import assert from 'node:assert/strict';
import { describe, expect, it } from './test-compat.js';
import { TradeRepublicClient } from '../src/index.js';
import { FakeSocket } from './fake-socket.js';

describe('TradeRepublicClient', () => {
  it('creates a QR challenge through the v2 login endpoint', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = TradeRepublicClient.create({
      fetch: mockFetch(calls, {
        id: 'challenge-1',
        qrCodeDataUrl: 'data:image/png;base64,abc',
      }),
    });

    const challenge = await client.auth.createInstantLogin({ deviceName: 'sdk-test' });

    expect(challenge).toMatchObject({
      id: 'challenge-1',
      qrCodeDataUrl: 'data:image/png;base64,abc',
    });
    expect(calls[0]?.url).toBe('https://api.traderepublic.com/api/v2/auth/web/login/qr-challenges');
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.body).toBe(JSON.stringify({ deviceName: 'sdk-test' }));
  });

  it('carries QR login cookies across poll steps before completing the web session', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const saved: unknown[] = [];
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      sessionStore: {
        async load() {
          return undefined;
        },
        async save(session) {
          saved.push(session);
        },
        async clear() {},
      },
      fetch: mockFetchSequence(calls, [
        jsonResponse({
          status: 'CLAIMED',
          processId: 'process-1',
        }, 200, {
          'set-cookie': 'JSESSIONID=claim-session; Path=/; Secure; HttpOnly',
        }),
        jsonResponse({
          status: 'CONFIRMED',
        }, 200, {
          'set-cookie': 'tr_external_id=external-1; Path=/; Domain=traderepublic.com; Secure; SameSite=Strict',
        }),
        jsonResponse({
          status: 'COMPLETED',
        }, 200, {
          'set-cookie': 'JSESSIONID=complete-session; Path=/; Secure; HttpOnly',
        }),
        jsonResponse({
          session: {
            connectionToken: 'session-token',
          },
        }),
      ]),
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') {
            socket.emit('message', `${id} A ${JSON.stringify(accountPairsPayload())}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.auth.pollInstantLogin({ id: 'challenge-1' }, { intervalMs: 0 })).resolves.toMatchObject({
      sessionToken: 'session-token',
      securitiesAccountNumber: '0000000001',
      cookies: {
        JSESSIONID: 'complete-session',
        tr_external_id: 'external-1',
      },
    });

    const sessionCall = calls[3];
    expect(sessionCall?.url).toBe('https://api.traderepublic.com/api/v1/auth/web/session');
    const sessionHeaders = sessionCall?.init.headers as Record<string, string>;
    expect(sessionHeaders.cookie).toContain('JSESSIONID=complete-session');
    expect(sessionHeaders.cookie).toContain('tr_external_id=external-1');
    expect(client.securitiesAccountNumber).toBe('0000000001');
    expect(client.getSession()).toMatchObject({ securitiesAccountNumber: '0000000001' });
    expect(saved).toEqual([expect.objectContaining({ securitiesAccountNumber: '0000000001' })]);
    expect(parseSubPayload(sockets[0]?.sent[1])).toMatchObject({ type: 'accountPairs' });
  });

  it('refreshes the saved web session cookies', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const saved: unknown[] = [];
    const client = TradeRepublicClient.create({
      session: {
        cookies: {
          tr_claims: 'old-claims',
          tr_session: 'old-session',
        },
        securitiesAccountNumber: '0000000000',
      },
      sessionStore: {
        async load() {
          return undefined;
        },
        async save(session) {
          saved.push(session);
        },
        async clear() {},
      },
      fetch: mockFetchSequence(calls, [
        jsonResponse({ status: 'ok' }, 200, {
          'set-cookie': [
            'tr_claims=new-claims; Path=/; Domain=traderepublic.com; Secure; SameSite=Strict',
            'tr_session=new-session; Path=/; Domain=traderepublic.com; Secure; SameSite=Strict',
          ].join(', '),
        }),
      ]),
    });

    await expect(client.auth.refreshSession()).resolves.toMatchObject({
      cookies: {
        tr_claims: 'new-claims',
        tr_session: 'new-session',
      },
      securitiesAccountNumber: '0000000000',
    });
    expect(calls[0]?.url).toBe('https://api.traderepublic.com/api/v1/auth/web/session');
    const refreshHeaders = calls[0]?.init.headers as Record<string, string>;
    expect(refreshHeaders.cookie).toContain('tr_claims=old-claims');
    expect(refreshHeaders.cookie).toContain('tr_session=old-session');
    expect(saved).toHaveLength(1);
  });

  it('initializes the public securities account number from an existing session', () => {
    const client = TradeRepublicClient.create({
      session: {
        securitiesAccountNumber: '0000000000',
      },
    });

    expect(client.securitiesAccountNumber).toBe('0000000000');
    expect(client.getSession()).toMatchObject({ securitiesAccountNumber: '0000000000' });
  });

  it('attaches web context per client and preserves it when saving sessions', async () => {
    const saved: unknown[] = [];
    const first = TradeRepublicClient.create({
      sessionStore: {
        async load() {
          return undefined;
        },
        async save(session) {
          saved.push(session);
        },
        async clear() {},
      },
    });
    const second = TradeRepublicClient.create();

    first.useWebContext({
      awsWafToken: 'waf-token',
      cookies: {
        tr_session: 'web-session',
      },
    });
    await first.auth.saveSession();

    expect(first.getSession()).toMatchObject({
      webContext: {
        awsWafToken: 'waf-token',
        cookies: {
          tr_session: 'web-session',
        },
      },
    });
    expect(second.getSession()).toBeUndefined();
    expect(saved).toEqual([
      expect.objectContaining({
        webContext: expect.objectContaining({ awsWafToken: 'waf-token' }),
      }),
    ]);
  });

  it('rejects drifted raw payloads by default', async () => {
    const client = TradeRepublicClient.create({
      fetch: mockFetch([], { unexpected: true }),
    });

    await assert.rejects(
      () => client.account.current(),
      /Trade Republic schema validation failed for auth\.account/,
    );
  });

  it('can disable raw schema validation for drifted payloads', async () => {
    const payload = { unexpected: true };
    const client = TradeRepublicClient.create({
      rawSchemaValidation: false,
      fetch: mockFetch([], payload),
    });

    await expect(client.account.current()).resolves.toEqual(payload);
  });

  it('can validate drifted payloads without throwing', async () => {
    const payload = { unexpected: true };
    const failures: unknown[] = [];
    const client = TradeRepublicClient.create({
      rawSchemaValidation: 'passthrough',
      onRawSchemaValidationFailure: (failure) => failures.push(failure),
      fetch: mockFetch([], payload),
    });

    await expect(client.account.current()).resolves.toEqual(payload);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      schemaName: 'auth.account',
      value: payload,
      error: expect.any(Error),
    });
  });

  it('normalizes portfolio and cash payloads', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') {
            socket.emit('message', `${id} A ${JSON.stringify(accountPairsPayload())}`);
          }
          if (payload.type === 'availableCash') {
            socket.emit('message', `${id} availableCash ${JSON.stringify([{ accountNumber: '0000000002', currencyId: 'EUR', amount: 12.5 }])}`);
          }
          if (payload.type === 'compactPortfolioByTypeV2') {
            expect(payload.secAccNo).toBe('0000000001');
            socket.emit('message', `${id} portfolio ${JSON.stringify({ positions: [{ instrumentId: 'US1', instrumentName: 'Example', shares: '2', marketValue: { amount: '42', currency: 'EUR' } }] })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.portfolio.current()).resolves.toEqual({
      positions: [
        expect.objectContaining({ id: 'US1', name: 'Example', quantity: 2, value: 42, currency: 'EUR' }),
      ],
      raw: expect.any(Object),
    });
    expect(sockets[0]?.sent[0]).toMatch(/^connect 34 /);
    expect(sockets[0]?.sent[1]).toBe('sub 1 {"type":"accountPairs"}');
    expect(sockets[1]?.sent[1]).toBe('sub 1 {"type":"compactPortfolioByTypeV2","secAccNo":"0000000001"}');
    await expect(client.portfolio.cash()).resolves.toEqual(expect.objectContaining({ amount: 12.5, currency: 'EUR' }));
    expect(sockets[2]?.sent[1]).toBe('sub 1 {"type":"availableCash"}');
  });

  it('refreshes a stale cached securities account number before portfolio queries', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      session: {
        securitiesAccountNumber: '0000000002',
      },
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') {
            socket.emit('message', `${id} A ${JSON.stringify(accountPairsPayload())}`);
          }
          if (payload.type === 'compactPortfolioByTypeV2') {
            expect(payload.secAccNo).toBe('0000000001');
            socket.emit('message', `${id} portfolio ${JSON.stringify([])}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.portfolio.current()).resolves.toEqual({
      positions: [],
      raw: [],
    });
    expect(client.securitiesAccountNumber).toBe('0000000001');
  });

  it('lists orders through the web-trading customer orders endpoint', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      fetch: mockFetchSequence(calls, [
        jsonResponse([{ id: 'o1', instrumentId: 'US1', side: 'BUY', submittedAt: '2026-07-03T10:00:00.000Z', trades: [] }]),
        jsonResponse([{ id: 'o2', instrumentId: 'US2', side: 'SELL', executedAt: '2026-07-03T11:00:00.000Z' }]),
        jsonResponse([{ id: 'o3', instrumentId: 'US3', side: 'BUY', submittedAt: '2026-07-03T12:00:00.000Z' }]),
      ]),
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') {
            socket.emit('message', `${id} A ${JSON.stringify(accountPairsPayload())}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.orders.open({ limit: 25 })).resolves.toEqual([expect.objectContaining({ id: 'o1', status: 'open' })]);
    await expect(client.orders.closed({ cursor: '2' })).resolves.toEqual([expect.objectContaining({ id: 'o2', status: 'executed' })]);
    await expect(client.orders.all({ sort: 'createdAt,asc', instrumentId: 'US3' })).resolves.toEqual([expect.objectContaining({ id: 'o3' })]);

    expect(sockets).toHaveLength(3);
    expectOrderCall(calls[0], {
      secAccNo: '0000000001',
      page: '1',
      pageSize: '25',
      sort: 'orderUpdatedAt,desc',
    });
    expectOrderCall(calls[1], {
      secAccNo: '0000000001',
      page: '2',
      pageSize: '100',
      sort: 'orderUpdatedAt,desc',
    });
    expectOrderCall(calls[2], {
      secAccNo: '0000000001',
      page: '1',
      pageSize: '100',
      sort: 'createdAt,asc',
      instrumentId: 'US3',
    });
    expect(client.securitiesAccountNumber).toBe('0000000001');
  });

  it('queries assets through neonSearch and instrument resources', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'neonSearch') {
            socket.emit('message', `${id} neonSearch ${JSON.stringify({ results: [{ isin: 'US1', name: 'Apple Inc.', type: 'stock' }] })}`);
          }
          if (payload.type === 'instrument') {
            socket.emit('message', `${id} instrument ${JSON.stringify({ isin: payload.id, name: 'Apple Inc.', issuer: { name: 'Issuer' } })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.assets.search('apple', { limit: 5 })).resolves.toEqual([
      expect.objectContaining({ id: 'US1', name: 'Apple Inc.', type: 'stock' }),
    ]);
    await expect(client.assets.listAll({ cursor: '2', limit: 10 })).resolves.toEqual([
      expect.objectContaining({ id: 'US1' }),
    ]);
    await expect(client.assets.get('US1')).resolves.toEqual(expect.objectContaining({ id: 'US1', issuer: 'Issuer' }));

    expect(parseSubPayload(sockets[0]?.sent[1])).toMatchObject({
      type: 'neonSearch',
      data: {
        q: 'apple',
        page: 1,
        pageSize: 5,
        filter: [{ key: 'type', value: 'stock' }, { key: 'jurisdiction', value: 'DE' }],
      },
    });
    expect(parseSubPayload(sockets[1]?.sent[1])).toMatchObject({
      type: 'neonSearch',
      data: { q: '', page: 2, pageSize: 10 },
    });
    expect(parseSubPayload(sockets[2]?.sent[1])).toEqual({ type: 'instrument', id: 'US1' });
  });

  it('queries derivatives through neonSearch, derivatives, and instrument resources', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'neonSearch') {
            socket.emit('message', `${id} neonSearch ${JSON.stringify({ results: [{ isin: 'DE1', productType: 'knockout', underlyingId: 'US1' }] })}`);
          }
          if (payload.type === 'derivatives') {
            socket.emit('message', `${id} derivatives ${JSON.stringify({ results: [{ isin: 'DE2', productCategory: 'knockouts', underlyingId: payload.underlying }] })}`);
          }
          if (payload.type === 'instrument') {
            socket.emit('message', `${id} instrument ${JSON.stringify({ isin: payload.id, productType: 'warrant', underlying: { id: 'US1' } })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.derivatives.search('tesla', { underlyingId: 'US1', direction: 'long', limit: 7 })).resolves.toEqual([
      expect.objectContaining({ id: 'DE1', productType: 'knockout', underlyingId: 'US1' }),
    ]);
    await expect(client.derivatives.listForUnderlying('US1', { direction: 'short', productType: 'knockouts', limit: 11 })).resolves.toEqual([
      expect.objectContaining({ id: 'DE2', underlyingId: 'US1' }),
    ]);
    await expect(client.derivatives.get('DE3')).resolves.toEqual(expect.objectContaining({ id: 'DE3', productType: 'warrant', underlyingId: 'US1' }));

    expect(parseSubPayload(sockets[0]?.sent[1])).toMatchObject({
      type: 'neonSearch',
      data: {
        q: 'tesla',
        page: 1,
        pageSize: 7,
        filter: [
          { key: 'type', value: 'derivative' },
          { key: 'jurisdiction', value: 'DE' },
          { key: 'underlying', value: 'US1' },
          { key: 'optionType', value: 'long' },
        ],
      },
    });
    expect(parseSubPayload(sockets[1]?.sent[1])).toEqual({
      type: 'derivatives',
      jurisdiction: 'DE',
      lang: 'en',
      underlying: 'US1',
      productCategory: 'knockouts',
      optionType: 'short',
      pageSize: 11,
    });
    expect(parseSubPayload(sockets[2]?.sent[1])).toEqual({ type: 'instrument', id: 'DE3' });
  });

  it('subscribes to order updates by securities account number', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    });

    const subscription = client.orders.orderUpdates('0000000000');
    await Promise.resolve();
    await Promise.resolve();

    expect(parseSubPayload(sockets[0]?.sent[1])).toEqual({
      type: 'orderUpdates',
      selector: { case: 'bySecAccNo', value: { accountNumber: '0000000000' } },
    });
    subscription.close();
  });

  it('exposes timeline and price alarm mapper APIs through SDK namespaces', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'timelineActivityLog') {
            expect(payload.after).toBe('cursor-1');
            socket.emit('message', `${id} timelineActivityLog ${JSON.stringify({ activities: [{ id: 'tl1', type: 'ORDER', title: 'Order filled' }] })}`);
          }
          if (payload.type === 'timelineActionsV2') {
            socket.emit('message', `${id} timelineActionsV2 ${JSON.stringify({ actions: [{ id: 'act1', type: 'download', title: 'Download' }] })}`);
          }
          if (payload.type === 'timelineDetailV2') {
            expect(payload.orderId).toBe('order-1');
            socket.emit('message', `${id} timelineDetailV2 ${JSON.stringify({ id: 'detail-1', type: 'ORDER' })}`);
          }
          if (payload.type === 'priceAlarms') {
            socket.emit('message', `${id} priceAlarms ${JSON.stringify({ obj: { items: [{ alarmId: 'pa1', isin: 'US1', price: { value: '123.45', currency: 'EUR' } }] } })}`);
          }
          if (payload.type === 'priceAlarmNotifications') {
            socket.emit('message', `${id} priceAlarmNotifications ${JSON.stringify({ priceAlarms: [{ id: 'pa2', instrumentName: 'Apple', targetPrice: 150 }] })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.timeline.list({ after: 'cursor-1' })).resolves.toEqual([
      expect.objectContaining({ id: 'tl1', type: 'ORDER', title: 'Order filled', raw: expect.any(Object) }),
    ]);
    await expect(client.timeline.actions()).resolves.toEqual([
      expect.objectContaining({ id: 'act1', type: 'download', title: 'Download' }),
    ]);
    await expect(client.timeline.detail('order-1', 'order')).resolves.toEqual(
      expect.objectContaining({ id: 'detail-1', type: 'ORDER', raw: expect.any(Object) }),
    );
    await expect(client.priceAlarms.list()).resolves.toEqual([
      expect.objectContaining({ id: 'pa1', isin: 'US1', price: 123.45, currency: 'EUR' }),
    ]);
    await expect(client.priceAlarms.notifications()).resolves.toEqual([
      expect.objectContaining({ id: 'pa2', name: 'Apple', price: 150 }),
    ]);

    expect(parseSubPayload(sockets[0]?.sent[1])).toEqual({ type: 'timelineActivityLog', after: 'cursor-1' });
    expect(parseSubPayload(sockets[1]?.sent[1])).toEqual({ type: 'timelineActionsV2' });
    expect(parseSubPayload(sockets[2]?.sent[1])).toEqual({ type: 'timelineDetailV2', orderId: 'order-1' });
    expect(parseSubPayload(sockets[3]?.sent[1])).toEqual({ type: 'priceAlarms' });
    expect(parseSubPayload(sockets[4]?.sent[1])).toEqual({ type: 'priceAlarmNotifications' });
  });

  it('exposes portfolio extras and auto-resolves securities account numbers', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      fetch: mockFetch(calls, { data: [{ time: '2026-07-03T00:00:00.000Z', value: 100 }] }),
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') {
            socket.emit('message', `${id} A ${JSON.stringify(accountPairsPayload())}`);
          }
          if (payload.type === 'savingsPlans') {
            expect(payload.secAccNo).toBe('0000000001');
            socket.emit('message', `${id} savingsPlans ${JSON.stringify({ items: [{ savingsPlanId: 'sp1', isin: 'US1', amount: { value: '25', currency: 'EUR' } }] })}`);
          }
          if (payload.type === 'privateMarketsPositions') {
            expect(payload.secAccNo).toBe('0000000001');
            socket.emit('message', `${id} privateMarketsPositions ${JSON.stringify({ positions: [{ id: 'pm1' }] })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.portfolio.savingsPlans()).resolves.toEqual([
      expect.objectContaining({ id: 'sp1', isin: 'US1', amount: 25, currency: 'EUR' }),
    ]);
    await expect(client.portfolio.privateMarketsPositions()).resolves.toEqual({ positions: [{ id: 'pm1' }] });
    await expect(client.portfolio.portfolioChart(undefined, '1m', { currency: 'EUR' })).resolves.toEqual({
      points: [{ time: '2026-07-03T00:00:00.000Z', value: 100 }],
      raw: { data: [{ time: '2026-07-03T00:00:00.000Z', value: 100 }] },
    });

    const chartUrl = new URL(calls[0]?.url ?? 'https://invalid.local/');
    expect(chartUrl.pathname).toBe('/api-gateway/portfolio-chart/v2/chart');
    expect(chartUrl.searchParams.get('secAccNo')).toBe('0000000001');
    expect(chartUrl.searchParams.get('range')).toBe('1m');
    expect(chartUrl.searchParams.get('currency')).toBe('EUR');
    expect(parseSubPayload(sockets[1]?.sent[1])).toEqual({ type: 'savingsPlans', secAccNo: '0000000001' });
    expect(parseSubPayload(sockets[3]?.sent[1])).toEqual({ type: 'privateMarketsPositions', secAccNo: '0000000001' });
  });

  it('exposes instrument and trading mapper APIs through SDK namespaces', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') {
            socket.emit('message', `${id} A ${JSON.stringify(accountPairsPayload())}`);
          }
          if (payload.type === 'neonNews') {
            expect(payload.isin).toBe('US1');
            socket.emit('message', `${id} neonNews ${JSON.stringify({ items: [{ newsId: 'n1', headline: 'News' }] })}`);
          }
          if (payload.type === 'etfDetails' || payload.type === 'etfComposition' || payload.type === 'mutualFundDetails' || payload.type === 'mutualFundComposition' || payload.type === 'cryptoDetails' || payload.type === 'yieldToMaturity') {
            socket.emit('message', `${id} ${payload.type} ${JSON.stringify({ ok: true, id: payload.id })}`);
          }
          if (payload.type === 'priceForOrderV2') {
            socket.emit('message', `${id} priceForOrderV2 ${JSON.stringify({ price: 1 })}`);
          }
          if (payload.type === 'availableSize') {
            expect(payload.secAccNo).toBe('0000000001');
            expect(payload.parameters).toEqual({ instrumentId: 'US1' });
            socket.emit('message', `${id} availableSize ${JSON.stringify({ size: 2 })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.instruments.news('US1')).resolves.toEqual([
      expect.objectContaining({ id: 'n1', title: 'News' }),
    ]);
    await expect(client.instruments.etfDetails('US1')).resolves.toEqual({ ok: true, id: 'US1' });
    await expect(client.instruments.etfComposition('US1', 'cursor')).resolves.toEqual({ ok: true, id: 'US1' });
    await expect(client.instruments.fundDetails('US1')).resolves.toEqual({ ok: true, id: 'US1' });
    await expect(client.instruments.fundComposition('US1', 'cursor')).resolves.toEqual({ ok: true, id: 'US1' });
    await expect(client.instruments.cryptoDetails('US1')).resolves.toEqual({ ok: true, id: 'US1' });
    await expect(client.instruments.yieldToMaturity('US1')).resolves.toEqual({ ok: true, id: 'US1' });
    await expect(client.trading.priceForOrder({ isin: 'US1', exchangeId: 'LSX', side: 'BUY' })).resolves.toEqual({ price: 1 });
    await expect(client.trading.availableSize('US1')).resolves.toEqual({ size: 2 });

    expect(parseSubPayload(sockets[2]?.sent[1])).toEqual({ type: 'etfComposition', id: 'US1', after: 'cursor' });
    expect(parseSubPayload(sockets[7]?.sent[1])).toEqual({ type: 'priceForOrderV2', unit: 'EUR', isin: 'US1', exchangeId: 'LSX', side: 'BUY' });
  });

  it('exposes REST-backed discovery, account, docs, tax, payment, and trading APIs', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = TradeRepublicClient.create({
      fetch: mockFetchSequence(calls, [
        jsonResponse({ data: [{ exchangeId: 'LSX', name: 'Lang & Schwarz' }] }),
        jsonResponse({ exchangeId: 'LSX', sessions: [] }),
        jsonResponse({ isin: 'US1', exchangeId: 'LSX', status: 'OPEN' }),
        jsonResponse({ watchlists: [] }),
        jsonResponse({ screeners: [] }),
        jsonResponse({ options: [] }),
        jsonResponse({ theme: 'dark' }),
        jsonResponse({ destinations: [{ exchangeId: 'LSX', name: 'Lang & Schwarz' }] }),
        jsonResponse({ trades: [{ tradeId: 't1', isin: 'US1', amount: { value: '12', currency: 'EUR' } }] }),
        jsonResponse({ pnl: 1 }),
        jsonResponse({ account: true }),
        jsonResponse({ name: 'Example' }),
        jsonResponse({ relationships: [] }),
        jsonResponse({ cards: [] }),
        jsonResponse({ documents: [] }),
        jsonResponse({ paymentMethods: [] }),
        jsonResponse({ iban: 'DE00' }),
        jsonResponse({ tax: true }),
        jsonResponse({ exemptionOrder: true }),
        jsonResponse({ taxResidencies: [] }),
        jsonResponse({ countries: [] }),
        jsonResponse({ interest: true }),
      ]),
    });

    await expect(client.discovery.exchangeDetails()).resolves.toEqual([
      expect.objectContaining({ id: 'LSX', name: 'Lang & Schwarz' }),
    ]);
    await expect(client.discovery.exchangeSchedule('LSX')).resolves.toEqual(expect.objectContaining({ exchangeId: 'LSX' }));
    await expect(client.discovery.instrumentStatus('US1', 'LSX')).resolves.toEqual(expect.objectContaining({ isin: 'US1', exchangeId: 'LSX', status: 'OPEN' }));
    await expect(client.discovery.watchlists()).resolves.toEqual({ watchlists: [] });
    await expect(client.discovery.screeners()).resolves.toEqual({ screeners: [] });
    await expect(client.discovery.screenerOptions()).resolves.toEqual({ options: [] });
    await expect(client.discovery.userPreferences()).resolves.toEqual({ theme: 'dark' });
    await expect(client.trading.orderDestinations('US1', { side: 'BUY' })).resolves.toEqual([
      expect.objectContaining({ id: 'LSX', name: 'Lang & Schwarz' }),
    ]);
    await expect(client.trading.trades({ page: 1 })).resolves.toEqual([
      expect.objectContaining({ id: 't1', isin: 'US1', amount: 12, currency: 'EUR' }),
    ]);
    await expect(client.trading.dailyPnl([{ id: 'US1' }])).resolves.toEqual({ pnl: 1 });
    await expect(client.account.accountSettings()).resolves.toEqual({ account: true });
    await expect(client.account.personalDetails()).resolves.toEqual({ name: 'Example' });
    await expect(client.account.relationships()).resolves.toEqual({ relationships: [] });
    await expect(client.account.cardsHome()).resolves.toEqual({ cards: [] });
    await expect(client.documents.documents()).resolves.toEqual({ documents: [] });
    await expect(client.payments.paymentMethods()).resolves.toEqual({ paymentMethods: [] });
    await expect(client.payments.iban()).resolves.toEqual({ iban: 'DE00' });
    await expect(client.tax.taxInformation()).resolves.toEqual({ tax: true });
    await expect(client.tax.exemptionOrder()).resolves.toEqual({ exemptionOrder: true });
    await expect(client.tax.taxResidencies()).resolves.toEqual({ taxResidencies: [] });
    await expect(client.tax.taxResidencyCountries()).resolves.toEqual({ countries: [] });
    await expect(client.payments.interestDetails()).resolves.toEqual({ interest: true });

    const paths = calls.map((call) => new URL(call.url).pathname);
    expect(paths).toEqual([
      '/api-gateway/instrument-universe/api/v1/exchanges-details',
      '/api-gateway/instrument-universe/api/v1/exchanges/LSX/schedule',
      '/api-gateway/instrument-universe/api/v1/instruments/US1/status/LSX',
      '/api-gateway/watchlists/api/v2/watchlists',
      '/api-gateway/screeners/api/v2/screeners',
      '/api-gateway/screeners/api/v2/screeners/options',
      '/api-gateway/pro-trading/api/v1/user-preferences',
      '/api-gateway/order-router/api/v2/instruments/US1/destinations',
      '/web-trading-gateway/api/customer/v1/trades',
      '/web-trading-gateway/api/customer/v1/pnl/daily',
      '/api/v2/auth/account',
      '/api/v1/customer/personal-details',
      '/api/v1/customer/relationships/detailed',
      '/api/v1/card/cards/home',
      '/api/v1/documents/all',
      '/api/v2/payment/methods',
      '/api/v1/auth/account/iban',
      '/api/v1/taxes/information',
      '/api/v1/taxes/exemptionorders',
      '/api/v1/auth/account/change/taxresidencies',
      '/api/v1/country/taxresidency',
      '/api/v1/interest/details',
    ]);
    expect(new URL(calls[7]?.url ?? 'https://invalid.local/').searchParams.get('side')).toBe('BUY');
    expect(new URL(calls[8]?.url ?? 'https://invalid.local/').searchParams.get('page')).toBe('1');
    expect(calls[9]?.init.method).toBe('POST');
    expect(calls[9]?.init.body).toBe(JSON.stringify({ items: [{ id: 'US1' }] }));
  });

  it('exposes low-risk price alarm mapper mutations', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'createPriceAlarm') {
            socket.emit('message', `${id} createPriceAlarm ${JSON.stringify({ id: 'alarm-1' })}`);
          }
          if (payload.type === 'cancelPriceAlarm') {
            socket.emit('message', `${id} cancelPriceAlarm ${JSON.stringify({ status: 'ok', id: payload.id })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.priceAlarms.create({ isin: 'US1', price: 123.45, currency: 'EUR' })).resolves.toEqual({ id: 'alarm-1' });
    await expect(client.priceAlarms.cancel('alarm-1')).resolves.toEqual({ status: 'ok', id: 'alarm-1' });

    expect(parseSubPayload(sockets[0]?.sent[1])).toEqual({
      type: 'createPriceAlarm',
      isin: 'US1',
      price: { value: '123.45', currency: 'EUR' },
    });
    expect(parseSubPayload(sockets[1]?.sent[1])).toEqual({ type: 'cancelPriceAlarm', id: 'alarm-1' });
  });

  it('exposes low-risk watchlist REST mutations', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = TradeRepublicClient.create({
      fetch: mockFetchSequence(calls, [
        jsonResponse({ id: 'watchlist-1', name: 'sdk-test-watchlist' }),
        jsonResponse({ id: 'watchlist-1', name: 'sdk-test-watchlist-renamed' }),
        jsonResponse({ id: 'watchlist-1', instrumentId: 'US1' }),
        jsonResponse({}),
        jsonResponse({}),
      ]),
    });

    await expect(client.discovery.createWatchlist('sdk-test-watchlist')).resolves.toEqual({ id: 'watchlist-1', name: 'sdk-test-watchlist' });
    await expect(client.discovery.renameWatchlist('watchlist-1', 'sdk-test-watchlist-renamed')).resolves.toEqual({ id: 'watchlist-1', name: 'sdk-test-watchlist-renamed' });
    await expect(client.discovery.addWatchlistItem('watchlist-1', 'US1')).resolves.toEqual({ id: 'watchlist-1', instrumentId: 'US1' });
    await expect(client.discovery.removeWatchlistItem('watchlist-1', 'US1')).resolves.toEqual({});
    await expect(client.discovery.deleteWatchlist('watchlist-1')).resolves.toEqual({});

    expect(calls.map((call) => [call.init.method, new URL(call.url).pathname, call.init.body])).toEqual([
      ['POST', '/api-gateway/watchlists/api/v2/watchlists', JSON.stringify({ name: 'sdk-test-watchlist' })],
      ['PUT', '/api-gateway/watchlists/api/v2/watchlists/watchlist-1', JSON.stringify({ name: 'sdk-test-watchlist-renamed' })],
      ['POST', '/api-gateway/watchlists/api/v2/watchlists/watchlist-1/items', JSON.stringify({ instrument_id: 'US1', item_rank: -1 })],
      ['DELETE', '/api-gateway/watchlists/api/v2/watchlists/watchlist-1/items/US1', undefined],
      ['DELETE', '/api-gateway/watchlists/api/v2/watchlists/watchlist-1', undefined],
    ]);
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
      from: '2026-07-01T00:00:00.000Z',
    })).resolves.toEqual([
      expect.objectContaining({ time: '2026-07-02T12:00:00.000Z', open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }),
    ]);
    expect(sockets[0]?.sent[0]).toMatch(/^connect 34 /);
  });
});

function mockFetch(calls: Array<{ url: string; init: RequestInit }>, responseBody: unknown): typeof fetch {
  return (async (url: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return jsonResponse(responseBody);
  }) as typeof fetch;
}

function mockFetchMap(responses: Map<string, unknown>): typeof fetch {
  return (async (url: URL | RequestInfo) => {
    const parsed = new URL(String(url));
    const response = responses.get(parsed.pathname);
    if (response === undefined) return jsonResponse({ error: 'not found' }, 404);
    return jsonResponse(response);
  }) as typeof fetch;
}

function mockFetchSequence(calls: Array<{ url: string; init: RequestInit }>, responses: Response[]): typeof fetch {
  return (async (url: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const response = responses.shift();
    return response ?? jsonResponse({ error: 'not found' }, 404);
  }) as typeof fetch;
}

function expectOrderCall(call: { url: string; init: RequestInit } | undefined, expected: Record<string, string>): void {
  expect(call).toBeDefined();
  const url = new URL(call?.url ?? 'https://invalid.local/');
  expect(url.origin).toBe('https://api.traderepublic.com');
  expect(url.pathname).toBe('/web-trading-gateway/api/customer/v1/orders');
  for (const [key, value] of Object.entries(expected)) {
    expect(url.searchParams.get(key)).toBe(value);
  }
}

function parseSubPayload(message: string | undefined): unknown {
  expect(message).toBeDefined();
  const text = message ?? '';
  const secondSpace = text.indexOf(' ', text.indexOf(' ') + 1);
  return JSON.parse(text.slice(secondSpace + 1));
}

function accountPairsPayload(): unknown {
  return {
    authAccountId: 'auth-account-1',
    accounts: [
      {
        securitiesAccountNumber: '0000000001',
        cashAccountNumber: '0000000002',
        productType: 'DEFAULT',
        currency: 'EUR',
        accountAccessType: 'OWNER',
      },
    ],
  };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}
