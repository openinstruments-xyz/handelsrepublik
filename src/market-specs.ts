import type { ProtobufStreamSpec, QuerySpec, StreamSpec } from './resource.js';
import { candleResolutionMs, candleResolutionsForInstrumentType } from './candle-resolutions.js';
import {
  arrayPayload,
  normalizeAsset,
  normalizeCandle,
  normalizeCandleSeries,
  normalizeL2OrderBook,
  normalizeL2Venues,
  normalizeLiveFeedEvent,
  normalizeMarketEntitlementSet,
  normalizeMarketQuote,
  normalizeSubscription,
} from './normalizers.js';
import type {
  Candle,
  CandleDownloadOptions,
  CandleSeries,
  CandleTimeframe,
  L2OrderBook,
  L2Venue,
  LiveFeedEvent,
  LiveFeedOptions,
  MarketQuote,
  MarketDataTopic,
  MarketEntitlementSet,
  MarketEntitlementsOptions,
  MarketSubscription,
} from './types.js';

export const marketSubscriptionsSpec: QuerySpec<void, MarketSubscription[]> = {
  endpoint: 'market.subscriptions',
  schemaName: 'market.subscriptions',
  normalize: (raw) => arrayPayload(raw).map(normalizeSubscription),
};

export const marketEntitlementsSpec: QuerySpec<{
  topic: MarketDataTopic;
  options: MarketEntitlementsOptions;
}, MarketEntitlementSet> = {
  endpoint: 'market.entitlements',
  schemaName: 'market.entitlements',
  pathParams: ({ topic }) => ({ topic }),
  query: ({ options }) => ({ exchangeId: options.exchangeIds.join(',') }),
  normalize: normalizeMarketEntitlementSet,
};

export const lightCandlesSpec: QuerySpec<CandleDownloadOptions, Candle[]> = {
  schemaName: 'market.candles.light',
  resource: lightCandleResource,
  normalize: (raw) => arrayPayload(raw).map(normalizeCandle),
};

export const lightCandleSeriesSpec: QuerySpec<CandleDownloadOptions, CandleSeries> = {
  schemaName: 'market.candles.light',
  resource: lightCandleResource,
  normalize: normalizeCandleSeries,
};

export const standardCandlesSpec: QuerySpec<CandleDownloadOptions, Candle[]> = {
  schemaName: 'market.candles.standard',
  resource: standardCandleResource,
  normalize: (raw) => arrayPayload(raw).map(normalizeCandle),
};

export const standardCandleSeriesSpec: QuerySpec<CandleDownloadOptions, CandleSeries> = {
  schemaName: 'market.candles.standard',
  resource: standardCandleResource,
  normalize: normalizeCandleSeries,
};

export const bondCandlesSpec: QuerySpec<CandleDownloadOptions, Candle[]> = {
  endpoint: 'market.bondCandles',
  schemaName: 'market.candles.bond',
  pathParams: ({ assetId, exchangeId }) => ({ assetId, exchangeId }),
  query: ({ range, from, to }) => ({ range: range ?? rangeForDates(from, to) }),
  normalize: (raw, params) => normalizeBondCandles(raw, params),
};

export const bondCandleSeriesSpec: QuerySpec<CandleDownloadOptions, CandleSeries> = {
  ...bondCandlesSpec,
  normalize: (raw, params) => ({
    ...normalizeCandleSeries(raw),
    resolutionMs: candleResolutionMs(params.timeframe),
    candles: normalizeBondCandles(raw, params),
  }),
};

export const availableCandleResolutionsSpec: QuerySpec<{ assetId: string }, CandleTimeframe[]> = {
  schemaName: 'assets.get',
  resource: (params) => ({ type: 'instrument', id: params.assetId }),
  normalize: (raw) => candleResolutionsForInstrumentType(normalizeAsset(raw).type),
};

export const availableL2BooksSpec: QuerySpec<{ assetId: string }, L2Venue[]> = {
  schemaName: 'market.availableL2Books',
  resource: (params) => ({ type: 'instrument', id: params.assetId }),
  normalize: (raw) => normalizeL2Venues(raw),
};

export const quoteSpec: QuerySpec<{ assetId: string; exchangeId: string }, MarketQuote> = {
  schemaName: 'market.quote',
  resource: (params) => ({ type: 'ticker', id: `${params.assetId}.${params.exchangeId}` }),
  normalize: (raw, params) => normalizeMarketQuote(raw, params.assetId, params.exchangeId),
};

export const liveFeedSpec: StreamSpec<LiveFeedOptions, LiveFeedEvent> = {
  schemaName: 'market.liveFeed',
  topic: 'tickerV3',
  payload: (params) => ({
    isin: params.assetId,
    exchangeId: params.exchangeId,
    unit: 'EUR',
    fields: params.fields,
  }),
  normalize: (raw) => normalizeLiveFeedEvent(raw),
};

export const l2OrderBookSpec: ProtobufStreamSpec<{
  assetId: string;
  exchangeId: string;
}, L2OrderBook> = {
  schemaName: 'market.l2OrderBook',
  topic: 'L2',
  request: (params) => ({ instrumentId: { isin: params.assetId, exchangeId: params.exchangeId } }),
  normalize: (raw) => normalizeL2OrderBook(raw),
};

function lightCandleResource(params: CandleDownloadOptions): Record<string, unknown> {
  const resolution = candleResolutionMs(params.timeframe);
  if (![600_000, 3_600_000, 14_400_000, 86_400_000, 604_800_000].includes(resolution)) {
    throw new TypeError('Derivative and crypto candles support only 10m, 1h, 4h, 1d, and 1w resolutions.');
  }
  return {
    type: 'aggregateHistoryLightV2',
    isin: params.assetId,
    exchangeId: params.exchangeId,
    resolution,
    range: params.range,
    from: params.from ? toIso(params.from) : undefined,
    until: params.to ? toIso(params.to) : undefined,
    unit: params.unit?.trim() || 'EUR',
  };
}

function normalizeBondCandles(raw: unknown, params: CandleDownloadOptions): Candle[] {
  const resolution = candleResolutionMs(params.timeframe);
  if (resolution !== 86_400_000 && resolution !== 604_800_000) {
    throw new TypeError('Bond candles support only 1d and 1w resolutions.');
  }
  const daily = arrayPayload(raw).map(normalizeCandle);
  if (resolution === 86_400_000) return daily;
  const weeks = new Map<string, Candle[]>();
  for (const candle of daily) {
    const date = new Date(candle.time);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
    date.setUTCHours(0, 0, 0, 0);
    const key = date.toISOString();
    const values = weeks.get(key) ?? [];
    values.push(candle);
    weeks.set(key, values);
  }
  return [...weeks.entries()].map(([time, candles]) => {
    const sorted = [...candles].sort((left, right) => left.time.localeCompare(right.time));
    const volumes = sorted.flatMap((candle) => candle.volume === undefined ? [] : [candle.volume]);
    return {
      time,
      open: sorted[0]!.open,
      high: Math.max(...sorted.map((candle) => candle.high)),
      low: Math.min(...sorted.map((candle) => candle.low)),
      close: sorted.at(-1)!.close,
      ...(volumes.length ? { volume: volumes.reduce((sum, value) => sum + value, 0) } : {}),
      raw: sorted.map((candle) => candle.raw),
    };
  });
}

function standardCandleResource(params: CandleDownloadOptions): Record<string, unknown> {
  const until = params.to ? toEpochMs(params.to) : Date.now();
  const from = params.from ? toEpochMs(params.from) : until - rangeDurationMs(params.range ?? '1m');
  return {
    type: 'tradeAggregateHistory',
    isin: params.assetId,
    exchangeId: params.exchangeId,
    resolution: candleResolutionMs(params.timeframe),
    from: Math.max(from, 1),
    until: Math.max(until, 1),
  };
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toEpochMs(value: string | Date): number {
  const result = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(result)) throw new TypeError(`Invalid candle date ${String(value)}.`);
  return result;
}

function rangeForDates(from?: string | Date, to?: string | Date): string {
  if (!from) return '1y';
  const duration = (to ? toEpochMs(to) : Date.now()) - toEpochMs(from);
  if (duration <= rangeDurationMs('1d')) return '1d';
  if (duration <= rangeDurationMs('5d')) return '5d';
  if (duration <= rangeDurationMs('1m')) return '1m';
  if (duration <= rangeDurationMs('3m')) return '3m';
  if (duration <= rangeDurationMs('6m')) return '6m';
  return '1y';
}

function rangeDurationMs(range: string): number {
  const durations: Record<string, number> = {
    '1d': 86_400_000,
    '5d': 5 * 86_400_000,
    '1m': 31 * 86_400_000,
    '3m': 92 * 86_400_000,
    '6m': 183 * 86_400_000,
    '1y': 366 * 86_400_000,
    '3y': 3 * 366 * 86_400_000,
    '5y': 5 * 366 * 86_400_000,
    max: 10 * 366 * 86_400_000,
  };
  return durations[range] ?? durations['1y']!;
}
