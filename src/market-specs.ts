import type { QuerySpec, StreamSpec } from './resource.js';
import { candleResolutionMs, candleResolutionsForInstrumentType } from './candle-resolutions.js';
import {
  arrayPayload,
  normalizeAsset,
  normalizeCandle,
  normalizeCandleSeries,
  normalizeL2OrderBook,
  normalizeL2Venues,
  normalizeLiveFeedEvent,
  normalizeMarketQuote,
  normalizeSubscription,
} from './normalizers.js';
import type {
  Candle,
  CandleDownloadOptions,
  CandleSeries,
  CandleTimeframe,
  L2OrderBook,
  L2OrderBookOptions,
  L2Venue,
  LiveFeedEvent,
  LiveFeedOptions,
  MarketQuote,
  MarketSubscription,
  MarketSubscriptionsOptions,
} from './types.js';

export const marketSubscriptionsSpec: QuerySpec<MarketSubscriptionsOptions, MarketSubscription[]> = {
  schemaName: 'market.subscriptions',
  resource: (params) => ({
    type: 'accountPairs',
    assetId: params.assetId,
    exchangeId: params.exchangeId,
    subscriptionType: params.type,
  }),
  normalize: (raw) => arrayPayload(raw).map(normalizeSubscription),
};

export const candlesSpec: QuerySpec<CandleDownloadOptions, Candle[]> = {
  schemaName: 'market.candles',
  resource: candleResource,
  normalize: (raw) => arrayPayload(raw).map(normalizeCandle),
};

export const candleSeriesSpec: QuerySpec<CandleDownloadOptions, CandleSeries> = {
  schemaName: 'market.candles',
  resource: candleResource,
  normalize: normalizeCandleSeries,
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

export const l2OrderBookSpec: StreamSpec<L2OrderBookOptions, L2OrderBook> = {
  schemaName: 'market.l2OrderBook',
  topic: 'L2',
  payload: (params) => ({
    isin: params.assetId,
    exchangeId: params.exchangeId,
    depth: params.depth,
    throttleMs: params.throttleMs,
  }),
  normalize: (raw) => normalizeL2OrderBook(raw),
};

function candleResource(params: CandleDownloadOptions): Record<string, unknown> {
  return {
    type: 'aggregateHistoryLightV2',
    isin: params.assetId,
    exchangeId: params.exchangeId,
    resolution: candleResolutionMs(params.timeframe),
    range: params.range,
    from: params.from ? toIso(params.from) : undefined,
    until: params.to ? toIso(params.to) : undefined,
    unit: params.unit?.trim() || 'EUR',
  };
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
