import { EventEmitter } from 'node:events';
import { describe, expect, it } from './test-compat.js';
import { TradeRepublicClient } from '../src/index.js';
import type { WebSocketLike } from '../src/types.js';
import { FakeSocket } from './fake-socket.js';

describe('market abstractions', () => {
  it('downloads candle ranges in timeframe chunks', async () => {
    const payloads: Array<Record<string, unknown>> = [];
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          payloads.push(payload);
          socket.emit('message', `${id} aggregateHistoryLightV2 ${JSON.stringify({ data: [[String(payload.from), 1, 2, 0.5, 1.5, 10]] })}`);
        });
        sockets.push(socket);
        return socket;
      },
    });

    const candles = await client.market.downloadCandles({
      assetId: 'US1',
      exchangeId: 'LSX',
      timeframe: '1h',
      from: '2026-07-02T00:00:00.000Z',
      to: '2026-07-02T03:00:00.000Z',
    }, { maxCandlesPerRequest: 2 });

    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toMatchObject({ type: 'aggregateHistoryLightV2', isin: 'US1', exchangeId: 'LSX' });
    expect(candles.map((candle) => candle.time)).toEqual([
      '2026-07-02T00:00:00.000Z',
      '2026-07-02T02:00:00.000Z',
    ]);
  });

  it('subscribes to typed l2 order book streams', async () => {
    const sockets: LocalFakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new LocalFakeSocket();
        sockets.push(socket);
        return socket;
      },
    });

    const subscription = client.market.subscribeL2OrderBook({
      assetId: 'US1',
      exchangeId: 'LSX',
      depth: 5,
    });

    sockets[0]?.emit('open');
    sockets[0]?.emit('message', 'connected');
    expect(sockets[0]?.sent[0]).toMatch(/^connect 34 /);
    expect(sockets[0]?.sent[1]).toBe('sub 1 {"isin":"US1","exchangeId":"LSX","depth":5,"type":"L2"}');

    const next = subscription[Symbol.asyncIterator]().next();
    sockets[0]?.emit('message', '1 L2 {"bid":[{"price":10,"size":2}],"ask":[{"price":11,"size":3}]}');
    await expect(next).resolves.toEqual({
      done: false,
      value: expect.objectContaining({ bids: [[10, 2]], asks: [[11, 3]] }),
    });
    subscription.close();
  });
});

class LocalFakeSocket extends EventEmitter implements WebSocketLike {
  readonly sent: string[] = [];

  send(data: string | ArrayBuffer | Buffer): void {
    this.sent.push(String(data));
  }

  close(): void {
    this.emit('close');
  }
}
