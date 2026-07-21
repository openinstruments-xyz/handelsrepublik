import { existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FileSessionStore,
  TradeRepublicClient,
  validateRawResponse,
} from '../../src/index.js';
import type { AssetSearchType } from '../../src/index.js';
import { withLiveDiagnostics } from '../live-diagnostics.js';

const enabled = process.env.TR_INTEGRATION === '1';
const sessionPath = process.env.TR_SESSION_FILE ?? join(process.cwd(), 'demo', '.demo-session.json');
const testAssetId = process.env.TR_INTEGRATION_ISIN ?? 'US0378331005';
const testExchangeId = process.env.TR_INTEGRATION_EXCHANGE ?? 'LSX';
const testQuery = process.env.TR_INTEGRATION_QUERY ?? 'apple';
const testAssetType = (process.env.TR_INTEGRATION_TYPE ?? 'stock') as AssetSearchType;
const testPriceAlarmPrice = Number(process.env.TR_INTEGRATION_PRICE_ALARM_PRICE ?? '1');
const defaultWatchlistId = '00000000-0000-0000-0000-000000000000';
const bitcoinAssetId = 'XF000BTC0017';
const bitcoinExchangeId = 'BHS';
const appleAssetId = 'US0378331005';
const appleL2ExchangeId = 'XETR';
const runXetraMarketHoursTests = isXetraMarketHours();
const runLowRiskMutationTests = process.env.TR_INTEGRATION_LOW_RISK_MUTATIONS === '1';

describe('TradeRepublicClient live integration', { skip: enabled ? false : 'set TR_INTEGRATION=1 to run live Trade Republic integration tests' }, () => {
  liveIt('restores and refreshes an existing real web session', { timeout: 30_000 }, async () => {
    const { client } = await createLiveClient();

    const restored = client.getSession();
    assert.ok(restored?.cookies || restored?.sessionToken || restored?.accessToken || restored?.refreshToken, 'expected a restored session with auth material');

    const refreshed = await client.auth.refreshSession();
    assert.ok(refreshed.cookies || refreshed.sessionToken || refreshed.accessToken || refreshed.refreshToken, 'expected a refreshed session with auth material');
  });

  liveIt('reads account and portfolio data without mutations', { timeout: 45_000 }, async () => {
    const { client } = await createLiveClient();

    const [account, cash, portfolio] = await Promise.all([
      client.account.current(),
      client.portfolio.cash(),
      client.portfolio.current({ timeoutMs: 15_000 }),
    ]);

    assertObject(account, 'account.current');
    assertObject(cash, 'portfolio.cash');
    assertObject(portfolio, 'portfolio.current');
    assert.ok(client.securitiesAccountNumber ?? client.getSession()?.securitiesAccountNumber, 'expected securities account number to be auto-resolved');
  });

  liveIt('exercises read-only convenience methods used by the demos', { timeout: 60_000 }, async () => {
    const { client } = await createLiveClient();
    await client.auth.refreshSession();
    const secAccNo = client.securitiesAccountNumber ?? client.getSession()?.securitiesAccountNumber;
    assert.ok(secAccNo, 'expected securities account number to be available');

    const [session, boards, mutualFundOrders, privateMarketOrders, markToMarket, portfolio] = await Promise.all([
      client.account.session(),
      client.boards.list(),
      client.orders.mutualFunds(),
      client.orders.privateMarkets(),
      client.portfolio.markToMarketValue(),
      client.portfolio.positionsForAccount(secAccNo, { timeoutMs: 15_000 }),
    ]);

    assertOptionalObject(session, 'account.session');
    assert.ok(Array.isArray(boards), 'boards.list should return an array');
    assert.ok(Array.isArray(mutualFundOrders), 'orders.mutualFunds should return an array');
    assert.ok(Array.isArray(privateMarketOrders), 'orders.privateMarkets should return an array');
    assertObject(markToMarket, 'portfolio.markToMarketValue');
    assertObject(portfolio, 'portfolio.positionsForAccount');
  });

  liveIt('reads market discovery, search, candles, and current price data', { timeout: 60_000 }, async () => {
    const { client } = await createLiveClient();

    const [searchResults, asset, venues, candles, price, subscriptions, l2Entitlements] = await Promise.all([
      client.assets.search(testQuery, { type: testAssetType, limit: 5 }),
      client.assets.get(testAssetId),
      client.market.availableL2Books(testAssetId),
      client.raw.query({ type: 'aggregateHistoryLightV2', isin: testAssetId, exchangeId: testExchangeId, unit: 'EUR', range: '1d' }, { timeoutMs: 15_000 }),
      client.raw.query({ type: 'ticker', id: `${testAssetId}.${testExchangeId}` }, { timeoutMs: 15_000 }),
      client.market.subscriptions(),
      client.market.entitlements('L2', { exchangeIds: ['LSX', 'XETR'] }),
    ]);

    assert.ok(Array.isArray(searchResults), 'assets.search should return an array');
    assert.ok(searchResults.length > 0, `expected at least one search result for ${testQuery}`);
    assertObject(asset, 'assets.get');
    assert.ok(Array.isArray(venues), 'market.availableL2Books should return an array');
    assert.ok(candles !== undefined && candles !== null, 'aggregateHistoryLightV2 should return a payload');
    assert.ok(price !== undefined && price !== null, 'ticker should return a current-price payload');
    assert.ok(Array.isArray(subscriptions), 'market.subscriptions should return an array');
    assert.equal(l2Entitlements.name, 'L2');
    assert.ok(Array.isArray(l2Entitlements.entitlements), 'market.entitlements should return an array of explicit entitlement entries');
  });

  liveIt('lists current derivative products for an underlying', { timeout: 45_000 }, async () => {
    const { client } = await createLiveClient();
    await client.auth.refreshSession();
    const derivatives = await client.derivatives.listForUnderlying(testAssetId, { limit: 10 });
    assert.ok(Array.isArray(derivatives), 'derivatives.listForUnderlying should return an array');
    assert.ok(derivatives.length > 0, `expected derivative products for ${testAssetId}`);
  });

  liveIt('reads user/account document and preference endpoints without mutations', { timeout: 60_000 }, async (t) => {
    const { client } = await createLiveClient();

    const calls = [
      { name: 'account.personalDetails', run: () => client.account.personalDetails() },
      {
        name: 'account.relationships',
        run: async () => {
          const relationships = await client.account.relationships();
          assert.ok(
            firstStringByKey(relationships, 'iban'),
            'account.relationships should include bankingInfo.iban for the personal account',
          );
          return relationships;
        },
      },
      { name: 'account.cardsHome', run: () => client.account.cardsHome() },
      { name: 'documents.documents', run: () => client.documents.documents() },
      { name: 'payments.paymentMethods', run: () => client.payments.paymentMethods() },
      {
        name: 'payments.iban',
        run: async () => {
          const ibanInfo = await client.payments.iban();
          assert.ok(ibanInfo.iban, 'payments.iban should return the personal account IBAN');
          return ibanInfo;
        },
      },
      { name: 'tax.taxInformation', run: () => client.tax.taxInformation() },
      { name: 'tax.exemptionOrder', run: () => client.tax.exemptionOrder() },
      { name: 'tax.taxResidencies', run: () => client.tax.taxResidencies() },
      { name: 'tax.taxResidencyCountries', run: () => client.tax.taxResidencyCountries() },
      { name: 'discovery.exchangeDetails', run: () => client.discovery.exchangeDetails() },
      { name: 'discovery.watchlists', run: () => client.discovery.watchlists() },
      { name: 'discovery.screeners', run: () => client.discovery.screeners() },
      { name: 'discovery.screenerOptions', run: () => client.discovery.screenerOptions() },
      { name: 'discovery.userPreferences', run: () => client.discovery.userPreferences() },
    ];
    for (const call of calls) {
      await t.test(call.name, async () => {
        await withLiveDiagnostics(call.name, call.run);
      });
    }
  });

  liveIt('receives at least one read-only websocket resource message', { timeout: 30_000 }, async () => {
    const { client } = await createLiveClient();
    const subscription = client.raw.subscribeResource({ type: 'availableCash' });
    try {
      const value = await nextStreamValue(subscription, 'availableCash websocket payload');
      assert.ok(value !== undefined && value !== null, 'expected websocket resource payload');
    } finally {
      subscription.close();
    }
  });

  liveIt('reads protobuf price alarm notifications', { timeout: 30_000 }, async () => {
    const { client } = await createLiveClient();
    await client.auth.refreshSession();
    const notifications = await client.priceAlarms.notifications({ timeoutMs: 15_000 });
    assert.ok(Array.isArray(notifications), 'priceAlarms.notifications should return an array');
    await client.close();
  });

  liveIt('opens the protobuf order update stream without a protocol rejection', { timeout: 30_000 }, async () => {
    const { client } = await createLiveClient();
    await client.auth.refreshSession();
    const secAccNo = client.securitiesAccountNumber ?? client.getSession()?.securitiesAccountNumber;
    assert.ok(secAccNo, 'expected securities account number to be available');
    const subscription = client.orders.orderUpdates(secAccNo);
    const iterator = subscription[Symbol.asyncIterator]();
    try {
      const result = await Promise.race([
        iterator.next(),
        delay(2_000).then(() => ({ timedOut: true as const })),
      ]);
      if (!('timedOut' in result)) {
        assert.equal(result.done, false, 'order update stream ended before yielding data');
        validateRawResponse('orders.orderUpdates', result.value);
      }
    } finally {
      subscription.close();
      await client.close();
    }
  });

  liveIt('streams BTC ticker updates', { timeout: 30_000 }, async () => {
    const { client } = await createLiveClient();
    const subscription = client.market.liveFeed(bitcoinAssetId, {
      exchangeId: bitcoinExchangeId,
    });
    try {
      const event = await nextStreamValue(subscription, 'BTC ticker');
      assertObject(event, 'BTC ticker event');
      assert.notEqual(event.raw, undefined, 'BTC ticker event should contain its raw payload');
    } finally {
      subscription.close();
    }
  });

  liveIt('streams AAPL L2 market data on Xetra during German market hours', {
    timeout: 30_000,
    skip: runXetraMarketHoursTests ? false : 'runs only during Xetra market hours (weekdays, 09:00-17:30 Europe/Berlin)',
  }, async () => {
    const { client } = await createLiveClient();
    const subscription = client.market.l2OrderBook(appleAssetId, appleL2ExchangeId);
    try {
      const orderBook = await nextStreamValue(subscription, 'AAPL/XETR L2 order book');
      assert.ok(orderBook.bids.length + orderBook.asks.length > 0, 'expected at least one AAPL/XETR L2 level');
    } finally {
      subscription.close();
    }
  });

  liveIt('validates disposable low-risk price alarm mutations with cleanup', {
    timeout: 45_000,
    skip: runLowRiskMutationTests ? false : 'set TR_INTEGRATION_LOW_RISK_MUTATIONS=1 to allow disposable price-alarm mutations',
  }, async () => {
    const { client } = await createLiveClient();
    let alarmId: string | undefined;

    try {
      const created = await client.priceAlarms.create({
        isin: testAssetId,
        price: testPriceAlarmPrice,
        timeoutMs: 15_000,
      });
      alarmId = firstStringByKey(created, 'id', 'priceAlarmId', 'alarmId');

      const alarms = await client.priceAlarms.list({ timeoutMs: 15_000 });
      const createdAlarm = alarms.find((alarm) => alarmId ? alarm.id === alarmId : alarm.isin === testAssetId && alarm.price === testPriceAlarmPrice);
      assert.ok(createdAlarm, 'expected disposable price alarm to be visible in list after create');
      alarmId = createdAlarm.id || alarmId;
      assert.ok(alarmId, 'expected disposable price alarm id for cleanup');
    } finally {
      if (alarmId) await client.priceAlarms.cancel(alarmId, { timeoutMs: 15_000 });
    }
  });

  liveIt('validates restorable low-risk watchlist mutations', {
    timeout: 45_000,
    skip: runLowRiskMutationTests ? false : 'set TR_INTEGRATION_LOW_RISK_MUTATIONS=1 to allow watchlist mutations',
  }, async (t) => {
    const { client } = await createLiveClient();
    const watchlists = await client.discovery.watchlists();
    const watchlistId = firstStringByKey(watchlists, 'id', 'watchlistId');
    assert.ok(watchlistId, 'expected an existing cloud watchlist');

    const items = await client.discovery.rawWatchlistItems(watchlistId);
    const candidates = [testAssetId, 'US5949181045', 'US67066G1040'];
    const instrumentId = candidates.find((candidate) => !hasStringByKey(items, candidate, 'instrumentId', 'instrument_id', 'isin'));
    assert.ok(instrumentId, 'expected at least one test instrument that is not already in the watchlist');

    await t.test('renames the cloud watchlist when the account supports rename', async (renameTest) => {
      if (watchlistId === defaultWatchlistId) {
        renameTest.skip('the built-in default watchlist supports item changes but cannot be renamed');
        return;
      }
      await withLiveDiagnostics(
        'discovery.watchlists.rename',
        () => client.discovery.renameWatchlist(watchlistId, firstStringByKey(watchlists, 'name', 'title') ?? ''),
      );
    });

    await t.test('adds and removes a disposable watchlist item', () => withLiveDiagnostics('watchlists.addRemoveItem', async () => {
      let added = false;
      try {
        await client.discovery.addWatchlistItem(watchlistId, instrumentId);
        added = true;
        assert.equal(hasStringByKey(await client.discovery.rawWatchlistItems(watchlistId), instrumentId, 'instrumentId', 'instrument_id', 'isin'), true);
        await client.discovery.removeWatchlistItem(watchlistId, instrumentId);
        added = false;
        assert.equal(hasStringByKey(await client.discovery.rawWatchlistItems(watchlistId), instrumentId, 'instrumentId', 'instrument_id', 'isin'), false);
      } finally {
        if (added) await client.discovery.removeWatchlistItem(watchlistId, instrumentId);
      }
    }));
  });

  liveIt('validates disposable watchlist clone/delete when the account supports clones', {
    timeout: 60_000,
    skip: runLowRiskMutationTests ? false : 'set TR_INTEGRATION_LOW_RISK_MUTATIONS=1 to allow watchlist mutations',
  }, async (t) => {
    const { client } = await createLiveClient();
    const name = `sdk-test-${Date.now()}`;
    const renamed = `${name}-renamed`;
    let watchlistId: string | undefined;

    try {
      const before = await client.discovery.watchlists();
      const sourceWatchlistId = firstStringByKey(before, 'id', 'watchlistId');
      assert.ok(sourceWatchlistId, 'expected an existing watchlist to clone');
      if (sourceWatchlistId === defaultWatchlistId) {
        t.skip('the account only exposes the built-in default watchlist, which cannot be cloned');
        return;
      }
      const existingIds = new Set(allStringsByKey(before, 'id', 'watchlistId'));

      const created = await withLiveDiagnostics(
        'discovery.watchlists.clone',
        () => client.discovery.cloneWatchlist(sourceWatchlistId),
      );
      watchlistId = allStringsByKey(created, 'id', 'watchlistId').find((id) => !existingIds.has(id));
      for (let attempt = 0; !watchlistId && attempt < 10; attempt += 1) {
        await delay(500);
        watchlistId = allStringsByKey(await client.discovery.watchlists(), 'id', 'watchlistId').find((id) => !existingIds.has(id));
      }
      assert.ok(watchlistId, 'expected disposable watchlist id after clone');
      const clonedWatchlistId = watchlistId;

      await withLiveDiagnostics(
        'discovery.watchlists.rename',
        () => client.discovery.renameWatchlist(clonedWatchlistId, renamed),
      );
      const clonedItems = await client.discovery.rawWatchlistItems(watchlistId);
      if (hasStringByKey(clonedItems, testAssetId, 'instrumentId', 'instrument_id', 'isin')) {
        await client.discovery.removeWatchlistItem(watchlistId, testAssetId);
      }
      await client.discovery.addWatchlistItem(watchlistId, testAssetId);
      assert.equal(hasStringByKey(await client.discovery.rawWatchlistItems(watchlistId), testAssetId, 'instrumentId', 'instrument_id', 'isin'), true);
      await client.discovery.removeWatchlistItem(watchlistId, testAssetId);
      assert.equal(hasStringByKey(await client.discovery.rawWatchlistItems(watchlistId), testAssetId, 'instrumentId', 'instrument_id', 'isin'), false);

      const watchlists = await client.discovery.watchlists();
      assert.equal(findWatchlistId(watchlists, renamed), watchlistId);
    } finally {
      if (watchlistId) await client.discovery.deleteWatchlist(watchlistId);
    }
  });
});

interface LiveTestContext {
  skip(message?: string): void;
  test(name: string, body: (context: LiveTestContext) => void | Promise<void>): Promise<void>;
}

interface LiveTestOptions {
  timeout?: number;
  skip?: boolean | string;
}

type LiveTestBody = (context: LiveTestContext) => void | Promise<void>;

function liveIt(name: string, body: LiveTestBody): void;
function liveIt(name: string, options: LiveTestOptions, body: LiveTestBody): void;
function liveIt(
  name: string,
  optionsOrBody: LiveTestOptions | LiveTestBody,
  body?: LiveTestBody,
): void {
  const options = typeof optionsOrBody === 'function' ? {} : optionsOrBody;
  const testBody = typeof optionsOrBody === 'function' ? optionsOrBody : body;
  if (!testBody) throw new Error(`Live test ${name} has no body.`);

  void it(name, options, (context) => withLiveDiagnostics(name, () => testBody(context)));
}

async function createLiveClient(): Promise<{ client: TradeRepublicClient }> {
  if (!existsSync(sessionPath)) {
    throw new Error(`Live integration tests need an existing session file. Run the REPL login first or set TR_SESSION_FILE. Missing: ${sessionPath}`);
  }

  const sessionStore = new FileSessionStore(sessionPath);
  const client = TradeRepublicClient.create({ sessionStore });
  const session = await client.auth.restoreSession();
  if (!session) throw new Error(`No session could be loaded from ${sessionPath}`);

  return { client };
}

function assertObject(value: unknown, label: string): void {
  assert.ok(value !== null && typeof value === 'object', `${label} should return an object`);
}

function assertOptionalObject(value: unknown, label: string): void {
  assert.ok(value === undefined || (value !== null && typeof value === 'object'), `${label} should return an empty or object response`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function nextStreamValue<T>(
  subscription: AsyncIterable<T>,
  label: string,
  timeoutMs = 15_000,
): Promise<T> {
  const iterator = subscription[Symbol.asyncIterator]();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      iterator.next(),
      new Promise<{ timedOut: true }>((resolve) => {
        timeout = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
      }),
    ]);
    assert.ok(!('timedOut' in result), `timed out waiting for ${label}`);
    assert.equal(result.done, false, `${label} stream ended before yielding data`);
    return result.value;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function isXetraMarketHours(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): string | undefined => parts.find((item) => item.type === type)?.value;
  const weekday = part('weekday');
  const minutes = Number(part('hour')) * 60 + Number(part('minute'));
  return weekday !== undefined && !['Sat', 'Sun'].includes(weekday) && minutes >= 9 * 60 && minutes < 17 * 60 + 30;
}

function firstStringByKey(value: unknown, ...keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstStringByKey(item, ...keys);
      if (found) return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate) return candidate;
  }
  for (const candidate of Object.values(record)) {
    const found = firstStringByKey(candidate, ...keys);
    if (found) return found;
  }
  return undefined;
}

function allStringsByKey(value: unknown, ...keys: string[]): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((item) => allStringsByKey(item, ...keys));
  const record = value as Record<string, unknown>;
  return [
    ...keys.flatMap((key) => typeof record[key] === 'string' && record[key] ? [record[key] as string] : []),
    ...Object.values(record).flatMap((candidate) => allStringsByKey(candidate, ...keys)),
  ];
}

function hasStringByKey(value: unknown, expected: string, ...keys: string[]): boolean {
  return allStringsByKey(value, ...keys).includes(expected);
}

function findWatchlistId(value: unknown, name: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findWatchlistId(item, name);
      if (found) return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (record.name === name || record.title === name) {
    return firstStringByKey(record, 'id', 'watchlistId');
  }
  for (const candidate of Object.values(record)) {
    const found = findWatchlistId(candidate, name);
    if (found) return found;
  }
  return undefined;
}
