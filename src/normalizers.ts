import type {
  Asset,
  AssetDetail,
  Board,
  BoardWidget,
  Candle,
  CashSummary,
  Derivative,
  ExchangeDetails,
  ExchangeSchedule,
  InstrumentNewsItem,
  InstrumentStatus,
  L2OrderBook,
  L2Venue,
  LiveFeedEvent,
  MarketQuote,
  MarketSubscription,
  Order,
  OrderDestination,
  Portfolio,
  PortfolioChart,
  PortfolioPosition,
  PriceAlarm,
  SavingsPlan,
  TimelineAction,
  TimelineDetail,
  TimelineItem,
  Trade,
  Watchlist,
  WatchlistItem,
} from './types.js';

export function arrayPayload(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  for (const key of [
    'items',
    'data',
    'results',
    'orders',
    'positions',
    'assets',
    'derivatives',
    'subscriptions',
    'activities',
    'timeline',
    'actions',
    'priceAlarms',
    'notifications',
    'watchlists',
    'screeners',
    'documents',
    'trades',
    'destinations',
  ]) {
    const candidate = record[key];
    if (Array.isArray(candidate)) return candidate;
  }
  const objItems = asRecord(record.obj).items;
  if (Array.isArray(objItems)) return objItems;
  const nestedData = asRecord(record.data);
  if (Array.isArray(nestedData.data)) return nestedData.data;
  if (Array.isArray(nestedData.items)) return nestedData.items;
  return [];
}

export function normalizeAsset(value: unknown): Asset {
  const record = asRecord(value);
  const instrument = asRecord(record.instrument);
  const core = asRecord(record.core);
  return {
    id: stringValue(record.id, record.instrumentId, record.isin, instrument.id, instrument.instrumentId, instrument.isin, record.slug),
    isin: optionalString(record.isin, record.instrumentId, instrument.isin, instrument.instrumentId),
    name: optionalString(
      record.name,
      record.shortName,
      record.title,
      record['core.shortName'],
      record['core.officialName'],
      core.shortName,
      core.officialName,
      instrument.name,
      instrument.shortName,
      instrument.title,
    ),
    type: optionalString(record.type, record.instrumentType, record.assetType, instrument.type, instrument.instrumentType, instrument.assetType),
    exchangeIds: uniqueStrings(
      arrayOfStrings(record.exchangeIds, record.exchanges, record.tradingVenues),
      arrayOfStrings(instrument.exchangeIds, instrument.exchanges, instrument.tradingVenues),
    ),
    raw: value,
  };
}

export function normalizeWatchlistItem(value: unknown): WatchlistItem {
  const record = asRecord(value);
  return {
    ...normalizeAsset(value),
    rank: optionalNumber(record.rank, record.itemRank, record.item_rank),
  };
}

export function normalizeWatchlist(value: unknown, items: unknown[] = []): Watchlist {
  const record = asRecord(value);
  const inlineItems = Array.isArray(record.items) ? record.items : items;
  return {
    id: stringValue(record.id, record.watchlistId, record.slug),
    name: optionalString(record.name, record.title),
    items: inlineItems.map(normalizeWatchlistItem).sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)),
    raw: value,
  };
}

export function normalizeAssetDetail(value: unknown): AssetDetail {
  const record = asRecord(value);
  const asset = normalizeAsset(value);
  return {
    ...asset,
    issuer: optionalString(record.issuer, asRecord(record.issuer).name),
    createdAt: optionalString(record.createdAt, record.created, record.issueDate),
    endsAt: optionalString(record.endsAt, record.endDate, record.expiry, record.expiryDate),
    knockout: optionalNumber(record.knockout, record.knockoutPrice, record.knockOut),
    entryPrice: optionalNumber(record.entryPrice, record.strike, record.strikePrice),
    direction: normalizeDirection(record.direction, record.side),
    leverage: optionalNumber(record.leverage),
  };
}

export function normalizeDerivative(value: unknown): Derivative {
  const record = asRecord(value);
  return {
    ...normalizeAssetDetail(value),
    underlyingId: optionalString(record.underlyingId, asRecord(record.underlying).id),
    productType: optionalString(record.productType, record.derivativeType, record.type),
  };
}

export function normalizeOrder(value: unknown): Order {
  const record = asRecord(value);
  const instrument = asRecord(record.instrument);
  const amount = moneyAmount(record.amount)
    ?? moneyAmount(record.cashQuantity)
    ?? optionalNumber(record.amount, asRecord(record.amount).value, asRecord(record.cashQuantity).amount);
  const currency = moneyCurrency(record.amount)
    ?? moneyCurrency(record.cashQuantity)
    ?? optionalString(record.currency, record.currencyId, asRecord(record.amount).currency, asRecord(record.cashQuantity).currency);
  const executedAt = optionalString(record.executedAt);
  const cancelledAt = optionalString(record.cancelledAt, record.canceledAt);
  const expiredAt = optionalString(record.expiredAt);
  const rejectedAt = optionalString(record.rejectedAt);
  const executions = normalizeExecutions(record.trades, record.executions, record.fills);
  const executedQuantity = optionalNumber(record.executedQuantity, record.executedSize, record.filledQuantity, record.filledSize)
    ?? (executions.length ? executions.reduce((sum, execution) => sum + execution.size, 0) : undefined);
  const executionPrice = optionalNumber(record.executionPrice, record.executedPrice, record.averageExecutionPrice, record.averagePrice)
    ?? weightedExecutionPrice(executions);
  return {
    id: stringValue(record.id, record.orderId),
    status: optionalString(record.status, record.state) ?? inferOrderStatus(record),
    isin: optionalString(record.isin, record.instrumentId, instrument.isin, instrument.instrumentId),
    instrumentId: optionalString(record.instrumentId, record.isin, instrument.instrumentId, instrument.isin),
    name: optionalString(record.name, record.instrumentName, instrument.name, instrument.shortName),
    side: optionalString(record.side, record.action),
    type: optionalString(record.type, record.mode, record.orderType),
    createdAt: optionalString(record.createdAt, record.created, record.createdTime, record.submittedAt),
    submittedAt: optionalString(record.submittedAt),
    updatedAt: optionalString(record.updatedAt),
    closedAt: optionalString(record.closedAt, executedAt, cancelledAt, expiredAt, rejectedAt),
    executedAt: executedAt ?? executions.map((execution) => execution.time).filter((time): time is string => Boolean(time)).sort().at(-1),
    cancelledAt,
    expiredAt,
    rejectedAt,
    quantity: optionalNumber(record.quantity, record.size, record.estimatedSize),
    executedQuantity,
    executionPrice,
    amount,
    currency,
    raw: value,
  };
}

function normalizeExecutions(...values: unknown[]): Array<{ size: number; price?: number | undefined; time?: string | undefined }> {
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    const executions = value.flatMap((item) => {
      const record = asRecord(item);
      const size = optionalNumber(record.executionSize, record.executedSize, record.quantity, record.size);
      if (size === undefined || size <= 0) return [];
      return [{
        size,
        price: optionalNumber(record.executionPrice, record.price, record.executedPrice),
        time: optionalString(record.executedAt, record.executionTime, record.createdAt, record.time),
      }];
    });
    if (executions.length) return executions;
  }
  return [];
}

function weightedExecutionPrice(executions: Array<{ size: number; price?: number | undefined }>): number | undefined {
  const priced = executions.filter((execution): execution is { size: number; price: number } => execution.price !== undefined);
  const size = priced.reduce((sum, execution) => sum + execution.size, 0);
  return size > 0 ? priced.reduce((sum, execution) => sum + execution.price * execution.size, 0) / size : undefined;
}

function inferOrderStatus(record: Record<string, unknown>): string | undefined {
  if (optionalString(record.executedAt)) return 'executed';
  if (optionalString(record.cancelledAt, record.canceledAt)) return 'canceled';
  if (optionalString(record.expiredAt)) return 'expired';
  if (optionalString(record.rejectedAt)) return 'rejected';
  const executionSize = sumExecutionSize(record.trades);
  return executionSize && executionSize > 0 ? 'partiallyFilled' : 'open';
}

function sumExecutionSize(value: unknown): number | undefined {
  if (!Array.isArray(value)) return undefined;
  let total = 0;
  let sawSize = false;
  for (const item of value) {
    const size = optionalNumber(asRecord(item).executionSize);
    if (size === undefined) continue;
    sawSize = true;
    total += size;
  }
  return sawSize ? total : undefined;
}

export function normalizeBoard(value: unknown): Board {
  const record = asRecord(value);
  return {
    id: stringValue(record.id, record.boardId),
    name: optionalString(record.name, record.title),
    widgets: arrayPayload(record.widgets).map(normalizeBoardWidget),
    raw: value,
  };
}

export function normalizeBoardWidget(value: unknown): BoardWidget {
  const record = asRecord(value);
  return {
    id: stringValue(record.id, record.widgetId),
    type: stringValue(record.type, record.widgetType),
    settings: objectPayload(record.settings),
    raw: value,
  };
}

export function normalizePortfolio(value: unknown): Portfolio {
  const record = asRecord(value);
  const source = Array.isArray(record.categories) ? record.categories : arrayPayload(value);
  const positions = source.flatMap((item) => {
    const record = asRecord(item);
    if (Array.isArray(record.positions)) return record.positions.map((position) => normalizePortfolioPosition({ ...asRecord(position), categoryType: record.categoryType }));
    return [normalizePortfolioPosition(item)];
  });
  return { positions, raw: value };
}

export function normalizePortfolioPosition(value: unknown): PortfolioPosition {
  const record = asRecord(value);
  return {
    id: stringValue(record.id, record.instrumentId, record.isin),
    isin: optionalString(record.isin, record.instrumentId),
    name: optionalString(record.name, record.instrumentName),
    quantity: optionalNumber(record.quantity, record.shares, record.size),
    value: optionalNumber(record.value, record.netValue, asRecord(record.marketValue).amount),
    currency: optionalString(record.currency, asRecord(record.marketValue).currency),
    categoryType: optionalString(record.categoryType),
    raw: value,
  };
}

export function normalizeCash(value: unknown): CashSummary {
  if (Array.isArray(value)) {
    const cashItems = value.map((item) => normalizeCashItem(item));
    const firstWithAmount = cashItems.find((item) => item.amount !== undefined);
    return {
      amount: firstWithAmount?.amount,
      currency: firstWithAmount?.currency,
      raw: value,
    };
  }
  return {
    ...normalizeCashItem(value),
    raw: value,
  };
}

export function normalizeTimelineItem(value: unknown): TimelineItem {
  const record = asRecord(value);
  return {
    id: stringValue(record.id, record.timelineId, record.activityId, record.orderId, record.savingsPlanId),
    type: optionalString(record.type, record.activityType, record.eventType),
    title: optionalString(record.title, record.name, asRecord(record.display).title),
    subtitle: optionalString(record.subtitle, record.description, asRecord(record.display).subtitle),
    createdAt: optionalString(record.createdAt, record.created, record.timestamp, record.date),
    updatedAt: optionalString(record.updatedAt, record.updated),
    instrumentId: optionalString(record.instrumentId, record.isin, asRecord(record.instrument).id),
    orderId: optionalString(record.orderId),
    savingsPlanId: optionalString(record.savingsPlanId),
    raw: value,
  };
}

export function normalizeTimelineAction(value: unknown): TimelineAction {
  const record = asRecord(value);
  return {
    id: stringValue(record.id, record.actionId, record.type),
    type: optionalString(record.type, record.actionType),
    title: optionalString(record.title, record.name, record.label),
    raw: value,
  };
}

export function normalizeTimelineDetail(value: unknown): TimelineDetail {
  const record = asRecord(value);
  return {
    id: stringValue(record.id, record.timelineId, record.activityId, record.orderId, record.savingsPlanId),
    type: optionalString(record.type, record.activityType, record.eventType),
    raw: value,
  };
}

export function normalizePriceAlarm(value: unknown): PriceAlarm {
  const record = asRecord(value);
  const price = moneyAmount(record.price)
    ?? moneyAmount(record.targetPrice)
    ?? optionalNumber(record.price, record.targetPrice, asRecord(record.price).value, asRecord(record.targetPrice).value);
  const currency = moneyCurrency(record.price)
    ?? moneyCurrency(record.targetPrice)
    ?? optionalString(record.currency, record.currencyId, asRecord(record.price).currency, asRecord(record.targetPrice).currency);
  return {
    id: stringValue(record.id, record.alarmId, record.priceAlarmId),
    isin: optionalString(record.isin, record.instrumentId),
    name: optionalString(record.name, record.instrumentName, record.title),
    price,
    currency,
    triggeredAt: optionalString(record.triggeredAt, record.triggered, record.notificationSentAt),
    raw: value,
  };
}

export function normalizeSavingsPlan(value: unknown): SavingsPlan {
  const record = asRecord(value);
  const amount = moneyAmount(record.amount) ?? moneyAmount(record.rate) ?? optionalNumber(record.amount, record.rate);
  const currency = moneyCurrency(record.amount) ?? moneyCurrency(record.rate) ?? optionalString(record.currency, record.currencyId);
  return {
    id: stringValue(record.id, record.savingsPlanId),
    isin: optionalString(record.isin, record.instrumentId),
    name: optionalString(record.name, record.instrumentName, record.title),
    amount,
    currency,
    raw: value,
  };
}

export function normalizePortfolioChart(value: unknown): PortfolioChart {
  return {
    points: arrayPayload(value),
    raw: value,
  };
}

export function normalizeInstrumentNewsItem(value: unknown): InstrumentNewsItem {
  const record = asRecord(value);
  return {
    id: stringValue(record.id, record.newsId, record.url),
    title: optionalString(record.title, record.headline),
    publishedAt: optionalString(record.publishedAt, record.createdAt, record.date),
    raw: value,
  };
}

export function normalizeOrderDestination(value: unknown): OrderDestination {
  const record = asRecord(value);
  return {
    id: stringValue(record.id, record.exchangeId, record.destinationId, record.venue),
    name: optionalString(record.name, record.title, record.exchangeName),
    raw: value,
  };
}

export function normalizeTrade(value: unknown): Trade {
  const record = asRecord(value);
  const amount = moneyAmount(record.amount) ?? moneyAmount(record.cashQuantity) ?? optionalNumber(record.amount, asRecord(record.amount).value);
  const currency = moneyCurrency(record.amount) ?? moneyCurrency(record.cashQuantity) ?? optionalString(record.currency, record.currencyId, asRecord(record.amount).currency);
  return {
    id: stringValue(record.id, record.tradeId, record.orderId),
    isin: optionalString(record.isin, record.instrumentId),
    side: optionalString(record.side, record.action),
    quantity: optionalNumber(record.quantity, record.size, record.executionSize),
    amount,
    currency,
    executedAt: optionalString(record.executedAt, record.executionTime, record.createdAt),
    raw: value,
  };
}

export function normalizeExchangeDetails(value: unknown): ExchangeDetails {
  const record = asRecord(value);
  return {
    id: stringValue(record.id, record.exchangeId, record.slug),
    name: optionalString(record.name, record.title),
    raw: value,
  };
}

export function normalizeExchangeSchedule(value: unknown): ExchangeSchedule {
  const record = asRecord(value);
  return {
    exchangeId: optionalString(record.exchangeId, record.exchange, record.id),
    raw: value,
  };
}

export function normalizeInstrumentStatus(value: unknown): InstrumentStatus {
  const record = asRecord(value);
  return {
    isin: optionalString(record.isin, record.instrumentId),
    exchangeId: optionalString(record.exchangeId, record.exchange),
    status: optionalString(record.status, record.state, record.tradingStatus),
    raw: value,
  };
}

function normalizeCashItem(value: unknown): Omit<CashSummary, 'raw'> {
  const record = asRecord(value);
  const amount = moneyAmount(record.amount)
    ?? moneyAmount(record.cash)
    ?? moneyAmount(record.availableCash)
    ?? moneyAmount(record.available)
    ?? optionalNumber(record.amount, record.cash, record.availableCash, asRecord(record.available).amount, record.value);
  const currency = moneyCurrency(record.amount)
    ?? moneyCurrency(record.cash)
    ?? moneyCurrency(record.availableCash)
    ?? moneyCurrency(record.available)
    ?? optionalString(record.currency, record.currencyId, asRecord(record.available).currency);
  return {
    amount,
    currency,
  };
}

export function normalizeCandle(value: unknown): Candle {
  if (Array.isArray(value)) {
    return {
      time: String(value[0]),
      open: Number(value[1]),
      high: Number(value[2]),
      low: Number(value[3]),
      close: Number(value[4]),
      volume: optionalNumber(value[5]),
      raw: value,
    };
  }
  const record = asRecord(value);
  return {
    time: stringValue(record.time, record.timestamp, record.date),
    open: numberValue(record.open),
    high: numberValue(record.high),
    low: numberValue(record.low),
    close: numberValue(record.close),
    volume: optionalNumber(record.volume),
    raw: value,
  };
}

export function normalizeSubscription(value: unknown): MarketSubscription {
  const record = asRecord(value);
  return {
    id: stringValue(record.id, record.subscriptionId),
    assetId: optionalString(record.assetId, record.instrumentId, record.isin),
    exchangeId: optionalString(record.exchangeId, record.exchange),
    type: optionalString(record.type),
    raw: value,
  };
}

export function normalizeLiveFeedEvent(value: unknown): LiveFeedEvent {
  const record = asRecord(value);
  return {
    type: stringValue(record.type, record.eventType, 'message'),
    assetId: optionalString(record.assetId, record.instrumentId, record.isin),
    exchangeId: optionalString(record.exchangeId, record.exchange),
    raw: value,
  };
}

export function normalizeMarketQuote(value: unknown, assetId: string, exchangeId: string): MarketQuote {
  const record = asRecord(value);
  const last = asRecord(record.last);
  const bid = asRecord(record.bid);
  const ask = asRecord(record.ask);
  const timeValue = optionalString(record.time, record.timestamp, record.updatedAt, last.time, bid.time, ask.time)
    ?? optionalNumber(record.time, record.timestamp, last.time, bid.time, ask.time);
  return {
    assetId,
    exchangeId,
    currency: optionalString(record.currency, record.unit, last.currency, bid.currency, ask.currency),
    last: priceValue(record.last, record.price),
    lastSize: sizeValue(record.last, record.lastSize, record.size),
    bid: priceValue(record.bid),
    bidSize: sizeValue(record.bid, record.bidSize),
    ask: priceValue(record.ask),
    askSize: sizeValue(record.ask, record.askSize),
    time: normalizeTimestamp(timeValue),
    raw: value,
  };
}

export function normalizeL2Venues(value: unknown): L2Venue[] {
  const record = asRecord(value);
  const instrument = asRecord(record.instrument);
  const candidates = [
    record.exchangeIds,
    record.exchanges,
    record.tradingVenues,
    record.availableExchanges,
    record.venues,
    instrument.exchangeIds,
    instrument.exchanges,
    instrument.tradingVenues,
  ];
  const venues = candidates.flatMap((candidate) => {
    if (!Array.isArray(candidate)) return [];
    return candidate.map((item) => typeof item === 'string' ? normalizeL2Venue({ exchangeId: item }) : normalizeL2Venue(item));
  });
  const exchange = asRecord(record.exchange);
  const direct = optionalString(record.exchangeId, exchange.id, exchange.exchangeId);
  if (direct) venues.unshift(normalizeL2Venue({ exchangeId: direct, name: exchange.name }));
  return venues.filter((venue, index) => venue.exchangeId && venues.findIndex((candidate) => candidate.exchangeId === venue.exchangeId) === index);
}

export function normalizeL2Venue(value: unknown): L2Venue {
  const record = asRecord(value);
  return {
    exchangeId: stringValue(record.exchangeId, record.exchange, record.id),
    name: optionalString(record.name, record.title),
    raw: value,
  };
}

export function normalizeL2OrderBook(value: unknown): L2OrderBook {
  const record = asRecord(value);
  return {
    bids: normalizeLevels(record.bids, record.bid),
    asks: normalizeLevels(record.asks, record.ask),
    raw: value,
  };
}

function normalizeLevels(...values: unknown[]): Array<[number, number]> {
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    const levels = value.flatMap((level): Array<[number, number]> => {
      if (Array.isArray(level)) return [[Number(level[0]), Number(level[1])]];
      const record = asRecord(level);
      return [[numberValue(record.price), numberValue(record.size, record.quantity, record.volume)]];
    }).filter(([price, size]) => Number.isFinite(price) && Number.isFinite(size));
    if (levels.length) return levels;
  }
  return [];
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function stringValue(...values: unknown[]): string {
  return optionalString(...values) ?? '';
}

function optionalString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function numberValue(...values: unknown[]): number {
  return optionalNumber(...values) ?? Number.NaN;
}

function optionalNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function arrayOfStrings(...values: unknown[]): string[] | undefined {
  for (const value of values) {
    if (Array.isArray(value)) {
      const strings = value.flatMap((item) => {
        if (typeof item === 'string') return [item];
        const record = asRecord(item);
        return optionalString(record.id, record.exchangeId, record.exchange, record.slug) ? [optionalString(record.id, record.exchangeId, record.exchange, record.slug)!] : [];
      });
      if (strings.length) return strings;
    }
  }
  return undefined;
}

function uniqueStrings(...values: Array<string[] | undefined>): string[] | undefined {
  const result = [...new Set(values.flatMap((value) => value ?? []))];
  return result.length ? result : undefined;
}

function priceValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    const number = optionalNumber(value, asRecord(value).price, asRecord(value).value, asRecord(value).amount, asRecord(value).decimal);
    if (number !== undefined) return number;
  }
  return undefined;
}

function sizeValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    const number = optionalNumber(value, asRecord(value).size, asRecord(value).quantity, asRecord(value).volume);
    if (number !== undefined) return number;
  }
  return undefined;
}

function normalizeTimestamp(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
  }
  if (/^\d+$/.test(value)) return normalizeTimestamp(Number(value));
  return value;
}

function objectPayload(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function moneyAmount(value: unknown): number | undefined {
  const record = asRecord(value);
  return optionalNumber(record.amount, record.value, record.float, record.decimal);
}

function moneyCurrency(value: unknown): string | undefined {
  const record = asRecord(value);
  return optionalString(record.currency, record.currencyId);
}

function normalizeDirection(...values: unknown[]): 'long' | 'short' | undefined {
  const value = optionalString(...values)?.toLowerCase();
  if (value === 'long' || value === 'short') return value;
  if (value === 'call') return 'long';
  if (value === 'put') return 'short';
  return undefined;
}
