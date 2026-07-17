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
  L2OrderBookOptions,
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

export const l2OrderBookSpec: ProtobufStreamSpec<L2OrderBookOptions, L2OrderBook> = {
  schemaName: 'market.l2OrderBook',
  topic: 'L2',
  request: (params) => ({ instrumentId: { isin: params.assetId, exchangeId: params.exchangeId } }),
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
