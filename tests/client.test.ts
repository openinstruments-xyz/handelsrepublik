import assert from 'node:assert/strict';
import { describe, expect, it } from './test-compat.js';
import { TradeRepublicClient } from '../src/index.js';
import { decodeMapperProtobufRequest, encodeMapperProtobufDataEnvelope, encodeMapperProtobufTopicPayload } from '../src/mapper-protobuf.js';
import { FakeSocket } from './fake-socket.js';
import { TEST_DEVICE_INFO, mockFetchSequence, parseSubPayload, accountPairsPayload, jsonResponse } from './unit/test-helpers.js';

describe('TradeRepublicClient', () => {
  it('initializes the public securities account number from an existing session', () => {
    const client = TradeRepublicClient.create({
      session: {
        deviceInfo: TEST_DEVICE_INFO,
        securitiesAccountNumber: '0000000000',
      },
    });

    expect(client.securitiesAccountNumber).toBe('0000000000');
    expect(client.getSession()).toMatchObject({ securitiesAccountNumber: '0000000000' });
  });

  it('attaches web context per client and preserves it when saving sessions', async () => {
    const saved: unknown[] = [];
    const first = TradeRepublicClient.create({
      webContext: {
        awsWafToken: 'waf-token',
        cookies: {
          tr_session: 'web-session',
        },
      },
      deviceInfo: {
        stableDeviceId: 'captured-fingerprint',
        browser: 'Firefox',
        preferredLanguages: ['de-DE', 'de'],
        numberOfCores: 8,
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
    });
    const second = TradeRepublicClient.create();

    first.setSession({
      accessToken: 'login-token',
    });
    await first.auth.saveSession();

    expect(first.getSession()).toMatchObject({
      accessToken: 'login-token',
      deviceInfo: {
        stableDeviceId: 'captured-fingerprint',
        preferredLanguages: ['de-DE', 'de'],
        numberOfCores: 8,
      },
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
        deviceInfo: expect.objectContaining({ stableDeviceId: 'captured-fingerprint' }),
        webContext: expect.objectContaining({ awsWafToken: 'waf-token' }),
      }),
    ]);
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
        }, (binary) => {
          const request = decodeMapperProtobufRequest(binary);
          if (request.topic !== 'priceAlarmNotifications') return;
          const payload = encodeMapperProtobufTopicPayload(request.topic, {
            priceAlarms: [{
              alarmId: { id: Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2]) },
              isin: 'US1',
              name: 'Apple',
              price: { value: { unscaled: Uint8Array.from([0x3a, 0x98]), scale: 2 }, currency: 1 },
            }],
          });
          socket.emit('message', encodeMapperProtobufDataEnvelope(request.subscriptionId, payload), true);
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
      expect.objectContaining({ id: '00000000-0000-0000-0000-000000000002', name: 'Apple', price: 150 }),
    ]);

    expect(parseSubPayload(sockets[0]?.sent[1])).toEqual({ type: 'timelineActivityLog', after: 'cursor-1' });
    expect(parseSubPayload(sockets[1]?.sent[1])).toEqual({ type: 'timelineActionsV2' });
    expect(parseSubPayload(sockets[2]?.sent[1])).toEqual({ type: 'timelineDetailV2', orderId: 'order-1' });
    expect(parseSubPayload(sockets[3]?.sent[1])).toEqual({ type: 'priceAlarms' });
    expect(decodeMapperProtobufRequest(sockets[4]!.binarySent[0]!)).toEqual({
      subscriptionId: 1,
      topic: 'priceAlarmNotifications',
    });
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
    expect(parseSubPayload(sockets[7]?.sent[1])).toEqual({ type: 'priceForOrderV2', unit: 'EUR', isin: 'US1', exchangeId: 'LSX', side: 'buy' });
  });

  it('exposes unique app-consent, valuation, tape, aggregate, and tax-wrapper reads', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      fetch: mockFetchSequence(calls, [jsonResponse({ consents: [] })]),
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'bondValuationV2') socket.emit('message', `${id} A ${JSON.stringify({ value: 100 })}`);
          if (payload.type === 'fixedSavingsValuation') socket.emit('message', `${id} A ${JSON.stringify({ value: 101 })}`);
          if (payload.type === 'taxWrapperAccountUtilization') socket.emit('message', `${id} A ${JSON.stringify({ utilized: 1 })}`);
          if (payload.type === 'tradeAggregateHistory') socket.emit('message', `${id} A ${JSON.stringify({ aggregates: [] })}`);
          if (payload.type === 'tape') socket.emit('message', `${id} A ${JSON.stringify({ trades: [] })}`);
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.account.appUsageConsents()).resolves.toEqual({ consents: [] });
    await expect(client.portfolio.bondValuation('DE1', '0000000001')).resolves.toEqual({ value: 100 });
    await expect(client.portfolio.fixedSavingsValuation('DE1', '0000000001')).resolves.toEqual({ value: 101 });
    await expect(client.tax.accountUtilization('0000000001')).resolves.toEqual({ utilized: 1 });
    await expect(client.trading.tradeAggregateHistory('US1', 'LSX', 60_000, 1, 2)).resolves.toEqual({ aggregates: [] });
    const tape = client.trading.tape('US1', 'LSX');
    const event = await tape[Symbol.asyncIterator]().next();
    expect(event).toEqual({ done: false, value: { trades: [] } });
    tape.close();

    expect(new URL(calls[0]?.url ?? 'https://invalid.local/').pathname).toBe('/api/v1/customer/app-usage-data-consents');
    const payloads = sockets.map((socket) => parseSubPayload(socket.sent[1]));
    assert.deepEqual(payloads, [
      { type: 'bondValuationV2', instrumentId: 'DE1', secAccNo: '0000000001' },
      { type: 'fixedSavingsValuation', instrumentId: 'DE1', secAccNo: '0000000001' },
      { type: 'taxWrapperAccountUtilization', secAccNo: '0000000001' },
      { type: 'tradeAggregateHistory', isin: 'US1', exchangeId: 'LSX', resolution: 60_000, from: 1, until: 2 },
      { type: 'tape', isin: 'US1', exchangeId: 'LSX', unit: 'EUR' },
    ]);
  });

  it('exposes REST-backed discovery, account, docs, tax, payment, and trading APIs', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = TradeRepublicClient.create({
      fetch: mockFetchSequence(calls, [
        jsonResponse({ data: [{ exchangeId: 'LSX', name: 'Lang & Schwarz' }] }),
        jsonResponse({ exchangeId: 'LSX', sessions: [] }),
        jsonResponse({ isin: 'US1', exchangeId: 'LSX', status: 'OPEN' }),
        jsonResponse({ watchlists: [{ id: 'wl-1', name: 'Main', items: [] }] }),
        jsonResponse({ screeners: [] }),
        jsonResponse({ options: [] }),
        jsonResponse({ theme: 'dark' }),
        jsonResponse({
          destinations: [{ exchangeId: 'LSX', name: 'Lang & Schwarz' }],
          preferredMarketDataProvider: 'LSX',
          preferredOrderDestination: 'LSX',
        }),
        jsonResponse({ priceLevels: { bidLevels: [{ price: 10, qty: 2 }], askLevels: [{ price: 11, qty: 3 }] } }),
        jsonResponse({ trades: [{ timestamp: '2026-07-22T10:00:00Z', price: { value: 10.5, currency: 'EUR' }, size: 1 }] }),
        jsonResponse([{
          currentQty: 1,
          day: '2026-07-22',
          instrumentId: 'US1',
          intradayOpenCost: 0,
          realizedBase: 0,
          secAccNo: '0000000001',
          sodOpenQty: 1,
          sodQty: 1,
          sodSoldQty: 0,
        }]),
        jsonResponse({ account: true }),
        jsonResponse({ name: 'Example' }),
        jsonResponse({
          relationships: [{
            customerId: 'customer-1',
            firstName: 'Example',
            lastName: 'Person',
            relationshipType: 'SELF',
            bankingInfo: { iban: 'DE00', bic: 'TRBKDEBBXXX' },
          }],
        }),
        jsonResponse({ cards: [] }),
        jsonResponse({ documents: [] }),
        jsonResponse({ paymentMethods: [] }),
        jsonResponse({
          relationships: [
            {
              customerId: 'child-1',
              firstName: 'Child',
              lastName: 'Account',
              relationshipType: 'CHILD',
              bankingInfo: { iban: 'DE11', bic: 'CHILDXXX' },
            },
            {
              customerId: 'customer-1',
              firstName: 'Example',
              lastName: 'Person',
              relationshipType: 'SELF',
              bankingInfo: { iban: 'DE00', bic: 'TRBKDEBBXXX' },
            },
          ],
        }),
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
    await expect(client.discovery.watchlists()).resolves.toEqual([
      {
        id: 'wl-1',
        name: 'Main',
        items: [],
        raw: { id: 'wl-1', name: 'Main', items: [] },
      },
    ]);
    await expect(client.discovery.screeners()).resolves.toEqual({ screeners: [] });
    await expect(client.discovery.screenerOptions()).resolves.toEqual({ options: [] });
    await expect(client.discovery.userPreferences()).resolves.toEqual({ theme: 'dark' });
    await expect(client.trading.orderDestinations('US1', { side: 'BUY' })).resolves.toEqual([
      expect.objectContaining({ id: 'LSX', name: 'Lang & Schwarz' }),
    ]);
    await expect(client.trading.orderBookSnapshot('trade/1')).resolves.toEqual({
      priceLevels: { bidLevels: [{ price: 10, qty: 2 }], askLevels: [{ price: 11, qty: 3 }] },
    });
    await expect(client.trading.tapeSnapshot('trade/1')).resolves.toEqual({
      trades: [{ timestamp: '2026-07-22T10:00:00Z', price: { value: 10.5, currency: 'EUR' }, size: 1 }],
    });
    await expect(client.trading.dailyPnl([{
      secAccNo: '0000000001', instrumentId: 'US1', day: '2026-07-22', quantity: 1,
    }])).resolves.toEqual([expect.objectContaining({ instrumentId: 'US1' })]);
    await expect(client.account.accountSettings()).resolves.toEqual({ account: true });
    await expect(client.account.personalDetails()).resolves.toEqual({ name: 'Example' });
    await expect(client.account.relationships()).resolves.toEqual([
      {
        customerId: 'customer-1',
        firstName: 'Example',
        lastName: 'Person',
        relationshipType: 'SELF',
        bankingInfo: {
          iban: 'DE00',
          bic: 'TRBKDEBBXXX',
          raw: { iban: 'DE00', bic: 'TRBKDEBBXXX' },
        },
        raw: {
          customerId: 'customer-1',
          firstName: 'Example',
          lastName: 'Person',
          relationshipType: 'SELF',
          bankingInfo: { iban: 'DE00', bic: 'TRBKDEBBXXX' },
        },
      },
    ]);
    await expect(client.account.cardsHome()).resolves.toEqual({ cards: [] });
    await expect(client.documents.documents()).resolves.toEqual({ documents: [] });
    await expect(client.payments.paymentMethods()).resolves.toEqual({ paymentMethods: [] });
    await expect(client.payments.iban()).resolves.toEqual({
      iban: 'DE00',
      bic: 'TRBKDEBBXXX',
      accountHolder: 'Example Person',
      customerId: 'customer-1',
      relationshipType: 'SELF',
      raw: {
        customerId: 'customer-1',
        firstName: 'Example',
        lastName: 'Person',
        relationshipType: 'SELF',
        bankingInfo: { iban: 'DE00', bic: 'TRBKDEBBXXX' },
      },
    });
    await expect(client.tax.taxInformation()).resolves.toEqual({ tax: true });
    await expect(client.tax.exemptionOrder()).resolves.toEqual({ exemptionOrder: true });
    await expect(client.tax.taxResidencies()).resolves.toEqual({ taxResidencies: [] });
    await expect(client.tax.taxResidencyCountries()).resolves.toEqual({ countries: [] });
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
      '/web-trading-gateway/api/customer/v1/trades/trade%2F1/order-book-snapshot',
      '/web-trading-gateway/api/customer/v1/trades/trade%2F1/tape-snapshot',
      '/web-trading-gateway/api/customer/v1/pnl/daily',
      '/api/v2/auth/account',
      '/api/v1/customer/personal-details',
      '/api/v1/customer/relationships/detailed',
      '/api/v1/card/cards/home',
      '/api/v1/documents/all',
      '/api/v2/payment/methods',
      '/api/v1/customer/relationships/detailed',
      '/api/v1/taxes/information',
      '/api/v1/taxes/exemptionorders',
      '/api/v1/auth/account/change/taxresidencies',
      '/api/v1/country/taxresidency',
    ]);
    expect(new URL(calls[7]?.url ?? 'https://invalid.local/').searchParams.get('side')).toBe('BUY');
    expect(new URL(calls[7]?.url ?? 'https://invalid.local/').searchParams.get('jurisdiction')).toBe('DE');
    expect(calls[10]?.init.method).toBe('POST');
    expect(calls[10]?.init.body).toBe(JSON.stringify({
      items: [{ secAccNo: '0000000001', instrumentId: 'US1', day: '2026-07-22', quantity: 1 }],
    }));
  });

  it('keeps the named web and market convenience surface', () => {
    const client = TradeRepublicClient.create();
    const webMethods = [
      'timeline',
      'timelineActions',
      'timelineDetail',
      'priceAlarms',
      'priceAlarmNotifications',
      'savingsPlans',
      'portfolioChart',
      'news',
      'etfDetails',
      'etfComposition',
      'mutualFundDetails',
      'mutualFundComposition',
      'cryptoDetails',
      'yieldToMaturity',
      'bondValuation',
      'fixedSavingsValuation',
      'privateMarketsPositions',
      'tape',
      'tradeAggregateHistory',
      'priceForOrder',
      'availableSize',
      'taxWrapperAccountUtilization',
      'userPreferences',
      'exchangeDetails',
      'exchangeSchedule',
      'instrumentStatus',
      'orderDestinations',
      'orderBookSnapshot',
      'tapeSnapshot',
      'dailyPnl',
      'documents',
      'personalDetails',
      'relationships',
      'cardsHome',
      'accountSettings',
      'appUsageConsents',
      'paymentMethods',
      'iban',
      'rawIban',
      'taxInformation',
      'exemptionOrder',
      'taxResidencies',
      'taxResidencyCountries',
      'watchlists',
      'screeners',
      'screenerOptions',
    ] as const;

    for (const method of webMethods) {
      expect(typeof client.web[method]).toBe('function');
    }
    expect(typeof client.market.liveFeed).toBe('function');
    expect(typeof client.market.subscribeL2OrderBook).toBe('function');
    expect(typeof client.market.snapshotL2OrderBook).toBe('function');
    expect('l2OrderBook' in client.market).toBe(false);
  });
});
