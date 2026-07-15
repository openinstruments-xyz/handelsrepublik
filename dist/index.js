// src/errors.ts
var TradeRepublicError = class extends Error {
  constructor(message, cause) {
    super(message);
    this.cause = cause;
    this.name = "TradeRepublicError";
  }
  cause;
};
var TradeRepublicHttpError = class extends TradeRepublicError {
  constructor(message, status, responseBody) {
    super(message);
    this.status = status;
    this.responseBody = responseBody;
    this.name = "TradeRepublicHttpError";
  }
  status;
  responseBody;
};
var TradeRepublicProtocolError = class extends TradeRepublicError {
  constructor(message, cause) {
    super(message, cause);
    this.name = "TradeRepublicProtocolError";
  }
};
var TradeRepublicSchemaError = class extends TradeRepublicError {
  constructor(message, schemaName, issues, rawSummary, cause) {
    super(message, cause);
    this.schemaName = schemaName;
    this.issues = issues;
    this.rawSummary = rawSummary;
    this.name = "TradeRepublicSchemaError";
  }
  schemaName;
  issues;
  rawSummary;
};

// src/normalizers.ts
function arrayPayload(value) {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  for (const key of [
    "items",
    "data",
    "results",
    "orders",
    "positions",
    "assets",
    "derivatives",
    "subscriptions",
    "activities",
    "timeline",
    "actions",
    "priceAlarms",
    "notifications",
    "watchlists",
    "screeners",
    "documents",
    "trades",
    "destinations"
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
function normalizeAsset(value) {
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
      record["core.shortName"],
      record["core.officialName"],
      core.shortName,
      core.officialName,
      instrument.name,
      instrument.shortName,
      instrument.title
    ),
    type: optionalString(record.type, record.instrumentType, record.assetType, instrument.type, instrument.instrumentType, instrument.assetType),
    exchangeIds: uniqueStrings(
      arrayOfStrings(record.exchangeIds, record.exchanges, record.tradingVenues),
      arrayOfStrings(instrument.exchangeIds, instrument.exchanges, instrument.tradingVenues)
    ),
    raw: value
  };
}
function normalizeWatchlistItem(value) {
  const record = asRecord(value);
  return {
    ...normalizeAsset(value),
    rank: optionalNumber(record.rank, record.itemRank, record.item_rank)
  };
}
function normalizeWatchlist(value, items = []) {
  const record = asRecord(value);
  const inlineItems = Array.isArray(record.items) ? record.items : items;
  return {
    id: stringValue(record.id, record.watchlistId, record.slug),
    name: optionalString(record.name, record.title),
    items: inlineItems.map(normalizeWatchlistItem).sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)),
    raw: value
  };
}
function normalizeAssetDetail(value) {
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
    leverage: optionalNumber(record.leverage)
  };
}
function normalizeDerivative(value) {
  const record = asRecord(value);
  return {
    ...normalizeAssetDetail(value),
    underlyingId: optionalString(record.underlyingId, asRecord(record.underlying).id),
    productType: optionalString(record.productType, record.derivativeType, record.type)
  };
}
function normalizeOrder(value) {
  const record = asRecord(value);
  const instrument = asRecord(record.instrument);
  const amount = moneyAmount(record.amount) ?? moneyAmount(record.cashQuantity) ?? optionalNumber(record.amount, asRecord(record.amount).value, asRecord(record.cashQuantity).amount);
  const currency = moneyCurrency(record.amount) ?? moneyCurrency(record.cashQuantity) ?? optionalString(record.currency, record.currencyId, asRecord(record.amount).currency, asRecord(record.cashQuantity).currency);
  const executedAt = optionalString(record.executedAt);
  const cancelledAt = optionalString(record.cancelledAt, record.canceledAt);
  const expiredAt = optionalString(record.expiredAt);
  const rejectedAt = optionalString(record.rejectedAt);
  const executions = normalizeExecutions(record.trades, record.executions, record.fills);
  const executedQuantity = optionalNumber(record.executedQuantity, record.executedSize, record.filledQuantity, record.filledSize) ?? (executions.length ? executions.reduce((sum, execution) => sum + execution.size, 0) : void 0);
  const executionPrice = optionalNumber(record.executionPrice, record.executedPrice, record.averageExecutionPrice, record.averagePrice) ?? weightedExecutionPrice(executions);
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
    executedAt: executedAt ?? executions.map((execution) => execution.time).filter((time) => Boolean(time)).sort().at(-1),
    cancelledAt,
    expiredAt,
    rejectedAt,
    quantity: optionalNumber(record.quantity, record.size, record.estimatedSize),
    executedQuantity,
    executionPrice,
    amount,
    currency,
    raw: value
  };
}
function normalizeExecutions(...values) {
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    const executions = value.flatMap((item) => {
      const record = asRecord(item);
      const size = optionalNumber(record.executionSize, record.executedSize, record.quantity, record.size);
      if (size === void 0 || size <= 0) return [];
      return [{
        size,
        price: optionalNumber(record.executionPrice, record.price, record.executedPrice),
        time: optionalString(record.executedAt, record.executionTime, record.createdAt, record.time)
      }];
    });
    if (executions.length) return executions;
  }
  return [];
}
function weightedExecutionPrice(executions) {
  const priced = executions.filter((execution) => execution.price !== void 0);
  const size = priced.reduce((sum, execution) => sum + execution.size, 0);
  return size > 0 ? priced.reduce((sum, execution) => sum + execution.price * execution.size, 0) / size : void 0;
}
function inferOrderStatus(record) {
  if (optionalString(record.executedAt)) return "executed";
  if (optionalString(record.cancelledAt, record.canceledAt)) return "canceled";
  if (optionalString(record.expiredAt)) return "expired";
  if (optionalString(record.rejectedAt)) return "rejected";
  const executionSize = sumExecutionSize(record.trades);
  return executionSize && executionSize > 0 ? "partiallyFilled" : "open";
}
function sumExecutionSize(value) {
  if (!Array.isArray(value)) return void 0;
  let total = 0;
  let sawSize = false;
  for (const item of value) {
    const size = optionalNumber(asRecord(item).executionSize);
    if (size === void 0) continue;
    sawSize = true;
    total += size;
  }
  return sawSize ? total : void 0;
}
function normalizeBoard(value) {
  const record = asRecord(value);
  return {
    id: stringValue(record.id, record.boardId),
    name: optionalString(record.name, record.title),
    widgets: arrayPayload(record.widgets).map(normalizeBoardWidget),
    raw: value
  };
}
function normalizeBoardWidget(value) {
  const record = asRecord(value);
  return {
    id: stringValue(record.id, record.widgetId),
    type: stringValue(record.type, record.widgetType),
    settings: objectPayload(record.settings),
    raw: value
  };
}
function normalizePortfolio(value) {
  const record = asRecord(value);
  const source = Array.isArray(record.categories) ? record.categories : arrayPayload(value);
  const positions = source.flatMap((item) => {
    const record2 = asRecord(item);
    if (Array.isArray(record2.positions)) return record2.positions.map((position) => normalizePortfolioPosition({ ...asRecord(position), categoryType: record2.categoryType }));
    return [normalizePortfolioPosition(item)];
  });
  return { positions, raw: value };
}
function normalizePortfolioPosition(value) {
  const record = asRecord(value);
  return {
    id: stringValue(record.id, record.instrumentId, record.isin),
    isin: optionalString(record.isin, record.instrumentId),
    name: optionalString(record.name, record.instrumentName),
    quantity: optionalNumber(record.quantity, record.shares, record.size),
    value: optionalNumber(record.value, record.netValue, asRecord(record.marketValue).amount),
    currency: optionalString(record.currency, asRecord(record.marketValue).currency),
    categoryType: optionalString(record.categoryType),
    raw: value
  };
}
function normalizeCash(value) {
  if (Array.isArray(value)) {
    const cashItems = value.map((item) => normalizeCashItem(item));
    const firstWithAmount = cashItems.find((item) => item.amount !== void 0);
    return {
      amount: firstWithAmount?.amount,
      currency: firstWithAmount?.currency,
      raw: value
    };
  }
  return {
    ...normalizeCashItem(value),
    raw: value
  };
}
function normalizeTimelineItem(value) {
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
    raw: value
  };
}
function normalizeTimelineAction(value) {
  const record = asRecord(value);
  return {
    id: stringValue(record.id, record.actionId, record.type),
    type: optionalString(record.type, record.actionType),
    title: optionalString(record.title, record.name, record.label),
    raw: value
  };
}
function normalizeTimelineDetail(value) {
  const record = asRecord(value);
  return {
    id: stringValue(record.id, record.timelineId, record.activityId, record.orderId, record.savingsPlanId),
    type: optionalString(record.type, record.activityType, record.eventType),
    raw: value
  };
}
function normalizePriceAlarm(value) {
  const record = asRecord(value);
  const price = moneyAmount(record.price) ?? moneyAmount(record.targetPrice) ?? optionalNumber(record.price, record.targetPrice, asRecord(record.price).value, asRecord(record.targetPrice).value);
  const currency = moneyCurrency(record.price) ?? moneyCurrency(record.targetPrice) ?? optionalString(record.currency, record.currencyId, asRecord(record.price).currency, asRecord(record.targetPrice).currency);
  return {
    id: stringValue(record.id, record.alarmId, record.priceAlarmId),
    isin: optionalString(record.isin, record.instrumentId),
    name: optionalString(record.name, record.instrumentName, record.title),
    price,
    currency,
    triggeredAt: optionalString(record.triggeredAt, record.triggered, record.notificationSentAt),
    raw: value
  };
}
function normalizeSavingsPlan(value) {
  const record = asRecord(value);
  const amount = moneyAmount(record.amount) ?? moneyAmount(record.rate) ?? optionalNumber(record.amount, record.rate);
  const currency = moneyCurrency(record.amount) ?? moneyCurrency(record.rate) ?? optionalString(record.currency, record.currencyId);
  return {
    id: stringValue(record.id, record.savingsPlanId),
    isin: optionalString(record.isin, record.instrumentId),
    name: optionalString(record.name, record.instrumentName, record.title),
    amount,
    currency,
    raw: value
  };
}
function normalizePortfolioChart(value) {
  return {
    points: arrayPayload(value),
    raw: value
  };
}
function normalizeInstrumentNewsItem(value) {
  const record = asRecord(value);
  return {
    id: stringValue(record.id, record.newsId, record.url),
    title: optionalString(record.title, record.headline),
    publishedAt: optionalString(record.publishedAt, record.createdAt, record.date),
    raw: value
  };
}
function normalizeOrderDestination(value) {
  const record = asRecord(value);
  return {
    id: stringValue(record.id, record.exchangeId, record.destinationId, record.venue),
    name: optionalString(record.name, record.title, record.exchangeName),
    raw: value
  };
}
function normalizeTrade(value) {
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
    raw: value
  };
}
function normalizeExchangeDetails(value) {
  const record = asRecord(value);
  return {
    id: stringValue(record.id, record.exchangeId, record.slug),
    name: optionalString(record.name, record.title),
    raw: value
  };
}
function normalizeExchangeSchedule(value) {
  const record = asRecord(value);
  return {
    exchangeId: optionalString(record.exchangeId, record.exchange, record.id),
    raw: value
  };
}
function normalizeInstrumentStatus(value) {
  const record = asRecord(value);
  return {
    isin: optionalString(record.isin, record.instrumentId),
    exchangeId: optionalString(record.exchangeId, record.exchange),
    status: optionalString(record.status, record.state, record.tradingStatus),
    raw: value
  };
}
function normalizeCashItem(value) {
  const record = asRecord(value);
  const amount = moneyAmount(record.amount) ?? moneyAmount(record.cash) ?? moneyAmount(record.availableCash) ?? moneyAmount(record.available) ?? optionalNumber(record.amount, record.cash, record.availableCash, asRecord(record.available).amount, record.value);
  const currency = moneyCurrency(record.amount) ?? moneyCurrency(record.cash) ?? moneyCurrency(record.availableCash) ?? moneyCurrency(record.available) ?? optionalString(record.currency, record.currencyId, asRecord(record.available).currency);
  return {
    amount,
    currency
  };
}
function normalizeCandle(value) {
  if (Array.isArray(value)) {
    return {
      time: String(value[0]),
      open: Number(value[1]),
      high: Number(value[2]),
      low: Number(value[3]),
      close: Number(value[4]),
      volume: optionalNumber(value[5]),
      raw: value
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
    raw: value
  };
}
function normalizeSubscription(value) {
  const record = asRecord(value);
  return {
    id: stringValue(record.id, record.subscriptionId),
    assetId: optionalString(record.assetId, record.instrumentId, record.isin),
    exchangeId: optionalString(record.exchangeId, record.exchange),
    type: optionalString(record.type),
    raw: value
  };
}
function normalizeLiveFeedEvent(value) {
  const record = asRecord(value);
  return {
    type: stringValue(record.type, record.eventType, "message"),
    assetId: optionalString(record.assetId, record.instrumentId, record.isin),
    exchangeId: optionalString(record.exchangeId, record.exchange),
    raw: value
  };
}
function normalizeMarketQuote(value, assetId, exchangeId) {
  const record = asRecord(value);
  const last = asRecord(record.last);
  const bid = asRecord(record.bid);
  const ask = asRecord(record.ask);
  const timeValue = optionalString(record.time, record.timestamp, record.updatedAt, last.time, bid.time, ask.time) ?? optionalNumber(record.time, record.timestamp, last.time, bid.time, ask.time);
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
    raw: value
  };
}
function normalizeL2Venues(value) {
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
    instrument.tradingVenues
  ];
  const venues = candidates.flatMap((candidate) => {
    if (!Array.isArray(candidate)) return [];
    return candidate.map((item) => typeof item === "string" ? normalizeL2Venue({ exchangeId: item }) : normalizeL2Venue(item));
  });
  const exchange = asRecord(record.exchange);
  const direct = optionalString(record.exchangeId, exchange.id, exchange.exchangeId);
  if (direct) venues.unshift(normalizeL2Venue({ exchangeId: direct, name: exchange.name }));
  return venues.filter((venue, index) => venue.exchangeId && venues.findIndex((candidate) => candidate.exchangeId === venue.exchangeId) === index);
}
function normalizeL2Venue(value) {
  const record = asRecord(value);
  return {
    exchangeId: stringValue(record.exchangeId, record.exchange, record.id),
    name: optionalString(record.name, record.title),
    raw: value
  };
}
function normalizeL2OrderBook(value) {
  const record = asRecord(value);
  return {
    bids: normalizeLevels(record.bids, record.bid),
    asks: normalizeLevels(record.asks, record.ask),
    raw: value
  };
}
function normalizeLevels(...values) {
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    const levels = value.flatMap((level) => {
      if (Array.isArray(level)) return [[Number(level[0]), Number(level[1])]];
      const record = asRecord(level);
      return [[numberValue(record.price), numberValue(record.size, record.quantity, record.volume)]];
    }).filter(([price, size]) => Number.isFinite(price) && Number.isFinite(size));
    if (levels.length) return levels;
  }
  return [];
}
function asRecord(value) {
  return typeof value === "object" && value !== null ? value : {};
}
function stringValue(...values) {
  return optionalString(...values) ?? "";
}
function optionalString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.length) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return void 0;
}
function numberValue(...values) {
  return optionalNumber(...values) ?? Number.NaN;
}
function optionalNumber(...values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return void 0;
}
function arrayOfStrings(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const strings = value.flatMap((item) => {
        if (typeof item === "string") return [item];
        const record = asRecord(item);
        return optionalString(record.id, record.exchangeId, record.exchange, record.slug) ? [optionalString(record.id, record.exchangeId, record.exchange, record.slug)] : [];
      });
      if (strings.length) return strings;
    }
  }
  return void 0;
}
function uniqueStrings(...values) {
  const result = [...new Set(values.flatMap((value) => value ?? []))];
  return result.length ? result : void 0;
}
function priceValue(...values) {
  for (const value of values) {
    const number = optionalNumber(value, asRecord(value).price, asRecord(value).value, asRecord(value).amount, asRecord(value).decimal);
    if (number !== void 0) return number;
  }
  return void 0;
}
function sizeValue(...values) {
  for (const value of values) {
    const number = optionalNumber(value, asRecord(value).size, asRecord(value).quantity, asRecord(value).volume);
    if (number !== void 0) return number;
  }
  return void 0;
}
function normalizeTimestamp(value) {
  if (value === void 0) return void 0;
  if (typeof value === "number") {
    const milliseconds = value < 1e10 ? value * 1e3 : value;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
  }
  if (/^\d+$/.test(value)) return normalizeTimestamp(Number(value));
  return value;
}
function objectPayload(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function moneyAmount(value) {
  const record = asRecord(value);
  return optionalNumber(record.amount, record.value, record.float, record.decimal);
}
function moneyCurrency(value) {
  const record = asRecord(value);
  return optionalString(record.currency, record.currencyId);
}
function normalizeDirection(...values) {
  const value = optionalString(...values)?.toLowerCase();
  if (value === "long" || value === "short") return value;
  if (value === "call") return "long";
  if (value === "put") return "short";
  return void 0;
}

// src/waf.ts
var DEFAULT_APP_URL = "https://app.traderepublic.com/";
var DEFAULT_API_URL = "https://api.traderepublic.com/";
var DEFAULT_TIMEOUT_MS = 6e4;
var DEFAULT_SETTLE_MS = 0;
var WAF_POLL_INTERVAL_MS = 50;
var RELEVANT_HEADER_NAMES = /* @__PURE__ */ new Set([
  "accept-language",
  "cookie",
  "x-aws-waf-token",
  "x-xsrf-token",
  "x-tr-app-version",
  "x-tr-device-info",
  "x-tr-platform"
]);
async function collectTradeRepublicWebContext(browser, options = {}) {
  const appUrl = options.appUrl ?? DEFAULT_APP_URL;
  const apiUrl = options.apiUrl ?? DEFAULT_API_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const waitUntil = options.waitUntil ?? "domcontentloaded";
  const capturedHeaders = {};
  const capturedCookies = {};
  const startedAt = Date.now();
  const context = await browser.newContext(options.contextOptions);
  try {
    context.on?.("request", (request) => captureRequest(request, appUrl, apiUrl, capturedHeaders, capturedCookies));
    const page = await context.newPage();
    page.on?.("request", (request) => captureRequest(request, appUrl, apiUrl, capturedHeaders, capturedCookies));
    await page.goto(appUrl, { waitUntil, timeout: timeoutMs });
    let webContext = await buildWebContext(context, appUrl, apiUrl, capturedHeaders, capturedCookies, page);
    if (!hasWafContext(webContext) && settleMs > 0) {
      await wait(page, settleMs);
      webContext = await buildWebContext(context, appUrl, apiUrl, capturedHeaders, capturedCookies, page);
    }
    while (!hasWafContext(webContext) && Date.now() - startedAt < timeoutMs) {
      await wait(page, WAF_POLL_INTERVAL_MS);
      webContext = await buildWebContext(context, appUrl, apiUrl, capturedHeaders, capturedCookies, page);
    }
    if (!hasWafContext(webContext)) {
      const missing = missingWafContext(webContext);
      throw new Error(formatLoginContextError(webContext, missing));
    }
    return webContext;
  } finally {
    await context.close();
  }
}
function normalizeTradeRepublicWebContext(context) {
  const headers = normalizeHeaders(context.headers);
  const cookieHeader = normalizeString(context.cookieHeader ?? headers.cookie);
  const cookies = {
    ...parseCookieHeader(cookieHeader),
    ...normalizeRecord(context.cookies)
  };
  const xsrfToken = normalizeString(context.xsrfToken ?? headers["x-xsrf-token"] ?? cookies["XSRF-TOKEN"]);
  const awsWafToken = normalizeString(context.awsWafToken ?? headers["x-aws-waf-token"]);
  const result = {};
  if (Object.keys(headers).length > 0) result.headers = headers;
  if (Object.keys(cookies).length > 0) result.cookies = cookies;
  const mergedCookieHeader = serializeCookies(cookies) || cookieHeader;
  if (mergedCookieHeader) result.cookieHeader = mergedCookieHeader;
  if (awsWafToken) result.awsWafToken = awsWafToken;
  if (xsrfToken) result.xsrfToken = xsrfToken;
  if (context.capturedAt) result.capturedAt = context.capturedAt;
  if (context.metadata) result.metadata = structuredClone(context.metadata);
  return result;
}
function mergeTradeRepublicWebContexts(current, next) {
  if (!current && !next) return void 0;
  const left = current ? normalizeTradeRepublicWebContext(current) : {};
  const right = next ? normalizeTradeRepublicWebContext(next) : {};
  return normalizeTradeRepublicWebContext({
    headers: { ...left.headers ?? {}, ...right.headers ?? {} },
    cookies: { ...left.cookies ?? {}, ...right.cookies ?? {} },
    cookieHeader: [left.cookieHeader, right.cookieHeader].filter(Boolean).join("; "),
    awsWafToken: right.awsWafToken ?? left.awsWafToken,
    xsrfToken: right.xsrfToken ?? left.xsrfToken,
    capturedAt: right.capturedAt ?? left.capturedAt,
    metadata: { ...left.metadata ?? {}, ...right.metadata ?? {} }
  });
}
function captureRequest(request, appUrl, apiUrl, headers, cookies) {
  const url = request.url();
  if (!isTradeRepublicUrl(url, appUrl, apiUrl)) return;
  const requestHeaders = normalizeHeaders(request.headers());
  for (const [name, value] of Object.entries(requestHeaders)) {
    if (!RELEVANT_HEADER_NAMES.has(name) || !value) continue;
    headers[name] = value;
  }
  Object.assign(cookies, parseCookieHeader(requestHeaders.cookie));
}
async function buildWebContext(context, appUrl, apiUrl, headers, requestCookies, page) {
  const browserCookies = cookieArrayToRecord(await context.cookies([appUrl, apiUrl]));
  const storageTokens = await readStorageTokens(page);
  return normalizeTradeRepublicWebContext({
    headers,
    cookies: { ...requestCookies, ...browserCookies },
    awsWafToken: headers["x-aws-waf-token"] ?? browserCookies["aws-waf-token"] ?? storageTokens.awsWafToken,
    xsrfToken: headers["x-xsrf-token"] ?? browserCookies["XSRF-TOKEN"] ?? storageTokens.xsrfToken,
    capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
    metadata: {
      source: "playwright",
      appUrl,
      apiUrl
    }
  });
}
async function readStorageTokens(page) {
  if (!page.evaluate) return {};
  try {
    const storage = await page.evaluate(() => {
      const entries = {};
      for (const area of [globalThis.localStorage, globalThis.sessionStorage]) {
        for (let index = 0; index < area.length; index += 1) {
          const key = area.key(index);
          if (!key) continue;
          const value = area.getItem(key);
          if (value) entries[key] = value;
        }
      }
      return entries;
    });
    const awsWafToken = decodeStorageToken(firstStorageValue(storage, [
      "awswaf_session_storage",
      "x-aws-waf-token",
      "awsWafToken",
      "aws-waf-token"
    ]));
    const xsrfToken = firstStorageValue(storage, ["x-xsrf-token", "xsrf"]);
    return {
      ...awsWafToken ? { awsWafToken } : {},
      ...xsrfToken ? { xsrfToken } : {}
    };
  } catch {
    return {};
  }
}
function firstStorageValue(storage, needles) {
  const entries = Object.entries(storage);
  for (const needle of needles) {
    const normalizedNeedle = needle.toLowerCase();
    const exact = entries.find(([key, value]) => key.toLowerCase() === normalizedNeedle && value.trim());
    if (exact) return exact[1].trim();
  }
  for (const needle of needles) {
    const normalizedNeedle = needle.toLowerCase();
    const partial = entries.find(([key, value]) => key.toLowerCase().includes(normalizedNeedle) && value.trim());
    if (partial) return partial[1].trim();
  }
  return void 0;
}
function decodeStorageToken(value) {
  let current = value?.trim();
  if (!current) return void 0;
  for (let depth = 0; depth < 2; depth += 1) {
    try {
      const parsed = JSON.parse(current);
      if (typeof parsed !== "string" || !parsed.trim()) break;
      current = parsed.trim();
    } catch {
      break;
    }
  }
  return current;
}
function hasWafContext(context) {
  return missingWafContext(context).length === 0;
}
function missingWafContext(context) {
  const headers = context.headers ?? {};
  const missing = [];
  if (!(context.awsWafToken || headers["x-aws-waf-token"])) missing.push("x-aws-waf-token");
  if (!(context.cookieHeader || Object.keys(context.cookies ?? {}).length > 0)) missing.push("cookie");
  return missing;
}
function formatLoginContextError(context, missing) {
  const headers = context.headers ?? {};
  const presentHeaders = [
    "x-aws-waf-token",
    "x-xsrf-token",
    "x-tr-app-version",
    "x-tr-platform",
    "x-tr-device-info",
    "accept-language",
    "cookie"
  ].filter((name) => Boolean(headers[name]));
  const cookieNames = Object.keys(context.cookies ?? {}).sort();
  const details = [
    `Missing: ${missing.join(", ") || "none"}`,
    `Present headers: ${presentHeaders.join(", ") || "none"}`,
    `Header preview: ${formatHeaderPreview(headers)}`,
    `Cookie names: ${cookieNames.join(", ") || "none"}`
  ];
  return `Trade Republic login context was incomplete after loading the web app. ${details.join(" | ")}`;
}
function formatHeaderPreview(headers) {
  const previewNames = ["x-tr-app-version", "x-tr-platform", "x-tr-device-info", "x-aws-waf-token", "x-xsrf-token"];
  const preview = previewNames.flatMap((name) => {
    const value = headers[name];
    return value ? [`${name}=${redactHeaderValue(value)}`] : [];
  });
  return preview.join(", ") || "none";
}
function redactHeaderValue(value) {
  const trimmed = value.trim();
  if (trimmed.length <= 16) return trimmed;
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-4)}`;
}
function normalizeHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), value.trim()]).filter(([key, value]) => key.length > 0 && value.length > 0)
  );
}
function normalizeRecord(record) {
  return Object.fromEntries(
    Object.entries(record ?? {}).filter(([key, value]) => key.length > 0 && value.length > 0)
  );
}
function normalizeString(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : void 0;
}
function cookieArrayToRecord(cookies) {
  return Object.fromEntries(cookies.filter((cookie) => cookie.name && cookie.value).map((cookie) => [cookie.name, cookie.value]));
}
function parseCookieHeader(value) {
  const cookies = {};
  for (const part of (value ?? "").split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    cookies[trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
  }
  return cookies;
}
function serializeCookies(cookies) {
  return Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join("; ");
}
function isTradeRepublicUrl(value, appUrl, apiUrl) {
  try {
    const url = new URL(value);
    return [new URL(appUrl), new URL(apiUrl)].some((base) => url.hostname === base.hostname || url.hostname.endsWith(`.${base.hostname}`));
  } catch {
    return false;
  }
}
async function wait(page, timeout) {
  if (page.waitForTimeout) {
    await page.waitForTimeout(timeout);
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, timeout));
}

// src/auth.ts
var AuthApi = class {
  constructor(http, endpoints, getSession, setSession, sessionStore, onSessionReady) {
    this.http = http;
    this.endpoints = endpoints;
    this.getSession = getSession;
    this.setSession = setSession;
    this.sessionStore = sessionStore;
    this.onSessionReady = onSessionReady;
  }
  http;
  endpoints;
  getSession;
  setSession;
  sessionStore;
  onSessionReady;
  async createInstantLogin(options = {}) {
    const basePayload = stripUndefined({
      phoneNumber: options.phoneNumber,
      deviceName: options.deviceName
    });
    try {
      const response = await this.http.requestDetailed(
        "POST",
        this.endpoints.resolve("auth.qrChallenge"),
        basePayload,
        void 0,
        { signal: options.signal }
      );
      return normalizeChallenge(response.body, response.headers.get("date"));
    } catch (error) {
      if (!(error instanceof TradeRepublicHttpError) || options.phoneNumber !== void 0) throw error;
      const response = await this.http.requestDetailed(
        "POST",
        this.endpoints.resolve("auth.qrChallenge"),
        {
          ...basePayload,
          phoneNumber: ""
        },
        void 0,
        { signal: options.signal }
      );
      return normalizeChallenge(response.body, response.headers.get("date"));
    }
  }
  async startLoginWithPin(options) {
    const raw = await this.http.request(
      "POST",
      this.endpoints.resolve("auth.login"),
      {
        phoneNumber: options.phoneNumber,
        pin: options.pin
      },
      void 0,
      {
        signal: options.signal,
        headers: options.otpLess ? { "X-TR-OTP-Less": "true" } : void 0
      }
    );
    return extractLoginProgressState(raw);
  }
  async loginWithPin(options) {
    const progress = await this.startLoginWithPin(options);
    return this.pollLoginProgress(progress, options);
  }
  async pollInstantLogin(challenge, options = {}) {
    const intervalMs = options.intervalMs ?? 1500;
    const timeoutMs = options.timeoutMs ?? 12e4;
    const startedAt = Date.now();
    let processId;
    let confirmedPolls = 0;
    let accumulatedSession = this.getSession();
    debugLog(options.debug, "poll:start", { challengeId: challenge.id, intervalMs, timeoutMs });
    while (Date.now() - startedAt <= timeoutMs) {
      if (options.signal?.aborted) throw options.signal.reason;
      if (processId) {
        const processResponse = await this.http.requestDetailed(
          "GET",
          this.endpoints.resolve("auth.loginProcess", { processId }),
          void 0,
          void 0,
          { signal: options.signal }
        );
        const processRaw = processResponse.body;
        const processState = extractLoginProgressState(processRaw);
        const processStatus = normalizeStatus(processState.status);
        confirmedPolls = processStatus === "CONFIRMED" ? confirmedPolls + 1 : 0;
        const processCookieSession = extractCookieSession(processResponse.headers);
        accumulatedSession = rememberProgressSession(accumulatedSession, processCookieSession, this.setSession);
        debugLog(options.debug, "poll:process", {
          processId,
          status: processState.status ?? null,
          responseKeys: objectKeys(processRaw),
          responseBody: processRaw,
          setCookieNames: Object.keys(processCookieSession?.cookies ?? {}),
          hasSession: Boolean(processState.session)
        });
        const processSession = processState.session ?? (isAuthenticatedStatus(processStatus) || confirmedPolls >= 2 ? accumulatedSession : void 0);
        if (processSession) {
          const completedSession = await this.completeWebSession(processSession, options);
          const finalizedSession = await this.finalizeSession(completedSession);
          debugLog(options.debug, "poll:session", summarizeSession(finalizedSession));
          return finalizedSession;
        }
        processId = processState.processId ?? processId;
        if (isTerminalFailureStatus(processStatus)) {
          throw new Error(`Trade Republic instant login failed during process step: ${processState.status ?? "unknown"}.`);
        }
      } else {
        const response = await this.http.requestDetailed(
          "GET",
          this.endpoints.resolve("auth.qrStatus", { challengeId: challenge.id }),
          void 0,
          void 0,
          { signal: options.signal }
        );
        const raw = response.body;
        const challengeState = extractLoginProgressState(raw);
        const challengeStatus = normalizeStatus(challengeState.status);
        const cookieSession = extractCookieSession(response.headers);
        accumulatedSession = rememberProgressSession(accumulatedSession, cookieSession, this.setSession);
        debugLog(options.debug, "poll:challenge", {
          challengeId: challenge.id,
          status: challengeState.status ?? null,
          processId: challengeState.processId ?? null,
          responseKeys: objectKeys(raw),
          responseBody: raw,
          setCookieNames: Object.keys(cookieSession?.cookies ?? {}),
          hasSession: Boolean(challengeState.session)
        });
        const session = challengeState.session ?? (isAuthenticatedStatus(challengeStatus) ? accumulatedSession : void 0);
        if (session) {
          const completedSession = await this.completeWebSession(session, options);
          const finalizedSession = await this.finalizeSession(completedSession);
          debugLog(options.debug, "poll:session", summarizeSession(finalizedSession));
          return finalizedSession;
        }
        processId = challengeState.processId ?? processId;
        if (isTerminalFailureStatus(challengeStatus) && !processId) {
          throw new Error(`Trade Republic instant login failed while polling challenge: ${challengeState.status ?? "unknown"}.`);
        }
      }
      await delay(intervalMs);
    }
    throw new Error("Timed out while waiting for Trade Republic instant login approval.");
  }
  async pollLoginProcess(processId, options = {}) {
    return this.pollLoginProgress({ status: void 0, processId, session: void 0 }, options);
  }
  async restoreSession() {
    const session = await this.sessionStore?.load();
    if (session) this.setSession(session);
    return session;
  }
  async saveSession(session = this.getSession()) {
    if (!session) throw new Error("No Trade Republic session is available to save.");
    await this.sessionStore?.save(session);
  }
  async refreshSession(options = {}) {
    const session = this.getSession() ?? await this.sessionStore?.load();
    if (!session) throw new Error("No Trade Republic session is available to refresh.");
    const refreshedSession = await this.completeWebSession(session, options);
    const finalizedSession = await this.finalizeSession(refreshedSession);
    debugLog(options.debug, "refresh:session", summarizeSession(finalizedSession));
    return finalizedSession;
  }
  async clearSession() {
    this.setSession({});
    await this.sessionStore?.clear();
  }
  async completeWebSession(session, options) {
    this.setSession(session);
    const response = await this.http.requestDetailed(
      "GET",
      this.endpoints.resolve("auth.session"),
      void 0,
      void 0,
      { signal: options.signal }
    );
    const webSession = extractSession(response.body);
    const cookieSession = extractCookieSession(response.headers);
    const completedSession = mergeSessions(session, cookieSession, webSession, {
      metadata: {
        source: "instant-login-web-session",
        authSession: response.body
      }
    });
    debugLog(options.debug, "poll:web-session", {
      status: response.status,
      responseKeys: objectKeys(response.body),
      responseBody: response.body,
      setCookieNames: Object.keys(cookieSession?.cookies ?? {}),
      session: summarizeSession(completedSession)
    });
    return completedSession;
  }
  async finalizeSession(session) {
    this.setSession(session);
    const updatedSession = await this.onSessionReady?.(session);
    const finalizedSession = updatedSession ? mergeSessions(session, updatedSession) : session;
    this.setSession(finalizedSession);
    await this.sessionStore?.save(finalizedSession);
    return finalizedSession;
  }
  async pollLoginProgress(progress, options) {
    const intervalMs = options.intervalMs ?? 1500;
    const timeoutMs = options.timeoutMs ?? 12e4;
    const startedAt = Date.now();
    let processId = progress.processId;
    let confirmedPolls = 0;
    let accumulatedSession = mergeSessions(this.getSession(), progress.session);
    if (accumulatedSession) this.setSession(accumulatedSession);
    debugLog(options.debug, "poll:process:start", {
      processId: processId ?? null,
      status: progress.status ?? null,
      hasSession: Boolean(progress.session)
    });
    while (Date.now() - startedAt <= timeoutMs) {
      if (options.signal?.aborted) throw options.signal.reason;
      const status = normalizeStatus(progress.status);
      confirmedPolls = status === "CONFIRMED" ? confirmedPolls + 1 : 0;
      const processSession = progress.session ?? (isAuthenticatedStatus(status) || confirmedPolls >= 2 ? accumulatedSession : void 0);
      if (processSession) {
        const completedSession = await this.completeWebSession(processSession, options);
        const finalizedSession = await this.finalizeSession(completedSession);
        debugLog(options.debug, "poll:session", summarizeSession(finalizedSession));
        return finalizedSession;
      }
      processId = progress.processId ?? processId;
      if (!processId) {
        if (isTerminalFailureStatus(status)) throw new Error(`Trade Republic login failed: ${progress.status ?? "unknown"}.`);
        throw new Error("Trade Republic login did not return a process id or session.");
      }
      if (isTerminalFailureStatus(status)) {
        throw new Error(`Trade Republic login failed during process step: ${progress.status ?? "unknown"}.`);
      }
      await delay(intervalMs);
      const response = await this.http.requestDetailed(
        "GET",
        this.endpoints.resolve("auth.loginProcess", { processId }),
        void 0,
        void 0,
        { signal: options.signal }
      );
      const processRaw = response.body;
      progress = extractLoginProgressState(processRaw);
      const processCookieSession = extractCookieSession(response.headers);
      accumulatedSession = rememberProgressSession(accumulatedSession, processCookieSession, this.setSession);
      debugLog(options.debug, "poll:process", {
        processId,
        status: progress.status ?? null,
        responseKeys: objectKeys(processRaw),
        responseBody: processRaw,
        setCookieNames: Object.keys(processCookieSession?.cookies ?? {}),
        hasSession: Boolean(progress.session)
      });
    }
    throw new Error("Timed out while waiting for Trade Republic login approval.");
  }
};
function normalizeChallenge(raw, serverTime) {
  const record = asRecord(raw);
  const id = stringValue2(record.id, record.challengeId, record.processId);
  return {
    id,
    qrCode: optionalString2(record.qrCode, record.qrCodePayload, record.qr, record.code),
    qrCodeDataUrl: optionalString2(record.qrCodeDataUrl, record.qrDataUrl),
    deepLink: optionalString2(record.deepLink, record.loginUrl, record.url),
    expiresAt: optionalString2(record.expiresAt, record.challengeExpiresAt, record.qrCodeTokenExpiresAt, record.expiration),
    serverTime: serverTime ?? void 0,
    raw
  };
}
function extractSession(raw) {
  const record = asRecord(raw);
  const sessionRecord = asRecord(record.session);
  const accessToken = optionalString2(record.accessToken, sessionRecord.accessToken, record.token);
  const sessionToken = optionalString2(
    record.sessionToken,
    sessionRecord.sessionToken,
    record.connectionToken,
    sessionRecord.connectionToken,
    record.webSocketToken,
    sessionRecord.webSocketToken,
    record.websocketToken,
    sessionRecord.websocketToken,
    record.mapperToken,
    sessionRecord.mapperToken
  );
  const refreshToken = optionalString2(record.refreshToken, sessionRecord.refreshToken);
  if (!accessToken && !sessionToken && !refreshToken) return void 0;
  return {
    accessToken,
    refreshToken,
    sessionToken,
    expiresAt: optionalString2(record.expiresAt, sessionRecord.expiresAt),
    accountId: optionalString2(record.accountId, sessionRecord.accountId),
    deviceId: optionalString2(record.deviceId, sessionRecord.deviceId),
    metadata: { source: "instant-login" }
  };
}
function mergeSessions(...sessions) {
  const result = {};
  for (const session of sessions) {
    if (!session) continue;
    result.accessToken = session.accessToken ?? result.accessToken;
    result.refreshToken = session.refreshToken ?? result.refreshToken;
    result.sessionToken = session.sessionToken ?? result.sessionToken;
    result.webContext = mergeTradeRepublicWebContexts(result.webContext, session.webContext);
    result.expiresAt = session.expiresAt ?? result.expiresAt;
    result.accountId = session.accountId ?? result.accountId;
    result.deviceId = session.deviceId ?? result.deviceId;
    result.securitiesAccountNumber = session.securitiesAccountNumber ?? result.securitiesAccountNumber;
    result.cookies = { ...result.cookies ?? {}, ...session.cookies ?? {} };
    result.metadata = { ...result.metadata ?? {}, ...session.metadata ?? {} };
  }
  return result;
}
function rememberProgressSession(accumulatedSession, cookieSession, setSession) {
  if (!cookieSession) return accumulatedSession;
  const nextSession = mergeSessions(accumulatedSession, cookieSession);
  setSession(nextSession);
  return nextSession;
}
function extractCookieSession(headers) {
  const cookies = setCookieHeaders(headers).map(parseSetCookie).filter((cookie) => Boolean(cookie));
  if (cookies.length === 0) return void 0;
  return {
    cookies: Object.fromEntries(cookies),
    metadata: {
      source: "instant-login-set-cookie",
      capturedAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
}
function extractLoginProgressState(raw) {
  const record = asRecord(raw);
  return {
    status: optionalString2(record.status, record.state),
    processId: optionalString2(record.processId, record.id),
    session: extractSession(raw)
  };
}
function normalizeStatus(value) {
  return value?.trim().toUpperCase();
}
function isTerminalFailureStatus(status) {
  if (!status) return false;
  return status === "FAILED" || status === "ERROR" || status === "EXPIRED" || status === "DECLINED" || status === "CANCELLED";
}
function isAuthenticatedStatus(status) {
  if (!status) return false;
  return status === "PROCESSED" || status === "COMPLETED" || status === "SUCCESS" || status === "AUTHENTICATED";
}
function stripUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== void 0));
}
function optionalString2(...values) {
  for (const value of values) if (typeof value === "string" && value.length) return value;
  return void 0;
}
function stringValue2(...values) {
  return optionalString2(...values) ?? "";
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function summarizeSession(session) {
  return {
    hasAccessToken: Boolean(session.accessToken),
    hasRefreshToken: Boolean(session.refreshToken),
    hasSessionToken: Boolean(session.sessionToken),
    hasWebContext: Boolean(session.webContext),
    cookieNames: Object.keys(session.cookies ?? {}),
    expiresAt: session.expiresAt ?? null,
    accountId: session.accountId ?? null,
    deviceId: session.deviceId ?? null,
    hasSecuritiesAccountNumber: Boolean(session.securitiesAccountNumber)
  };
}
function debugLog(enabled, event, payload) {
  if (!enabled) return;
  console.log(`[handelsrepublik] ${event}`, payload);
}
function objectKeys(value) {
  return value && typeof value === "object" ? Object.keys(value).sort() : [];
}
function setCookieHeaders(headers) {
  const withGetSetCookie = headers;
  if (typeof withGetSetCookie.getSetCookie === "function") {
    return withGetSetCookie.getSetCookie().flatMap(splitSetCookieHeader);
  }
  const combined = headers.get("set-cookie");
  return combined ? splitSetCookieHeader(combined) : [];
}
function splitSetCookieHeader(value) {
  return value.split(/,(?=\s*[^;,=\s]+=[^;,]+)/).map((item) => item.trim()).filter(Boolean);
}
function parseSetCookie(value) {
  const firstPart = value.split(";", 1)[0]?.trim();
  if (!firstPart) return void 0;
  const separator = firstPart.indexOf("=");
  if (separator <= 0) return void 0;
  return [firstPart.slice(0, separator), firstPart.slice(separator + 1)];
}

// src/traderepublic-client.ts
import { randomUUID } from "crypto";

// src/market-specs.ts
var marketSubscriptionsSpec = {
  schemaName: "market.subscriptions",
  resource: (params) => ({
    type: "accountPairs",
    assetId: params.assetId,
    exchangeId: params.exchangeId,
    subscriptionType: params.type
  }),
  normalize: (raw) => arrayPayload(raw).map(normalizeSubscription)
};
var candlesSpec = {
  schemaName: "market.candles",
  resource: (params) => ({
    type: "aggregateHistoryLightV2",
    isin: params.assetId,
    exchangeId: params.exchangeId,
    resolution: params.timeframe,
    from: toIso(params.from),
    until: params.to ? toIso(params.to) : void 0,
    range: params.limit ? String(params.limit) : void 0,
    unit: "EUR"
  }),
  normalize: (raw) => arrayPayload(raw).map(normalizeCandle)
};
var availableL2BooksSpec = {
  schemaName: "market.availableL2Books",
  resource: (params) => ({ type: "instrument", id: params.assetId }),
  normalize: (raw) => normalizeL2Venues(raw)
};
var quoteSpec = {
  schemaName: "market.quote",
  resource: (params) => ({ type: "ticker", id: `${params.assetId}.${params.exchangeId}` }),
  normalize: (raw, params) => normalizeMarketQuote(raw, params.assetId, params.exchangeId)
};
var liveFeedSpec = {
  schemaName: "market.liveFeed",
  topic: "tickerV3",
  payload: (params) => ({
    isin: params.assetId,
    exchangeId: params.exchangeId,
    unit: "EUR",
    fields: params.fields
  }),
  normalize: (raw) => normalizeLiveFeedEvent(raw)
};
var l2OrderBookSpec = {
  schemaName: "market.l2OrderBook",
  topic: "L2",
  payload: (params) => ({
    isin: params.assetId,
    exchangeId: params.exchangeId,
    depth: params.depth,
    throttleMs: params.throttleMs
  }),
  normalize: (raw) => normalizeL2OrderBook(raw)
};
function toIso(value) {
  return value instanceof Date ? value.toISOString() : value;
}

// src/candles.ts
var TIMEFRAME_MS = {
  "1m": 6e4,
  "5m": 5 * 6e4,
  "15m": 15 * 6e4,
  "30m": 30 * 6e4,
  "1h": 60 * 6e4,
  "4h": 4 * 60 * 6e4,
  "1d": 24 * 60 * 6e4,
  "1w": 7 * 24 * 60 * 6e4,
  "1M": 31 * 24 * 60 * 6e4
};
var CandleQuery = class {
  constructor(resources, options) {
    this.resources = resources;
    this.options = options;
  }
  resources;
  options;
  fetch() {
    return this.resources.query(candlesSpec, this.options);
  }
  async *pages(options = {}) {
    const maxCandlesPerRequest = options.maxCandlesPerRequest ?? this.options.limit ?? 500;
    const to = this.options.to ? asDate(this.options.to) : void 0;
    if (!to) {
      yield await this.fetch();
      return;
    }
    const stepMs = TIMEFRAME_MS[this.options.timeframe] * maxCandlesPerRequest;
    let cursor = asDate(this.options.from);
    while (cursor < to) {
      const next = new Date(Math.min(cursor.getTime() + stepMs, to.getTime()));
      yield await this.resources.query(candlesSpec, {
        ...this.options,
        from: cursor,
        to: next,
        limit: maxCandlesPerRequest
      });
      cursor = next;
    }
  }
  async download(options = {}) {
    const candles = [];
    for await (const page of this.pages(options)) candles.push(...page);
    return dedupeCandles(candles);
  }
};
function asDate(value) {
  return value instanceof Date ? value : new Date(value);
}
function dedupeCandles(candles) {
  const byTime = /* @__PURE__ */ new Map();
  for (const candle of candles) byTime.set(candle.time, candle);
  return [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
}

// src/schemas/registry.ts
import { z } from "zod";
var scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
var jsonValue = z.lazy(() => z.union([scalar, z.array(jsonValue), z.record(z.string(), jsonValue)]));
var jsonRecord = z.record(z.string(), jsonValue);
var emptyObject = z.strictObject({});
var optionalNullableString = z.string().nullable().optional();
var optionalNullableNumber = z.number().nullable().optional();
var optionalNullableBoolean = z.boolean().nullable().optional();
var errorItemSchema = z.strictObject({
  errorCode: optionalNullableString,
  errorField: optionalNullableString,
  errorMessage: optionalNullableString,
  meta: jsonValue.optional()
});
var emptyOrErrorResponse = z.union([
  emptyObject,
  z.strictObject({ errors: z.array(errorItemSchema) })
]);
var availableCashItemSchema = z.strictObject({
  accountNumber: z.string(),
  currencyId: z.string(),
  amount: z.number()
});
var accountPairSchema = z.strictObject({
  securitiesAccountNumber: z.string(),
  cashAccountNumber: z.string().optional(),
  accountProductType: z.string().optional()
});
var normalizedArrayWrappers = z.union([
  z.array(jsonValue),
  z.strictObject({ data: z.array(jsonValue) }),
  z.strictObject({ items: z.array(jsonValue) }),
  z.strictObject({ results: z.array(jsonValue) }),
  z.strictObject({ results: z.array(jsonValue), resultCount: z.number().optional(), correlationId: z.string().optional() }),
  z.strictObject({ orders: z.array(jsonValue) }),
  z.strictObject({ positions: z.array(jsonValue) }),
  z.strictObject({ assets: z.array(jsonValue) }),
  z.strictObject({ derivatives: z.array(jsonValue) }),
  z.strictObject({ subscriptions: z.array(jsonValue) }),
  z.strictObject({ activities: z.array(jsonValue) }),
  z.strictObject({ timeline: z.array(jsonValue) }),
  z.strictObject({ actions: z.array(jsonValue) }),
  z.strictObject({ priceAlarms: z.array(jsonValue) }),
  z.strictObject({ notifications: z.array(jsonValue) }),
  z.strictObject({ watchlists: z.array(jsonValue) }),
  z.strictObject({ screeners: z.array(jsonValue) }),
  z.strictObject({ documents: z.array(jsonValue) }),
  z.strictObject({ trades: z.array(jsonValue) }),
  z.strictObject({ destinations: z.array(jsonValue) }),
  z.strictObject({ categories: z.array(jsonValue) }),
  z.strictObject({ accounts: z.array(jsonValue) }),
  z.strictObject({ obj: z.strictObject({ items: z.array(jsonValue) }) })
]);
var orderDestinationsResponseSchema = z.union([
  normalizedArrayWrappers,
  z.strictObject({
    destinations: z.array(jsonValue),
    preferredMarketDataProvider: optionalNullableString,
    preferredOrderDestination: optionalNullableString
  })
]);
var accountSchema = z.object({
  account: jsonValue.optional(),
  phoneNumber: z.string().optional(),
  jurisdiction: z.string().optional(),
  name: jsonRecord.optional(),
  email: jsonRecord.optional(),
  postalAddress: jsonRecord.optional(),
  cashAccount: jsonRecord.optional(),
  referenceAccount: jsonRecord.optional(),
  referenceAccountV2: jsonRecord.optional(),
  referenceAccountList: z.array(jsonRecord).optional(),
  securitiesAccountNumber: z.string().optional(),
  experience: jsonRecord.optional(),
  taxExemptionOrder: jsonRecord.optional(),
  personId: z.string().optional(),
  duplicateTradingEmail: optionalNullableBoolean,
  birthdate: optionalNullableString,
  birthplace: jsonValue.optional(),
  mainNationality: optionalNullableString,
  additionalNationalities: z.array(jsonValue).optional(),
  mainTaxResidency: jsonValue.optional(),
  usTaxResidency: optionalNullableBoolean,
  additionalTaxResidencies: z.array(jsonValue).optional(),
  taxInformationSyncTimestamp: z.union([z.string(), z.number(), z.null()]).optional(),
  registrationAccount: jsonValue.optional(),
  referralDetails: jsonValue.optional(),
  supportDocuments: jsonValue.optional(),
  tinFormat: jsonValue.optional()
}).strict();
var sessionSchema = z.union([
  z.undefined(),
  emptyObject,
  z.object({
    session: jsonValue.optional(),
    connectionToken: z.string().optional(),
    expiresAt: optionalNullableString,
    status: optionalNullableString
  }).strict()
]);
var priceAlarmMutationSchema = z.union([
  emptyObject,
  z.strictObject({ id: z.string() }),
  z.strictObject({ status: z.string().optional(), alarmId: z.string() }),
  z.strictObject({ priceAlarmId: z.string() }),
  z.strictObject({ status: z.string().optional(), id: z.string().optional() })
]);
var watchlistMutationSchema = z.union([
  z.undefined(),
  emptyObject,
  jsonRecord
]);
var schemaRegistry = [
  entry("auth.session", "Auth web session", "rest", "read", "GET /api/v1/auth/web/session", sessionSchema),
  entry("auth.account", "Auth account", "rest", "read", "GET /api/v2/auth/account", accountSchema),
  entry("account.personalDetails", "Personal details", "rest", "read", "GET /api/v1/customer/personal-details", jsonRecord),
  entry("account.relationships", "Account relationships", "rest", "read", "GET /api/v1/customer/relationships/detailed", jsonRecord),
  entry("account.cardsHome", "Cards home", "rest", "read", "GET /api/v1/card/cards/home", jsonRecord, { live: { optionalStatuses: [404, 500] } }),
  entry("boards.list", "Boards list", "rest", "read", "GET /api-gateway/pro-trading/api/v2/boards", normalizedArrayWrappers),
  entry("boards.detail", "Board detail", "rest", "read", "GET /api-gateway/pro-trading/api/v2/boards/{boardId}", jsonRecord),
  entry("assets.search", "Asset search", "websocket", "read", "neonSearch", normalizedArrayWrappers, { variants: ["stock", "crypto", "etf -> fund", "mutualFund", "privateFund", "bond", "synthetic"] }),
  entry("assets.get", "Instrument detail", "websocket", "read", "instrument", jsonRecord),
  entry("derivatives.search", "Derivative search", "websocket", "read", "neonSearch type=derivative", normalizedArrayWrappers),
  entry("derivatives.listForUnderlying", "Derivatives for underlying", "websocket", "read", "derivatives", normalizedArrayWrappers),
  entry("orders.all", "Orders list", "rest", "read", "GET /web-trading-gateway/api/customer/v1/orders", normalizedArrayWrappers),
  entry("orders.mutualFunds", "Mutual fund orders", "rest", "read", "GET /api-gateway/mutual-funds/api/v1/orders", normalizedArrayWrappers),
  entry("orders.privateMarkets", "Private market orders", "rest", "read", "GET /api/v1/private-markets/orders/all", normalizedArrayWrappers),
  entry("orders.orderUpdates", "Order update stream", "websocket", "read", "orderUpdates", jsonValue, { live: { sample: "stream" } }),
  entry("orders.fees", "Order fee preview", "websocket", "read", "orderFeesV2", jsonValue),
  entry("orders.submit", "Submit brokerage order", "websocket", "highRiskMutation", "simpleCreateOrder", jsonValue),
  entry("orders.cancel", "Cancel brokerage order", "websocket", "highRiskMutation", "cancelOrder", jsonValue),
  entry("portfolio.current", "Portfolio positions", "websocket", "read", "compactPortfolioByTypeV2", z.union([jsonRecord, normalizedArrayWrappers])),
  entry("portfolio.cash", "Available cash", "websocket", "read", "availableCash", z.array(availableCashItemSchema)),
  entry("portfolio.markToMarketValue", "Portfolio status", "websocket", "read", "portfolioStatus", jsonValue),
  entry("portfolio.savingsPlans", "Savings plans", "websocket", "read", "savingsPlans", normalizedArrayWrappers),
  entry("portfolio.privateMarketsPositions", "Private markets positions", "websocket", "read", "privateMarketsPositions", jsonValue),
  entry("portfolio.portfolioChart", "Portfolio chart", "rest", "read", "GET /api-gateway/portfolio-chart/v2/chart", jsonValue),
  entry("market.subscriptions", "Market subscriptions", "websocket", "read", "accountPairs", z.union([z.array(accountPairSchema), normalizedArrayWrappers])),
  entry("market.candles", "Price history candles", "websocket", "read", "aggregateHistoryLightV2", jsonValue, { variants: ["stock", "crypto"] }),
  entry("market.quote", "Market quote", "websocket", "read", "ticker", jsonValue, { variants: ["stock", "crypto"] }),
  entry("market.liveFeed", "Live quote feed", "websocket", "read", "tickerV3", jsonValue, { variants: ["stock", "crypto"], live: { sample: "stream" } }),
  entry("market.availableL2Books", "Available L2 books", "websocket", "read", "instrument", jsonValue),
  entry("market.l2OrderBook", "L2 order book stream", "websocket", "read", "L2", jsonValue, { live: { sample: "stream" } }),
  entry("timeline.list", "Timeline activity", "websocket", "read", "timelineActivityLog", normalizedArrayWrappers),
  entry("timeline.actions", "Timeline actions", "websocket", "read", "timelineActionsV2", normalizedArrayWrappers),
  entry("timeline.detail", "Timeline detail", "websocket", "read", "timelineDetailV2", jsonRecord),
  entry("priceAlarms.list", "Price alarms", "websocket", "read", "priceAlarms", normalizedArrayWrappers),
  entry("priceAlarms.notifications", "Price alarm notifications", "websocket", "read", "priceAlarmNotifications", normalizedArrayWrappers),
  entry("priceAlarms.create", "Create price alarm", "websocket", "lowRiskMutation", "createPriceAlarm", priceAlarmMutationSchema, { live: { sample: "cleanup" } }),
  entry("priceAlarms.cancel", "Cancel price alarm", "websocket", "lowRiskMutation", "cancelPriceAlarm", priceAlarmMutationSchema, { live: { sample: "cleanup" } }),
  entry("instruments.news", "Instrument news", "websocket", "read", "neonNews", normalizedArrayWrappers),
  entry("instruments.etfDetails", "ETF details", "websocket", "read", "etfDetails", jsonValue),
  entry("instruments.etfComposition", "ETF composition", "websocket", "read", "etfComposition", jsonValue),
  entry("instruments.fundDetails", "Fund details", "websocket", "read", "mutualFundDetails", jsonValue),
  entry("instruments.fundComposition", "Fund composition", "websocket", "read", "mutualFundComposition", jsonValue),
  entry("instruments.cryptoDetails", "Crypto details", "websocket", "read", "cryptoDetails", jsonValue),
  entry("instruments.yieldToMaturity", "Yield to maturity", "websocket", "read", "yieldToMaturity", jsonValue),
  entry("trading.priceForOrder", "Price for order quote", "websocket", "read", "priceForOrderV2", jsonValue),
  entry("trading.availableSize", "Available size", "websocket", "read", "availableSize", jsonValue),
  entry("trading.orderDestinations", "Order destinations", "rest", "read", "GET /api-gateway/order-router/api/v2/instruments/{isin}/destinations?jurisdiction=DE", orderDestinationsResponseSchema),
  entry("trading.trades", "Trades", "rest", "read", "GET /web-trading-gateway/api/customer/v1/trades", normalizedArrayWrappers),
  entry("trading.dailyPnl", "Daily PnL", "rest", "read", "POST /web-trading-gateway/api/customer/v1/pnl/daily", jsonValue),
  entry("discovery.exchangeDetails", "Exchange details", "rest", "read", "GET /api-gateway/instrument-universe/api/v1/exchanges-details", normalizedArrayWrappers),
  entry("discovery.exchangeSchedule", "Exchange schedule", "rest", "read", "GET /api-gateway/instrument-universe/api/v1/exchanges/{exchange}/schedule", jsonRecord),
  entry("discovery.instrumentStatus", "Instrument status", "rest", "read", "GET /api-gateway/instrument-universe/api/v1/instruments/{isin}/status/{exchange}", jsonRecord),
  entry("discovery.watchlists", "Watchlists", "rest", "read", "GET /api-gateway/watchlists/api/v2/watchlists", jsonValue),
  entry("discovery.watchlists.items", "Watchlist items", "rest", "read", "GET /api-gateway/watchlists/api/v2/watchlists/{watchlistId}/items", jsonValue),
  entry("discovery.watchlists.clone", "Clone watchlist", "rest", "lowRiskMutation", "POST /api-gateway/watchlists/api/v2/watchlists/{watchlistId}/clone", watchlistMutationSchema, { live: { sample: "cleanup", optionalStatuses: [404] } }),
  entry("discovery.watchlists.rename", "Rename watchlist", "rest", "lowRiskMutation", "PUT /api-gateway/watchlists/api/v2/watchlists/{watchlistId}", watchlistMutationSchema, { live: { sample: "cleanup", optionalStatuses: [404] } }),
  entry("discovery.watchlists.delete", "Delete watchlist", "rest", "lowRiskMutation", "DELETE /api-gateway/watchlists/api/v2/watchlists/{watchlistId}", watchlistMutationSchema, { live: { sample: "cleanup" } }),
  entry("discovery.watchlists.addItem", "Add watchlist item", "rest", "lowRiskMutation", "POST /api-gateway/watchlists/api/v2/watchlists/{watchlistId}/items", watchlistMutationSchema, { live: { sample: "cleanup" } }),
  entry("discovery.watchlists.removeItem", "Remove watchlist item", "rest", "lowRiskMutation", "DELETE /api-gateway/watchlists/api/v2/watchlists/{watchlistId}/items/{instrumentId}", watchlistMutationSchema, { live: { sample: "cleanup" } }),
  entry("discovery.screeners", "Screeners", "rest", "read", "GET /api-gateway/screeners/api/v2/screeners", jsonValue),
  entry("discovery.screenerOptions", "Screener options", "rest", "read", "GET /api-gateway/screeners/api/v2/screeners/options", jsonValue),
  entry("discovery.userPreferences", "User preferences", "rest", "read", "GET /api-gateway/pro-trading/api/v1/user-preferences", jsonValue),
  entry("documents.documents", "Documents", "rest", "read", "GET /api/v1/documents/all", jsonValue),
  entry("tax.taxInformation", "Tax information", "rest", "read", "GET /api/v1/taxes/information", jsonValue),
  entry("tax.exemptionOrder", "Tax exemption order", "rest", "read", "GET /api/v1/taxes/exemptionorders", jsonValue),
  entry("tax.taxResidencies", "Tax residencies", "rest", "read", "GET /api/v1/auth/account/change/taxresidencies", jsonValue, { live: { optionalStatuses: [404, 500] } }),
  entry("tax.taxResidencyCountries", "Tax residency countries", "rest", "read", "GET /api/v1/country/taxresidency", jsonValue),
  entry("payments.paymentMethods", "Payment methods", "rest", "read", "GET /api/v2/payment/methods", jsonValue),
  entry("payments.iban", "IBAN", "rest", "read", "GET /api/v1/auth/account/iban", z.union([jsonRecord, emptyOrErrorResponse]), { live: { optionalStatuses: [404, 500] } }),
  entry("payments.interestDetails", "Interest details", "rest", "read", "GET /api/v1/interest/details", z.union([jsonRecord, emptyOrErrorResponse]), { live: { optionalStatuses: [404, 500] } }),
  entry("blocked.orderMutations", "Unsupported legacy order change/confirm resources", "websocket", "blockedMutation", "confirmOrder|changeOrder", jsonValue),
  entry("blocked.bankTransfers", "Payouts and bank transfers", "rest", "blockedMutation", "POST /api/v1/payout and payment authorization paths", jsonValue),
  entry("blocked.documentAcceptance", "Document acceptance", "rest", "blockedMutation", "api/v1/documents/group/accept and terms accept paths", jsonValue),
  entry("blocked.accountSecurity", "Account identity, tax, PIN, login security mutations", "rest", "blockedMutation", "change account/tax/security paths", jsonValue)
];
var schemasByName = new Map(schemaRegistry.map((item) => [item.name, item]));
function validateRawResponse(schemaName, value) {
  const entry2 = schemasByName.get(schemaName);
  if (!entry2) throw new Error(`Unknown Trade Republic schema: ${schemaName}`);
  const result = entry2.responseSchema.safeParse(value);
  if (result.success) return result.data;
  throw new TradeRepublicSchemaError(
    `Trade Republic schema validation failed for ${schemaName}`,
    schemaName,
    result.error.issues,
    summarizeRaw(value),
    result.error
  );
}
function schemaCatalogMarkdown() {
  const lines = [
    "# Trade Republic API Schemas",
    "",
    "Generated from `src/schemas/registry.ts`. These schemas validate raw Trade Republic responses before SDK normalization.",
    "",
    "| Name | Risk | Transport | Request | Variants |",
    "| --- | --- | --- | --- | --- |"
  ];
  for (const entry2 of schemaRegistry) {
    lines.push(`| \`${entry2.name}\` | \`${entry2.risk}\` | \`${entry2.transport}\` | \`${entry2.request.replaceAll("|", "\\|")}\` | ${entry2.variants?.join(", ") ?? ""} |`);
  }
  lines.push("");
  lines.push("`highRiskMutation` entries can move money or alter live orders and must never be exercised by unattended integration tests. `blockedMutation` entries remain unsupported.");
  return `${lines.join("\n")}
`;
}
function entry(name, title, transport, risk, request, responseSchema, options = {}) {
  return { name, title, transport, risk, request, requestSchema: jsonValue, responseSchema, ...options };
}
function summarizeRaw(value) {
  if (Array.isArray(value)) return { kind: "array", length: value.length, first: summarizeRaw(value[0]) };
  if (!value || typeof value !== "object") return value;
  const record = value;
  return {
    kind: "object",
    keys: Object.keys(record).slice(0, 40)
  };
}

// src/resource.ts
var ResourceClient = class {
  constructor(http, endpoints, raw, validateRaw = validateRawResponse) {
    this.http = http;
    this.endpoints = endpoints;
    this.raw = raw;
    this.validateRaw = validateRaw;
  }
  http;
  endpoints;
  raw;
  validateRaw;
  async query(spec, params) {
    const raw = spec.resource ? await this.raw.query(spec.resource(params)) : await this.http.request(
      spec.method ?? "GET",
      this.endpoints.resolve(requiredEndpoint(spec), spec.pathParams?.(params)),
      spec.body?.(params),
      spec.query?.(params)
    );
    const validatedRaw = spec.schemaName ? this.validateRaw(spec.schemaName, raw) : raw;
    return spec.normalize(validatedRaw, params);
  }
  stream(spec, params) {
    return toSubscription(this.raw.subscribe(spec.topic, spec.payload(params))).map((raw) => spec.normalize(spec.schemaName ? this.validateRaw(spec.schemaName, raw) : raw, params));
  }
};
function requiredEndpoint(spec) {
  if (!spec.endpoint) throw new Error("Query spec needs either endpoint or resource.");
  return spec.endpoint;
}
function toSubscription(source, close) {
  return {
    close() {
      if ("close" in source && typeof source.close === "function") source.close();
      close?.();
    },
    map(mapper) {
      const parent = this;
      return toSubscription(mapAsync(parent, mapper), () => parent.close());
    },
    [Symbol.asyncIterator]() {
      return source[Symbol.asyncIterator]();
    }
  };
}
async function* mapAsync(source, mapper) {
  for await (const item of source) yield mapper(item);
}

// src/operations.ts
var OperationClient = class {
  constructor(http, raw, validateRaw, endpoints) {
    this.http = http;
    this.raw = raw;
    this.validateRaw = validateRaw;
    this.endpoints = endpoints;
  }
  http;
  raw;
  validateRaw;
  endpoints;
  async execute(operation, params) {
    return operation.normalize(await this.executeRaw(operation, params), params);
  }
  async executeRaw(operation, params) {
    const timeoutMs = operation.transport === "mapper-query" ? operation.timeoutMs?.(params) : void 0;
    const raw = operation.transport === "rest" ? await this.http.request(
      operation.method ?? "GET",
      this.resolvePath(operation, params),
      operation.body?.(params),
      operation.query?.(params)
    ) : await this.raw.query(
      operation.payload(params),
      timeoutMs === void 0 ? {} : { timeoutMs }
    );
    return operation.schemaName ? this.validateRaw(operation.schemaName, raw) : raw;
  }
  stream(operation, params) {
    return toSubscription(this.raw.subscribeResource(operation.payload(params))).map((raw) => operation.normalize(operation.schemaName ? this.validateRaw(operation.schemaName, raw) : raw, params));
  }
  resolvePath(operation, params) {
    if (operation.endpoint) {
      if (!this.endpoints) throw new Error(`Operation ${operation.name} needs an endpoint resolver.`);
      return this.endpoints.resolve(operation.endpoint, operation.pathParams?.(params));
    }
    if (!operation.path) throw new Error(`REST operation ${operation.name} needs a path or endpoint.`);
    return typeof operation.path === "function" ? operation.path(params) : operation.path;
  }
};
var identity = (value) => value;

// src/client-runtime.ts
var ClientRuntime = class {
  constructor(http, endpoints, raw, validateRaw, accountIdentity) {
    this.http = http;
    this.endpoints = endpoints;
    this.raw = raw;
    this.validateRaw = validateRaw;
    this.accountIdentity = accountIdentity;
    this.resources = new ResourceClient(http, endpoints, raw, validateRaw);
    this.operations = new OperationClient(http, raw, validateRaw, endpoints);
  }
  http;
  endpoints;
  raw;
  validateRaw;
  accountIdentity;
  resources;
  operations;
  get securitiesAccountNumber() {
    return this.accountIdentity.get();
  }
  rememberSecuritiesAccountNumber(value) {
    this.accountIdentity.set(value);
  }
  async resolveSecuritiesAccountNumber(timeoutMs) {
    const cached = this.accountIdentity.get();
    try {
      const accountPairs = await this.raw.query(
        { type: "accountPairs" },
        timeoutMs === void 0 ? {} : { timeoutMs }
      );
      const accountNumber2 = firstStringByKey(accountPairs, "securitiesAccountNumber");
      if (accountNumber2) {
        this.accountIdentity.set(accountNumber2);
        return accountNumber2;
      }
    } catch {
      if (cached) return cached;
      const accountNumber2 = await this.accountIdentity.fallback?.();
      if (accountNumber2) {
        this.accountIdentity.set(accountNumber2);
        return accountNumber2;
      }
      throw unavailableAccountNumber();
    }
    if (cached) return cached;
    const accountNumber = await this.accountIdentity.fallback?.();
    if (accountNumber) {
      this.accountIdentity.set(accountNumber);
      return accountNumber;
    }
    throw unavailableAccountNumber();
  }
};
function firstStringByKey(value, key) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = firstStringByKey(item, key);
      if (match) return match;
    }
    return void 0;
  }
  if (!value || typeof value !== "object") return void 0;
  const record = value;
  if (typeof record[key] === "string" && record[key].length > 0) return record[key];
  for (const item of Object.values(record)) {
    const match = firstStringByKey(item, key);
    if (match) return match;
  }
  return void 0;
}
function unavailableAccountNumber() {
  return new Error("Trade Republic securities account number was not available from accountPairs or account profile.");
}

// src/endpoints.ts
var DEFAULT_ENDPOINTS = {
  "auth.qrChallenge": "/api/v2/auth/web/login/qr-challenges",
  "auth.qrStatus": "/api/v2/auth/web/login/qr-challenges/{challengeId}",
  "auth.login": "/api/v2/auth/web/login",
  "auth.loginProcess": "/api/v2/auth/web/login/processes/{processId}",
  "auth.account": "/api/v2/auth/account",
  "auth.session": "/api/v1/auth/web/session",
  "boards.list": "/api-gateway/pro-trading/api/v2/boards",
  "boards.detail": "/api-gateway/pro-trading/api/v2/boards/{boardId}",
  "assets.search": "/api/v2/search/instruments",
  "assets.detail": "/api/v2/instruments/{assetId}",
  "assets.all": "/api/v2/instruments",
  "derivatives.search": "/api/v2/derivatives",
  "derivatives.forUnderlying": "/api/v2/instruments/{underlyingId}/derivatives",
  "derivatives.detail": "/api/v2/derivatives/{derivativeId}",
  "orders.all": "/web-trading-gateway/api/customer/v1/orders",
  "orders.mutualFunds": "/api-gateway/mutual-funds/api/v1/orders",
  "orders.privateMarkets": "/api/v1/private-markets/orders/all",
  "portfolio.current": "/api/v2/portfolio",
  "portfolio.cash": "/api/v2/portfolio/cash",
  "portfolio.markToMarket": "/api/v2/portfolio/mark-to-market",
  "market.subscriptions": "/api/v2/market-data/subscriptions",
  "market.candles": "/api/v2/market-data/candles",
  "market.liveFeed": "/api/v2/market-data/live-feed",
  "market.availableL2Books": "/api/v2/market-data/l2/venues",
  "market.l2OrderBook": "/api/v2/market-data/l2/orderbook"
};
var EndpointResolver = class {
  endpoints;
  constructor(overrides = {}) {
    this.endpoints = { ...DEFAULT_ENDPOINTS, ...overrides };
  }
  resolve(key, params = {}) {
    let path = this.endpoints[key];
    for (const [name, value] of Object.entries(params)) {
      path = path.replaceAll(`{${name}}`, encodeURIComponent(String(value)));
    }
    return path;
  }
};

// src/operation-specs.ts
var accountOperations = {
  current: endpoint("auth.account", "auth.account"),
  session: endpoint("auth.session", "auth.session"),
  accountSettings: endpoint("auth.account", "auth.account"),
  personalDetails: rest("account.personalDetails", "/api/v1/customer/personal-details"),
  relationships: rest("account.relationships", "/api/v1/customer/relationships/detailed"),
  cardsHome: rest("account.cardsHome", "/api/v1/card/cards/home")
};
var boardOperations = {
  list: {
    ...endpoint("boards.list", "boards.list"),
    normalize: (raw) => arrayPayload(raw).map(normalizeBoard)
  },
  detail: {
    transport: "rest",
    name: "boards.detail",
    schemaName: "boards.detail",
    endpoint: "boards.detail",
    pathParams: ({ boardId }) => ({ boardId }),
    normalize: (raw) => normalizeBoard(raw)
  }
};
var discoveryOperations = {
  exchangeDetails: {
    ...rest("discovery.exchangeDetails", "/api-gateway/instrument-universe/api/v1/exchanges-details"),
    query: () => ({ includeMaintenanceWindow: false }),
    normalize: (raw) => arrayPayload(raw).map(normalizeExchangeDetails)
  },
  exchangeSchedule: {
    transport: "rest",
    name: "discovery.exchangeSchedule",
    schemaName: "discovery.exchangeSchedule",
    path: ({ exchange }) => `/api-gateway/instrument-universe/api/v1/exchanges/${encodeURIComponent(exchange)}/schedule`,
    normalize: (raw) => normalizeExchangeSchedule(raw)
  },
  instrumentStatus: {
    transport: "rest",
    name: "discovery.instrumentStatus",
    schemaName: "discovery.instrumentStatus",
    path: ({ isin, exchange }) => `/api-gateway/instrument-universe/api/v1/instruments/${encodeURIComponent(isin)}/status/${encodeURIComponent(exchange)}`,
    normalize: (raw) => normalizeInstrumentStatus(raw)
  },
  watchlists: rest("discovery.watchlists", "/api-gateway/watchlists/api/v2/watchlists"),
  watchlistItems: {
    transport: "rest",
    name: "discovery.watchlists.items",
    schemaName: "discovery.watchlists.items",
    path: ({ watchlistId }) => `/api-gateway/watchlists/api/v2/watchlists/${encodeURIComponent(watchlistId)}/items`,
    query: ({ pageSize }) => ({ pageSize: pageSize ?? 200 }),
    normalize: identity
  },
  cloneWatchlist: mutation("discovery.watchlists.clone", "POST", ({ watchlistId }) => `/api-gateway/watchlists/api/v2/watchlists/${encodeURIComponent(watchlistId)}/clone`),
  renameWatchlist: mutation("discovery.watchlists.rename", "PUT", ({ watchlistId }) => `/api-gateway/watchlists/api/v2/watchlists/${encodeURIComponent(watchlistId)}`, ({ name }) => ({ name })),
  deleteWatchlist: mutation("discovery.watchlists.delete", "DELETE", ({ watchlistId }) => `/api-gateway/watchlists/api/v2/watchlists/${encodeURIComponent(watchlistId)}`),
  addWatchlistItem: mutation("discovery.watchlists.addItem", "POST", ({ watchlistId }) => `/api-gateway/watchlists/api/v2/watchlists/${encodeURIComponent(watchlistId)}/items`, ({ instrumentId, options }) => ({ instrument_id: instrumentId, item_rank: -1, ...options })),
  removeWatchlistItem: mutation("discovery.watchlists.removeItem", "DELETE", ({ watchlistId, instrumentId }) => `/api-gateway/watchlists/api/v2/watchlists/${encodeURIComponent(watchlistId)}/items/${encodeURIComponent(instrumentId)}`),
  screeners: rest("discovery.screeners", "/api-gateway/screeners/api/v2/screeners"),
  screenerOptions: rest("discovery.screenerOptions", "/api-gateway/screeners/api/v2/screeners/options"),
  userPreferences: rest("discovery.userPreferences", "/api-gateway/pro-trading/api/v1/user-preferences")
};
var customerOperations = {
  documents: rest("documents.documents", "/api/v1/documents/all"),
  taxInformation: rest("tax.taxInformation", "/api/v1/taxes/information"),
  exemptionOrder: rest("tax.exemptionOrder", "/api/v1/taxes/exemptionorders"),
  taxResidencies: rest("tax.taxResidencies", "/api/v1/auth/account/change/taxresidencies"),
  taxResidencyCountries: rest("tax.taxResidencyCountries", "/api/v1/country/taxresidency"),
  paymentMethods: rest("payments.paymentMethods", "/api/v2/payment/methods"),
  iban: rest("payments.iban", "/api/v1/auth/account/iban"),
  interestDetails: rest("payments.interestDetails", "/api/v1/interest/details")
};
var operationCatalog = [
  ...Object.values(accountOperations),
  ...Object.values(boardOperations),
  ...Object.values(discoveryOperations),
  ...Object.values(customerOperations)
];
function rest(name, path) {
  return { transport: "rest", name, schemaName: name, path, normalize: identity };
}
function endpoint(name, endpointKey) {
  return { transport: "rest", name, schemaName: name, endpoint: endpointKey, normalize: identity };
}
function mutation(name, method, path, body) {
  return {
    transport: "rest",
    name,
    schemaName: name,
    method,
    path,
    ...body ? { body } : {},
    normalize: identity
  };
}

// src/domains/account.ts
var AccountApi = class {
  constructor(operations) {
    this.operations = operations;
  }
  operations;
  current() {
    return this.operations.executeRaw(accountOperations.current, {});
  }
  session() {
    return this.operations.executeRaw(accountOperations.session, {});
  }
  accountSettings() {
    return this.operations.executeRaw(accountOperations.accountSettings, {});
  }
  personalDetails() {
    return this.operations.executeRaw(accountOperations.personalDetails, {});
  }
  relationships() {
    return this.operations.executeRaw(accountOperations.relationships, {});
  }
  cardsHome() {
    return this.operations.executeRaw(accountOperations.cardsHome, {});
  }
};
var BoardsApi = class {
  constructor(operations) {
    this.operations = operations;
  }
  operations;
  list() {
    return this.operations.execute(boardOperations.list, {});
  }
  get(boardId) {
    return this.operations.execute(boardOperations.detail, { boardId });
  }
};

// src/domains/customer.ts
var DocumentsApi = class {
  constructor(operations) {
    this.operations = operations;
  }
  operations;
  documents() {
    return this.rawDocuments();
  }
  rawDocuments() {
    return this.operations.executeRaw(customerOperations.documents, {});
  }
};
var TaxApi = class {
  constructor(operations) {
    this.operations = operations;
  }
  operations;
  taxInformation() {
    return this.rawTaxInformation();
  }
  rawTaxInformation() {
    return this.operations.executeRaw(customerOperations.taxInformation, {});
  }
  exemptionOrder() {
    return this.rawExemptionOrder();
  }
  rawExemptionOrder() {
    return this.operations.executeRaw(customerOperations.exemptionOrder, {});
  }
  taxResidencies() {
    return this.rawTaxResidencies();
  }
  rawTaxResidencies() {
    return this.operations.executeRaw(customerOperations.taxResidencies, {});
  }
  taxResidencyCountries() {
    return this.rawTaxResidencyCountries();
  }
  rawTaxResidencyCountries() {
    return this.operations.executeRaw(customerOperations.taxResidencyCountries, {});
  }
};
var PaymentsApi = class {
  constructor(operations) {
    this.operations = operations;
  }
  operations;
  paymentMethods() {
    return this.rawPaymentMethods();
  }
  rawPaymentMethods() {
    return this.operations.executeRaw(customerOperations.paymentMethods, {});
  }
  iban() {
    return this.rawIban();
  }
  rawIban() {
    return this.operations.executeRaw(customerOperations.iban, {});
  }
  interestDetails() {
    return this.rawInterestDetails();
  }
  rawInterestDetails() {
    return this.operations.executeRaw(customerOperations.interestDetails, {});
  }
};

// src/domains/discovery.ts
var DiscoveryApi = class {
  constructor(operations) {
    this.operations = operations;
  }
  operations;
  exchangeDetails() {
    return this.operations.execute(discoveryOperations.exchangeDetails, {});
  }
  rawExchangeDetails() {
    return this.operations.executeRaw(discoveryOperations.exchangeDetails, {});
  }
  exchangeSchedule(exchange) {
    return this.operations.execute(discoveryOperations.exchangeSchedule, { exchange });
  }
  rawExchangeSchedule(exchange) {
    return this.operations.executeRaw(discoveryOperations.exchangeSchedule, { exchange });
  }
  instrumentStatus(isin, exchange) {
    return this.operations.execute(discoveryOperations.instrumentStatus, { isin, exchange });
  }
  rawInstrumentStatus(isin, exchange) {
    return this.operations.executeRaw(discoveryOperations.instrumentStatus, { isin, exchange });
  }
  watchlists() {
    return this.rawWatchlists();
  }
  async cloudWatchlist(options = {}) {
    const watchlist = arrayPayload(await this.rawWatchlists())[0];
    if (!watchlist) return void 0;
    const normalized = normalizeWatchlist(watchlist);
    if (!normalized.id) return normalized;
    const items = arrayPayload(await this.rawWatchlistItems(normalized.id, options));
    return normalizeWatchlist(watchlist, items);
  }
  rawWatchlistItems(watchlistId, options = {}) {
    return this.operations.executeRaw(discoveryOperations.watchlistItems, {
      watchlistId,
      ...options.pageSize === void 0 ? {} : { pageSize: options.pageSize }
    });
  }
  rawWatchlists() {
    return this.operations.executeRaw(discoveryOperations.watchlists, {});
  }
  cloneWatchlist(watchlistId) {
    return this.rawCloneWatchlist(watchlistId);
  }
  rawCloneWatchlist(watchlistId) {
    return this.operations.executeRaw(discoveryOperations.cloneWatchlist, { watchlistId });
  }
  renameWatchlist(watchlistId, name) {
    return this.rawRenameWatchlist(watchlistId, name);
  }
  rawRenameWatchlist(watchlistId, name) {
    return this.operations.executeRaw(discoveryOperations.renameWatchlist, { watchlistId, name });
  }
  deleteWatchlist(watchlistId) {
    return this.rawDeleteWatchlist(watchlistId);
  }
  rawDeleteWatchlist(watchlistId) {
    return this.operations.executeRaw(discoveryOperations.deleteWatchlist, { watchlistId });
  }
  addWatchlistItem(watchlistId, instrumentId, options = {}) {
    return this.rawAddWatchlistItem(watchlistId, instrumentId, options);
  }
  rawAddWatchlistItem(watchlistId, instrumentId, options = {}) {
    return this.operations.executeRaw(discoveryOperations.addWatchlistItem, { watchlistId, instrumentId, options });
  }
  removeWatchlistItem(watchlistId, instrumentId) {
    return this.rawRemoveWatchlistItem(watchlistId, instrumentId);
  }
  rawRemoveWatchlistItem(watchlistId, instrumentId) {
    return this.operations.executeRaw(discoveryOperations.removeWatchlistItem, { watchlistId, instrumentId });
  }
  screeners() {
    return this.rawScreeners();
  }
  rawScreeners() {
    return this.operations.executeRaw(discoveryOperations.screeners, {});
  }
  screenerOptions() {
    return this.rawScreenerOptions();
  }
  rawScreenerOptions() {
    return this.operations.executeRaw(discoveryOperations.screenerOptions, {});
  }
  userPreferences() {
    return this.rawUserPreferences();
  }
  rawUserPreferences() {
    return this.operations.executeRaw(discoveryOperations.userPreferences, {});
  }
};

// src/http.ts
var HttpClient = class {
  constructor(options) {
    this.options = options;
  }
  options;
  async request(method, path, body, query, requestOptions = {}) {
    const url = new URL(path, this.options.apiBaseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== void 0) url.searchParams.set(key, String(value));
    }
    const headers = this.headers(requestOptions.headers, body !== void 0);
    const init = {
      method,
      headers
    };
    if (body !== void 0) init.body = JSON.stringify(body);
    if (requestOptions.signal) init.signal = requestOptions.signal;
    const response = await this.options.fetch(url, init);
    const responseBody = await parseResponseBody(response);
    if (!response.ok) {
      throw new TradeRepublicHttpError(`Trade Republic request failed: ${method} ${url.pathname}`, response.status, responseBody);
    }
    return responseBody;
  }
  async requestDetailed(method, path, body, query, requestOptions = {}) {
    const url = new URL(path, this.options.apiBaseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== void 0) url.searchParams.set(key, String(value));
    }
    const headers = this.headers(requestOptions.headers, body !== void 0);
    const init = {
      method,
      headers
    };
    if (body !== void 0) init.body = JSON.stringify(body);
    if (requestOptions.signal) init.signal = requestOptions.signal;
    const response = await this.options.fetch(url, init);
    const responseBody = await parseResponseBody(response);
    if (!response.ok) {
      throw new TradeRepublicHttpError(`Trade Republic request failed: ${method} ${url.pathname}`, response.status, responseBody);
    }
    return { body: responseBody, headers: response.headers, status: response.status, url: response.url };
  }
  headers(extra = {}, hasJsonBody = false) {
    const session = this.options.getSession();
    const webContext = session?.webContext;
    const xsrfToken = session?.cookies?.["XSRF-TOKEN"] ?? webContext?.cookies?.["XSRF-TOKEN"] ?? webContext?.xsrfToken;
    const headers = {
      accept: "application/json, text/plain, */*",
      "accept-language": this.options.locale,
      origin: "https://app.traderepublic.com",
      referer: "https://app.traderepublic.com/",
      "user-agent": this.options.userAgent,
      ...normalizeHeaderRecord(webContext?.headers),
      ...normalizeHeaderRecord(this.options.sdkHeaders),
      ...normalizeHeaderRecord(this.options.defaultHeaders),
      ...extra
    };
    if (hasJsonBody && !hasHeader(headers, "content-type")) headers["content-type"] = "application/json";
    if (session?.accessToken) headers.authorization = `Bearer ${session.accessToken}`;
    if (session?.sessionToken) headers["x-tr-session"] = session.sessionToken;
    if (webContext?.awsWafToken && !hasHeader(headers, "x-aws-waf-token")) headers["x-aws-waf-token"] = webContext.awsWafToken;
    if (xsrfToken && !hasHeader(headers, "x-xsrf-token")) headers["x-xsrf-token"] = decodeCookieValue(xsrfToken);
    const cookieHeader = mergeCookieHeaders(
      [headers.cookie, webContext?.cookieHeader].filter((value) => Boolean(value)).join("; "),
      { ...webContext?.cookies ?? {}, ...session?.cookies ?? {} }
    );
    if (cookieHeader) {
      headers.cookie = cookieHeader;
    }
    return headers;
  }
};
function normalizeHeaderRecord(headers) {
  return Object.fromEntries(
    Object.entries(headers ?? {}).filter(([, value]) => typeof value === "string" && value.length > 0)
  );
}
function hasHeader(headers, name) {
  const lowerName = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lowerName);
}
function decodeCookieValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
function mergeCookieHeaders(defaultCookieHeader, sessionCookies) {
  const cookies = /* @__PURE__ */ new Map();
  for (const part of (defaultCookieHeader ?? "").split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    cookies.set(trimmed.slice(0, separator), trimmed.slice(separator + 1));
  }
  for (const [key, value] of Object.entries(sessionCookies ?? {})) {
    if (value) cookies.set(key, value);
  }
  return Array.from(cookies.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
}
async function parseResponseBody(response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return response.json();
  const text = await response.text();
  if (!text) return void 0;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// src/mapper-connection.ts
var MapperConnectionLostError = class extends TradeRepublicProtocolError {
  constructor(event) {
    super("WebSocket disconnected after a non-replayable mutation was sent. The broker outcome is unknown.");
    this.event = event;
    this.name = "MapperConnectionLostError";
  }
  event;
};
var MapperConnection = class {
  constructor(options) {
    this.options = options;
  }
  options;
  socket;
  connected = false;
  nextSubscriptionId = 1;
  subscriptions = /* @__PURE__ */ new Map();
  reconnectTimer;
  expectedClose = false;
  outage;
  subscribe(message, options = {}) {
    const state = {
      id: this.nextSubscriptionId++,
      message,
      messages: [],
      waiters: [],
      closed: false,
      replayOnReconnect: options.replayOnReconnect ?? true,
      sent: false
    };
    this.subscriptions.set(state.id, state);
    this.ensureSocket();
    if (this.connected) this.sendSubscription(state);
    return {
      close: () => this.closeSubscription(state),
      [Symbol.asyncIterator]: () => ({
        next: () => this.next(state),
        return: async () => {
          this.closeSubscription(state);
          return { done: true, value: void 0 };
        }
      })
    };
  }
  /** Reconnects active subscriptions so a refreshed session supplies fresh headers. */
  refreshHeaders() {
    if (!this.socket || this.subscriptions.size === 0) return;
    this.expectedClose = true;
    this.connected = false;
    this.socket.close(1e3, "session refreshed");
    this.socket = void 0;
    this.expectedClose = false;
    this.ensureSocket();
  }
  close() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = void 0;
    for (const state of this.subscriptions.values()) this.finish(state);
    this.subscriptions.clear();
    if (this.socket) {
      this.expectedClose = true;
      this.socket.close(1e3, "client closed");
    }
    this.socket = void 0;
    this.connected = false;
    this.expectedClose = false;
    this.outage = void 0;
  }
  ensureSocket() {
    if (this.socket || this.reconnectTimer || this.subscriptions.size === 0 && !this.outage) return;
    const socket = this.options.websocketFactory(this.options.url, this.options.headers());
    this.socket = socket;
    addListener(socket, "open", () => {
      if (this.socket !== socket) return;
      const message = `connect 34 ${JSON.stringify(connectPayload())}`;
      logWire("send", message);
      socket.send(message);
    });
    addListener(socket, "message", (event) => {
      if (this.socket !== socket) return;
      this.handleMessage(event);
    });
    addListener(socket, "error", (error) => {
      if (this.socket !== socket) return;
      logWire("error", error);
    });
    addListener(socket, "close", (...args) => {
      if (this.socket !== socket) return;
      const wasConnected = this.connected;
      this.socket = void 0;
      this.connected = false;
      if (this.expectedClose) return;
      if (wasConnected && !this.outage) {
        const disconnectedAtMs = Date.now();
        const details = closeEventDetails(args);
        const disconnectEvent = {
          disconnectedAt: new Date(disconnectedAtMs).toISOString(),
          reconnectDelayMs: Math.max(0, this.options.reconnectDelayMs ?? 250),
          ...details.code !== void 0 ? { code: details.code } : {},
          ...details.reason ? { reason: details.reason } : {}
        };
        this.outage = { disconnectedAtMs, disconnectEvent, reconnectAttempts: 0 };
        invokeCallback(this.options.onDisconnect, disconnectEvent);
      }
      if (this.outage) this.failSentNonReplayableSubscriptions(this.outage.disconnectEvent);
      if (this.subscriptions.size > 0 || this.outage) this.scheduleReconnect();
    });
  }
  handleMessage(event) {
    const message = socketText(event);
    logWire("message", message);
    if (message === "connected") {
      this.connected = true;
      for (const state2 of this.subscriptions.values()) {
        if (!state2.sent || state2.replayOnReconnect) this.sendSubscription(state2);
      }
      const outage = this.outage;
      if (outage) {
        this.outage = void 0;
        const reconnectedAtMs = Date.now();
        invokeCallback(this.options.onReconnect, {
          disconnectedAt: outage.disconnectEvent.disconnectedAt,
          reconnectedAt: new Date(reconnectedAtMs).toISOString(),
          downtimeMs: Math.max(0, reconnectedAtMs - outage.disconnectedAtMs),
          reconnectAttempts: outage.reconnectAttempts
        });
        if (this.subscriptions.size === 0) this.closeIdleSocket();
      }
      return;
    }
    if (message.startsWith("echo") || message.startsWith("connected")) return;
    const frame = parseSubscriptionFrame(message);
    if (!frame) return;
    const state = this.subscriptions.get(frame.id);
    if (state) this.push(state, frame.payload);
  }
  sendSubscription(state) {
    if (!this.socket || state.closed) return;
    const message = `sub ${state.id} ${state.message}`;
    logWire("send", message);
    this.socket.send(message);
    state.sent = true;
  }
  closeSubscription(state) {
    if (state.closed) return;
    if (this.connected && this.socket) {
      try {
        const message = `unsub ${state.id}`;
        logWire("send", message);
        this.socket.send(message);
      } catch {
      }
    }
    this.subscriptions.delete(state.id);
    this.finish(state);
    if (this.subscriptions.size === 0 && !this.outage) this.closeIdleSocket();
  }
  closeIdleSocket() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = void 0;
    if (this.socket) {
      const socket = this.socket;
      this.expectedClose = true;
      this.socket = void 0;
      this.connected = false;
      socket.close(1e3, "idle");
      this.expectedClose = false;
    }
    this.nextSubscriptionId = 1;
  }
  scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delayMs = Math.max(0, this.options.reconnectDelayMs ?? 250);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = void 0;
      if (this.outage) this.outage.reconnectAttempts += 1;
      this.ensureSocket();
    }, delayMs);
    this.reconnectTimer.unref?.();
  }
  next(state) {
    const value = state.messages.shift();
    if (value !== void 0) return Promise.resolve({ done: false, value });
    if (state.error !== void 0) return Promise.reject(state.error);
    if (state.closed) return Promise.resolve({ done: true, value: void 0 });
    return new Promise((resolve, reject) => state.waiters.push({ resolve, reject }));
  }
  push(state, value) {
    const waiter = state.waiters.shift();
    if (waiter) waiter.resolve({ done: false, value });
    else state.messages.push(value);
  }
  finish(state) {
    state.closed = true;
    while (state.waiters.length) state.waiters.shift()?.resolve({ done: true, value: void 0 });
  }
  failSentNonReplayableSubscriptions(event) {
    for (const state of [...this.subscriptions.values()]) {
      if (!state.sent || state.replayOnReconnect) continue;
      this.subscriptions.delete(state.id);
      state.closed = true;
      state.error = new MapperConnectionLostError(event);
      while (state.waiters.length) state.waiters.shift()?.reject(state.error);
    }
  }
};
function invokeCallback(callback, event) {
  if (!callback) return;
  queueMicrotask(() => {
    try {
      Promise.resolve(callback(event)).catch((error) => logWire("error", error));
    } catch (error) {
      logWire("error", error);
    }
  });
}
function closeEventDetails(args) {
  const first = args[0];
  const code = typeof first === "number" ? first : first && typeof first === "object" && "code" in first && typeof first.code === "number" ? first.code : void 0;
  const rawReason = typeof first === "number" ? args[1] : first && typeof first === "object" && "reason" in first ? first.reason : void 0;
  const reason = Buffer.isBuffer(rawReason) ? rawReason.toString("utf8") : typeof rawReason === "string" ? rawReason : void 0;
  return {
    ...code !== void 0 ? { code } : {},
    ...reason ? { reason } : {}
  };
}
function addListener(socket, event, listener) {
  if (socket.addEventListener) socket.addEventListener(event, listener);
  else if (socket.on) socket.on(event, listener);
  else throw new TradeRepublicProtocolError("Unsupported WebSocket implementation.");
}
function socketText(event) {
  const data = typeof event === "object" && event !== null && "data" in event ? event.data : event;
  return Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
}
function parseSubscriptionFrame(text) {
  const firstSpace = text.indexOf(" ");
  if (firstSpace <= 0) return void 0;
  const secondSpace = text.indexOf(" ", firstSpace + 1);
  if (secondSpace <= firstSpace) return void 0;
  const id = Number(text.slice(0, firstSpace));
  if (!Number.isFinite(id)) return void 0;
  const rawPayload = text.slice(secondSpace + 1);
  try {
    return { id, payload: JSON.parse(rawPayload) };
  } catch {
    return { id, payload: rawPayload };
  }
}
function connectPayload() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC";
  return {
    locale: "en",
    platformId: "webtrading",
    platformVersion: "web",
    clientId: "app.traderepublic.com",
    clientVersion: "web",
    timezone,
    secondsFromGMT: -(/* @__PURE__ */ new Date()).getTimezoneOffset() * 60
  };
}
function logWire(direction, value) {
  if (process.env.TR_SDK_LOG_WIRE !== "1") return;
  console.log(`[handelsrepublik] websocket:${direction}`, value);
}

// src/raw.ts
import WebSocket from "ws";
var RawApi = class {
  constructor(http, websocketUrl, websocketFactory, getSession, websocketMode = "shared", reconnectDelayMs = 250, onWebSocketDisconnect, onWebSocketReconnect) {
    this.http = http;
    this.websocketUrl = websocketUrl;
    this.websocketFactory = websocketFactory;
    this.getSession = getSession;
    this.reconnectDelayMs = reconnectDelayMs;
    this.onWebSocketDisconnect = onWebSocketDisconnect;
    this.onWebSocketReconnect = onWebSocketReconnect;
    this.sharedConnection = websocketMode === "shared" ? this.createConnection() : void 0;
  }
  http;
  websocketUrl;
  websocketFactory;
  getSession;
  reconnectDelayMs;
  onWebSocketDisconnect;
  onWebSocketReconnect;
  sharedConnection;
  isolatedConnections = /* @__PURE__ */ new Set();
  request(request) {
    return this.http.request(request.method ?? "GET", request.path, request.body, request.query);
  }
  subscribe(topic, payload = {}) {
    return this.subscribeResource({ ...asObject(payload), type: topic });
  }
  subscribeLegacy(topic, payload = {}) {
    return this.openSubscription(JSON.stringify({ type: "subscribe", topic, payload, token: this.getSession()?.sessionToken }));
  }
  subscribeResource(payload, options = {}) {
    return this.openSubscription(JSON.stringify({ ...payload, token: this.getSession()?.sessionToken }), options);
  }
  query(payload, options = {}) {
    return this.queryResource(payload, options);
  }
  async queryResource(payload, options = {}) {
    const subscription = this.subscribeResource(payload, options);
    const iterator = subscription[Symbol.asyncIterator]();
    try {
      const result = await Promise.race([
        iterator.next(),
        delay2(options.timeoutMs ?? 15e3).then(() => ({ done: true, value: void 0, timedOut: true }))
      ]);
      if (result.done || "timedOut" in result && result.timedOut) {
        throw new TradeRepublicProtocolError(`Timed out waiting for resource: ${String(payload.type ?? "unknown")}`);
      }
      assertNoResourceErrors(result.value, payload);
      return result.value;
    } finally {
      subscription.close();
    }
  }
  /** Reconnect active subscriptions after session or browser-context changes. */
  refreshSession() {
    this.sharedConnection?.refreshHeaders();
    for (const connection of this.isolatedConnections) connection.refreshHeaders();
  }
  close() {
    this.sharedConnection?.close();
    for (const connection of this.isolatedConnections) connection.close();
    this.isolatedConnections.clear();
  }
  openSubscription(subscriptionMessage, options = {}) {
    if (this.sharedConnection) return this.sharedConnection.subscribe(subscriptionMessage, options);
    const connection = this.createConnection();
    this.isolatedConnections.add(connection);
    const subscription = connection.subscribe(subscriptionMessage, options);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      subscription.close();
      connection.close();
      this.isolatedConnections.delete(connection);
    };
    return {
      close,
      [Symbol.asyncIterator]() {
        const iterator = subscription[Symbol.asyncIterator]();
        return {
          next: () => iterator.next(),
          return: async () => {
            close();
            return { done: true, value: void 0 };
          }
        };
      }
    };
  }
  createConnection() {
    return new MapperConnection({
      url: this.websocketUrl,
      websocketFactory: this.websocketFactory,
      headers: () => this.http.headers(),
      reconnectDelayMs: this.reconnectDelayMs,
      onDisconnect: this.onWebSocketDisconnect,
      onReconnect: this.onWebSocketReconnect
    });
  }
};
function assertNoResourceErrors(value, request) {
  if (!value || typeof value !== "object" || !("errors" in value)) return;
  const errors = value.errors;
  if (!Array.isArray(errors) || errors.length === 0) return;
  throw new TradeRepublicProtocolError(`Trade Republic resource failed: ${String(request.type ?? "unknown")} ${JSON.stringify(errors)}`);
}
function defaultWebSocketFactory(url, headers) {
  return new WebSocket(url, { headers });
}
function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function delay2(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/traderepublic-client.ts
var DEFAULT_API_BASE_URL = "https://api.traderepublic.com";
var DEFAULT_WEBSOCKET_URL = "wss://api.traderepublic.com";
var DEFAULT_LOCALE = "en";
var DEFAULT_USER_AGENT = "handelsrepublik/0.1.0";
var DEFAULT_TR_HEADERS = {
  "x-tr-app-version": "15.101.0",
  "x-tr-platform": "web-pro",
  "x-tr-device-info": "eyJzdGFibGVEZXZpY2VJZCI6IjFlMTEyMjA3ZmNlZDhhZTNhZDRlY2ZiNGNiYjlmZTIyZDhkYjI1NDk5YmUwMzk4OGU2ODlmOTVmMmVlYTBlYTg4NWJhOTI2NmU2YWIwMTE5ZmRjZGQ1MDI2NGIzMDgyZWZmZDgxZGViZmEwYmQ1YTMzNjdmN2QwNzljMDZjMDcwIiwiYnJvd3NlciI6IkNocm9tZSIsImJyb3dzZXJWZXJzaW9uIjoiMTUwLjAuMC4wIiwib3MiOiJXaW5kb3dzIiwib3NWZXJzaW9uIjoiMTAiLCJ0aW1lem9uZSI6IkV1cm9wZS9CZXJsaW4iLCJ0aW1lem9uZU9mZnNldCI6LTEyMCwic2NyZWVuIjoiMTI4MHg3MjB4MjQiLCJwcmVmZXJyZWRMYW5ndWFnZXMiOlsiZW4tVVMiLCJlbiJdLCJudW1iZXJPZkNvcmVzIjoxMiwiZGV2aWNlTWVtb3J5IjozMn0="
};
var TradeRepublicClient = class _TradeRepublicClient {
  auth;
  raw;
  account;
  boards;
  assets;
  derivatives;
  orders;
  portfolio;
  market;
  timeline;
  priceAlarms;
  instruments;
  trading;
  discovery;
  documents;
  tax;
  payments;
  web;
  securitiesAccountNumber;
  session;
  http;
  endpoints;
  resources;
  operations;
  runtime;
  validateRaw;
  constructor(options = {}) {
    this.session = withWebContext(options.session, options.webContext);
    this.securitiesAccountNumber = options.session?.securitiesAccountNumber;
    this.validateRaw = createRawSchemaValidator(options.rawSchemaValidation, options.onRawSchemaValidationFailure);
    this.endpoints = new EndpointResolver(options.endpoints);
    this.http = new HttpClient({
      apiBaseUrl: options.apiBaseUrl ?? DEFAULT_API_BASE_URL,
      locale: options.locale ?? DEFAULT_LOCALE,
      userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
      sdkHeaders: DEFAULT_TR_HEADERS,
      defaultHeaders: options.defaultHeaders,
      fetch: options.fetch ?? fetch,
      getSession: () => this.session
    });
    this.auth = new AuthApi(this.http, this.endpoints, () => this.session, (session) => {
      this.setSession(session);
    }, options.sessionStore, (session) => this.captureSecuritiesAccountNumber(session));
    this.raw = new RawApi(
      this.http,
      options.websocketUrl ?? DEFAULT_WEBSOCKET_URL,
      options.websocketFactory ?? defaultWebSocketFactory,
      () => this.session,
      options.websocketMode,
      options.websocketReconnectDelayMs,
      options.onWebSocketDisconnect,
      options.onWebSocketReconnect
    );
    this.runtime = new ClientRuntime(this.http, this.endpoints, this.raw, this.validateRaw, {
      get: () => this.securitiesAccountNumber ?? this.session?.securitiesAccountNumber,
      set: (value) => this.setSecuritiesAccountNumber(value),
      fallback: () => this.resolveSecuritiesAccountNumberFromRest()
    });
    this.operations = this.runtime.operations;
    this.account = new AccountApi(this.operations);
    this.boards = new BoardsApi(this.operations);
    this.resources = this.runtime.resources;
    this.assets = new AssetsApi(this.raw, this.validateRaw);
    this.derivatives = new DerivativesApi(this.raw, this.validateRaw);
    this.orders = new OrdersApi(this.runtime);
    this.portfolio = new PortfolioApi(this.runtime);
    this.market = new MarketApi(this.resources);
    this.timeline = new TimelineApi(this.raw, this.validateRaw);
    this.priceAlarms = new PriceAlarmsApi(this.raw, this.validateRaw);
    this.instruments = new InstrumentsApi(this.raw, this.validateRaw);
    this.trading = new TradingApi(this.runtime);
    this.discovery = new DiscoveryApi(this.operations);
    this.documents = new DocumentsApi(this.operations);
    this.tax = new TaxApi(this.operations);
    this.payments = new PaymentsApi(this.operations);
    this.web = new WebApi(this.runtime);
  }
  static create(options = {}) {
    return new _TradeRepublicClient(options);
  }
  getSession() {
    if (!this.session) return void 0;
    return structuredClone({
      ...this.session,
      securitiesAccountNumber: this.session.securitiesAccountNumber ?? this.securitiesAccountNumber
    });
  }
  setSession(session) {
    const shouldPreserveWebContext = Object.keys(session).length > 0 && !session.webContext;
    const nextSession = shouldPreserveWebContext && this.session?.webContext ? { ...session, webContext: this.session.webContext } : session;
    this.session = structuredClone(nextSession);
    this.raw?.refreshSession();
    if (session.securitiesAccountNumber) this.setSecuritiesAccountNumber(session.securitiesAccountNumber);
    else if (Object.keys(session).length === 0) this.securitiesAccountNumber = void 0;
  }
  useWebContext(webContext) {
    const session = {
      ...this.session ?? {},
      webContext: mergeTradeRepublicWebContexts(this.session?.webContext, normalizeTradeRepublicWebContext(webContext))
    };
    this.setSession(session);
    return this.getSession() ?? session;
  }
  close() {
    this.raw.close();
  }
  setSecuritiesAccountNumber(value) {
    if (!value) return;
    this.securitiesAccountNumber = value;
    if (this.session) this.session.securitiesAccountNumber = value;
  }
  async captureSecuritiesAccountNumber(session) {
    if (session.securitiesAccountNumber) {
      this.setSecuritiesAccountNumber(session.securitiesAccountNumber);
      return session;
    }
    try {
      const accountNumber = await this.runtime.resolveSecuritiesAccountNumber(5e3);
      return { ...session, securitiesAccountNumber: accountNumber };
    } catch {
      return session;
    }
  }
  async resolveSecuritiesAccountNumberFromRest() {
    const account = await this.account.current();
    const accountNumber = firstStringByKey(account, "securitiesAccountNumber");
    if (accountNumber) this.setSecuritiesAccountNumber(accountNumber);
    return accountNumber;
  }
};
function withWebContext(session, webContext) {
  if (!webContext) return session ? structuredClone(session) : void 0;
  return {
    ...session ? structuredClone(session) : {},
    webContext: mergeTradeRepublicWebContexts(session?.webContext, webContext)
  };
}
var AssetsApi = class {
  constructor(raw, validateRaw) {
    this.raw = raw;
    this.validateRaw = validateRaw;
  }
  raw;
  validateRaw;
  async search(query, options = {}) {
    const raw = await validated(this.validateRaw, "assets.search", this.raw.query({
      type: "neonSearch",
      data: {
        q: query.trim(),
        page: options.page ?? 1,
        pageSize: options.limit ?? 20,
        filter: neonSearchFilters(options.type ?? "stock", options.filters)
      }
    }));
    return arrayPayload(raw).map(normalizeAsset);
  }
  async get(assetId) {
    return normalizeAssetDetail(await validated(this.validateRaw, "assets.get", this.raw.query({ type: "instrument", id: assetId })));
  }
  async listAll(options = {}) {
    const page = numberString(options.cursor) ?? 1;
    const raw = await validated(this.validateRaw, "assets.search", this.raw.query({
      type: "neonSearch",
      data: {
        q: "",
        page,
        pageSize: options.limit ?? 20,
        filter: neonSearchFilters(options.type ?? "stock", options.filters)
      }
    }));
    return arrayPayload(raw).map(normalizeAsset);
  }
};
var DerivativesApi = class {
  constructor(raw, validateRaw) {
    this.raw = raw;
    this.validateRaw = validateRaw;
  }
  raw;
  validateRaw;
  async search(query, options = {}) {
    const raw = await validated(this.validateRaw, "derivatives.search", this.raw.query({
      type: "neonSearch",
      data: {
        q: query.trim(),
        page: 1,
        pageSize: options.limit ?? 20,
        filter: neonSearchFilters("derivative", {
          underlying: options.underlyingId,
          optionType: options.direction
        })
      }
    }));
    return arrayPayload(raw).map(normalizeDerivative);
  }
  async listForUnderlying(underlyingId, options = {}) {
    const raw = await validated(this.validateRaw, "derivatives.listForUnderlying", this.raw.query({
      type: "derivatives",
      jurisdiction: "DE",
      lang: "en",
      underlying: underlyingId,
      productCategory: options.productType,
      optionType: options.direction,
      pageSize: options.limit ?? null
    }));
    return arrayPayload(raw).map(normalizeDerivative);
  }
  async get(derivativeId) {
    return normalizeDerivative(await validated(this.validateRaw, "assets.get", this.raw.query({ type: "instrument", id: derivativeId })));
  }
};
var OrdersApi = class {
  constructor(runtime) {
    this.runtime = runtime;
    this.http = runtime.http;
    this.endpoints = runtime.endpoints;
    this.raw = runtime.raw;
    this.validateRaw = runtime.validateRaw;
  }
  runtime;
  http;
  endpoints;
  raw;
  validateRaw;
  async open(options = {}) {
    const orders = await this.all(options);
    return orders.filter(isOpenOrder);
  }
  async closed(options = {}) {
    const orders = await this.all(options);
    return orders.filter((order) => !isOpenOrder(order));
  }
  async executed(options = {}) {
    const orders = await this.all(options);
    return orders.filter(isExecutedOrder);
  }
  async all(options = {}) {
    return arrayPayload(await this.rawAll(options)).map(normalizeOrder);
  }
  async rawAll(options = {}) {
    const { filters, secAccNo: providedSecAccNo, ...rest2 } = options;
    const secAccNo = providedSecAccNo ?? await this.runtime.resolveSecuritiesAccountNumber();
    return validated(this.validateRaw, "orders.all", this.http.request("GET", this.endpoints.resolve("orders.all"), void 0, {
      secAccNo,
      page: rest2.page ?? numberString(rest2.cursor) ?? 1,
      pageSize: rest2.pageSize ?? rest2.limit ?? 100,
      sort: rest2.sort ?? "orderUpdatedAt,desc",
      instrumentId: rest2.instrumentId,
      instrumentCategory: rest2.instrumentCategory,
      accountType: rest2.accountType,
      ...filters
    }));
  }
  async mutualFunds(options = {}) {
    return arrayPayload(await this.rawMutualFunds(options)).map(normalizeOrder);
  }
  async rawMutualFunds(options = {}) {
    const { filters, ...rest2 } = options;
    return validated(this.validateRaw, "orders.mutualFunds", this.http.request("GET", this.endpoints.resolve("orders.mutualFunds"), void 0, {
      openOnly: false,
      excludeQuantityNull: false,
      page: 1,
      pageSize: 100,
      ...rest2,
      ...filters
    }));
  }
  async privateMarkets(options = {}) {
    return arrayPayload(await this.rawPrivateMarkets(options)).map(normalizeOrder);
  }
  async rawPrivateMarkets(options = {}) {
    const { filters, ...rest2 } = options;
    return validated(this.validateRaw, "orders.privateMarkets", this.http.request("GET", this.endpoints.resolve("orders.privateMarkets"), void 0, {
      sortBy: "CREATED_AT",
      sortAscending: false,
      pageNumber: 1,
      pageSize: 100,
      ...rest2,
      ...filters
    }));
  }
  orderUpdates(secAccNo) {
    return toSubscription(this.raw.subscribeResource({
      type: "orderUpdates",
      selector: { case: "bySecAccNo", value: { accountNumber: secAccNo } }
    })).map((raw) => this.validateRaw("orders.orderUpdates", raw));
  }
  async rawOrderUpdates(secAccNo) {
    const accountNumber = secAccNo ?? await this.runtime.resolveSecuritiesAccountNumber();
    return validated(this.validateRaw, "orders.orderUpdates", this.raw.query({
      type: "orderUpdates",
      selector: { case: "bySecAccNo", value: { accountNumber } }
    }));
  }
  async prepare(options) {
    const normalizedOptions = options.amount !== void 0 && options.sizeStep === void 0 ? { ...options, sizeStep: await this.resolveAmountSizeStep(options.instrumentId, options.exchangeId) } : options;
    const normalized = normalizeCreateOrderOptions(normalizedOptions);
    const secAccNo = options.secAccNo ?? await this.runtime.resolveSecuritiesAccountNumber();
    return {
      parameters: normalized.parameters,
      clientProcessId: options.clientProcessId ?? createClientProcessId(),
      secAccNo,
      warningsShown: options.warningsShown ?? [],
      ...options.lastClientPrice !== void 0 ? { lastClientPrice: positiveNumber(options.lastClientPrice, "lastClientPrice") } : {}
    };
  }
  async preview(options) {
    const order = await this.prepare(options);
    const currency = options.settlementCurrency?.trim() || "EUR";
    const feeParameters = {
      ...order.parameters,
      currency
    };
    delete feeParameters.expiry;
    delete feeParameters.settlementCurrency;
    delete feeParameters.tradingCurrency;
    delete feeParameters.acceptedTerms;
    const unitPrice = options.mode === "limit" ? options.limit : options.mode === "stopMarket" ? options.stop : options.lastClientPrice;
    if (options.amount !== void 0) {
      if (unitPrice === void 0) throw new TypeError("Amount-based order previews require lastClientPrice for market orders.");
      delete feeParameters.amount;
    }
    const raw = await validated(this.validateRaw, "orders.fees", this.raw.query({
      type: "orderFeesV2",
      parameters: feeParameters,
      secAccNo: order.secAccNo
    }, options.timeoutMs === void 0 ? {} : { timeoutMs: options.timeoutMs }));
    const fees = normalizeOrderFees(raw);
    const totalFees = firstNumberAtPaths(raw, ["total.absolute.value"], ["total.value"], ["totalFees"], ["total"]);
    const feeCurrency = firstStringAtPaths(raw, ["total.absolute.currency"], ["total.currency"], ["currency"], ["currencyId"]) ?? currency;
    const estimatedGross = options.amount !== void 0 ? options.amount : unitPrice === void 0 || options.size === void 0 ? void 0 : unitPrice * options.size;
    const estimatedTotal = estimatedGross === void 0 ? void 0 : options.side === "buy" ? estimatedGross + (totalFees ?? 0) : estimatedGross - (totalFees ?? 0);
    return {
      order,
      fees,
      ...totalFees !== void 0 ? { totalFees } : {},
      ...feeCurrency ? { currency: feeCurrency } : {},
      ...estimatedGross !== void 0 ? { estimatedGross } : {},
      ...estimatedTotal !== void 0 ? { estimatedTotal } : {},
      raw
    };
  }
  async submit(options) {
    const order = isPreparedOrder(options) ? options : await this.prepare(options);
    const timeoutMs = isPreparedOrder(options) ? 12e4 : options.timeoutMs ?? 12e4;
    const payload = {
      type: "simpleCreateOrder",
      parameters: order.parameters,
      warningsShown: order.warningsShown,
      ...order.lastClientPrice !== void 0 ? { lastClientPrice: order.lastClientPrice } : {},
      clientProcessId: order.clientProcessId,
      secAccNo: order.secAccNo
    };
    const subscription = this.raw.subscribeResource(payload, { replayOnReconnect: false });
    const iterator = subscription[Symbol.asyncIterator]();
    const updates = [];
    const deadline = Date.now() + timeoutMs;
    try {
      while (Date.now() < deadline) {
        const remaining = Math.max(1, deadline - Date.now());
        const result = await nextOrderUpdate(iterator, remaining);
        if (result.done || "timedOut" in result && result.timedOut) break;
        const raw = this.validateRaw("orders.submit", result.value);
        throwResourceErrors(raw, "simpleCreateOrder");
        updates.push(raw);
        const status = orderMutationStatus(raw);
        const orderId = firstStringAtPaths(raw, ["orderId"], ["id"], ["order.id"]);
        if (status === "succeeded" || orderId && !status) {
          return { status: "succeeded", orderId, clientProcessId: order.clientProcessId, updates, raw };
        }
        if (status === "failed") {
          return {
            status,
            ...orderId ? { orderId } : {},
            clientProcessId: order.clientProcessId,
            updates,
            error: firstValueAtPaths(raw, ["error"], ["errors"], ["message"]),
            raw
          };
        }
      }
      const lastStatus = updates.length > 0 ? orderMutationStatus(updates.at(-1)) : void 0;
      const error = new TradeRepublicProtocolError(`Timed out waiting for order submission${lastStatus ? ` after status ${lastStatus}` : ""}. The broker outcome is unknown; do not retry without checking the order history.`);
      return {
        status: "outcomeUnknown",
        clientProcessId: order.clientProcessId,
        updates,
        outcomeReason: "timeout",
        error,
        raw: updates.at(-1)
      };
    } catch (error) {
      if (!(error instanceof MapperConnectionLostError)) throw error;
      return {
        status: "outcomeUnknown",
        clientProcessId: order.clientProcessId,
        updates,
        outcomeReason: "disconnect",
        connectionLoss: error.event,
        error,
        raw: updates.at(-1)
      };
    } finally {
      subscription.close();
    }
  }
  async cancel(orderId, options = {}) {
    const id = requiredString(orderId, "orderId");
    try {
      const raw = await validated(this.validateRaw, "orders.cancel", this.raw.query(
        { type: "cancelOrder", orderId: id },
        { ...pickTimeoutOptions(options), replayOnReconnect: false }
      ));
      return {
        orderId: firstStringAtPaths(raw, ["orderId"], ["id"]) ?? id,
        ...orderMutationStatus(raw) ? { status: orderMutationStatus(raw) } : {},
        raw
      };
    } catch (error) {
      if (!(error instanceof MapperConnectionLostError)) throw error;
      return {
        orderId: id,
        status: "outcomeUnknown",
        outcomeReason: "disconnect",
        connectionLoss: error.event,
        error,
        raw: void 0
      };
    }
  }
  async resolveAmountSizeStep(instrumentId, exchangeId) {
    const id = requiredString(instrumentId, "instrumentId");
    const venue = requiredString(exchangeId, "exchangeId");
    const instrument = await this.raw.query({ type: "instrument", id });
    const exchange = findNestedRecordById(instrument, venue);
    const explicit = firstNumberAtPaths(exchange, ["stepSize"], ["fractionalTrading.stepSize"], ["orderSizeStep"], ["sizeStep"]);
    if (explicit !== void 0 && explicit > 0) return explicit;
    const assetType = (normalizeAsset(instrument).type ?? firstNestedStringByKeys(instrument, "instrumentType", "assetType", "category", "type"))?.toLowerCase();
    if (assetType?.includes("crypto") || assetType?.includes("fund")) return 1e-6;
    throw new TradeRepublicProtocolError(`Could not determine the order size step for amount-based order ${id}.${venue}. Pass sizeStep explicitly.`);
  }
};
function normalizeCreateOrderOptions(options) {
  const instrumentId = requiredString(options.instrumentId, "instrumentId");
  const exchangeId = requiredString(options.exchangeId, "exchangeId");
  const side = options.side?.toLowerCase();
  if (side !== "buy" && side !== "sell") throw new TypeError('side must be "buy" or "sell".');
  if (options.mode !== "market" && options.mode !== "limit" && options.mode !== "stopMarket") {
    throw new TypeError('mode must be "market", "limit", or "stopMarket".');
  }
  const hasSize = options.size !== void 0;
  const hasAmount = options.amount !== void 0;
  if (hasSize === hasAmount) throw new TypeError("Provide exactly one of size or amount.");
  const amount = hasAmount ? roundCurrency(positiveNumber(options.amount, "amount")) : void 0;
  const amountUnitPrice = options.mode === "limit" ? options.limit : options.mode === "stopMarket" ? options.stop : options.lastClientPrice;
  if (hasAmount && amountUnitPrice === void 0) throw new TypeError("Amount-based market orders require lastClientPrice.");
  const size = hasSize ? positiveNumber(options.size, "size") : floorToStep(
    positiveNumber(Number(amount) / positiveNumber(amountUnitPrice, "order price"), "derived size"),
    positiveNumber(options.sizeStep, "sizeStep")
  );
  if (options.mode === "limit" && options.limit === void 0) throw new TypeError("limit is required for a limit order.");
  if (options.mode === "stopMarket" && options.stop === void 0) throw new TypeError("stop is required for a stop-market order.");
  if (options.mode === "market" && (options.limit !== void 0 || options.stop !== void 0)) {
    throw new TypeError("Market orders must not include limit or stop prices.");
  }
  const expiry = normalizeOrderExpiry(options.expiry);
  const parameters = {
    instrumentId,
    exchangeId,
    mode: options.mode,
    size,
    type: side,
    expiry,
    sellFractions: options.sellFractions ?? false,
    settlementCurrency: options.settlementCurrency?.trim() || "EUR"
  };
  if (amount !== void 0) parameters.amount = amount;
  if (options.limit !== void 0) parameters.limit = positiveNumber(options.limit, "limit");
  if (options.stop !== void 0) parameters.stop = positiveNumber(options.stop, "stop");
  if (options.tradingCurrency?.trim()) parameters.tradingCurrency = options.tradingCurrency.trim();
  if (options.destinationId?.trim()) parameters.destinationId = options.destinationId.trim();
  if (options.isDMA !== void 0) parameters.isDMA = options.isDMA;
  if (options.acceptedTerms?.length) parameters.acceptedTerms = options.acceptedTerms;
  return { parameters };
}
function normalizeOrderExpiry(expiry) {
  if (!expiry) return { type: "gfd" };
  if (expiry.type !== "gfd" && expiry.type !== "gtc" && expiry.type !== "eom" && expiry.type !== "gtd") {
    throw new TypeError('expiry.type must be "gfd", "gtc", "eom", or "gtd".');
  }
  if (expiry.type !== "gtd") return { type: expiry.type };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry.value) || Number.isNaN(Date.parse(`${expiry.value}T00:00:00Z`))) {
    throw new TypeError("A gtd expiry requires value in YYYY-MM-DD format.");
  }
  return { type: expiry.type, value: expiry.value };
}
function normalizeOrderFees(raw) {
  const value = firstValueAtPaths(raw, ["fees"], ["data.fees"], ["result.fees"]);
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    ...firstStringAtPaths(item, ["name"], ["title"], ["type"], ["label"]) ? { name: firstStringAtPaths(item, ["name"], ["title"], ["type"], ["label"]) } : {},
    ...firstNumberAtPaths(item, ["absolute.value"], ["amount.value"], ["amount"], ["value"]) !== void 0 ? { amount: firstNumberAtPaths(item, ["absolute.value"], ["amount.value"], ["amount"], ["value"]) } : {},
    ...firstStringAtPaths(item, ["absolute.currency"], ["amount.currency"], ["currency"], ["currencyId"]) ? { currency: firstStringAtPaths(item, ["absolute.currency"], ["amount.currency"], ["currency"], ["currencyId"]) } : {},
    raw: item
  }));
}
function isPreparedOrder(value) {
  return Boolean(value && typeof value === "object" && "parameters" in value && "clientProcessId" in value && "secAccNo" in value);
}
function orderMutationStatus(value) {
  const status = firstStringAtPaths(value, ["status"], ["state"], ["result.status"]);
  if (!status) return void 0;
  const normalized = status.replaceAll("_", "").replaceAll("-", "").toLowerCase();
  if (normalized === "confirmationneeded") return "confirmationNeeded";
  return normalized;
}
function throwResourceErrors(value, resource) {
  const errors = firstValueAtPaths(value, ["errors"]);
  if (Array.isArray(errors) && errors.length > 0) {
    throw new TradeRepublicProtocolError(`Trade Republic resource failed: ${resource} ${JSON.stringify(errors)}`);
  }
}
function requiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be a non-empty string.`);
  return value.trim();
}
function positiveNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new TypeError(`${name} must be a finite number greater than zero.`);
  return value;
}
function roundCurrency(value) {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return positiveNumber(rounded, "amount rounded to currency precision");
}
function floorToStep(value, step) {
  const decimals = Math.min(12, Math.max(0, decimalPlaces(step)));
  const floored = Math.floor(value / step + 1e-10) * step;
  return positiveNumber(Number(floored.toFixed(decimals)), "derived size rounded to sizeStep");
}
function decimalPlaces(value) {
  const text = value.toString().toLowerCase();
  if (text.includes("e-")) return Number(text.split("e-")[1] ?? 0);
  return text.includes(".") ? text.split(".")[1]?.length ?? 0 : 0;
}
function createClientProcessId() {
  return randomUUID();
}
function firstValueAtPaths(value, ...paths) {
  for (const path of paths) {
    let current = value;
    for (const part of path[0]?.split(".") ?? []) {
      if (!current || typeof current !== "object" || Array.isArray(current)) {
        current = void 0;
        break;
      }
      current = current[part];
    }
    if (current !== void 0 && current !== null) return current;
  }
  return void 0;
}
function firstStringAtPaths(value, ...paths) {
  const candidate = firstValueAtPaths(value, ...paths);
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : void 0;
}
function firstNumberAtPaths(value, ...paths) {
  const candidate = firstValueAtPaths(value, ...paths);
  if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  if (typeof candidate === "string" && candidate.trim() && Number.isFinite(Number(candidate))) return Number(candidate);
  return void 0;
}
function firstNestedStringByKeys(value, ...keys) {
  if (!value || typeof value !== "object") return void 0;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstNestedStringByKeys(item, ...keys);
      if (found) return found;
    }
    return void 0;
  }
  const record = value;
  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
  }
  for (const item of Object.values(record)) {
    const found = firstNestedStringByKeys(item, ...keys);
    if (found) return found;
  }
  return void 0;
}
function findNestedRecordById(value, id) {
  if (!value || typeof value !== "object") return void 0;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNestedRecordById(item, id);
      if (found) return found;
    }
    return void 0;
  }
  const record = value;
  if ([record.id, record.exchangeId, record.slug, record.destinationId].some((candidate) => candidate === id)) return record;
  for (const item of Object.values(record)) {
    const found = findNestedRecordById(item, id);
    if (found) return found;
  }
  return void 0;
}
function nextOrderUpdate(iterator, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ done: true, value: void 0, timedOut: true }), timeoutMs);
    timer.unref?.();
    iterator.next().then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
function isOpenOrder(order) {
  const status = order.status?.toUpperCase();
  return status === "OPEN" || status === "OPENED" || status === "PARTIALLYFILLED" || status === "PARTIALLY_FILLED" || status === "RECEIVED";
}
function isExecutedOrder(order) {
  const status = order.status?.toUpperCase().replaceAll("_", "").replaceAll("-", "");
  return Boolean(
    order.executedAt || order.executedQuantity !== void 0 && order.executedQuantity > 0 || status === "EXECUTED" || status === "FILLED" || status === "PARTIALLYFILLED"
  );
}
var PortfolioApi = class {
  constructor(runtime) {
    this.runtime = runtime;
    this.http = runtime.http;
    this.raw = runtime.raw;
    this.validateRaw = runtime.validateRaw;
  }
  runtime;
  http;
  raw;
  validateRaw;
  async current(options = {}) {
    const secAccNo = await this.resolveSecuritiesAccountNumber();
    const raw = await validated(this.validateRaw, "portfolio.current", this.raw.query({ type: "compactPortfolioByTypeV2", secAccNo }, pickTimeoutOptions(options)));
    return normalizePortfolio(raw);
  }
  async cash() {
    return normalizeCash(await validated(this.validateRaw, "portfolio.cash", this.raw.query({ type: "availableCash" })));
  }
  async markToMarketValue() {
    return normalizeCash(await validated(this.validateRaw, "portfolio.markToMarketValue", this.raw.query({ type: "portfolioStatus" })));
  }
  async savingsPlans(secAccNo) {
    return arrayPayload(await this.rawSavingsPlans(secAccNo)).map(normalizeSavingsPlan);
  }
  async rawSavingsPlans(secAccNo) {
    const accountNumber = secAccNo ?? await this.resolveSecuritiesAccountNumber();
    return validated(this.validateRaw, "portfolio.savingsPlans", this.raw.query({ type: "savingsPlans", secAccNo: accountNumber }));
  }
  async privateMarketsPositions(secAccNo) {
    return this.rawPrivateMarketsPositions(secAccNo);
  }
  async rawPrivateMarketsPositions(secAccNo) {
    const accountNumber = secAccNo ?? await this.resolveSecuritiesAccountNumber();
    return validated(this.validateRaw, "portfolio.privateMarketsPositions", this.raw.query({ type: "privateMarketsPositions", secAccNo: accountNumber }));
  }
  async portfolioChart(secAccNo, range = "1y", options = {}) {
    return normalizePortfolioChart(await this.rawPortfolioChart(secAccNo, range, options));
  }
  async rawPortfolioChart(secAccNo, range = "1y", options = {}) {
    const accountNumber = secAccNo ?? await this.resolveSecuritiesAccountNumber();
    return validated(this.validateRaw, "portfolio.portfolioChart", this.http.request("GET", "/api-gateway/portfolio-chart/v2/chart", void 0, {
      secAccNo: accountNumber,
      range,
      ...options
    }));
  }
  async positionsForAccount(secAccNo, options = {}) {
    const raw = await validated(this.validateRaw, "portfolio.current", this.raw.query({ type: "compactPortfolioByTypeV2", secAccNo }, pickTimeoutOptions(options)));
    return normalizePortfolio(raw);
  }
  async resolveSecuritiesAccountNumber() {
    return this.runtime.resolveSecuritiesAccountNumber();
  }
};
function pickTimeoutOptions(options) {
  return options.timeoutMs ? { timeoutMs: options.timeoutMs } : void 0;
}
function numberString(value) {
  if (!value) return void 0;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : void 0;
}
function neonSearchFilters(type, filters = {}) {
  return [
    { key: "type", value: type === "etf" ? "fund" : type },
    { key: "jurisdiction", value: "DE" },
    ...Object.entries(filters).flatMap(([key, value]) => value === void 0 ? [] : [{ key, value }])
  ];
}
async function validated(validateRaw, schemaName, value) {
  return validateRaw(schemaName, await value);
}
function skipRawSchemaValidation(_schemaName, value) {
  return value;
}
function createRawSchemaValidator(mode = true, onFailure) {
  if (mode === false) return skipRawSchemaValidation;
  if (mode === "passthrough") {
    return (schemaName, value) => {
      try {
        return validateRawResponse(schemaName, value);
      } catch (error) {
        onFailure?.({ schemaName, value, error });
        return value;
      }
    };
  }
  return validateRawResponse;
}
var MarketApi = class {
  constructor(resources) {
    this.resources = resources;
  }
  resources;
  subscriptions(options = {}) {
    return this.resources.query(marketSubscriptionsSpec, options);
  }
  candleQuery(options) {
    return new CandleQuery(this.resources, options);
  }
  candles(options) {
    return this.resources.query(candlesSpec, options);
  }
  quote(assetId, exchangeId) {
    return this.resources.query(quoteSpec, { assetId, exchangeId });
  }
  downloadCandles(options, paging = {}) {
    return this.candleQuery(options).download(paging);
  }
  subscribeLiveFeed(options) {
    return this.resources.stream(liveFeedSpec, options);
  }
  liveFeed(assetId, options = {}) {
    return this.subscribeLiveFeed({ ...options, assetId });
  }
  availableL2Books(assetId) {
    return this.resources.query(availableL2BooksSpec, { assetId });
  }
  subscribeL2OrderBook(options) {
    return this.resources.stream(l2OrderBookSpec, options);
  }
  l2OrderBook(assetId, exchangeId, options = {}) {
    return this.subscribeL2OrderBook({ ...options, assetId, exchangeId });
  }
};
var TimelineApi = class {
  constructor(raw, validateRaw) {
    this.raw = raw;
    this.validateRaw = validateRaw;
  }
  raw;
  validateRaw;
  async list(options = {}) {
    return arrayPayload(await this.rawList(options)).map(normalizeTimelineItem);
  }
  rawList(options = {}) {
    const { after } = options;
    return validated(this.validateRaw, "timeline.list", this.raw.query({ type: "timelineActivityLog", ...after ? { after } : {} }, pickTimeoutOptions(options)));
  }
  async actions(options = {}) {
    return arrayPayload(await this.rawActions(options)).map(normalizeTimelineAction);
  }
  rawActions(options = {}) {
    return validated(this.validateRaw, "timeline.actions", this.raw.query({ type: "timelineActionsV2" }, pickTimeoutOptions(options)));
  }
  async detail(id, kind = "timeline", options = {}) {
    return normalizeTimelineDetail(await this.rawDetail(id, kind, options));
  }
  rawDetail(id, kind = "timeline", options = {}) {
    const key = kind === "order" ? "orderId" : kind === "savingsPlan" ? "savingsPlanId" : "id";
    return validated(this.validateRaw, "timeline.detail", this.raw.query({ type: "timelineDetailV2", [key]: id }, pickTimeoutOptions(options)));
  }
};
var PriceAlarmsApi = class {
  constructor(raw, validateRaw) {
    this.raw = raw;
    this.validateRaw = validateRaw;
  }
  raw;
  validateRaw;
  async list(options = {}) {
    return arrayPayload(await this.rawList(options)).map(normalizePriceAlarm);
  }
  rawList(options = {}) {
    return validated(this.validateRaw, "priceAlarms.list", this.raw.query({ type: "priceAlarms" }, pickTimeoutOptions(options)));
  }
  async notifications(options = {}) {
    return arrayPayload(await this.rawNotifications(options)).map(normalizePriceAlarm);
  }
  rawNotifications(options = {}) {
    return validated(this.validateRaw, "priceAlarms.notifications", this.raw.query({ type: "priceAlarmNotifications" }, pickTimeoutOptions(options)));
  }
  create(options) {
    const { timeoutMs, isin, price } = options;
    const payload = { instrumentId: isin, targetPrice: price };
    return this.rawCreate(payload, timeoutMs === void 0 ? {} : { timeoutMs });
  }
  rawCreate(payload, options = {}) {
    return validated(this.validateRaw, "priceAlarms.create", this.raw.query({ type: "createPriceAlarm", ...payload }, pickTimeoutOptions(options)));
  }
  cancel(id, options = {}) {
    return this.rawCancel(id, options);
  }
  rawCancel(id, options = {}) {
    return validated(this.validateRaw, "priceAlarms.cancel", this.raw.query({ type: "cancelPriceAlarm", id }, pickTimeoutOptions(options)));
  }
};
var InstrumentsApi = class {
  constructor(raw, validateRaw) {
    this.raw = raw;
    this.validateRaw = validateRaw;
  }
  raw;
  validateRaw;
  async news(isin, options = {}) {
    return arrayPayload(await this.rawNews(isin, options)).map(normalizeInstrumentNewsItem);
  }
  rawNews(isin, options = {}) {
    return validated(this.validateRaw, "instruments.news", this.raw.query({ type: "neonNews", isin }, pickTimeoutOptions(options)));
  }
  etfDetails(id, options = {}) {
    return this.rawEtfDetails(id, options);
  }
  rawEtfDetails(id, options = {}) {
    return validated(this.validateRaw, "instruments.etfDetails", this.raw.query({ type: "etfDetails", id }, pickTimeoutOptions(options)));
  }
  etfComposition(id, after, options = {}) {
    return this.rawEtfComposition(id, after, options);
  }
  rawEtfComposition(id, after, options = {}) {
    return validated(this.validateRaw, "instruments.etfComposition", this.raw.query({ type: "etfComposition", id, ...after ? { after } : {} }, pickTimeoutOptions(options)));
  }
  fundDetails(id, options = {}) {
    return this.rawFundDetails(id, options);
  }
  rawFundDetails(id, options = {}) {
    return validated(this.validateRaw, "instruments.fundDetails", this.raw.query({ type: "mutualFundDetails", id }, pickTimeoutOptions(options)));
  }
  fundComposition(id, after, options = {}) {
    return this.rawFundComposition(id, after, options);
  }
  rawFundComposition(id, after, options = {}) {
    return validated(this.validateRaw, "instruments.fundComposition", this.raw.query({ type: "mutualFundComposition", id, ...after ? { after } : {} }, pickTimeoutOptions(options)));
  }
  cryptoDetails(id, options = {}) {
    return this.rawCryptoDetails(id, options);
  }
  rawCryptoDetails(id, options = {}) {
    return validated(this.validateRaw, "instruments.cryptoDetails", this.raw.query({ type: "cryptoDetails", id }, pickTimeoutOptions(options)));
  }
  yieldToMaturity(id, options = {}) {
    return this.rawYieldToMaturity(id, options);
  }
  rawYieldToMaturity(id, options = {}) {
    return validated(this.validateRaw, "instruments.yieldToMaturity", this.raw.query({ type: "yieldToMaturity", id }, pickTimeoutOptions(options)));
  }
};
var TradingApi = class {
  constructor(runtime) {
    this.runtime = runtime;
    this.http = runtime.http;
    this.raw = runtime.raw;
    this.validateRaw = runtime.validateRaw;
  }
  runtime;
  http;
  raw;
  validateRaw;
  priceForOrder(options, queryOptions = {}) {
    return validated(this.validateRaw, "trading.priceForOrder", this.raw.query({ type: "priceForOrderV2", unit: "EUR", ...options }, pickTimeoutOptions(queryOptions)));
  }
  async availableSize(instrumentId, secAccNo, options = {}) {
    const accountNumber = secAccNo ?? await this.resolveSecuritiesAccountNumber();
    return validated(this.validateRaw, "trading.availableSize", this.raw.query({ type: "availableSize", parameters: { instrumentId }, secAccNo: accountNumber }, pickTimeoutOptions(options)));
  }
  async orderDestinations(isin, query = {}) {
    return arrayPayload(await this.rawOrderDestinations(isin, query)).map(normalizeOrderDestination);
  }
  rawOrderDestinations(isin, query = {}) {
    return validated(this.validateRaw, "trading.orderDestinations", this.http.request("GET", `/api-gateway/order-router/api/v2/instruments/${encodeURIComponent(isin)}/destinations`, void 0, {
      jurisdiction: "DE",
      ...query
    }));
  }
  async trades(query = {}) {
    return arrayPayload(await this.rawTrades(query)).map(normalizeTrade);
  }
  rawTrades(query = {}) {
    return validated(this.validateRaw, "trading.trades", this.http.request("GET", "/web-trading-gateway/api/customer/v1/trades", void 0, query));
  }
  dailyPnl(items) {
    return this.rawDailyPnl(items);
  }
  rawDailyPnl(items) {
    return validated(this.validateRaw, "trading.dailyPnl", this.http.request("POST", "/web-trading-gateway/api/customer/v1/pnl/daily", { items }));
  }
  resolveSecuritiesAccountNumber() {
    return this.runtime.resolveSecuritiesAccountNumber();
  }
};
var WebApi = class {
  constructor(runtime) {
    this.runtime = runtime;
    this.http = runtime.http;
    this.raw = runtime.raw;
  }
  runtime;
  http;
  raw;
  request(method, path, options = {}) {
    return this.http.request(method, path, options.body, options.query);
  }
  requestDetailed(method, path, options = {}) {
    return this.http.requestDetailed(method, path, options.body, options.query);
  }
  query(payload, options = {}) {
    return this.raw.query(payload, options);
  }
  subscribe(payload) {
    return toSubscription(this.raw.subscribeResource(payload));
  }
  timeline(after) {
    return this.query({ type: "timelineActivityLog", ...after ? { after } : {} });
  }
  timelineActions() {
    return this.query({ type: "timelineActionsV2" });
  }
  timelineDetail(id, kind = "timeline") {
    const key = kind === "order" ? "orderId" : kind === "savingsPlan" ? "savingsPlanId" : "id";
    return this.query({ type: "timelineDetailV2", [key]: id });
  }
  priceAlarms() {
    return this.query({ type: "priceAlarms" });
  }
  priceAlarmNotifications() {
    return this.query({ type: "priceAlarmNotifications" });
  }
  savingsPlans(secAccNo) {
    return this.withSecAccNo(secAccNo, (accountNumber) => this.query({ type: "savingsPlans", secAccNo: accountNumber }));
  }
  portfolioChart(secAccNo, range = "1y", options = {}) {
    return this.request("GET", "/api-gateway/portfolio-chart/v2/chart", {
      query: { secAccNo, range, ...options }
    });
  }
  news(isin) {
    return this.query({ type: "neonNews", isin });
  }
  etfDetails(id) {
    return this.query({ type: "etfDetails", id });
  }
  etfComposition(id, after) {
    return this.query({ type: "etfComposition", id, after });
  }
  mutualFundDetails(id) {
    return this.query({ type: "mutualFundDetails", id });
  }
  mutualFundComposition(id, after) {
    return this.query({ type: "mutualFundComposition", id, after });
  }
  cryptoDetails(id) {
    return this.query({ type: "cryptoDetails", id });
  }
  yieldToMaturity(id) {
    return this.query({ type: "yieldToMaturity", id });
  }
  bondValuation(instrumentId, secAccNo) {
    return this.withSecAccNo(secAccNo, (accountNumber) => this.query({ type: "bondValuationV2", instrumentId, secAccNo: accountNumber }));
  }
  fixedSavingsValuation(instrumentId, secAccNo) {
    return this.withSecAccNo(secAccNo, (accountNumber) => this.query({ type: "fixedSavingsValuation", instrumentId, secAccNo: accountNumber }));
  }
  privateMarketsPositions(secAccNo) {
    return this.withSecAccNo(secAccNo, (accountNumber) => this.query({ type: "privateMarketsPositions", secAccNo: accountNumber }));
  }
  tape(isin, exchangeId, unit = "EUR") {
    return this.subscribe({ type: "tape", isin, exchangeId, unit });
  }
  tradeAggregateHistory(isin, exchangeId, resolution, from, until) {
    return this.query({ type: "tradeAggregateHistory", isin, exchangeId, resolution, from, until });
  }
  priceForOrder(options) {
    return this.query({ type: "priceForOrderV2", unit: "EUR", ...options });
  }
  availableSize(instrumentId, secAccNo) {
    return this.withSecAccNo(secAccNo, (accountNumber) => this.query({ type: "availableSize", parameters: { instrumentId }, secAccNo: accountNumber }));
  }
  taxWrapperAccountUtilization(secAccNo) {
    return this.query({ type: "taxWrapperAccountUtilization", secAccNo });
  }
  userPreferences() {
    return this.request("GET", "/api-gateway/pro-trading/api/v1/user-preferences");
  }
  exchangeDetails() {
    return this.request("GET", "/api-gateway/instrument-universe/api/v1/exchanges-details", { query: { includeMaintenanceWindow: false } });
  }
  exchangeSchedule(exchange) {
    return this.request("GET", `/api-gateway/instrument-universe/api/v1/exchanges/${encodeURIComponent(exchange)}/schedule`);
  }
  instrumentStatus(isin, exchange) {
    return this.request("GET", `/api-gateway/instrument-universe/api/v1/instruments/${encodeURIComponent(isin)}/status/${encodeURIComponent(exchange)}`);
  }
  orderDestinations(isin, query = {}) {
    return this.request("GET", `/api-gateway/order-router/api/v2/instruments/${encodeURIComponent(isin)}/destinations`, { query });
  }
  trades(query = {}) {
    return this.request("GET", "/web-trading-gateway/api/customer/v1/trades", { query });
  }
  dailyPnl(items) {
    return this.request("POST", "/web-trading-gateway/api/customer/v1/pnl/daily", { body: { items } });
  }
  documents() {
    return this.request("GET", "/api/v1/documents/all");
  }
  personalDetails() {
    return this.request("GET", "/api/v1/customer/personal-details");
  }
  relationships() {
    return this.request("GET", "/api/v1/customer/relationships/detailed");
  }
  cardsHome() {
    return this.request("GET", "/api/v1/card/cards/home");
  }
  accountSettings() {
    return this.request("GET", "/api/v2/auth/account");
  }
  appUsageConsents() {
    return this.request("GET", "/api/v1/customer/app-usage-data-consents");
  }
  paymentMethods() {
    return this.request("GET", "/api/v2/payment/methods");
  }
  iban() {
    return this.request("GET", "/api/v1/auth/account/iban");
  }
  taxInformation() {
    return this.request("GET", "/api/v1/taxes/information");
  }
  exemptionOrder() {
    return this.request("GET", "/api/v1/taxes/exemptionorders");
  }
  taxResidencies() {
    return this.request("GET", "/api/v1/auth/account/change/taxresidencies");
  }
  taxResidencyCountries() {
    return this.request("GET", "/api/v1/country/taxresidency");
  }
  interestDetails() {
    return this.request("GET", "/api/v1/interest/details");
  }
  watchlists() {
    return this.request("GET", "/api-gateway/watchlists/api/v2/watchlists");
  }
  screeners() {
    return this.request("GET", "/api-gateway/screeners/api/v2/screeners");
  }
  screenerOptions() {
    return this.request("GET", "/api-gateway/screeners/api/v2/screeners/options");
  }
  async withSecAccNo(secAccNo, fn) {
    const accountNumber = secAccNo ?? await this.runtime.resolveSecuritiesAccountNumber();
    return fn(accountNumber);
  }
};

// src/session.ts
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { dirname } from "path";
var SECRET_KEYS = /* @__PURE__ */ new Set(["accessToken", "refreshToken", "sessionToken", "webContext", "cookies"]);
function redactSession(session) {
  return Object.fromEntries(
    Object.entries(session).map(([key, value]) => [key, SECRET_KEYS.has(key) ? "[redacted]" : value])
  );
}
var MemorySessionStore = class {
  session;
  async load() {
    return this.session ? structuredClone(this.session) : void 0;
  }
  async save(session) {
    this.session = structuredClone(session);
  }
  async clear() {
    this.session = void 0;
  }
};
var FileSessionStore = class {
  constructor(filePath) {
    this.filePath = filePath;
  }
  filePath;
  async load() {
    try {
      return JSON.parse(await readFile(this.filePath, "utf8"));
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") return void 0;
      if (error instanceof SyntaxError) return void 0;
      throw error;
    }
  }
  async save(session) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(session, null, 2)}
`, { mode: 384 });
  }
  async clear() {
    await rm(this.filePath, { force: true });
  }
};
export {
  CandleQuery,
  FileSessionStore,
  MemorySessionStore,
  TradeRepublicClient,
  TradeRepublicError,
  TradeRepublicHttpError,
  TradeRepublicProtocolError,
  TradeRepublicSchemaError,
  collectTradeRepublicWebContext,
  redactSession,
  schemaCatalogMarkdown,
  schemaRegistry,
  validateRawResponse
};
//# sourceMappingURL=index.js.map