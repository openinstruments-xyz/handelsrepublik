import assert from 'node:assert/strict';
import { describe, expect, it } from '../test-compat.js';
import { MapperRequestError, TradeRepublicClient } from '../../src/index.js';
import { FakeSocket } from '../fake-socket.js';
import { parseSubPayload } from './test-helpers.js';

describe('price-alarms namespace', () => {
  it('exposes low-risk price alarm mapper mutations', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'createPriceAlarm') {
            socket.emit('message', `${id} createPriceAlarm ${JSON.stringify({ status: 'created', alarmId: 'alarm-1' })}`);
          }
          if (payload.type === 'cancelPriceAlarm') {
            socket.emit('message', `${id} cancelPriceAlarm ${JSON.stringify({ status: 'ok', id: payload.id })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.priceAlarms.create({ isin: 'US1', price: 123.45 })).resolves.toEqual({
      alarmId: 'alarm-1',
      status: 'created',
      raw: { status: 'created', alarmId: 'alarm-1' },
    });
    await expect(client.priceAlarms.cancel('alarm-1')).resolves.toEqual({
      alarmId: 'alarm-1',
      status: 'ok',
      raw: { status: 'ok', id: 'alarm-1' },
    });

    expect(parseSubPayload(sockets[0]?.sent[1])).toEqual({
      type: 'createPriceAlarm',
      instrumentId: 'US1',
      targetPrice: 123.45,
    });
    expect(parseSubPayload(sockets[1]?.sent[1])).toEqual({ type: 'cancelPriceAlarm', id: 'alarm-1' });
  });

  it('classifies built-in price alarm mutations as non-replayable', async () => {
    let sends = 0;
    const client = TradeRepublicClient.create({
      websocketReconnectDelayMs: 0,
      websocketFactory: () => {
        const socket = new FakeSocket((payload) => {
          if (payload.type !== 'createPriceAlarm') return;
          sends += 1;
          if (sends === 1) queueMicrotask(() => socket.emit('close', 1006));
        });
        return socket;
      },
    });

    await assert.rejects(client.priceAlarms.create({ isin: 'US1', price: 123.45 }), (error: unknown) => {
      assert.ok(error instanceof MapperRequestError);
      assert.equal(error.deliveryState, 'sent');
      assert.equal(error.outcomeUnknown, true);
      return true;
    });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(sends).toBe(1);
    client.close();
  });
});
