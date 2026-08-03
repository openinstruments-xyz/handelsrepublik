import assert from 'node:assert/strict';
import {
  BOND_CANDLE_RESOLUTIONS,
  DERIVATIVE_AND_CRYPTO_CANDLE_RESOLUTIONS,
  STANDARD_CANDLE_RESOLUTIONS,
  TradeRepublicProtocolError,
  type AssetSearchType,
  type CandleTimeframe,
} from '../../src/index.js';
import {
  assetClasses,
  assertArray,
  assertRecord,
  defineLiveCase,
  firstAsset,
  firstDestination,
  nextStreamValue,
  resolveSecuritiesAccountNumber,
  type LiveCase,
} from './live-runtime.js';

const APPLE = 'US0378331005';
const APPLE_QUERY = 'apple';
const DEFAULT_EXCHANGE = process.env.TR_INTEGRATION_EXCHANGE ?? 'LSX';
const TIB = 'TIB';
const BITCOIN = 'XF000BTC0017';
const BITCOIN_EXCHANGE = 'BHS';
const DEFAULT_WATCHLIST = '00000000-0000-0000-0000-000000000000';

export const liveCases: readonly LiveCase[] = [
  defineLiveCase('session.restore', 'read', async ({ client }) => {
    assert.ok(client.getSession(), 'expected a restored session');
  }),
  defineLiveCase('account.current', 'read', async ({ client }) => assertRecord(await client.account.current(), 'account.current')),
  defineLiveCase('account.settings', 'read', async ({ client }) => assertRecord(await client.account.accountSettings(), 'account.settings')),
  defineLiveCase('account.personal-details', 'read', async ({ client }) => assertRecord(await client.account.personalDetails(), 'account.personalDetails')),
  defineLiveCase('account.relationships', 'read', async ({ client }) => assertArray(await client.account.relationships(), 'account.relationships')),
  defineLiveCase('account.cards', 'read', async ({ client }) => assertRecord(await client.account.cardsHome(), 'account.cardsHome')),
  defineLiveCase('account.app-usage-consents', 'read', async ({ client }) => {
    const value = await client.account.appUsageConsents();
    assert.ok(value !== undefined);
  }),
  defineLiveCase('assets.search-all-classes', 'read', async ({ client, note }) => {
    for (const type of assetClasses) {
      const results = await client.assets.search(type === 'stock' ? APPLE_QUERY : type, { type, limit: 5 });
      assertArray(results, `assets.search(${type})`);
      if (results.length === 0) await note(`${type}: valid empty result; item schema not observed`);
    }
  }, 90_000),
  defineLiveCase('assets.details-all-classes', 'read', async ({ client, note }) => {
    for (const type of assetClasses) {
      const asset = await firstAsset(client, type);
      if (!asset?.id) {
        await note(`${type}: no fixture discovered; detail variant not observed`);
        continue;
      }
      assertRecord(await client.assets.get(asset.id), `assets.get(${type})`);
    }
  }, 120_000),
  defineLiveCase('assets.pagination', 'read', async ({ client }) => assertArray(await client.assets.listAll({ type: 'stock', limit: 20 }), 'assets.listAll')),
  defineLiveCase('derivatives.search', 'read', async ({ client, note }) => {
    const search = await client.derivatives.search('apple', { underlyingId: APPLE, limit: 10 });
    assertArray(search, 'derivatives.search');
    if (search.length === 0) await note('valid empty derivatives search; item schema not observed');
  }),
  defineLiveCase('derivatives.list', 'read', async ({ client, note }) => {
    const list = await client.derivatives.listForUnderlying(APPLE, { limit: 10 });
    assertArray(list, 'derivatives.listForUnderlying');
    if (list.length === 0) await note('valid empty derivatives list; item schema not observed');
  }),
  defineLiveCase('derivatives.details', 'read', async ({ client, note }) => {
    const list = await client.derivatives.listForUnderlying(APPLE, { limit: 10 });
    const derivative = list[0] ?? (await client.derivatives.search('apple', { underlyingId: APPLE, limit: 10 }))[0];
    if (derivative?.id) assertRecord(await client.derivatives.get(derivative.id), 'derivatives.get');
    else await note('valid empty derivatives result; detail variant not observed');
  }, 90_000),
  defineLiveCase('orders.history', 'read', async ({ client, note }) => {
    const [all, open, closed, executed] = await Promise.all([
      client.orders.all(), client.orders.open(), client.orders.closed(), client.orders.executed(),
    ]);
    for (const [name, value] of Object.entries({ all, open, closed, executed })) {
      assertArray(value, `orders.${name}`);
      if (value.length === 0) await note(`${name}: valid empty list; item schema not observed`);
    }
  }),
  defineLiveCase('orders.mutual-funds', 'read', async ({ client, note }) => {
    const value = await client.orders.mutualFunds();
    assertArray(value, 'orders.mutualFunds');
    if (value.length === 0) await note('valid empty list; item schema not observed');
  }),
  defineLiveCase('orders.private-markets', 'read', async ({ client, note }) => {
    const value = await client.orders.privateMarkets();
    assertArray(value, 'orders.privateMarkets');
    if (value.length === 0) await note('valid empty list; item schema not observed');
  }),
  defineLiveCase('orders.prepare-preview-fees', 'read', async ({ client }) => {
    const destination = (await client.trading.orderDestinations(APPLE)).find((item) => item.id === DEFAULT_EXCHANGE)
      ?? (await client.trading.orderDestinations(APPLE))[0];
    assert.ok(destination?.id, 'expected an Apple order destination');
    const order = { instrumentId: APPLE, exchangeId: destination.id, side: 'buy' as const, mode: 'limit' as const, size: 1, limit: 1, validity: 'day' as const };
    const prepared = await client.orders.prepare(order);
    assertRecord(prepared, 'orders.prepare');
    assertRecord(await client.orders.preview(order), 'orders.preview');
  }),
  defineLiveCase('portfolio.current', 'read', async ({ client }) => assertRecord(await client.portfolio.current(), 'portfolio.current')),
  defineLiveCase('portfolio.cash', 'read', async ({ client }) => assertRecord(await client.portfolio.cash(), 'portfolio.cash')),
  defineLiveCase('portfolio.mark-to-market', 'read', async ({ client }) => assertRecord(await client.portfolio.markToMarketValue(), 'portfolio.markToMarketValue')),
  defineLiveCase('portfolio.account-positions', 'read', async ({ client }) => {
    const account = await resolveSecuritiesAccountNumber(client);
    assertRecord(await client.portfolio.positionsForAccount(account), 'portfolio.positionsForAccount');
  }),
  defineLiveCase('portfolio.savings-plans', 'read', async ({ client, note }) => {
    const value = await client.portfolio.savingsPlans();
    assertArray(value, 'portfolio.savingsPlans');
    if (value.length === 0) await note('valid empty list; item schema not observed');
  }),
  defineLiveCase('portfolio.private-markets', 'read', async ({ client }) => {
    const value = await client.portfolio.privateMarketsPositions();
    assert.ok(value !== undefined);
  }),
  defineLiveCase('portfolio.chart', 'read', async ({ client }) => assertRecord(await client.portfolio.portfolioChart(), 'portfolio.portfolioChart')),
  defineLiveCase('candles.standard-aapl', 'read', async ({ client }) => {
    await assertCandleMatrix(client, APPLE, DEFAULT_EXCHANGE, 'stock', STANDARD_CANDLE_RESOLUTIONS, true);
  }, 180_000),
  defineLiveCase('candles.derivative', 'read', async ({ client, note }) => {
    await assertDiscoveredCandleMatrix(client, 'derivative', DERIVATIVE_AND_CRYPTO_CANDLE_RESOLUTIONS, note);
  }, 120_000),
  defineLiveCase('candles.crypto', 'read', async ({ client }) => {
    await assertCandleMatrix(client, BITCOIN, BITCOIN_EXCHANGE, 'crypto', DERIVATIVE_AND_CRYPTO_CANDLE_RESOLUTIONS);
  }, 120_000),
  defineLiveCase('candles.bond', 'read', async ({ client, note }) => {
    await assertDiscoveredCandleMatrix(client, 'bond', BOND_CANDLE_RESOLUTIONS, note);
  }, 90_000),
  defineLiveCase('candles.etf-fund-smoke', 'read', async ({ client, note }) => {
    await assertDiscoveredCandleMatrix(client, 'etf', ['1d'], note);
    await assertDiscoveredCandleMatrix(client, 'mutualFund', ['1d'], note);
  }, 90_000),
  defineLiveCase('market.subscriptions', 'read', async ({ client }) => assertArray(await client.market.subscriptions(), 'market.subscriptions')),
  defineLiveCase('timeline.list', 'read', async ({ client, note }) => {
    const items = await client.timeline.list();
    assertArray(items, 'timeline.list');
    if (items.length === 0) await note('valid empty timeline; item schema not observed');
  }),
  defineLiveCase('timeline.actions', 'read', async ({ client, note }) => {
    const actions = await client.timeline.actions();
    assertArray(actions, 'timeline.actions');
    if (actions.length === 0) await note('valid empty timeline actions; item schema not observed');
  }),
  defineLiveCase('timeline.detail', 'read', async ({ client, note }) => {
    const items = await client.timeline.list();
    const first = items[0];
    if (first?.id) assertRecord(await client.timeline.detail(first.id), 'timeline.detail');
    else await note('timeline empty; detail variant not observed');
  }, 90_000),
  defineLiveCase('price-alarms.list', 'read', async ({ client, note }) => {
    const list = await client.priceAlarms.list();
    assertArray(list, 'priceAlarms.list');
    if (list.length === 0) await note('valid empty list; item schema not observed');
  }),
  defineLiveCase('price-alarms.notifications', 'read', async ({ client, note }) => {
    const notifications = await client.priceAlarms.notifications();
    assertArray(notifications, 'priceAlarms.notifications');
    if (notifications.length === 0) await note('valid empty notifications; item schema not observed');
  }),
  defineLiveCase('instruments.news', 'read', async ({ client }) => assertArray(await client.instruments.news(APPLE), 'instruments.news')),
  defineLiveCase('instruments.etf-details', 'read', async ({ client, note }) => callForDiscoveredAsset(client, 'etf', (id) => client.instruments.etfDetails(id), note)),
  defineLiveCase('instruments.etf-composition', 'read', async ({ client, note }) => callForDiscoveredAsset(client, 'etf', (id) => client.instruments.etfComposition(id), note)),
  defineLiveCase('instruments.fund-details', 'read', async ({ client, note }) => callForDiscoveredAsset(client, 'mutualFund', (id) => client.instruments.fundDetails(id), note)),
  defineLiveCase('instruments.fund-composition', 'read', async ({ client, note }) => callForDiscoveredAsset(client, 'mutualFund', (id) => client.instruments.fundComposition(id), note)),
  defineLiveCase('instruments.crypto-details', 'read', async ({ client, note }) => callForDiscoveredAsset(client, 'crypto', (id) => client.instruments.cryptoDetails(id), note)),
  defineLiveCase('instruments.bond-yield-to-maturity', 'read', async ({ client, note }) => callForDiscoveredAsset(client, 'bond', (id) => client.instruments.yieldToMaturity(id), note)),
  defineLiveCase('portfolio.bond-valuation', 'read', async ({ client, note }) => callForHeldPosition(client, /bond|fixed.?income/i, (id) => client.portfolio.bondValuation(id), note)),
  defineLiveCase('portfolio.fixed-savings-valuation', 'read', async ({ client, note }) => callForHeldPosition(client, /fixed.?saving/i, (id) => client.portfolio.fixedSavingsValuation(id), note)),
  defineLiveCase('trading.available-size', 'read', async ({ client }) => {
    const value = await client.trading.availableSize(APPLE);
    assert.ok(value !== undefined);
  }),
  defineLiveCase('trading.execution-snapshots', 'read', async ({ client, note }) => {
    const executed = await client.orders.executed({ limit: 100 });
    const tradeId = firstDeepString(executed.map((order) => order.raw), 'tradeId');
    if (!tradeId) return note('no executed trade id discovered; order-book and tape snapshot schemas not observed');
    assertRecord(await client.trading.orderBookSnapshot(tradeId), 'trading.orderBookSnapshot');
    assertRecord(await client.trading.tapeSnapshot(tradeId), 'trading.tapeSnapshot');
  }),
  defineLiveCase('trading.daily-pnl', 'read', async ({ client, note }) => {
    const portfolio = await client.portfolio.current();
    const secAccNo = await resolveSecuritiesAccountNumber(client);
    const items = portfolio.positions.flatMap((position) => {
      const instrumentId = position.isin ?? position.id;
      const quantity = position.quantity;
      return instrumentId && quantity !== undefined && quantity > 0
        ? [{ secAccNo, instrumentId, day: new Date().toISOString().slice(0, 10), quantity }]
        : [];
    });
    if (items.length === 0) return note('no positive held positions; daily PnL response schema not observed');
    assert.ok(await client.trading.dailyPnl(items) !== undefined);
  }),
  defineLiveCase('trading.aggregate-history', 'read', async ({ client }) => {
    const until = Date.now();
    assert.ok(await client.trading.tradeAggregateHistory(APPLE, DEFAULT_EXCHANGE, 60_000, until - 86_400_000, until) !== undefined);
  }),
  defineLiveCase('discovery.exchanges', 'read', async ({ client }) => assertArray(await client.discovery.exchangeDetails(), 'discovery.exchangeDetails')),
  defineLiveCase('discovery.watchlists', 'read', async ({ client, note }) => {
    const watchlists = await client.discovery.watchlists();
    assertArray(watchlists, 'discovery.watchlists');
    const watchlist = watchlists[0];
    if (!watchlist?.id) return note('valid empty watchlist response; item schema not observed');
    assert.ok(await client.discovery.rawWatchlistItems(watchlist.id) !== undefined);
  }),
  defineLiveCase('discovery.screeners', 'read', async ({ client }) => assert.ok(await client.discovery.screeners() !== undefined)),
  defineLiveCase('discovery.screener-options', 'read', async ({ client }) => assert.ok(await client.discovery.screenerOptions() !== undefined)),
  defineLiveCase('discovery.user-preferences', 'read', async ({ client }) => assert.ok(await client.discovery.userPreferences() !== undefined)),
  defineLiveCase('documents.list', 'read', async ({ client }) => assert.ok(await client.documents.documents() !== undefined)),
  defineLiveCase('tax.information', 'read', async ({ client }) => assert.ok(await client.tax.taxInformation() !== undefined)),
  defineLiveCase('tax.exemption-order', 'read', async ({ client }) => assert.ok(await client.tax.exemptionOrder() !== undefined)),
  defineLiveCase('tax.residencies', 'read', async ({ client }) => assert.ok(await client.tax.taxResidencies() !== undefined)),
  defineLiveCase('tax.residency-countries', 'read', async ({ client }) => assert.ok(await client.tax.taxResidencyCountries() !== undefined)),
  defineLiveCase('tax.account-utilization', 'read', async ({ client, note }) => {
    await callOptionalAccountResource('tax wrapper account utilization', () => client.tax.accountUtilization(), note);
  }),
  defineLiveCase('payments.methods', 'read', async ({ client }) => assert.ok(await client.payments.paymentMethods() !== undefined)),
  defineLiveCase('payments.iban', 'read', async ({ client }) => assert.ok((await client.payments.iban()).iban, 'expected an IBAN without logging it')),
  defineLiveCase('closed-venue.destinations-all-classes', 'closed-venue', async ({ client, note }) => {
    for (const type of assetClasses) {
      const asset = await firstAsset(client, type);
      if (!asset?.id) {
        await note(`${type}: no fixture discovered`);
        continue;
      }
      const destinations = await client.trading.orderDestinations(asset.id);
      assertArray(destinations, `orderDestinations(${type})`);
      if (destinations.length === 0) await note(`${type}: valid empty destinations; item schema not observed`);
      if (!['crypto', 'mutualFund', 'privateFund'].includes(type)) {
        assert.ok(destinations.every((destination) => destination.open !== true), `${type} unexpectedly exposes an open destination`);
      }
    }
  }, 150_000),
  defineLiveCase('closed-venue.exchange-schedule', 'closed-venue', async ({ client }) => assertRecord(await client.discovery.exchangeSchedule(DEFAULT_EXCHANGE), 'exchangeSchedule')),
  defineLiveCase('closed-venue.instrument-status', 'closed-venue', async ({ client }) => assertRecord(await client.discovery.instrumentStatus(APPLE, DEFAULT_EXCHANGE), 'instrumentStatus')),
  defineLiveCase('closed-venue.quote', 'closed-venue', async ({ client }) => assertRecord(await client.market.quote(APPLE, DEFAULT_EXCHANGE), 'closed quote')),
  defineLiveCase('open-venue.destinations', 'open-venue', async ({ client }) => assertArray(await client.trading.orderDestinations(APPLE), 'orderDestinations')),
  defineLiveCase('open-venue.home-destination', 'open-venue', async ({ client }) => assertRecord(await client.trading.homeOrderDestination(APPLE), 'homeOrderDestination')),
  defineLiveCase('open-venue.quote', 'open-venue', async ({ client }) => {
    const destination = (await client.trading.orderDestinations(APPLE)).find((item) => item.open === true);
    assert.ok(destination?.id, 'expected an explicitly open Apple venue');
    assertRecord(await client.market.quote(APPLE, destination.id), 'market.quote');
  }),
  defineLiveCase('open-venue.price-for-order', 'open-venue', async ({ client }) => {
    const destination = (await client.trading.orderDestinations(APPLE)).find((item) => item.open === true);
    assert.ok(destination?.id, 'expected an explicitly open Apple venue');
    assertRecord(await client.trading.priceForOrder({ isin: APPLE, exchangeId: destination.id, side: 'buy' }), 'priceForOrder buy');
    assertRecord(await client.trading.priceForOrder({ isin: APPLE, exchangeId: destination.id, side: 'sell' }), 'priceForOrder sell');
  }),
  defineLiveCase('open-venue.subscriptions', 'open-venue', async ({ client }) => assertArray(await client.market.subscriptions(), 'market.subscriptions')),
  defineLiveCase('open-venue.entitlements', 'open-venue', async ({ client }) => assertRecord(await client.market.entitlements('L2', { exchangeIds: [TIB, DEFAULT_EXCHANGE] }), 'market.entitlements')),
  defineLiveCase('open-venue.ticker', 'open-venue', async ({ client }) => {
    assertRecord(await nextStreamValue(client.market.subscribeLiveFeed({
      assetId: APPLE,
      exchangeId: DEFAULT_EXCHANGE,
    }), 'AAPL ticker'), 'ticker event');
  }),
  defineLiveCase('open-venue.last-trades-tape', 'open-venue', async ({ client }) => {
    assertRecord(await nextStreamValue(client.trading.tape(APPLE, DEFAULT_EXCHANGE), 'AAPL tape'), 'tape event');
  }),
  defineLiveCase('open-venue.l2-books', 'open-venue', async ({ client }) => {
    assertArray(await client.market.availableL2Books(APPLE), 'availableL2Books');
    const book = await nextStreamValue(client.market.subscribeL2OrderBook({
      assetId: APPLE,
      exchangeId: TIB,
    }), 'AAPL L2');
    assert.ok(book.bids.length + book.asks.length > 0, 'expected at least one L2 level');
  }),
  defineLiveCase('mutations.price-alert', 'mutations', async ({ client }) => {
    let alarmId: string | undefined;
    try {
      const created = await client.priceAlarms.create({ isin: APPLE, price: 1 });
      alarmId = created.alarmId;
      assert.ok(alarmId, 'expected disposable alarm id');
      assert.ok((await client.priceAlarms.list()).some((alarm) => alarm.id === alarmId));
    } finally {
      if (alarmId) await client.priceAlarms.cancel(alarmId);
    }
  }),
  defineLiveCase('mutations.default-watchlist-item', 'mutations', async ({ client }) => {
    const watchlists = await client.discovery.watchlists();
    const watchlist = watchlists.find((item) => item.id === DEFAULT_WATCHLIST) ?? watchlists[0];
    assert.ok(watchlist?.id, 'expected the default watchlist');
    const candidates = [APPLE, 'US5949181045', 'US67066G1040'];
    const before = JSON.stringify(await client.discovery.rawWatchlistItems(watchlist.id));
    const instrument = candidates.find((candidate) => !before.includes(candidate));
    assert.ok(instrument, 'expected a disposable watchlist instrument');
    let added = false;
    try {
      await client.discovery.addWatchlistItem(watchlist.id, instrument);
      added = true;
      assert.match(JSON.stringify(await client.discovery.rawWatchlistItems(watchlist.id)), new RegExp(instrument));
    } finally {
      if (added) await client.discovery.removeWatchlistItem(watchlist.id, instrument);
    }
  }),
];

export function getLiveCase(id: string): LiveCase {
  const value = liveCases.find((testCase) => testCase.id === id);
  if (!value) throw new Error(`Unknown live case ${id}. Available: ${liveCases.map((testCase) => testCase.id).join(', ')}`);
  return value;
}

async function assertCandleMatrix(
  client: Parameters<LiveCase['run']>[0]['client'],
  assetId: string,
  exchangeId: string,
  instrumentType: AssetSearchType,
  resolutions: readonly CandleTimeframe[],
  requireVolume = false,
): Promise<void> {
  for (const timeframe of resolutions) {
    const candles = await client.market.candles({
      assetId,
      exchangeId,
      instrumentType,
      timeframe,
      range: candleProbeRange(timeframe),
    });
    assertArray(candles, `candles(${timeframe})`);
    assert.ok(candles.length > 0, `expected ${assetId} ${timeframe} candles`);
    for (const candle of candles) {
      assert.equal(typeof candle.time, 'string');
      for (const field of ['open', 'high', 'low', 'close'] as const) assert.equal(typeof candle[field], 'number', `${field} must be present`);
      if (requireVolume || candle.volume !== undefined) assert.equal(typeof candle.volume, 'number', 'volume must be numeric when present');
    }
  }
}

function candleProbeRange(timeframe: CandleTimeframe): '1d' | '5d' | '1m' | '6m' | '1y' {
  if (timeframe === '1m') return '5d';
  if (['3m', '5m', '10m', '15m', '20m', '30m', '45m'].includes(timeframe)) return '5d';
  if (['1h', '2h', '4h'].includes(timeframe)) return '1m';
  if (timeframe === '1d') return '6m';
  return '1y';
}

async function assertDiscoveredCandleMatrix(
  client: Parameters<LiveCase['run']>[0]['client'],
  type: AssetSearchType,
  resolutions: readonly CandleTimeframe[],
  note: (message: string) => Promise<void>,
): Promise<void> {
  const asset = await firstAsset(client, type);
  if (!asset?.id) return note(`${type}: no fixture discovered; candle variant not observed`);
  const destination = await firstDestination(client, asset.id);
  if (!destination) return note(`${type}: no order destination discovered; candle variant not observed`);
  await assertCandleMatrix(client, destination.instrumentId, destination.exchangeId, type, resolutions);
}

async function callForDiscoveredAsset(
  client: Parameters<LiveCase['run']>[0]['client'],
  type: AssetSearchType,
  call: (id: string) => Promise<unknown>,
  note: (message: string) => Promise<void>,
): Promise<void> {
  const asset = await firstAsset(client, type);
  if (!asset?.id) return note(`${type}: no fixture discovered; response variant not observed`);
  assert.ok(await call(asset.id) !== undefined);
}

async function callForHeldPosition(
  client: Parameters<LiveCase['run']>[0]['client'],
  category: RegExp,
  call: (id: string) => Promise<unknown>,
  note: (message: string) => Promise<void>,
): Promise<void> {
  const portfolio = await client.portfolio.current();
  const position = portfolio.positions.find((item) => {
    const raw = item.raw && typeof item.raw === 'object' && !Array.isArray(item.raw) ? item.raw as Record<string, unknown> : {};
    return category.test(item.categoryType ?? '') || category.test(typeof raw.instrumentType === 'string' ? raw.instrumentType : '');
  });
  const instrumentId = position?.isin ?? position?.id;
  if (!instrumentId) return note(`no held ${category.source} position; account-specific valuation schema not observed`);
  await callOptionalAccountResource(`${category.source} valuation`, () => call(instrumentId), note);
}

async function callOptionalAccountResource(
  label: string,
  call: () => Promise<unknown>,
  note: (message: string) => Promise<void>,
): Promise<void> {
  try {
    assert.ok(await call() !== undefined);
  } catch (error) {
    if (error instanceof TradeRepublicProtocolError && error.message.includes('"errorCode":"NOT_FOUND"')) {
      await note(`${label}: valid NOT_FOUND for this account; response schema not observed`);
      return;
    }
    throw error;
  }
}

function firstDeepString(value: unknown, key: string): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstDeepString(item, key);
      if (found) return found;
    }
    return undefined;
  }
  if (value === null || typeof value !== 'object') return undefined;
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (entryKey === key && typeof entryValue === 'string' && entryValue) return entryValue;
    const found = firstDeepString(entryValue, key);
    if (found) return found;
  }
  return undefined;
}
