import type { QuerySpec, StreamSpec } from './resource.js';
import {
  arrayPayload,
  normalizeCandle,
  normalizeL2OrderBook,
  normalizeL2Venues,
  normalizeLiveFeedEvent,
  normalizeMarketQuote,
  normalizeSubscription,
} from './normalizers.js';
import type {
  Candle,
  CandleDownloadOptions,
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
  resource: (params) => ({
    type: 'aggregateHistoryLightV2',
    isin: params.assetId,
    exchangeId: params.exchangeId,
    resolution: params.timeframe,
    from: toIso(params.from),
    until: params.to ? toIso(params.to) : undefined,
    range: params.limit ? String(params.limit) : undefined,
    unit: 'EUR',
  }),
  normalize: (raw) => arrayPayload(raw).map(normalizeCandle),
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

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
