import assert from 'node:assert/strict';
import { describe, expect, it } from './test-compat.js';
import { TradeRepublicClient } from '../src/index.js';
import {
  decodeMapperProtobufRequest,
  encodeMapperProtobufDataEnvelope,
  encodeMapperProtobufStatusEnvelope,
} from '../src/mapper-protobuf.js';
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
      instrumentType: 'derivative',
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

  it('reads market subscriptions and topic entitlements from REST', async () => {
    const calls: string[] = [];
    let socketsOpened = 0;
    const client = TradeRepublicClient.create({
      fetch: (async (input: URL | RequestInfo) => {
        const url = String(input);
        calls.push(url);
        if (url.includes('/subscriptions/api/v1/subscriptions')) {
          return jsonResponse([{
            id: 'subscription-1',
            plan: {
              id: 'plan-1', name: 'Xetra', description: 'Orderbook', product: 'XETR_L2', group: 'MARKET_DATA',
              price: { value: '0.0', currency: 'EUR' }, termPeriod: 'P1Y6M',
              tier: { level: 2, group: 'XETR' },
            },
            createdAt: '2026-07-02T14:50:36.023750Z',
            terms: [{ id: 'term-1', activatedAt: '2026-07-02T14:50:36.023750Z', validUntil: '2028-01-02T15:50:35.981Z' }],
          }]);
        }
        return jsonResponse({
          kind: 'TOPIC',
          name: 'L2',
          entitlements: [{
            query: [{ name: 'exchangeId', value: 'XETR' }],
            planId: 'plan-1', subscribedUntil: '2028-01-02T15:50:35.981Z', isSubscribed: true, isCanceled: false,
          }],
        });
      }) as typeof fetch,
      websocketFactory: () => {
        socketsOpened += 1;
        return new FakeSocket();
      },
    });

    await expect(client.market.subscriptions()).resolves.toEqual([
      expect.objectContaining({
        id: 'subscription-1',
        plan: expect.objectContaining({ product: 'XETR_L2', price: expect.objectContaining({ value: '0.0', currency: 'EUR' }) }),
        terms: [expect.objectContaining({ id: 'term-1', validUntil: '2028-01-02T15:50:35.981Z' })],
      }),
    ]);
    const entitlements = await client.market.entitlements('L2', { exchangeIds: ['LSX', 'XETR'] });
    expect(entitlements.entitlements).toEqual([
      expect.objectContaining({ query: [expect.objectContaining({ value: 'XETR' })], isSubscribed: true }),
    ]);
    expect(entitlements.entitlements).toHaveLength(1);
    expect(new URL(calls[0]!).pathname).toBe('/api-gateway/subscriptions/api/v1/subscriptions');
    const entitlementUrl = new URL(calls[1]!);
    expect(entitlementUrl.pathname).toBe('/api-gateway/subscriptions/api/v1/entitlements/topics/L2');
    expect(entitlementUrl.searchParams.get('exchangeId')).toBe('LSX,XETR');
    expect(socketsOpened).toBe(0);
  });

  it('subscribes to typed l2 order book streams over protobuf', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket(undefined, (binary) => {
          const request = decodeMapperProtobufRequest(binary);
          const payload = currentL2Payload({
            instrumentId: 'US1.XETR',
            currency: 'EUR',
            bid: { price: 10, size: 2 },
            ask: { price: 11, size: 3 },
            timestamp: 1_784_294_157_408n,
          });
          socket.emit('message', encodeMapperProtobufDataEnvelope(request.subscriptionId, payload), true);
        });
        sockets.push(socket);
        return socket;
      },
    });

    const subscription = client.market.subscribeL2OrderBook({
      assetId: 'US1',
      exchangeId: 'XETR',
    });

    await expect(subscription[Symbol.asyncIterator]().next()).resolves.toEqual({
      done: false,
      value: expect.objectContaining({
        instrumentId: 'US1.XETR',
        currency: 'EUR',
        bids: [[10, 2]],
        asks: [[11, 3]],
        timestamp: 1_784_294_157_408,
      }),
    });
    expect(decodeMapperProtobufRequest(sockets[0]!.binarySent[0]!)).toEqual({
      subscriptionId: 1,
      topic: 'L2',
      instrumentId: { isin: 'US1', exchangeId: 'XETR' },
    });
    subscription.close();
  });

  it('surfaces protobuf l2 venue errors to subscription consumers', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket(undefined, (binary) => {
          const request = decodeMapperProtobufRequest(binary);
          socket.emit('message', encodeMapperProtobufStatusEnvelope(
            request.subscriptionId,
            5,
            'No L2 market data is available for US1.LSX',
          ), true);
        });
        sockets.push(socket);
        return socket;
      },
    });

    const subscription = client.market.l2OrderBook('US1', 'LSX');
    await assert.rejects(subscription[Symbol.asyncIterator]().next(), {
      name: 'TradeRepublicProtocolError',
      message: 'Trade Republic protobuf resource failed (5): No L2 market data is available for US1.LSX',
    });
    subscription.close();
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

function currentL2Payload(value: {
  instrumentId: string;
  currency: string;
  bid: { price: number; size: number };
  ask: { price: number; size: number };
  timestamp: bigint;
}): Uint8Array {
  // Encode independently from the production descriptor so protobuf wire-type drift stays detectable.
  return Buffer.concat([
    protobufBytes(1, Buffer.from(value.instrumentId)),
    protobufBytes(2, Buffer.from(value.currency)),
    protobufBytes(3, protobufPriceLevel(value.ask)),
    protobufBytes(4, protobufPriceLevel(value.bid)),
    Buffer.from([5 << 3, ...protobufVarint(value.timestamp)]),
  ]);
}

function protobufPriceLevel(level: { price: number; size: number }): Buffer {
  const payload = Buffer.alloc(18);
  payload[0] = (1 << 3) | 1;
  payload.writeDoubleLE(level.price, 1);
  payload[9] = (2 << 3) | 1;
  payload.writeDoubleLE(level.size, 10);
  return payload;
}

function protobufBytes(fieldNumber: number, value: Uint8Array): Buffer {
  return Buffer.concat([
    Buffer.from([(fieldNumber << 3) | 2, ...protobufVarint(BigInt(value.length))]),
    value,
  ]);
}

function protobufVarint(value: bigint): number[] {
  const bytes: number[] = [];
  let remaining = value;
  for (; remaining >= 0x80n; remaining >>= 7n) {
    bytes.push(Number(remaining & 0x7fn) | 0x80);
  }
  bytes.push(Number(remaining));
  return bytes;
}
