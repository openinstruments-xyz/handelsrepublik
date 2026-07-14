import { existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FileSessionStore,
  schemaRegistry,
  TradeRepublicClient,
  TradeRepublicHttpError,
  TradeRepublicProtocolError,
  TradeRepublicSchemaError,
} from '../../src/index.js';

const enabled = process.env.TR_INTEGRATION === '1';
const sessionPath = process.env.TR_SESSION_FILE ?? join(process.cwd(), 'demo', '.demo-session.json');
const testAssetId = process.env.TR_INTEGRATION_ISIN ?? 'US0378331005';
const testExchangeId = process.env.TR_INTEGRATION_EXCHANGE ?? 'LSX';
const testQuery = process.env.TR_INTEGRATION_QUERY ?? 'apple';
const testAssetType = process.env.TR_INTEGRATION_TYPE ?? 'stock';
const testPriceAlarmPrice = Number(process.env.TR_INTEGRATION_PRICE_ALARM_PRICE ?? '1');

describe('TradeRepublicClient readonly live integration', { skip: enabled ? false : 'set TR_INTEGRATION=1 to run live Trade Republic integration tests' }, () => {
  it('restores and refreshes an existing real web session', { timeout: 30_000 }, async () => {
    const { client } = await createLiveClient();

    const restored = client.getSession();
    assert.ok(restored?.cookies || restored?.sessionToken || restored?.accessToken || restored?.refreshToken, 'expected a restored session with auth material');

    const refreshed = await client.auth.refreshSession();
    assert.ok(refreshed.cookies || refreshed.sessionToken || refreshed.accessToken || refreshed.refreshToken, 'expected a refreshed session with auth material');
  });

  it('reads account and portfolio data without mutations', { timeout: 45_000 }, async () => {
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

  it('reads market discovery, search, candles, and current price data', { timeout: 60_000 }, async () => {
    const { client } = await createLiveClient();

    const [searchResults, asset, venues, candles, price] = await Promise.all([
      client.assets.search(testQuery, { type: testAssetType, limit: 5 }),
      client.assets.get(testAssetId),
      client.market.availableL2Books(testAssetId),
      client.raw.query({ type: 'aggregateHistoryLightV2', isin: testAssetId, exchangeId: testExchangeId, unit: 'EUR', range: '1d' }, { timeoutMs: 15_000 }),
      client.raw.query({ type: 'ticker', id: `${testAssetId}.${testExchangeId}` }, { timeoutMs: 15_000 }),
    ]);

    assert.ok(Array.isArray(searchResults), 'assets.search should return an array');
    assert.ok(searchResults.length > 0, `expected at least one search result for ${testQuery}`);
    assertObject(asset, 'assets.get');
    assert.ok(Array.isArray(venues), 'market.availableL2Books should return an array');
    assert.ok(candles !== undefined && candles !== null, 'aggregateHistoryLightV2 should return a payload');
    assert.ok(price !== undefined && price !== null, 'ticker should return a current-price payload');
  });

  it('reads user/account document and preference endpoints without mutations', { timeout: 60_000 }, async (t) => {
    const { client } = await createLiveClient();

    const calls = [
      { name: 'account.personalDetails', run: () => client.account.personalDetails() },
      { name: 'account.relationships', run: () => client.account.relationships() },
      { name: 'account.cardsHome', run: () => client.account.cardsHome(), optional: true },
      { name: 'documents.documents', run: () => client.documents.documents() },
      { name: 'payments.paymentMethods', run: () => client.payments.paymentMethods() },
      { name: 'payments.iban', run: () => client.payments.iban(), optional: true },
      { name: 'payments.interestDetails', run: () => client.payments.interestDetails(), optional: true },
      { name: 'tax.taxInformation', run: () => client.tax.taxInformation() },
      { name: 'tax.exemptionOrder', run: () => client.tax.exemptionOrder() },
      { name: 'tax.taxResidencies', run: () => client.tax.taxResidencies(), optional: true },
      { name: 'tax.taxResidencyCountries', run: () => client.tax.taxResidencyCountries() },
      { name: 'discovery.exchangeDetails', run: () => client.discovery.exchangeDetails() },
      { name: 'discovery.watchlists', run: () => client.discovery.watchlists() },
      { name: 'discovery.screeners', run: () => client.discovery.screeners() },
      { name: 'discovery.screenerOptions', run: () => client.discovery.screenerOptions() },
      { name: 'discovery.userPreferences', run: () => client.discovery.userPreferences() },
    ];
    const results = await Promise.allSettled(calls.map((call) => call.run()));

    const failures: string[] = [];
    results.forEach((result, index) => {
      if (result.status !== 'rejected') return;
      const call = calls[index]!;
      const message = `${call.name}: ${formatError(result.reason)}`;
      if (call.optional && !isAuthFailure(result.reason)) {
        t.diagnostic(`optional read endpoint unavailable for this account: ${message}`);
        return;
      }
      failures.push(message);
    });
    assert.deepEqual(failures, []);
  });

  it('receives at least one read-only websocket resource message', { timeout: 30_000 }, async () => {
    const { client } = await createLiveClient();
    const subscription = client.raw.subscribeResource({ type: 'availableCash' });
    const iterator = subscription[Symbol.asyncIterator]();
    try {
      const result = await Promise.race([
        iterator.next(),
        delay(15_000).then(() => ({ timedOut: true as const })),
      ]);
      assert.ok(!('timedOut' in result), 'timed out waiting for availableCash websocket payload');
      assert.equal(result.done, false);
      assert.ok(result.value !== undefined && result.value !== null, 'expected websocket resource payload');
    } finally {
      subscription.close();
    }
  });

  it('keeps high-risk mutations out of live integration execution', () => {
    const blocked = schemaRegistry.filter((entry) => entry.risk === 'blockedMutation').map((entry) => entry.name);
    const highRisk = schemaRegistry.filter((entry) => entry.risk === 'highRiskMutation').map((entry) => entry.name);
    assert.deepEqual(highRisk.sort(), ['orders.cancel', 'orders.submit']);
    assert.deepEqual(blocked.sort(), [
      'blocked.accountSecurity',
      'blocked.bankTransfers',
      'blocked.documentAcceptance',
      'blocked.orderMutations',
    ].sort());
  });

  it('validates disposable low-risk price alarm mutations with cleanup', { timeout: 45_000 }, async (t) => {
    const { client } = await createLiveClient();
    let alarmId: string | undefined;

    try {
      const created = await runFeatureGated(t, 'priceAlarms.create', () => client.priceAlarms.create({
        isin: testAssetId,
        price: testPriceAlarmPrice,
        currency: 'EUR',
        timeoutMs: 15_000,
      }));
      if (created === undefined) return;
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

  it('validates disposable low-risk watchlist mutations with cleanup', { timeout: 45_000 }, async (t) => {
    const { client } = await createLiveClient();
    const name = `sdk-test-${Date.now()}`;
    const renamed = `${name}-renamed`;
    let watchlistId: string | undefined;

    try {
      const created = await runFeatureGated(t, 'discovery.watchlists.create', () => client.discovery.createWatchlist(name));
      if (created === undefined) return;
      watchlistId = firstStringByKey(created, 'id', 'watchlistId');
      if (!watchlistId) watchlistId = findWatchlistId(await client.discovery.watchlists(), name);
      assert.ok(watchlistId, 'expected disposable watchlist id after create');

      await client.discovery.renameWatchlist(watchlistId, renamed);
      await client.discovery.addWatchlistItem(watchlistId, testAssetId);
      await client.discovery.removeWatchlistItem(watchlistId, testAssetId);

      const watchlists = await client.discovery.watchlists();
      assert.equal(findWatchlistId(watchlists, renamed), watchlistId);
    } finally {
      if (watchlistId) await client.discovery.deleteWatchlist(watchlistId);
    }
  });
});

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isAuthFailure(error: unknown): boolean {
  return error instanceof TradeRepublicHttpError && (error.status === 401 || error.status === 403);
}

async function runFeatureGated<T>(t: { diagnostic(message: string): void }, label: string, run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof TradeRepublicSchemaError || isAuthFailure(error)) throw error;
    if (isFeatureUnavailable(error)) {
      t.diagnostic(`optional low-risk endpoint unavailable for this account/API shape: ${label}: ${formatError(error)}`);
      return undefined;
    }
    throw error;
  }
}

function isFeatureUnavailable(error: unknown): boolean {
  if (error instanceof TradeRepublicHttpError) return [400, 404, 405, 409, 422, 500].includes(error.status);
  if (error instanceof TradeRepublicProtocolError) return /JSON_PARSE_ERROR|BAD_SUBSCRIPTION_TYPE|validation failed/i.test(error.message);
  return false;
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
