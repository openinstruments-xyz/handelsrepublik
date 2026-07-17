import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, expect, it } from './test-compat.js';
import { TradeRepublicClient } from '../src/index.js';
import {
  decodeMapperProtobufRequest,
  encodeMapperProtobufDataEnvelope,
  encodeMapperProtobufTopicPayload,
} from '../src/mapper-protobuf.js';
import { FakeSocket } from './fake-socket.js';
import type { Session, WebSocketLike } from '../src/types.js';

describe('public convenience methods', () => {
  it('treats stored sessions without device information as unrestorable', async () => {
    const client = TradeRepublicClient.create({
      sessionStore: {
        async load() {
          return { sessionToken: 'session-without-device-info' };
        },
        async save() {},
        async clear() {},
      },
    });

    assert.equal(await client.auth.restoreSession(), undefined);
    expect(client.getSession()).toBeUndefined();
    await assert.rejects(
      () => client.auth.refreshSession(),
      /must contain deviceInfo/,
    );
  });

  it('restores, clears, and directly polls a login process', async () => {
    const stored: Session = {
      sessionToken: 'stored-token',
      securitiesAccountNumber: '0000000001',
      deviceInfo: {
        stableDeviceId: 'stored-fingerprint',
        browser: 'Chrome',
        preferredLanguages: ['de-DE', 'de'],
        numberOfCores: 8,
      },
    };
    let cleared = false;
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = TradeRepublicClient.create({
      sessionStore: {
        async load() {
          return stored;
        },
        async save() {},
        async clear() {
          cleared = true;
        },
      },
      fetch: mockFetchSequence(calls, [
        jsonResponse({ status: 'COMPLETED', session: { connectionToken: 'process-token' } }),
        jsonResponse({ session: { connectionToken: 'web-token' } }),
      ]),
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') {
            socket.emit('message', `${id} accountPairs ${JSON.stringify(accountPairsPayload())}`);
          }
        });
        return socket;
      },
    });

    await expect(client.auth.restoreSession()).resolves.toEqual(stored);
    expect(client.getSession()).toEqual(stored);

    await expect(client.auth.pollLoginProcess('process-1', { intervalMs: 0 })).resolves.toMatchObject({
      sessionToken: 'web-token',
      securitiesAccountNumber: '0000000001',
    });
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      '/api/v2/auth/web/login/processes/process-1',
      '/api/v1/auth/web/session',
    ]);

    await client.auth.clearSession();
    expect(cleared).toBe(true);
    expect(client.getSession()).toEqual({});
  });

  it('calls account, board, and read-only order convenience endpoints', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = TradeRepublicClient.create({
      rawSchemaValidation: false,
      fetch: mockFetchSequence(calls, [
        jsonResponse({ session: 'active' }),
        jsonResponse([{ id: 'board-1', name: 'Main' }]),
        jsonResponse({ orders: [{ id: 'fund-order', status: 'EXECUTED' }] }),
        jsonResponse({ orders: [{ id: 'private-order', status: 'OPEN' }] }),
        jsonResponse({ raw: 'detailed' }, 201, { 'x-test': 'present' }),
      ]),
    });

    await expect(client.account.session()).resolves.toEqual({ session: 'active' });
    await expect(client.boards.list()).resolves.toEqual([
      expect.objectContaining({ id: 'board-1', name: 'Main' }),
    ]);
    await expect(client.orders.mutualFunds({ page: 2, filters: { status: 'EXECUTED' } })).resolves.toEqual([
      expect.objectContaining({ id: 'fund-order', status: 'EXECUTED' }),
    ]);
    await expect(client.orders.privateMarkets({ pageNumber: 3, filters: { status: 'OPEN' } })).resolves.toEqual([
      expect.objectContaining({ id: 'private-order', status: 'OPEN' }),
    ]);
    const detailed = await client.web.requestDetailed<{ raw: string }>('POST', '/demo-check', {
      body: { ok: true },
      query: { source: 'tui' },
    });
    expect(detailed).toMatchObject({
      body: { raw: 'detailed' },
      status: 201,
    });
    expect(detailed.headers.get('x-test')).toBe('present');

    const urls = calls.map((call) => new URL(call.url));
    expect(urls.map((url) => url.pathname)).toEqual([
      '/api/v1/auth/web/session',
      '/api-gateway/pro-trading/api/v2/boards',
      '/api-gateway/mutual-funds/api/v1/orders',
      '/api/v1/private-markets/orders/all',
      '/demo-check',
    ]);
    expect(urls[2]?.searchParams.get('page')).toBe('2');
    expect(urls[2]?.searchParams.get('status')).toBe('EXECUTED');
    expect(urls[3]?.searchParams.get('pageNumber')).toBe('3');
    expect(urls[3]?.searchParams.get('status')).toBe('OPEN');
    expect(urls[4]?.searchParams.get('source')).toBe('tui');
    expect(calls[4]?.init.body).toBe(JSON.stringify({ ok: true }));
  });

  it('normalizes portfolio convenience queries and resolves explicit positions', async () => {
    const payloads: Array<Record<string, unknown>> = [];
    const client = TradeRepublicClient.create({
      rawSchemaValidation: false,
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          payloads.push(payload);
          if (payload.type === 'portfolioStatus') {
            socket.emit('message', `${id} portfolioStatus ${JSON.stringify({ amount: 125.5, currencyId: 'EUR' })}`);
          }
          if (payload.type === 'compactPortfolioByTypeV2') {
            socket.emit('message', `${id} compactPortfolioByTypeV2 ${JSON.stringify({ positions: [{ instrumentId: 'US1', shares: 2 }] })}`);
          }
        });
        return socket;
      },
    });

    await expect(client.portfolio.markToMarketValue()).resolves.toMatchObject({ amount: 125.5, currency: 'EUR' });
    await expect(client.portfolio.positionsForAccount('0000000042', { timeoutMs: 100 })).resolves.toEqual({
      positions: [expect.objectContaining({ id: 'US1', quantity: 2 })],
      raw: { positions: [{ instrumentId: 'US1', shares: 2 }] },
    });
    expect(payloads).toEqual([
      { type: 'portfolioStatus' },
      { type: 'compactPortfolioByTypeV2', secAccNo: '0000000042' },
    ]);
  });

  it('fetches one candle page through CandleQuery', async () => {
    const payloads: Array<Record<string, unknown>> = [];
    const client = TradeRepublicClient.create({
      rawSchemaValidation: false,
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

  it('supports both live-feed entry points and the L2 convenience alias', async () => {
    const sockets: ManualSocket[] = [];
    const client = TradeRepublicClient.create({
      rawSchemaValidation: false,
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

    const orderBook = client.market.l2OrderBook('US3', 'XETR');
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
});

function mockFetchSequence(calls: Array<{ url: string; init: RequestInit }>, responses: Response[]): typeof fetch {
  return (async (url: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return responses.shift() ?? jsonResponse({ error: 'not found' }, 404);
  }) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function accountPairsPayload(): unknown {
  return {
    accounts: [{ securitiesAccountNumber: '0000000001', productType: 'DEFAULT' }],
  };
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
