import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { decodeMapperProtobufRequest, encodeMapperProtobufDataEnvelope, encodeMapperProtobufStatusEnvelope, encodeMapperProtobufTopicPayload } from '../../src/mapper-protobuf.js';
import type { WebSocketLike } from '../../src/types.js';
import { jsonResponse } from './test-helpers.js';
import { describe, expect, it } from '../test-compat.js';
import { TradeRepublicClient } from '../../src/index.js';
import { FakeSocket } from '../fake-socket.js';
import { mockFetch, parseSubPayload } from './test-helpers.js';

describe('market namespace', () => {
  it('normalizes quote fields and nested L2 exchange candidates', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'ticker') {
            socket.emit('message', `${id} ticker ${JSON.stringify({
              last: { price: '275.8', size: '359', time: 1784055758749 },
              bid: { price: '275.8', size: '359' },
              ask: { price: '276.1', size: '42' },
              currency: 'EUR',
            })}`);
          }
          if (payload.type === 'instrument') {
            socket.emit('message', `${id} instrument ${JSON.stringify({ exchanges: [{ id: 'LSX', name: 'Lang & Schwarz' }, { exchangeId: 'XETRA', name: 'Xetra' }] })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.market.quote('US1', 'LSX')).resolves.toEqual(expect.objectContaining({
      assetId: 'US1', exchangeId: 'LSX', last: 275.8, lastSize: 359, bid: 275.8, ask: 276.1, askSize: 42,
      time: new Date(1784055758749).toISOString(),
    }));
    await expect(client.market.availableL2Books('US1')).resolves.toEqual([
      expect.objectContaining({ exchangeId: 'LSX', name: 'Lang & Schwarz' }),
      expect.objectContaining({ exchangeId: 'XETRA', name: 'Xetra' }),
    ]);
    expect(parseSubPayload(sockets[0]?.sent[1])).toEqual({ type: 'ticker', id: 'US1.LSX' });
    expect(parseSubPayload(sockets[1]?.sent[1])).toEqual({ type: 'instrument', id: 'US1' });
  });

  it('normalizes candle arrays', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          expect(payload).toMatchObject({ type: 'aggregateHistoryLightV2', isin: 'US1', exchangeId: 'LSX' });
          socket.emit('message', `${id} aggregateHistoryLightV2 ${JSON.stringify({ data: [['2026-07-02T12:00:00.000Z', 1, 2, 0.5, 1.5, 10]] })}`);
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.market.candles({
      assetId: 'US1',
      exchangeId: 'LSX',
      timeframe: '1h',
      instrumentType: 'derivative',
      from: '2026-07-01T00:00:00.000Z',
    })).resolves.toEqual([
      expect.objectContaining({ time: '2026-07-02T12:00:00.000Z', open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }),
    ]);
    expect(sockets[0]?.sent[0]).toMatch(/^connect 34 /);
  });

  it('routes stock candles through trade aggregate history', async () => {
    const payloads: Array<Record<string, unknown>> = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          payloads.push(payload);
          socket.emit('message', `${id} A ${JSON.stringify({
            aggregates: [{ time: 1_784_294_157_408, open: 200, high: 202, low: 199, close: 201, volume: 10 }],
            resolution: 60_000,
            sourceCurrency: 'EUR',
          })}`);
        });
        return socket;
      },
    });

    await expect(client.market.candles({
      assetId: 'US0378331005',
      exchangeId: 'LSX',
      timeframe: '1m',
      instrumentType: 'stock',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-02T00:00:00.000Z',
    })).resolves.toEqual([
      expect.objectContaining({ open: 200, high: 202, low: 199, close: 201, volume: 10 }),
    ]);
    expect(payloads).toEqual([
      expect.objectContaining({
        type: 'tradeAggregateHistory',
        isin: 'US0378331005',
        exchangeId: 'LSX',
        resolution: 60_000,
      }),
    ]);
  });

  it('routes bond candles through yield history and aggregates calendar weeks', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = TradeRepublicClient.create({
      fetch: mockFetch(calls, {
        aggregates: [
          { time: '2026-07-20T00:00:00.000Z', open: 3, high: 4, low: 2, close: 3.5, adjValue: 3.5 },
          { time: '2026-07-21T00:00:00.000Z', open: 3.5, high: 5, low: 3, close: 4.5, adjValue: 4.5 },
          { time: '2026-07-27T00:00:00.000Z', open: 4.5, high: 4.75, low: 4, close: 4.25, adjValue: 4.25 },
        ],
        resolution: 86_400_000,
        sourceCurrency: null,
      }),
    });

    await expect(client.market.candles({
      assetId: 'DE0001102622',
      exchangeId: 'LSX',
      timeframe: '1w',
      instrumentType: 'bond',
    })).resolves.toEqual([
      expect.objectContaining({
        time: '2026-07-20T00:00:00.000Z', open: 3, high: 5, low: 2, close: 4.5,
      }),
      expect.objectContaining({
        time: '2026-07-27T00:00:00.000Z', open: 4.5, high: 4.75, low: 4, close: 4.25,
      }),
    ]);
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe('/api-gateway/quotes-api/v1/instruments/DE0001102622.LSX/ytm/aggregateHistory');
    expect(url.searchParams.get('range')).toBe('1y');
  });

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

    const subscription = client.market.subscribeL2OrderBook('US1', 'XETR');

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

  it('returns one l2 order book snapshot and closes its subscription', async () => {
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

    await expect(client.market.snapshotL2OrderBook('US1', 'XETR')).resolves.toEqual(
      expect.objectContaining({
        instrumentId: 'US1.XETR',
        bids: [[10, 2]],
        asks: [[11, 3]],
      }),
    );
    expect(sockets[0]?.sent).toContain('unsub 1');
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

    const subscription = client.market.subscribeL2OrderBook('US1', 'LSX');
    await assert.rejects(subscription[Symbol.asyncIterator]().next(), {
      name: 'TradeRepublicProtocolError',
      message: 'Trade Republic protobuf resource failed (5): No L2 market data is available for US1.LSX',
    });
    subscription.close();
  });

  it('fetches one candle page through CandleQuery', async () => {
    const payloads: Array<Record<string, unknown>> = [];
    const client = TradeRepublicClient.create({
      rawSchemaValidation: 'off',
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          payloads.push(payload);
          socket.emit('message', `${id} aggregateHistoryLightV2 ${JSON.stringify({ data: [['2026-07-01T12:00:00.000Z', 1, 2, 0.5, 1.5, 10]] })}`);
        });
        return socket;
      },
    });

    await expect(client.market.candleQuery({
      assetId: 'US1',
      exchangeId: 'LSX',
      timeframe: '1h',
      instrumentType: 'derivative',
      from: '2026-07-01T00:00:00.000Z',
    }).fetch()).resolves.toEqual([
      expect.objectContaining({ time: '2026-07-01T12:00:00.000Z', close: 1.5 }),
    ]);
    expect(payloads[0]).toMatchObject({
      type: 'aggregateHistoryLightV2',
      isin: 'US1',
      exchangeId: 'LSX',
      resolution: 3_600_000,
    });
  });

  it('supports both live-feed entry points and positional L2 subscriptions', async () => {
    const sockets: ManualSocket[] = [];
    const client = TradeRepublicClient.create({
      rawSchemaValidation: 'off',
      websocketFactory: () => {
        const socket = new ManualSocket((binary) => {
          const request = decodeMapperProtobufRequest(binary);
          socket.emit('message', encodeMapperProtobufDataEnvelope(request.subscriptionId,
            encodeMapperProtobufTopicPayload('L2', {
              instrumentId: 'US3.XETR', currency: 'EUR', bid: [{ price: 10, size: 2 }], ask: [{ price: 11, size: 3 }], timestamp: 1,
            })), true);
        });
        sockets.push(socket);
        return socket;
      },
    });

    const direct = client.market.subscribeLiveFeed({ assetId: 'US1', exchangeId: 'LSX', fields: ['bid'] });
    connect(sockets[0]);
    expect(subscriptionPayload(sockets[0]?.sent[1])).toEqual({
      isin: 'US1', exchangeId: 'LSX', unit: 'EUR', fields: ['bid'], type: 'tickerV3',
    });
    const directNext = direct[Symbol.asyncIterator]().next();
    sockets[0]?.emit('message', '1 tickerV3 {"bid":10}');
    await expect(directNext).resolves.toEqual({
      done: false,
      value: expect.objectContaining({ type: 'message', raw: { bid: 10 } }),
    });
    direct.close();

    const alias = client.market.liveFeed('US2', { exchangeId: 'XETR' });
    connect(sockets[1]);
    expect(subscriptionPayload(sockets[1]?.sent[1])).toMatchObject({
      isin: 'US2', exchangeId: 'XETR', type: 'tickerV3',
    });
    alias.close();

    const orderBook = client.market.subscribeL2OrderBook('US3', 'XETR');
    connect(sockets[2]);
    expect(decodeMapperProtobufRequest(sockets[2]!.binarySent[0]!)).toEqual({
      subscriptionId: 1, topic: 'L2', instrumentId: { isin: 'US3', exchangeId: 'XETR' },
    });
    const bookNext = orderBook[Symbol.asyncIterator]().next();
    await expect(bookNext).resolves.toEqual({
      done: false,
      value: expect.objectContaining({ bids: [[10, 2]], asks: [[11, 3]] }),
    });
    orderBook.close();
  });

  it('uses numeric candle resolutions and normalizes aggregateHistoryLightV2 responses', async () => {
    const payloads: Array<Record<string, unknown>> = [];
    const sockets: FakeSocket[] = [];
    const actualClient = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          payloads.push(payload);
          socket.emit('message', `${id} A ${JSON.stringify({
            expectedClosingTime: 1_784_232_000_000,
            resolution: payload.resolution,
            lastAggregateEndTime: 1_784_160_000_000,
            aggregates: [{
              time: 1_784_160_000_000,
              open: '3.55',
              high: '4.12',
              low: '1.58',
              close: '3.51',
            }],
            unit: 'EUR',
          })}`);
        });
        sockets.push(socket);
        return socket;
      },
    });

    const series = await actualClient.market.candleSeries({
      assetId: 'DE000FC95YR4',
      exchangeId: 'SGL',
      timeframe: '10m',
      instrumentType: 'derivative',
      range: '5d',
    });

    expect(payloads[0]).toEqual({
      type: 'aggregateHistoryLightV2',
      isin: 'DE000FC95YR4',
      exchangeId: 'SGL',
      resolution: 600_000,
      range: '5d',
      unit: 'EUR',
    });
    expect(series).toMatchObject({
      resolutionMs: 600_000,
      expectedClosingTime: '2026-07-16T20:00:00.000Z',
      lastAggregateEndTime: '2026-07-16T00:00:00.000Z',
      unit: 'EUR',
      candles: [{
        time: '2026-07-16T00:00:00.000Z',
        open: 3.55,
        high: 4.12,
        low: 1.58,
        close: 3.51,
      }],
    });

    actualClient.close();
  });

  it('derives the broker chart resolutions from each instrument type', async () => {
    const payloads: Array<Record<string, unknown>> = [];
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          payloads.push(payload);
          const instrumentTypes: Record<string, string> = {
            DERIVATIVE: 'derivative',
            CRYPTO: 'crypto',
            BOND: 'bond',
            STOCK: 'stock',
          };
          socket.emit('message', `${id} A ${JSON.stringify({
            isin: payload.id,
            typeId: instrumentTypes[String(payload.id)],
          })}`);
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.market.availableCandleResolutions({ assetId: 'DERIVATIVE' }))
      .resolves.toEqual(['10m', '1h', '4h', '1d', '1w']);
    await expect(client.market.availableCandleResolutions({ assetId: 'CRYPTO' }))
      .resolves.toEqual(['10m', '1h', '4h', '1d', '1w']);
    await expect(client.market.availableCandleResolutions({ assetId: 'BOND' }))
      .resolves.toEqual(['1d', '1w']);
    await expect(client.market.availableCandleResolutions({ assetId: 'STOCK' }))
      .resolves.toEqual([
        '1m', '3m', '5m', '10m', '15m', '20m', '30m',
        '45m', '1h', '2h', '4h', '1d', '1w', '1M',
      ]);
    expect(payloads).toEqual([
      { type: 'instrument', id: 'DERIVATIVE' },
      { type: 'instrument', id: 'CRYPTO' },
      { type: 'instrument', id: 'BOND' },
      { type: 'instrument', id: 'STOCK' },
    ]);
    client.close();
  });
});

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

class ManualSocket extends EventEmitter implements WebSocketLike {
  readonly sent: string[] = [];
  readonly binarySent: Uint8Array[] = [];

  constructor(private readonly onBinarySubscribe?: (payload: Uint8Array) => void) {
    super();
  }

  send(data: string | ArrayBuffer | Buffer): void {
    if (typeof data !== 'string') {
      const payload = data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      this.binarySent.push(payload);
      queueMicrotask(() => this.onBinarySubscribe?.(payload));
      return;
    }
    this.sent.push(String(data));
  }

  close(): void {
    this.emit('close');
  }
}

function connect(socket: ManualSocket | undefined): void {
  assert.ok(socket);
  socket.emit('open');
  socket.emit('message', 'connected');
}

function subscriptionPayload(message: string | undefined): unknown {
  assert.ok(message);
  const secondSpace = message.indexOf(' ', message.indexOf(' ') + 1);
  return JSON.parse(message.slice(secondSpace + 1));
}
