// src/errors.ts
var TradeRepublicError = class extends Error {
  constructor(message2, cause) {
    super(message2);
    this.cause = cause;
    this.name = "TradeRepublicError";
  }
  cause;
};
var TradeRepublicHttpError = class extends TradeRepublicError {
  constructor(message2, status, responseBody) {
    super(message2);
    this.status = status;
    this.responseBody = responseBody;
    this.name = "TradeRepublicHttpError";
  }
  status;
  responseBody;
};
var TradeRepublicProtocolError = class extends TradeRepublicError {
  constructor(message2, cause) {
    super(message2, cause);
    this.name = "TradeRepublicProtocolError";
  }
};
var TradeRepublicSchemaError = class extends TradeRepublicError {
  constructor(message2, schemaName, issues, rawSummary, cause) {
    super(message2, cause);
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
  const record2 = asRecord(value);
  for (const key of [
    "items",
    "data",
    "results",
    "orders",
    "positions",
    "aggregates",
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
    const candidate = record2[key];
    if (Array.isArray(candidate)) return candidate;
  }
  const objItems = asRecord(record2.obj).items;
  if (Array.isArray(objItems)) return objItems;
  const nestedData = asRecord(record2.data);
  if (Array.isArray(nestedData.data)) return nestedData.data;
  if (Array.isArray(nestedData.items)) return nestedData.items;
  return [];
}
function normalizeIbanInfo(value) {
  const root = asRecord(value);
  const relationships = Array.isArray(root.relationships) ? root.relationships : [];
  const withIban = relationships.filter((relationship2) => {
    const bankingInfo2 = asRecord(asRecord(relationship2).bankingInfo);
    return optionalString(bankingInfo2.iban) !== void 0;
  });
  const relationship = withIban.find((candidate) => asRecord(candidate).relationshipType === "SELF") ?? withIban[0];
  const record2 = asRecord(relationship);
  const bankingInfo = asRecord(record2.bankingInfo);
  const iban = optionalString(bankingInfo.iban);
  if (!iban) throw new TypeError("Trade Republic account relationships response did not contain an IBAN.");
  const accountHolder = [optionalString(record2.firstName), optionalString(record2.lastName)].filter((part) => part !== void 0).join(" ");
  return {
    iban,
    bic: optionalString(bankingInfo.bic),
    accountHolder: accountHolder || void 0,
    customerId: optionalString(record2.customerId),
    relationshipType: optionalString(record2.relationshipType),
    raw: relationship
  };
}
function normalizeAccountRelationship(value) {
  const record2 = asRecord(value);
  const rawBankingInfo = record2.bankingInfo;
  const bankingInfo = asRecord(rawBankingInfo);
  const hasBankingInfo = typeof rawBankingInfo === "object" && rawBankingInfo !== null;
  return {
    customerId: optionalString(record2.customerId),
    firstName: optionalString(record2.firstName),
    lastName: optionalString(record2.lastName),
    relationshipType: optionalString(record2.relationshipType),
    bankingInfo: hasBankingInfo ? {
      iban: optionalString(bankingInfo.iban),
      bic: optionalString(bankingInfo.bic),
      raw: rawBankingInfo
    } : void 0,
    raw: value
  };
}
function normalizeAccountRelationships(value) {
  const relationships = asRecord(value).relationships;
  return (Array.isArray(relationships) ? relationships : arrayPayload(value)).map(normalizeAccountRelationship);
}
function normalizeAsset(value) {
  const record2 = asRecord(value);
  const instrument = asRecord(record2.instrument);
  const core = asRecord(record2.core);
  return {
    id: stringValue(record2.id, record2.instrumentId, record2.isin, instrument.id, instrument.instrumentId, instrument.isin, record2.slug),
    isin: optionalString(record2.isin, record2.instrumentId, instrument.isin, instrument.instrumentId),
    name: optionalString(
      record2.name,
      record2.shortName,
      record2.title,
      record2["core.shortName"],
      record2["core.officialName"],
      core.shortName,
      core.officialName,
      instrument.name,
      instrument.shortName,
      instrument.title
    ),
    type: optionalString(
      record2.typeId,
      record2.type,
      record2.instrumentType,
      record2.assetType,
      instrument.typeId,
      instrument.type,
      instrument.instrumentType,
      instrument.assetType
    ),
    exchangeIds: uniqueStrings(
      arrayOfStrings(record2.exchangeIds, record2.exchanges, record2.tradingVenues),
      arrayOfStrings(instrument.exchangeIds, instrument.exchanges, instrument.tradingVenues)
    ),
    raw: value
  };
}
function normalizeWatchlistItem(value) {
  const record2 = asRecord(value);
  return {
    ...normalizeAsset(value),
    rank: optionalNumber(record2.rank, record2.itemRank, record2.item_rank)
  };
}
function normalizeWatchlist(value, items = []) {
  const record2 = asRecord(value);
  const inlineItems = Array.isArray(record2.items) ? record2.items : items;
  return {
    id: stringValue(record2.id, record2.watchlistId, record2.slug),
    name: optionalString(record2.name, record2.title),
    items: inlineItems.map(normalizeWatchlistItem).sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)),
    raw: value
  };
}
function normalizeAssetDetail(value) {
  const record2 = asRecord(value);
  const asset = normalizeAsset(value);
  return {
    ...asset,
    issuer: optionalString(record2.issuer, asRecord(record2.issuer).name),
    createdAt: optionalString(record2.createdAt, record2.created, record2.issueDate),
    endsAt: optionalString(record2.endsAt, record2.endDate, record2.expiry, record2.expiryDate),
    knockout: optionalNumber(record2.knockout, record2.knockoutPrice, record2.knockOut),
    entryPrice: optionalNumber(record2.entryPrice, record2.strike, record2.strikePrice),
    direction: normalizeDirection(record2.direction, record2.side),
    leverage: optionalNumber(record2.leverage)
  };
}
function normalizeDerivative(value) {
  const record2 = asRecord(value);
  return {
    ...normalizeAssetDetail(value),
    underlyingId: optionalString(record2.underlyingId, asRecord(record2.underlying).id),
    productType: optionalString(record2.productType, record2.derivativeType, record2.type)
  };
}
function normalizeOrder(value) {
  const record2 = asRecord(value);
  const instrument = asRecord(record2.instrument);
  const amount = moneyAmount(record2.amount) ?? moneyAmount(record2.cashQuantity) ?? optionalNumber(record2.amount, asRecord(record2.amount).value, asRecord(record2.cashQuantity).amount);
  const currency = moneyCurrency(record2.amount) ?? moneyCurrency(record2.cashQuantity) ?? optionalString(record2.currency, record2.currencyId, asRecord(record2.amount).currency, asRecord(record2.cashQuantity).currency);
  const executedAt = optionalString(record2.executedAt);
  const cancelledAt = optionalString(record2.cancelledAt, record2.canceledAt);
  const expiredAt = optionalString(record2.expiredAt);
  const rejectedAt = optionalString(record2.rejectedAt);
  const executions = normalizeExecutions(record2.trades, record2.executions, record2.fills);
  const executedQuantity = optionalNumber(record2.executedQuantity, record2.executedSize, record2.filledQuantity, record2.filledSize) ?? (executions.length ? executions.reduce((sum, execution) => sum + execution.size, 0) : void 0);
  const executionPrice = optionalNumber(record2.executionPrice, record2.executedPrice, record2.averageExecutionPrice, record2.averagePrice) ?? weightedExecutionPrice(executions);
  return {
    id: stringValue(record2.id, record2.orderId),
    status: optionalString(record2.status, record2.state) ?? inferOrderStatus(record2),
    isin: optionalString(record2.isin, record2.instrumentId, instrument.isin, instrument.instrumentId),
    instrumentId: optionalString(record2.instrumentId, record2.isin, instrument.instrumentId, instrument.isin),
    name: optionalString(record2.name, record2.instrumentName, instrument.name, instrument.shortName),
    side: optionalString(record2.side, record2.action),
    type: optionalString(record2.type, record2.mode, record2.orderType),
    createdAt: optionalString(record2.createdAt, record2.created, record2.createdTime, record2.submittedAt),
    submittedAt: optionalString(record2.submittedAt),
    updatedAt: optionalString(record2.updatedAt),
    closedAt: optionalString(record2.closedAt, executedAt, cancelledAt, expiredAt, rejectedAt),
    executedAt: executedAt ?? executions.map((execution) => execution.time).filter((time) => Boolean(time)).sort().at(-1),
    cancelledAt,
    expiredAt,
    rejectedAt,
    quantity: optionalNumber(record2.quantity, record2.size, record2.estimatedSize),
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
      const record2 = asRecord(item);
      const size = optionalNumber(record2.executionSize, record2.executedSize, record2.quantity, record2.size);
      if (size === void 0 || size <= 0) return [];
      return [{
        size,
        price: optionalNumber(record2.executionPrice, record2.price, record2.executedPrice),
        time: optionalString(record2.executedAt, record2.executionTime, record2.createdAt, record2.time)
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
function inferOrderStatus(record2) {
  if (optionalString(record2.executedAt)) return "executed";
  if (optionalString(record2.cancelledAt, record2.canceledAt)) return "canceled";
  if (optionalString(record2.expiredAt)) return "expired";
  if (optionalString(record2.rejectedAt)) return "rejected";
  const executionSize = sumExecutionSize(record2.trades);
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
function normalizePortfolio(value) {
  const record2 = asRecord(value);
  const source = Array.isArray(record2.categories) ? record2.categories : arrayPayload(value);
  const positions = source.flatMap((item) => {
    const record3 = asRecord(item);
    if (Array.isArray(record3.positions)) return record3.positions.map((position) => normalizePortfolioPosition({ ...asRecord(position), categoryType: record3.categoryType }));
    return [normalizePortfolioPosition(item)];
  });
  return { positions, raw: value };
}
function normalizePortfolioPosition(value) {
  const record2 = asRecord(value);
  return {
    id: stringValue(record2.id, record2.instrumentId, record2.isin),
    isin: optionalString(record2.isin, record2.instrumentId),
    name: optionalString(record2.name, record2.instrumentName),
    quantity: optionalNumber(record2.quantity, record2.shares, record2.size, record2.netSize),
    value: optionalNumber(record2.value, record2.netValue, asRecord(record2.marketValue).amount),
    currency: optionalString(record2.currency, asRecord(record2.marketValue).currency),
    categoryType: optionalString(record2.categoryType),
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
  const record2 = asRecord(value);
  return {
    id: stringValue(record2.id, record2.timelineId, record2.activityId, record2.orderId, record2.savingsPlanId),
    type: optionalString(record2.type, record2.activityType, record2.eventType),
    title: optionalString(record2.title, record2.name, asRecord(record2.display).title),
    subtitle: optionalString(record2.subtitle, record2.description, asRecord(record2.display).subtitle),
    createdAt: optionalString(record2.createdAt, record2.created, record2.timestamp, record2.date),
    updatedAt: optionalString(record2.updatedAt, record2.updated),
    instrumentId: optionalString(record2.instrumentId, record2.isin, asRecord(record2.instrument).id),
    orderId: optionalString(record2.orderId),
    savingsPlanId: optionalString(record2.savingsPlanId),
    raw: value
  };
}
function normalizeTimelineAction(value) {
  const record2 = asRecord(value);
  return {
    id: stringValue(record2.id, record2.actionId, record2.type),
    type: optionalString(record2.type, record2.actionType),
    title: optionalString(record2.title, record2.name, record2.label),
    raw: value
  };
}
function normalizeTimelineDetail(value) {
  const record2 = asRecord(value);
  return {
    id: stringValue(record2.id, record2.timelineId, record2.activityId, record2.orderId, record2.savingsPlanId),
    type: optionalString(record2.type, record2.activityType, record2.eventType),
    raw: value
  };
}
function normalizePriceAlarm(value) {
  const record2 = asRecord(value);
  const price = moneyAmount(record2.price) ?? moneyAmount(record2.targetPrice) ?? optionalNumber(record2.price, record2.targetPrice, asRecord(record2.price).value, asRecord(record2.targetPrice).value);
  const currency = moneyCurrency(record2.price) ?? moneyCurrency(record2.targetPrice) ?? optionalString(record2.currency, record2.currencyId, asRecord(record2.price).currency, asRecord(record2.targetPrice).currency);
  return {
    id: stringValue(record2.id, record2.alarmId, record2.priceAlarmId),
    isin: optionalString(record2.isin, record2.instrumentId),
    name: optionalString(record2.name, record2.instrumentName, record2.title),
    price,
    currency,
    triggeredAt: optionalString(record2.triggeredAt, record2.triggered, record2.notificationSentAt),
    raw: value
  };
}
function normalizePriceAlarmCreation(value) {
  const record2 = asRecord(value);
  return {
    alarmId: optionalString(record2.alarmId, record2.priceAlarmId, record2.id),
    status: optionalString(record2.status),
    raw: value
  };
}
function normalizePriceAlarmCancellation(value, requestedAlarmId) {
  const record2 = asRecord(value);
  return {
    alarmId: optionalString(record2.alarmId, record2.priceAlarmId, record2.id) ?? requestedAlarmId,
    status: optionalString(record2.status),
    raw: value
  };
}
function normalizeSavingsPlan(value) {
  const record2 = asRecord(value);
  const amount = moneyAmount(record2.amount) ?? moneyAmount(record2.rate) ?? optionalNumber(record2.amount, record2.rate);
  const currency = moneyCurrency(record2.amount) ?? moneyCurrency(record2.rate) ?? optionalString(record2.currency, record2.currencyId);
  return {
    id: stringValue(record2.id, record2.savingsPlanId),
    isin: optionalString(record2.isin, record2.instrumentId),
    name: optionalString(record2.name, record2.instrumentName, record2.title),
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
  const record2 = asRecord(value);
  return {
    id: stringValue(record2.id, record2.newsId, record2.url),
    title: optionalString(record2.title, record2.headline),
    publishedAt: optionalString(record2.publishedAt, record2.createdAt, record2.date),
    raw: value
  };
}
function normalizeOrderDestination(value) {
  const record2 = asRecord(value);
  const exchange = asRecord(record2.exchange);
  return {
    id: stringValue(record2.id, record2.exchangeId, record2.destinationId, record2.venue),
    name: optionalString(record2.name, record2.title, record2.exchangeName, exchange.name),
    type: optionalString(record2.type),
    orderModes: optionalStringArray(record2.orderModes),
    orderExpiries: optionalStringArray(record2.orderExpiries),
    listingId: optionalString(record2.listingId),
    currencyId: optionalString(record2.currencyId, asRecord(record2.currency).id),
    open: optionalBoolean(record2.open),
    openTimeOffsetMillis: optionalNumber(record2.openTimeOffsetMillis),
    closeTimeOffsetMillis: optionalNumber(record2.closeTimeOffsetMillis),
    timeZoneId: optionalString(record2.timeZoneId, exchange.timeZoneId),
    ..."maintenanceWindow" in record2 ? { maintenanceWindow: record2.maintenanceWindow } : {},
    ongoingOutage: optionalBoolean(record2.ongoingOutage),
    priority: optionalNumber(record2.priority),
    tickSizes: optionalNumberMatrix(record2.tickSizes),
    raw: value
  };
}
function normalizeOrderPriceQuote(value, options, instrumentId) {
  const record2 = asRecord(value);
  return {
    instrumentId,
    exchangeId: options.exchangeId,
    side: options.side.toLowerCase(),
    price: optionalNumber(record2.price),
    bid: optionalNumber(record2.bidPrice, record2.bid),
    ask: optionalNumber(record2.askPrice, record2.ask),
    unit: optionalString(record2.unit, record2.currency),
    time: normalizeTimestamp(optionalString(record2.time, record2.timestamp) ?? optionalNumber(record2.time, record2.timestamp)),
    raw: value
  };
}
function normalizeTrade(value) {
  const record2 = asRecord(value);
  const amount = moneyAmount(record2.amount) ?? moneyAmount(record2.cashQuantity) ?? optionalNumber(record2.amount, asRecord(record2.amount).value);
  const currency = moneyCurrency(record2.amount) ?? moneyCurrency(record2.cashQuantity) ?? optionalString(record2.currency, record2.currencyId, asRecord(record2.amount).currency);
  return {
    id: stringValue(record2.id, record2.tradeId, record2.orderId),
    isin: optionalString(record2.isin, record2.instrumentId),
    side: optionalString(record2.side, record2.action),
    quantity: optionalNumber(record2.quantity, record2.size, record2.executionSize),
    amount,
    currency,
    executedAt: optionalString(record2.executedAt, record2.executionTime, record2.createdAt),
    raw: value
  };
}
function normalizeExchangeDetails(value) {
  const record2 = asRecord(value);
  return {
    id: stringValue(record2.id, record2.exchangeId, record2.slug),
    name: optionalString(record2.name, record2.title),
    raw: value
  };
}
function normalizeExchangeSchedule(value) {
  const record2 = asRecord(value);
  return {
    exchangeId: optionalString(record2.exchangeId, record2.exchange, record2.id),
    raw: value
  };
}
function normalizeInstrumentStatus(value) {
  const record2 = asRecord(value);
  return {
    isin: optionalString(record2.isin, record2.instrumentId),
    exchangeId: optionalString(record2.exchangeId, record2.exchange),
    status: optionalString(record2.status, record2.state, record2.tradingStatus),
    raw: value
  };
}
function normalizeCashItem(value) {
  const record2 = asRecord(value);
  const amount = moneyAmount(record2.amount) ?? moneyAmount(record2.cash) ?? moneyAmount(record2.availableCash) ?? moneyAmount(record2.available) ?? optionalNumber(record2.amount, record2.cash, record2.availableCash, asRecord(record2.available).amount, record2.value);
  const currency = moneyCurrency(record2.amount) ?? moneyCurrency(record2.cash) ?? moneyCurrency(record2.availableCash) ?? moneyCurrency(record2.available) ?? optionalString(record2.currency, record2.currencyId, asRecord(record2.available).currency);
  return {
    amount,
    currency
  };
}
function normalizeCandle(value) {
  if (Array.isArray(value)) {
    const time2 = normalizeTimestamp(optionalString(value[0]) ?? optionalNumber(value[0])) ?? String(value[0]);
    return {
      time: time2,
      open: Number(value[1]),
      high: Number(value[2]),
      low: Number(value[3]),
      close: Number(value[4]),
      volume: optionalNumber(value[5]),
      raw: value
    };
  }
  const record2 = asRecord(value);
  const time = normalizeTimestamp(optionalString(record2.time, record2.timestamp, record2.date) ?? optionalNumber(record2.time, record2.timestamp, record2.date)) ?? stringValue(record2.time, record2.timestamp, record2.date);
  return {
    time,
    open: numberValue(record2.open),
    high: numberValue(record2.high),
    low: numberValue(record2.low),
    close: numberValue(record2.close),
    volume: optionalNumber(record2.volume),
    raw: value
  };
}
function normalizeCandleSeries(value) {
  const record2 = asRecord(value);
  return {
    resolutionMs: numberValue(record2.resolution),
    expectedClosingTime: normalizeTimestamp(optionalString(record2.expectedClosingTime) ?? optionalNumber(record2.expectedClosingTime)),
    lastAggregateEndTime: normalizeTimestamp(optionalString(record2.lastAggregateEndTime) ?? optionalNumber(record2.lastAggregateEndTime)),
    unit: optionalString(record2.unit, record2.currency),
    candles: arrayPayload(value).map(normalizeCandle),
    raw: value
  };
}
function normalizeSubscription(value) {
  const record2 = asRecord(value);
  return {
    id: stringValue(record2.id, record2.subscriptionId),
    plan: normalizeSubscriptionPlan(record2.plan),
    createdAt: optionalString(record2.createdAt),
    terms: Array.isArray(record2.terms) ? record2.terms.map(normalizeSubscriptionTerm) : [],
    raw: value
  };
}
function normalizeSubscriptionPlan(value) {
  const record2 = asRecord(value);
  return {
    id: stringValue(record2.id),
    name: stringValue(record2.name),
    description: optionalString(record2.description),
    product: stringValue(record2.product),
    group: stringValue(record2.group),
    price: normalizeSubscriptionPrice(record2.price),
    termPeriod: optionalString(record2.termPeriod),
    createdAt: optionalString(record2.createdAt),
    updatedAt: optionalString(record2.updatedAt),
    imageId: optionalString(record2.imageId),
    version: optionalNumber(record2.version),
    tier: record2.tier ? normalizeSubscriptionTier(record2.tier) : void 0,
    raw: value
  };
}
function normalizeSubscriptionPrice(value) {
  const record2 = asRecord(value);
  return { value: stringValue(record2.value), currency: stringValue(record2.currency), raw: value };
}
function normalizeSubscriptionTier(value) {
  const record2 = asRecord(value);
  return { level: numberValue(record2.level), group: stringValue(record2.group), raw: value };
}
function normalizeSubscriptionTerm(value) {
  const record2 = asRecord(value);
  return {
    id: stringValue(record2.id),
    activatedAt: optionalString(record2.activatedAt),
    validUntil: optionalString(record2.validUntil),
    raw: value
  };
}
function normalizeMarketEntitlementSet(value) {
  const record2 = asRecord(value);
  return {
    kind: stringValue(record2.kind),
    name: stringValue(record2.name),
    entitlements: Array.isArray(record2.entitlements) ? record2.entitlements.map(normalizeMarketEntitlement) : [],
    raw: value
  };
}
function normalizeMarketEntitlement(value) {
  const record2 = asRecord(value);
  return {
    query: Array.isArray(record2.query) ? record2.query.map(normalizeMarketEntitlementQuery) : [],
    planId: optionalString(record2.planId),
    subscribedUntil: optionalString(record2.subscribedUntil),
    isSubscribed: record2.isSubscribed === true,
    isCanceled: record2.isCanceled === true,
    raw: value
  };
}
function normalizeMarketEntitlementQuery(value) {
  const record2 = asRecord(value);
  return { name: stringValue(record2.name), value: stringValue(record2.value), raw: value };
}
function normalizeLiveFeedEvent(value) {
  const record2 = asRecord(value);
  return {
    type: stringValue(record2.type, record2.eventType, "message"),
    assetId: optionalString(record2.assetId, record2.instrumentId, record2.isin),
    exchangeId: optionalString(record2.exchangeId, record2.exchange),
    raw: value
  };
}
function normalizeMarketQuote(value, assetId, exchangeId) {
  const record2 = asRecord(value);
  const last = asRecord(record2.last);
  const bid = asRecord(record2.bid);
  const ask = asRecord(record2.ask);
  const timeValue = optionalString(record2.time, record2.timestamp, record2.updatedAt, last.time, bid.time, ask.time) ?? optionalNumber(record2.time, record2.timestamp, last.time, bid.time, ask.time);
  return {
    assetId,
    exchangeId,
    currency: optionalString(record2.currency, record2.unit, last.currency, bid.currency, ask.currency),
    last: priceValue(record2.last, record2.price),
    lastSize: sizeValue(record2.last, record2.lastSize, record2.size),
    bid: priceValue(record2.bid),
    bidSize: sizeValue(record2.bid, record2.bidSize),
    ask: priceValue(record2.ask),
    askSize: sizeValue(record2.ask, record2.askSize),
    time: normalizeTimestamp(timeValue),
    raw: value
  };
}
function normalizeL2Venues(value) {
  const record2 = asRecord(value);
  const instrument = asRecord(record2.instrument);
  const candidates = [
    record2.exchangeIds,
    record2.exchanges,
    record2.tradingVenues,
    record2.availableExchanges,
    record2.venues,
    instrument.exchangeIds,
    instrument.exchanges,
    instrument.tradingVenues
  ];
  const venues = candidates.flatMap((candidate) => {
    if (!Array.isArray(candidate)) return [];
    return candidate.map((item) => typeof item === "string" ? normalizeL2Venue({ exchangeId: item }) : normalizeL2Venue(item));
  });
  const exchange = asRecord(record2.exchange);
  const direct = optionalString(record2.exchangeId, exchange.id, exchange.exchangeId);
  if (direct) venues.unshift(normalizeL2Venue({ exchangeId: direct, name: exchange.name }));
  return venues.filter((venue, index) => venue.exchangeId && venues.findIndex((candidate) => candidate.exchangeId === venue.exchangeId) === index);
}
function normalizeL2Venue(value) {
  const record2 = asRecord(value);
  return {
    exchangeId: stringValue(record2.exchangeId, record2.exchange, record2.id),
    name: optionalString(record2.name, record2.title),
    raw: value
  };
}
function normalizeL2OrderBook(value) {
  const record2 = asRecord(value);
  return {
    instrumentId: optionalString(record2.instrumentId),
    currency: optionalString(record2.currency),
    timestamp: optionalNumber(record2.timestamp),
    bids: normalizeLevels(record2.bids, record2.bid),
    asks: normalizeLevels(record2.asks, record2.ask),
    raw: value
  };
}
function normalizeLevels(...values) {
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    const levels = value.flatMap((level) => {
      if (Array.isArray(level)) return [[Number(level[0]), Number(level[1])]];
      const record2 = asRecord(level);
      return [[numberValue(record2.price), numberValue(record2.size, record2.quantity, record2.volume)]];
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
function optionalBoolean(...values) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return void 0;
}
function optionalStringArray(value) {
  if (!Array.isArray(value)) return void 0;
  return value.filter((item) => typeof item === "string");
}
function optionalNumberMatrix(value) {
  if (value === null) return null;
  if (!Array.isArray(value)) return void 0;
  return value.map((row) => Array.isArray(row) ? row.map(Number).filter(Number.isFinite) : [Number(row)].filter(Number.isFinite));
}
function arrayOfStrings(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const strings = value.flatMap((item) => {
        if (typeof item === "string") return [item];
        const record2 = asRecord(item);
        return optionalString(record2.id, record2.exchangeId, record2.exchange, record2.slug) ? [optionalString(record2.id, record2.exchangeId, record2.exchange, record2.slug)] : [];
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
function moneyAmount(value) {
  const record2 = asRecord(value);
  return optionalNumber(record2.amount, record2.value, record2.float, record2.decimal);
}
function moneyCurrency(value) {
  const record2 = asRecord(value);
  return optionalString(record2.currency, record2.currencyId);
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
async function collectTradeRepublicWafContext(browser, options = {}) {
  return toTradeRepublicWafContext(await collectTradeRepublicWebContext(browser, options));
}
function toTradeRepublicWafContext(context) {
  const normalized = normalizeTradeRepublicWebContext(context);
  if (!normalized.awsWafToken) {
    throw new TypeError("Trade Republic WAF context requires an AWS WAF token.");
  }
  return {
    awsWafToken: normalized.awsWafToken,
    ...normalized.xsrfToken ? { xsrfToken: normalized.xsrfToken } : {},
    ...normalized.capturedAt ? { capturedAt: normalized.capturedAt } : {}
  };
}
function normalizeTradeRepublicWafContext(context) {
  const awsWafToken = normalizeString(context.awsWafToken);
  if (!awsWafToken) {
    throw new TypeError("Trade Republic WAF context requires an AWS WAF token.");
  }
  const xsrfToken = normalizeString(context.xsrfToken);
  const capturedAt = normalizeString(context.capturedAt);
  return {
    awsWafToken,
    ...xsrfToken ? { xsrfToken } : {},
    ...capturedAt ? { capturedAt } : {}
  };
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
function normalizeRecord(record2) {
  return Object.fromEntries(
    Object.entries(record2 ?? {}).filter(([key, value]) => key.length > 0 && value.length > 0)
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
  async createQrChallenge(options = {}) {
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
  async loginWithQr(options) {
    const timeoutMs = options.timeoutMs ?? 12e4;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      let challengeCallbackFailed = false;
      const challenge = await this.createQrChallenge({
        ...options.phoneNumber !== void 0 ? { phoneNumber: options.phoneNumber } : {},
        ...options.deviceName !== void 0 ? { deviceName: options.deviceName } : {},
        ...options.signal !== void 0 ? { signal: options.signal } : {}
      });
      try {
        return await this.pollQrChallenge(challenge, {
          timeoutMs: Math.max(1, deadline - Date.now()),
          async onChallengeUpdate(update) {
            try {
              await options.onChallengeUpdate(update);
            } catch (error) {
              challengeCallbackFailed = true;
              throw error;
            }
          },
          ...options.intervalMs !== void 0 ? { intervalMs: options.intervalMs } : {},
          ...options.signal !== void 0 ? { signal: options.signal } : {},
          ...options.debug !== void 0 ? { debug: options.debug } : {}
        });
      } catch (error) {
        if (challengeCallbackFailed || Date.now() >= deadline || !isRetryableInstantLoginExpiry(error)) throw error;
        debugLog(options.debug, "challenge:renew", { challengeId: challenge.id });
      }
    }
    throw new Error("Timed out while waiting for Trade Republic instant login approval.");
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
  async pollQrChallenge(challenge, options = {}) {
    const intervalMs = options.intervalMs ?? 1500;
    const timeoutMs = options.timeoutMs ?? 12e4;
    const startedAt = Date.now();
    let processId;
    let confirmedPolls = 0;
    let accumulatedSession = this.getSession();
    let latestChallenge = initialChallenge(challenge);
    let deliveredChallengeKey;
    const deliverChallenge = async (next) => {
      latestChallenge = mergeChallenges(latestChallenge, next);
      const key = challengePresentationKey(latestChallenge);
      if (!options.onChallengeUpdate || key === void 0 || key === deliveredChallengeKey) return;
      deliveredChallengeKey = key;
      await options.onChallengeUpdate(latestChallenge);
    };
    await deliverChallenge(latestChallenge);
    if (isInstantLoginChallengeExpired(latestChallenge)) {
      throw new Error("Trade Republic instant login challenge expired.");
    }
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
        await deliverChallenge(normalizeChallenge({ ...asRecord(raw), id: challenge.id }, response.headers.get("date")));
        if (isInstantLoginChallengeExpired(latestChallenge)) {
          throw new Error("Trade Republic instant login challenge expired.");
        }
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
    if (!session?.deviceInfo) return void 0;
    this.setSession(session);
    return session;
  }
  async saveSession(session = this.getSession()) {
    if (!session) throw new Error("No Trade Republic session is available to save.");
    await this.sessionStore?.save(session);
  }
  async refreshSession(options = {}) {
    const currentSession = this.getSession();
    const session = currentSession ?? await this.sessionStore?.load();
    if (!session) throw new Error("No Trade Republic session is available to refresh.");
    if (!currentSession) assertStoredSessionDeviceInfo(session);
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
  const record2 = asRecord(raw);
  const id = stringValue2(record2.id, record2.challengeId, record2.processId);
  const challengeExpiresAt = optionalString2(record2.challengeExpiresAt);
  const qrCodeTokenExpiresAt = optionalString2(record2.qrCodeTokenExpiresAt);
  return {
    id,
    qrCode: optionalString2(record2.qrCode, record2.qrCodePayload, record2.qr, record2.code),
    qrCodeDataUrl: optionalString2(record2.qrCodeDataUrl, record2.qrDataUrl),
    deepLink: optionalString2(record2.deepLink, record2.loginUrl, record2.url),
    challengeExpiresAt,
    qrCodeTokenExpiresAt,
    expiresAt: optionalString2(record2.expiresAt, challengeExpiresAt, qrCodeTokenExpiresAt, record2.expiration),
    serverTime: serverTime ?? void 0,
    raw
  };
}
function initialChallenge(challenge) {
  return {
    id: challenge.id,
    qrCode: challenge.qrCode,
    qrCodeDataUrl: challenge.qrCodeDataUrl,
    deepLink: challenge.deepLink,
    challengeExpiresAt: challenge.challengeExpiresAt,
    qrCodeTokenExpiresAt: challenge.qrCodeTokenExpiresAt,
    expiresAt: challenge.expiresAt,
    serverTime: challenge.serverTime,
    raw: challenge.raw ?? challenge
  };
}
function mergeChallenges(previous, next) {
  const hasFreshPresentation = Boolean(next.qrCode || next.qrCodeDataUrl || next.deepLink);
  return {
    ...previous,
    ...next,
    qrCode: hasFreshPresentation ? next.qrCode : previous.qrCode,
    qrCodeDataUrl: hasFreshPresentation ? next.qrCodeDataUrl : previous.qrCodeDataUrl,
    deepLink: hasFreshPresentation ? next.deepLink : previous.deepLink,
    challengeExpiresAt: next.challengeExpiresAt ?? previous.challengeExpiresAt,
    qrCodeTokenExpiresAt: next.qrCodeTokenExpiresAt ?? previous.qrCodeTokenExpiresAt,
    expiresAt: next.expiresAt ?? previous.expiresAt,
    serverTime: next.serverTime ?? previous.serverTime
  };
}
function challengePresentationKey(challenge) {
  if (!challenge.qrCode && !challenge.qrCodeDataUrl && !challenge.deepLink) return void 0;
  return JSON.stringify([
    challenge.id,
    challenge.qrCode,
    challenge.qrCodeDataUrl,
    challenge.deepLink,
    challenge.challengeExpiresAt,
    challenge.qrCodeTokenExpiresAt
  ]);
}
function isRetryableInstantLoginExpiry(error) {
  return error instanceof Error && /expired|timed out while waiting for trade republic instant login approval/i.test(error.message);
}
function isInstantLoginChallengeExpired(challenge) {
  if (!challenge.challengeExpiresAt) return false;
  const expiresAt = Date.parse(challenge.challengeExpiresAt);
  const observedAt = challenge.serverTime ? Date.parse(challenge.serverTime) : Date.now();
  return Number.isFinite(expiresAt) && Number.isFinite(observedAt) && observedAt >= expiresAt;
}
function extractSession(raw) {
  const record2 = asRecord(raw);
  const sessionRecord = asRecord(record2.session);
  const accessToken = optionalString2(record2.accessToken, sessionRecord.accessToken, record2.token);
  const sessionToken = optionalString2(
    record2.sessionToken,
    sessionRecord.sessionToken,
    record2.connectionToken,
    sessionRecord.connectionToken,
    record2.webSocketToken,
    sessionRecord.webSocketToken,
    record2.websocketToken,
    sessionRecord.websocketToken,
    record2.mapperToken,
    sessionRecord.mapperToken
  );
  const refreshToken = optionalString2(record2.refreshToken, sessionRecord.refreshToken);
  if (!accessToken && !sessionToken && !refreshToken) return void 0;
  return {
    accessToken,
    refreshToken,
    sessionToken,
    expiresAt: optionalString2(record2.expiresAt, sessionRecord.expiresAt),
    accountId: optionalString2(record2.accountId, sessionRecord.accountId),
    deviceId: optionalString2(record2.deviceId, sessionRecord.deviceId),
    metadata: { source: "instant-login" }
  };
}
function assertStoredSessionDeviceInfo(session) {
  if (!session.deviceInfo) {
    throw new TypeError("Stored Trade Republic sessions must contain deviceInfo. Create a new session.");
  }
}
function mergeSessions(...sessions) {
  const result = {};
  for (const session of sessions) {
    if (!session) continue;
    result.accessToken = session.accessToken ?? result.accessToken;
    result.refreshToken = session.refreshToken ?? result.refreshToken;
    result.sessionToken = session.sessionToken ?? result.sessionToken;
    result.deviceInfo = session.deviceInfo ?? result.deviceInfo;
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
  const record2 = asRecord(raw);
  return {
    status: optionalString2(record2.status, record2.state),
    processId: optionalString2(record2.processId, record2.id),
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
import { randomBytes, randomInt, randomUUID } from "crypto";
import { arch, cpus, platform, release, totalmem } from "os";

// src/candle-resolutions.ts
var CANDLE_TIMEFRAME_MS = {
  "1m": 6e4,
  "3m": 3 * 6e4,
  "5m": 5 * 6e4,
  "10m": 10 * 6e4,
  "15m": 15 * 6e4,
  "20m": 20 * 6e4,
  "30m": 30 * 6e4,
  "45m": 45 * 6e4,
  "1h": 60 * 6e4,
  "2h": 2 * 60 * 6e4,
  "4h": 4 * 60 * 6e4,
  "1d": 24 * 60 * 6e4,
  "1w": 7 * 24 * 60 * 6e4,
  "1M": 30 * 24 * 60 * 6e4
};
var STANDARD_CANDLE_RESOLUTIONS = [
  "1m",
  "3m",
  "5m",
  "10m",
  "15m",
  "20m",
  "30m",
  "45m",
  "1h",
  "2h",
  "4h",
  "1d",
  "1w",
  "1M"
];
var DERIVATIVE_AND_CRYPTO_CANDLE_RESOLUTIONS = [
  "10m",
  "1h",
  "4h",
  "1d",
  "1w"
];
var BOND_CANDLE_RESOLUTIONS = [
  "1d",
  "1w"
];
function candleResolutionsForInstrumentType(instrumentType) {
  const normalized = instrumentType?.trim().toLowerCase();
  if (normalized === "derivative" || normalized === "crypto") {
    return [...DERIVATIVE_AND_CRYPTO_CANDLE_RESOLUTIONS];
  }
  if (normalized === "bond") return [...BOND_CANDLE_RESOLUTIONS];
  return [...STANDARD_CANDLE_RESOLUTIONS];
}
function candleResolutionMs(resolution) {
  const milliseconds = typeof resolution === "number" ? resolution : CANDLE_TIMEFRAME_MS[resolution];
  if (!Number.isFinite(milliseconds) || milliseconds <= 0 || !Number.isInteger(milliseconds)) {
    throw new TypeError("Candle resolution must be a positive integer number of milliseconds.");
  }
  return milliseconds;
}

// src/market-specs.ts
var marketSubscriptionsSpec = {
  endpoint: "market.subscriptions",
  schemaName: "market.subscriptions",
  normalize: (raw) => arrayPayload(raw).map(normalizeSubscription)
};
var marketEntitlementsSpec = {
  endpoint: "market.entitlements",
  schemaName: "market.entitlements",
  pathParams: ({ topic }) => ({ topic }),
  query: ({ options }) => ({ exchangeId: options.exchangeIds.join(",") }),
  normalize: normalizeMarketEntitlementSet
};
var candlesSpec = {
  schemaName: "market.candles",
  resource: candleResource,
  normalize: (raw) => arrayPayload(raw).map(normalizeCandle)
};
var candleSeriesSpec = {
  schemaName: "market.candles",
  resource: candleResource,
  normalize: normalizeCandleSeries
};
var availableCandleResolutionsSpec = {
  schemaName: "assets.get",
  resource: (params) => ({ type: "instrument", id: params.assetId }),
  normalize: (raw) => candleResolutionsForInstrumentType(normalizeAsset(raw).type)
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
  request: (params) => ({ instrumentId: { isin: params.assetId, exchangeId: params.exchangeId } }),
  normalize: (raw) => normalizeL2OrderBook(raw)
};
function candleResource(params) {
  return {
    type: "aggregateHistoryLightV2",
    isin: params.assetId,
    exchangeId: params.exchangeId,
    resolution: candleResolutionMs(params.timeframe),
    range: params.range,
    from: params.from ? toIso(params.from) : void 0,
    until: params.to ? toIso(params.to) : void 0,
    unit: params.unit?.trim() || "EUR"
  };
}
function toIso(value) {
  return value instanceof Date ? value.toISOString() : value;
}

// src/candles.ts
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
    if (!this.options.from) throw new TypeError("from is required when to is provided for paged candle downloads.");
    const stepMs = candleResolutionMs(this.options.timeframe) * maxCandlesPerRequest;
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

// src/operations.ts
var OperationClient = class {
  constructor(http, validateRaw, endpoints) {
    this.http = http;
    this.validateRaw = validateRaw;
    this.endpoints = endpoints;
  }
  http;
  validateRaw;
  endpoints;
  async execute(operation, params) {
    return operation.normalize(await this.executeRaw(operation, params), params);
  }
  async executeRaw(operation, params) {
    const raw = await this.http.request(
      operation.method ?? "GET",
      this.resolvePath(operation, params),
      operation.body?.(params),
      operation.query?.(params)
    );
    return operation.schemaName ? this.validateRaw(operation.schemaName, raw) : raw;
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

// src/schemas/registry.ts
import { z } from "zod";
var scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
var jsonValue = z.lazy(() => z.union([scalar, z.array(jsonValue), z.record(z.string(), jsonValue)]));
var jsonRecord = z.record(z.string(), jsonValue);
var emptyObject = z.strictObject({});
var optionalNullableString = z.string().nullable().optional();
var optionalNullableBoolean = z.boolean().nullable().optional();
var availableCashItemSchema = z.strictObject({
  accountNumber: z.string(),
  currencyId: z.string(),
  amount: z.number()
});
var marketSubscriptionPriceSchema = z.strictObject({ value: z.string(), currency: z.string() });
var marketSubscriptionTierSchema = z.strictObject({ level: z.number(), group: z.string() });
var marketSubscriptionPlanSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  product: z.string(),
  group: z.string(),
  price: marketSubscriptionPriceSchema,
  termPeriod: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  imageId: z.string().optional(),
  version: z.number().optional(),
  tier: marketSubscriptionTierSchema.optional()
});
var marketSubscriptionSchema = z.strictObject({
  id: z.string(),
  plan: marketSubscriptionPlanSchema,
  createdAt: z.string().optional(),
  terms: z.array(z.strictObject({
    id: z.string(),
    activatedAt: z.string().optional(),
    validUntil: z.string().optional()
  }))
});
var marketEntitlementsSchema = z.strictObject({
  kind: z.string(),
  name: z.string(),
  entitlements: z.array(z.strictObject({
    query: z.array(z.strictObject({ name: z.string(), value: z.string() })),
    planId: z.string().optional(),
    subscribedUntil: z.string().optional(),
    isSubscribed: z.boolean(),
    isCanceled: z.boolean()
  }))
});
var normalizedArrayWrappers = z.union([
  z.array(jsonValue),
  z.strictObject({ data: z.array(jsonValue) }),
  z.strictObject({ items: z.array(jsonValue) }),
  z.strictObject({ items: z.array(jsonValue), total: z.number() }),
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
var derivativesForUnderlyingResponseSchema = z.strictObject({
  results: z.array(jsonValue),
  resultCount: z.number().optional(),
  issuerCount: z.record(z.string(), z.number()).optional(),
  cursors: z.strictObject({
    before: z.string().nullable(),
    after: z.string().nullable()
  }).optional()
});
var timelineActivityResponseSchema = z.union([
  z.strictObject({
    items: z.array(jsonValue),
    cursors: z.strictObject({
      before: z.string().nullable(),
      after: z.string().nullable()
    })
  }),
  z.strictObject({ activities: z.array(jsonValue) })
]);
var accountRelationshipSchema = z.object({
  customerId: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  relationshipType: z.string().optional(),
  bankingInfo: z.object({
    iban: z.string().optional(),
    bic: z.string().optional()
  }).passthrough().optional()
}).passthrough();
var accountRelationshipsSchema = z.object({
  relationships: z.array(accountRelationshipSchema)
}).passthrough();
var ibanRelationshipsSchema = accountRelationshipsSchema.refine(
  (value) => value.relationships.some((relationship) => Boolean(relationship.bankingInfo?.iban)),
  { message: "Expected at least one account relationship with bankingInfo.iban." }
);
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
var orderMutationStatusSchema = z.enum([
  "received",
  "waiting",
  "confirmationNeeded",
  "succeeded",
  "failed"
]);
var otherOrderMutationErrorCodeSchema = z.enum([
  "cashMissing",
  "currentQuoteMissing",
  "instrumentSuspended",
  "internalError",
  "invalidSecurityDerivative",
  "invalidSecurityNonDerivative",
  "limitDenied",
  "maxQuantityExceeded",
  "noRefPriceAvailable",
  "noRouteToMarket",
  "orderAlreadyDeleted",
  "orderAlreadyExists",
  "orderRejectedAtExchange",
  "portfolioInactive",
  "quoteMissing",
  "savingsplanSharesMissingToday",
  "sharesMissing",
  "shortPositionNotAllowed",
  "timeoutError",
  "unknownInstrument"
]);
var otherOrderMutationErrorDetailsSchema = z.strictObject({
  exchangeId: z.string().optional(),
  isin: z.string().optional(),
  orderId: z.string().optional(),
  userId: z.string().optional(),
  clientProcessId: z.string().optional(),
  isNostro: z.boolean().optional()
});
var otherOrderMutationErrorSchema = z.strictObject({
  code: otherOrderMutationErrorCodeSchema,
  message: z.string().optional(),
  details: otherOrderMutationErrorDetailsSchema.optional()
});
var exchangeClosedErrorSchema = z.strictObject({
  code: z.literal("exchangeClosed"),
  message: z.string(),
  details: z.strictObject({
    exchangeId: z.string(),
    isin: z.string(),
    isNostro: z.boolean(),
    clientProcessId: z.string()
  })
});
var orderNotFoundErrorSchema = z.strictObject({
  code: z.literal("orderNotFound"),
  message: z.string(),
  details: z.strictObject({
    orderId: z.string(),
    userId: z.string()
  })
});
var exchangeClosedResponseSchema = z.strictObject({
  status: z.literal("failed"),
  message: z.string(),
  error: exchangeClosedErrorSchema
});
var orderNotFoundResponseSchema = z.strictObject({
  status: z.literal("failed"),
  orderId: z.string(),
  message: z.string(),
  error: orderNotFoundErrorSchema
});
var otherOrderMutationErrorValueSchema = z.union([
  z.string(),
  otherOrderMutationErrorSchema
]);
var otherOrderMutationResponseSchema = z.strictObject({
  status: orderMutationStatusSchema,
  orderId: z.string().optional(),
  id: z.string().optional(),
  message: z.string().optional(),
  error: z.union([
    otherOrderMutationErrorValueSchema,
    z.array(otherOrderMutationErrorValueSchema)
  ]).optional()
});
var orderMutationResponseSchema = z.union([
  exchangeClosedResponseSchema,
  orderNotFoundResponseSchema,
  otherOrderMutationResponseSchema
]);
var orderMutationVariants = [
  "received",
  "waiting",
  "confirmationNeeded",
  "succeeded",
  "failed: exchangeClosed (observed live)",
  "failed: cashMissing",
  "failed: currentQuoteMissing",
  "failed: instrumentSuspended",
  "failed: internalError",
  "failed: invalidSecurityDerivative",
  "failed: invalidSecurityNonDerivative",
  "failed: limitDenied",
  "failed: maxQuantityExceeded",
  "failed: noRefPriceAvailable",
  "failed: noRouteToMarket",
  "failed: orderAlreadyDeleted",
  "failed: orderAlreadyExists",
  "failed: orderNotFound (observed live cancellation)",
  "failed: orderRejectedAtExchange",
  "failed: portfolioInactive",
  "failed: quoteMissing",
  "failed: savingsplanSharesMissingToday",
  "failed: sharesMissing",
  "failed: shortPositionNotAllowed",
  "failed: timeoutError",
  "failed: unknownInstrument"
];
var orderReplacementVariants = [
  "succeeded",
  "failed",
  "outcomeUnknown",
  "replacementNotSent",
  "cancelFailed",
  "cancelOutcomeUnknown"
];
var schemaRegistry = [
  entry("auth.session", "Auth web session", "rest", "read", "GET /api/v1/auth/web/session", sessionSchema),
  entry("auth.account", "Auth account", "rest", "read", "GET /api/v2/auth/account", accountSchema),
  entry("account.personalDetails", "Personal details", "rest", "read", "GET /api/v1/customer/personal-details", jsonRecord),
  entry("account.relationships", "Account relationships", "rest", "read", "GET /api/v1/customer/relationships/detailed", accountRelationshipsSchema),
  entry("account.cardsHome", "Cards home", "rest", "read", "GET /api/v1/card/cards/home", jsonRecord),
  entry("assets.search", "Asset search", "websocket", "read", "neonSearch", normalizedArrayWrappers, { variants: ["stock", "crypto", "etf -> fund", "mutualFund", "privateFund", "bond", "synthetic"] }),
  entry("assets.get", "Instrument detail", "websocket", "read", "instrument", jsonRecord),
  entry("derivatives.search", "Derivative search", "websocket", "read", "neonSearch type=derivative", normalizedArrayWrappers),
  entry("derivatives.listForUnderlying", "Derivatives for underlying", "websocket", "read", "derivatives", derivativesForUnderlyingResponseSchema),
  entry("orders.all", "Orders list", "rest", "read", "GET /web-trading-gateway/api/customer/v1/orders", normalizedArrayWrappers),
  entry("orders.mutualFunds", "Mutual fund orders", "rest", "read", "GET /api-gateway/mutual-funds/api/v1/orders", normalizedArrayWrappers),
  entry("orders.privateMarkets", "Private market orders", "rest", "read", "GET /api/v1/private-markets/orders/all", normalizedArrayWrappers),
  entry("orders.orderUpdates", "Order update stream", "websocket", "read", "orderUpdates", jsonValue, { live: { sample: "stream" } }),
  entry("orders.fees", "Order fee preview", "websocket", "read", "orderFeesV2", jsonValue),
  entry("orders.submit", "Submit brokerage order", "websocket", "highRiskMutation", "simpleCreateOrder", orderMutationResponseSchema, { variants: orderMutationVariants }),
  entry("orders.cancel", "Cancel brokerage order", "websocket", "highRiskMutation", "cancelOrder", orderMutationResponseSchema, { variants: orderMutationVariants }),
  entry("orders.replace", "Replace brokerage order", "websocket", "highRiskMutation", "cancelOrder -> simpleCreateOrder (non-atomic)", jsonValue, { variants: orderReplacementVariants }),
  entry("portfolio.current", "Portfolio positions", "websocket", "read", "compactPortfolioByTypeV2", z.union([jsonRecord, normalizedArrayWrappers])),
  entry("portfolio.cash", "Available cash", "websocket", "read", "availableCash", z.array(availableCashItemSchema)),
  entry("portfolio.markToMarketValue", "Portfolio status", "websocket", "read", "portfolioStatus", jsonValue),
  entry("portfolio.savingsPlans", "Savings plans", "websocket", "read", "savingsPlans", normalizedArrayWrappers),
  entry("portfolio.privateMarketsPositions", "Private markets positions", "websocket", "read", "privateMarketsPositions", jsonValue),
  entry("portfolio.portfolioChart", "Portfolio chart", "rest", "read", "GET /api-gateway/portfolio-chart/v2/chart", jsonValue),
  entry("market.subscriptions", "Market subscriptions", "rest", "read", "GET /api-gateway/subscriptions/api/v1/subscriptions", z.array(marketSubscriptionSchema)),
  entry("market.entitlements", "Market topic entitlements", "rest", "read", "GET /api-gateway/subscriptions/api/v1/entitlements/topics/{topic}", marketEntitlementsSchema),
  entry("market.candles", "Price history candles", "websocket", "read", "aggregateHistoryLightV2", jsonValue, { variants: ["stock", "crypto"] }),
  entry("market.quote", "Market quote", "websocket", "read", "ticker", jsonValue, { variants: ["stock", "crypto"] }),
  entry("market.liveFeed", "Live quote feed", "websocket", "read", "tickerV3", jsonValue, { variants: ["stock", "crypto"], live: { sample: "stream" } }),
  entry("market.availableL2Books", "Available L2 books", "websocket", "read", "instrument", jsonValue),
  entry("market.l2OrderBook", "L2 order book stream", "websocket", "read", "L2", jsonValue, { live: { sample: "stream" } }),
  entry("timeline.list", "Timeline activity", "websocket", "read", "timelineActivityLog", timelineActivityResponseSchema),
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
  entry("trading.homeOrderDestination", "Home order destination and capabilities", "websocket", "read", "homeInstrumentExchange", jsonValue),
  entry("trading.orderDestinations", "Order destinations", "rest", "read", "GET /api-gateway/order-router/api/v2/instruments/{isin}/destinations?jurisdiction=DE", orderDestinationsResponseSchema),
  entry("trading.trades", "Trades", "rest", "read", "GET /web-trading-gateway/api/customer/v1/trades", normalizedArrayWrappers),
  entry("trading.dailyPnl", "Daily PnL", "rest", "read", "POST /web-trading-gateway/api/customer/v1/pnl/daily", jsonValue),
  entry("discovery.exchangeDetails", "Exchange details", "rest", "read", "GET /api-gateway/instrument-universe/api/v1/exchanges-details", normalizedArrayWrappers),
  entry("discovery.exchangeSchedule", "Exchange schedule", "rest", "read", "GET /api-gateway/instrument-universe/api/v1/exchanges/{exchange}/schedule", jsonRecord),
  entry("discovery.instrumentStatus", "Instrument status", "rest", "read", "GET /api-gateway/instrument-universe/api/v1/instruments/{isin}/status/{exchange}", jsonRecord),
  entry("discovery.watchlists", "Watchlists", "rest", "read", "GET /api-gateway/watchlists/api/v2/watchlists", jsonValue),
  entry("discovery.watchlists.items", "Watchlist items", "rest", "read", "GET /api-gateway/watchlists/api/v2/watchlists/{watchlistId}/items", jsonValue),
  entry("discovery.watchlists.clone", "Clone watchlist", "rest", "lowRiskMutation", "POST /api-gateway/watchlists/api/v2/watchlists/{watchlistId}/clone", watchlistMutationSchema, { live: { sample: "cleanup" } }),
  entry("discovery.watchlists.rename", "Rename watchlist", "rest", "lowRiskMutation", "PUT /api-gateway/watchlists/api/v2/watchlists/{watchlistId}", watchlistMutationSchema, { live: { sample: "cleanup" } }),
  entry("discovery.watchlists.delete", "Delete watchlist", "rest", "lowRiskMutation", "DELETE /api-gateway/watchlists/api/v2/watchlists/{watchlistId}", watchlistMutationSchema, { live: { sample: "cleanup" } }),
  entry("discovery.watchlists.addItem", "Add watchlist item", "rest", "lowRiskMutation", "POST /api-gateway/watchlists/api/v2/watchlists/{watchlistId}/items", watchlistMutationSchema, { live: { sample: "cleanup" } }),
  entry("discovery.watchlists.removeItem", "Remove watchlist item", "rest", "lowRiskMutation", "DELETE /api-gateway/watchlists/api/v2/watchlists/{watchlistId}/items/{instrumentId}", watchlistMutationSchema, { live: { sample: "cleanup" } }),
  entry("discovery.screeners", "Screeners", "rest", "read", "GET /api-gateway/screeners/api/v2/screeners", jsonValue),
  entry("discovery.screenerOptions", "Screener options", "rest", "read", "GET /api-gateway/screeners/api/v2/screeners/options", jsonValue),
  entry("discovery.userPreferences", "User preferences", "rest", "read", "GET /api-gateway/pro-trading/api/v1/user-preferences", jsonValue),
  entry("documents.documents", "Documents", "rest", "read", "GET /api/v1/documents/all", jsonValue),
  entry("tax.taxInformation", "Tax information", "rest", "read", "GET /api/v1/taxes/information", jsonValue),
  entry("tax.exemptionOrder", "Tax exemption order", "rest", "read", "GET /api/v1/taxes/exemptionorders", jsonValue),
  entry("tax.taxResidencies", "Tax residencies", "rest", "read", "GET /api/v1/auth/account/change/taxresidencies", jsonValue),
  entry("tax.taxResidencyCountries", "Tax residency countries", "rest", "read", "GET /api/v1/country/taxresidency", jsonValue),
  entry("payments.paymentMethods", "Payment methods", "rest", "read", "GET /api/v2/payment/methods", jsonValue),
  entry("payments.iban", "IBAN information", "rest", "read", "GET /api/v1/customer/relationships/detailed", ibanRelationshipsSchema)
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
  lines.push("`highRiskMutation` entries can move money or alter live orders and must never be exercised by unattended integration tests.");
  return `${lines.join("\n")}
`;
}
function entry(name, title, transport, risk, request, responseSchema, options = {}) {
  return { name, title, transport, risk, request, requestSchema: jsonValue, responseSchema, ...options };
}
function summarizeRaw(value) {
  if (Array.isArray(value)) return { kind: "array", length: value.length, first: summarizeRaw(value[0]) };
  if (!value || typeof value !== "object") return value;
  const record2 = value;
  return {
    kind: "object",
    keys: Object.keys(record2).slice(0, 40)
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
  protobufStream(spec, params) {
    return toSubscription(this.raw.subscribeProtobufResource(spec.topic, spec.request(params))).map((raw) => spec.normalize(spec.schemaName ? this.validateRaw(spec.schemaName, raw) : raw, params));
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

// src/client-runtime.ts
var ClientRuntime = class {
  constructor(http, endpoints, raw, validateRaw, accountIdentity) {
    this.http = http;
    this.endpoints = endpoints;
    this.raw = raw;
    this.validateRaw = validateRaw;
    this.accountIdentity = accountIdentity;
    this.resources = new ResourceClient(http, endpoints, raw, validateRaw);
    this.operations = new OperationClient(http, validateRaw, endpoints);
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
  const record2 = value;
  if (typeof record2[key] === "string" && record2[key].length > 0) return record2[key];
  for (const item of Object.values(record2)) {
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
  "market.subscriptions": "/api-gateway/subscriptions/api/v1/subscriptions",
  "market.entitlements": "/api-gateway/subscriptions/api/v1/entitlements/topics/{topic}",
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
  relationships: {
    ...rest("account.relationships", "/api/v1/customer/relationships/detailed"),
    normalize: (raw) => normalizeAccountRelationships(raw)
  },
  cardsHome: rest("account.cardsHome", "/api/v1/card/cards/home")
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
  watchlists: {
    ...rest("discovery.watchlists", "/api-gateway/watchlists/api/v2/watchlists"),
    normalize: (raw) => arrayPayload(raw).map((watchlist) => normalizeWatchlist(watchlist))
  },
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
  iban: {
    transport: "rest",
    name: "payments.iban",
    schemaName: "payments.iban",
    path: "/api/v1/customer/relationships/detailed",
    normalize: normalizeIbanInfo
  }
};
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
    return this.operations.execute(accountOperations.relationships, {});
  }
  rawRelationships() {
    return this.operations.executeRaw(accountOperations.relationships, {});
  }
  cardsHome() {
    return this.operations.executeRaw(accountOperations.cardsHome, {});
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
    return this.operations.execute(customerOperations.iban, {});
  }
  rawIban() {
    return this.operations.executeRaw(customerOperations.iban, {});
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
    return this.operations.execute(discoveryOperations.watchlists, {});
  }
  async cloudWatchlist(options = {}) {
    const watchlist = (await this.watchlists())[0];
    if (!watchlist) return void 0;
    if (!watchlist.id) return watchlist;
    const items = arrayPayload(await this.rawWatchlistItems(watchlist.id, options));
    return normalizeWatchlist(watchlist.raw, items);
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
    const wafContext = this.options.getWafContext?.();
    const xsrfToken = session?.cookies?.["XSRF-TOKEN"] ?? wafContext?.xsrfToken ?? webContext?.cookies?.["XSRF-TOKEN"] ?? webContext?.xsrfToken;
    const webContextHeaders = normalizeHeaderRecord(webContext?.headers);
    if (wafContext) {
      deleteHeader(webContextHeaders, "x-aws-waf-token");
      deleteHeader(webContextHeaders, "x-xsrf-token");
    }
    const headers = {
      accept: "application/json, text/plain, */*",
      "accept-language": this.options.locale,
      origin: "https://app.traderepublic.com",
      referer: "https://app.traderepublic.com/",
      "user-agent": this.options.userAgent,
      ...webContextHeaders,
      ...normalizeHeaderRecord(this.options.sdkHeaders),
      "x-tr-device-info": encodeDeviceInfo(this.options.getDeviceInfo()),
      ...normalizeHeaderRecord(this.options.defaultHeaders),
      ...extra
    };
    if (hasJsonBody && !hasHeader(headers, "content-type")) headers["content-type"] = "application/json";
    if (session?.accessToken) headers.authorization = `Bearer ${session.accessToken}`;
    if (session?.sessionToken) headers["x-tr-session"] = session.sessionToken;
    const awsWafToken = wafContext?.awsWafToken ?? webContext?.awsWafToken;
    if (awsWafToken && !hasHeader(headers, "x-aws-waf-token")) headers["x-aws-waf-token"] = awsWafToken;
    if (xsrfToken && !hasHeader(headers, "x-xsrf-token")) headers["x-xsrf-token"] = decodeCookieValue(xsrfToken);
    const cookies = { ...webContext?.cookies ?? {}, ...session?.cookies ?? {} };
    if (wafContext?.awsWafToken) cookies["aws-waf-token"] = wafContext.awsWafToken;
    if (wafContext?.xsrfToken && !cookies["XSRF-TOKEN"]) cookies["XSRF-TOKEN"] = wafContext.xsrfToken;
    const cookieHeader = mergeCookieHeaders(
      [headers.cookie, webContext?.cookieHeader].filter((value) => Boolean(value)).join("; "),
      cookies
    );
    if (cookieHeader) {
      headers.cookie = cookieHeader;
    }
    return headers;
  }
};
function encodeDeviceInfo(deviceInfo) {
  return Buffer.from(JSON.stringify(deviceInfo), "utf8").toString("base64");
}
function normalizeHeaderRecord(headers) {
  const normalized = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (typeof value === "string" && value.length > 0) normalized[name] = value;
  }
  return normalized;
}
function hasHeader(headers, name) {
  const lowerName = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lowerName);
}
function deleteHeader(headers, name) {
  const lowerName = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lowerName) delete headers[key];
  }
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

// src/mapper-protobuf.ts
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { boot, messageDesc } from "@bufbuild/protobuf/codegenv2";
var file = boot({
  name: "handelsrepublik/mapper.proto",
  package: "handelsrepublik.mapper",
  syntax: "proto3",
  enumType: [],
  messageType: [
    message("SecAccNoSelector", [field("account_number", 1, 9)]),
    message("SubscribeRequest", [
      field("sub_id", 1, 5),
      field("topic_id", 2, 9),
      field("by_instrument", 3, 11, ".handelsrepublik.mapper.InstrumentSelector"),
      field("by_sec_acc_no", 4, 11, ".handelsrepublik.mapper.SecAccNoSelector")
    ]),
    message("Request", [field("sub", 1, 11, ".handelsrepublik.mapper.SubscribeRequest")]),
    message("DataResponse", [field("data", 1, 12), field("completed", 2, 8)]),
    message("Status", [field("code", 1, 5), field("message", 2, 9)]),
    message("Response", [
      field("sub_id", 1, 5),
      field("data", 2, 11, ".handelsrepublik.mapper.DataResponse"),
      field("status", 3, 11, ".handelsrepublik.mapper.Status")
    ]),
    message("Uuid", [field("id", 1, 12)]),
    message("Decimal", [field("unscaled", 1, 12), field("scale", 2, 5)]),
    message("Money", [
      field("value", 1, 11, ".handelsrepublik.mapper.Decimal"),
      field("currency", 2, 5)
    ]),
    message("UnitValue", [
      field("value", 1, 11, ".handelsrepublik.mapper.Decimal"),
      field("unit", 2, 9)
    ]),
    message("Trade", [
      field("id", 1, 11, ".handelsrepublik.mapper.Uuid"),
      field("group_id", 2, 11, ".handelsrepublik.mapper.Uuid"),
      field("trade_type", 3, 5),
      field("execution_size", 4, 11, ".handelsrepublik.mapper.Decimal"),
      field("execution_price", 5, 11, ".handelsrepublik.mapper.Money"),
      field("execution_fees", 6, 11, ".handelsrepublik.mapper.Money"),
      field("executed_at", 7, 3),
      field("gross_profit", 8, 11, ".handelsrepublik.mapper.Money"),
      field("net_profit", 9, 11, ".handelsrepublik.mapper.Money")
    ]),
    message("OrderTrade", [
      field("id", 1, 11, ".handelsrepublik.mapper.Uuid"),
      field("sec_acc_no", 2, 9),
      field("user_id", 3, 11, ".handelsrepublik.mapper.Uuid"),
      field("exchange_id", 4, 9),
      field("instrument_id", 5, 9),
      field("type", 6, 5),
      field("side", 7, 5),
      field("order_usecase", 8, 5),
      field("expiry", 9, 5),
      field("group_id", 10, 9),
      field("size", 11, 11, ".handelsrepublik.mapper.Decimal"),
      field("amount", 12, 11, ".handelsrepublik.mapper.UnitValue"),
      field("stop", 13, 11, ".handelsrepublik.mapper.UnitValue"),
      field("limit", 14, 11, ".handelsrepublik.mapper.UnitValue"),
      field("created_at", 15, 3),
      field("updated_at", 16, 3),
      field("received_at", 17, 3),
      field("submitted_at", 18, 3),
      field("opened_at", 19, 3),
      field("executed_at", 20, 3),
      field("expired_at", 21, 3),
      field("canceled_at", 22, 3),
      field("rejected_at", 23, 3),
      field("trades", 24, 11, ".handelsrepublik.mapper.Trade", 3)
    ]),
    message("Timestamp", [field("seconds", 1, 3), field("nanos", 2, 5)]),
    message("PriceAlarm", [
      field("alarm_id", 1, 11, ".handelsrepublik.mapper.Uuid"),
      field("isin", 2, 9),
      field("name", 3, 9),
      field("price", 4, 11, ".handelsrepublik.mapper.Money"),
      field("triggered_at", 5, 11, ".handelsrepublik.mapper.Timestamp")
    ]),
    message("PriceAlarmNotification", [
      field("price_alarms", 1, 11, ".handelsrepublik.mapper.PriceAlarm", 3)
    ]),
    message("InstrumentId", [field("isin", 1, 9), field("exchange_id", 2, 9)]),
    message("InstrumentSelector", [
      field("instrument_id", 1, 11, ".handelsrepublik.mapper.InstrumentId"),
      field("currency", 2, 9)
    ]),
    message("PriceLevel", [field("price", 1, 2), field("size", 2, 1)]),
    message("InstrumentOrderBook", [
      field("instrument_id", 1, 9),
      field("currency", 2, 9),
      field("ask", 3, 11, ".handelsrepublik.mapper.PriceLevel", 3),
      field("bid", 4, 11, ".handelsrepublik.mapper.PriceLevel", 3),
      field("timestamp", 5, 3)
    ])
  ]
});
var RequestSchema = messageDesc(file, 2);
var ResponseSchema = messageDesc(file, 5);
var OrderTradeSchema = messageDesc(file, 11);
var PriceAlarmNotificationSchema = messageDesc(file, 14);
var InstrumentOrderBookSchema = messageDesc(file, 18);
function mapperProtobufCodec(topic, request = {}) {
  return {
    encode(subscriptionId) {
      const sub = {
        subId: subscriptionId,
        topicId: topic,
        ...request.instrumentId ? { byInstrument: { instrumentId: request.instrumentId } } : {},
        ...request.accountNumber ? { bySecAccNo: { accountNumber: request.accountNumber } } : {}
      };
      return toBinary(RequestSchema, create(RequestSchema, { sub }));
    },
    decode(payload) {
      if (topic === "L2") return normalizeInstrumentOrderBook(fromBinary(InstrumentOrderBookSchema, payload));
      if (topic === "orderUpdates") return normalizeOrderTrade(fromBinary(OrderTradeSchema, payload));
      return normalizePriceAlarmNotification(fromBinary(PriceAlarmNotificationSchema, payload));
    }
  };
}
function decodeMapperProtobufEnvelope(bytes) {
  const response = fromBinary(ResponseSchema, bytes);
  const subscriptionId = Number(response.subId);
  const data = record(response.data);
  if (data.data instanceof Uint8Array) return { subscriptionId, payload: data.data };
  const status = record(response.status);
  if (Object.keys(status).length) {
    return {
      subscriptionId,
      status: { code: Number(status.code ?? 0), message: String(status.message ?? "Mapper protobuf request failed") }
    };
  }
  return { subscriptionId };
}
function normalizeInstrumentOrderBook(value) {
  const source = record(value);
  return {
    instrumentId: source.instrumentId,
    currency: source.currency,
    bid: priceLevels(source.bid),
    ask: priceLevels(source.ask),
    timestamp: Number(source.timestamp)
  };
}
function priceLevels(value) {
  if (!Array.isArray(value)) return [];
  return value.map((level) => {
    const source = record(level);
    return { price: Number(source.price), size: Number(source.size) };
  });
}
function normalizeOrderTrade(value) {
  const source = record(value);
  return compact({
    id: uuid(source.id),
    secAccNo: source.secAccNo,
    userId: uuid(source.userId),
    exchangeId: source.exchangeId,
    instrumentId: source.instrumentId,
    type: enumName(source.type, ["unspecified", "market", "limit", "stop", "trailingStop"]),
    side: enumName(source.side, ["unspecified", "buy", "sell"]),
    orderUsecase: enumName(source.orderUsecase, [
      "unspecified",
      "blockOrder",
      "regularOrder",
      "savingsPlan",
      "tradingPerk",
      "proprietary",
      "spareChange",
      "saveback",
      "switch",
      "externalSwitch",
      "kindergeld",
      "onePercentBonus"
    ]),
    expiry: enumName(source.expiry, ["unspecified", "day", "gtc", "gtd", "eom"]),
    groupId: source.groupId,
    size: decimal(source.size),
    amount: unitValue(source.amount),
    stop: unitValue(source.stop),
    limit: unitValue(source.limit),
    createdAt: epochMillis(source.createdAt),
    updatedAt: epochMillis(source.updatedAt),
    receivedAt: epochMillis(source.receivedAt),
    submittedAt: epochMillis(source.submittedAt),
    openedAt: epochMillis(source.openedAt),
    executedAt: epochMillis(source.executedAt),
    expiredAt: epochMillis(source.expiredAt),
    cancelledAt: epochMillis(source.canceledAt),
    rejectedAt: epochMillis(source.rejectedAt),
    trades: Array.isArray(source.trades) ? source.trades.map(normalizeTrade2) : []
  });
}
function normalizeTrade2(value) {
  const source = record(value);
  return compact({
    id: uuid(source.id),
    groupId: uuid(source.groupId),
    tradeType: enumName(source.tradeType, ["unspecified", "sell", "buy"]),
    executionSize: decimal(source.executionSize),
    executionPrice: money(source.executionPrice),
    executionFees: money(source.executionFees),
    executedAt: epochMillis(source.executedAt),
    grossProfit: money(source.grossProfit),
    netProfit: money(source.netProfit)
  });
}
function normalizePriceAlarmNotification(value) {
  const source = record(value);
  const priceAlarms = Array.isArray(source.priceAlarms) ? source.priceAlarms.map((item) => {
    const alarm = record(item);
    return compact({
      alarmId: uuid(alarm.alarmId),
      isin: alarm.isin,
      name: alarm.name,
      price: money(alarm.price),
      triggeredAt: timestamp(alarm.triggeredAt)
    });
  }) : [];
  return { priceAlarms };
}
function message(name, fields) {
  return { name, field: fields };
}
function field(name, number, type, typeName = "", label = 1) {
  return { name, number, type, typeName, label };
}
function record(value) {
  return value && typeof value === "object" ? value : {};
}
function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== void 0));
}
function uuid(value) {
  const bytes = record(value).id;
  if (!(bytes instanceof Uint8Array) || bytes.length !== 16) return void 0;
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function decimal(value) {
  const source = record(value);
  const bytes = source.unscaled;
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) return void 0;
  let unscaled = 0n;
  for (const byte of bytes) unscaled = unscaled << 8n | BigInt(byte);
  if ((bytes[0] ?? 0) & 128) unscaled -= 1n << BigInt(bytes.length * 8);
  const scale = Number(source.scale ?? 0);
  const negative = unscaled < 0n;
  const digits = (negative ? -unscaled : unscaled).toString().padStart(scale + 1, "0");
  const text = scale > 0 ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
  return negative ? `-${text}` : text;
}
function money(value) {
  const source = record(value);
  if (!Object.keys(source).length) return void 0;
  return compact({ value: decimal(source.value), currency: currencyName(source.currency) });
}
function unitValue(value) {
  const source = record(value);
  if (!Object.keys(source).length) return void 0;
  return compact({ value: decimal(source.value), unit: source.unit });
}
function currencyName(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return void 0;
  return number === 1 ? "EUR" : number === 2 ? "PLN" : number === 5 ? "USD" : String(number);
}
function enumName(value, names) {
  const number = Number(value);
  return Number.isInteger(number) ? names[number] ?? String(number) : void 0;
}
function epochMillis(value) {
  if (typeof value !== "bigint" && typeof value !== "number") return void 0;
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return void 0;
  const date = new Date(number);
  return Number.isNaN(date.getTime()) ? String(number) : date.toISOString();
}
function timestamp(value) {
  const source = record(value);
  const seconds = source.seconds;
  if (typeof seconds !== "bigint" && typeof seconds !== "number") return void 0;
  const milliseconds = Number(seconds) * 1e3 + Math.floor(Number(source.nanos ?? 0) / 1e6);
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? void 0 : date.toISOString();
}

// src/mapper-connection.ts
var MapperRequestError = class extends TradeRepublicProtocolError {
  constructor(message2, reason, deliveryState, connectionLoss, cause) {
    super(message2, cause);
    this.reason = reason;
    this.deliveryState = deliveryState;
    this.connectionLoss = connectionLoss;
    this.name = "MapperRequestError";
    this.outcomeUnknown = deliveryState === "sent";
  }
  reason;
  deliveryState;
  connectionLoss;
  outcomeUnknown;
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
  handshakeTimer;
  outage;
  subscribe(message2, options = {}) {
    const state = {
      id: this.nextSubscriptionId++,
      message: message2,
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
      get deliveryState() {
        return state.sent ? "sent" : "notSent";
      },
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
  /** Reconnects reads with fresh headers and terminates already-sent mutations. */
  refreshHeaders() {
    this.failSentNonReplayableSubscriptions("sessionRefresh");
    const socket = this.socket;
    if (!socket) return;
    this.socket = void 0;
    this.connected = false;
    this.clearHandshakeTimer();
    try {
      socket.close(1e3, "session refreshed");
    } catch {
    }
    if (this.subscriptions.size > 0 || this.outage) this.ensureSocket();
    else this.closeIdleSocket();
  }
  close() {
    this.clearReconnectTimer();
    this.clearHandshakeTimer();
    for (const state of [...this.subscriptions.values()]) {
      this.fail(state, requestError("clientClosed", state.sent ? "sent" : "notSent"));
    }
    this.subscriptions.clear();
    const socket = this.socket;
    this.socket = void 0;
    this.connected = false;
    this.outage = void 0;
    if (socket) {
      try {
        socket.close(1e3, "client closed");
      } catch {
      }
    }
    this.options.onIdle?.();
  }
  ensureSocket() {
    if (this.socket || this.reconnectTimer || this.subscriptions.size === 0 && !this.outage) return;
    let socket;
    try {
      socket = this.options.websocketFactory(this.options.url, this.options.headers());
    } catch (error) {
      logWire("error", error);
      if (this.outage) this.scheduleReconnect();
      else this.failInitialSubscriptions("connectFailure", error);
      return;
    }
    this.socket = socket;
    this.startHandshakeTimer(socket);
    try {
      addListener(socket, "open", () => {
        if (this.socket !== socket) return;
        const message2 = `connect 34 ${JSON.stringify(connectPayload())}`;
        logWire("send", message2);
        try {
          socket.send(message2);
        } catch (error) {
          this.handleSocketEnd(socket, "sendFailure", [], error, true);
        }
      });
      addListener(socket, "message", (event, isBinary) => {
        if (this.socket !== socket) return;
        this.handleMessage(socket, event, isBinary === true);
      });
      addListener(socket, "error", (error) => {
        if (this.socket !== socket) return;
        logWire("error", error);
        this.handleSocketEnd(socket, this.connected ? "disconnect" : "connectFailure", [], error, true);
      });
      addListener(socket, "close", (...args) => {
        if (this.socket !== socket) return;
        this.handleSocketEnd(socket, this.connected ? "disconnect" : "connectFailure", args);
      });
    } catch (error) {
      this.handleSocketEnd(socket, "connectFailure", [], error, true);
    }
  }
  handleMessage(socket, event, isBinary = false) {
    const binary = socketBinary(event, isBinary);
    if (binary) {
      let frame2;
      try {
        frame2 = decodeMapperProtobufEnvelope(binary);
      } catch (error) {
        logWire("error", error);
        return;
      }
      const state2 = this.subscriptions.get(frame2.subscriptionId);
      if (!state2) return;
      if (frame2.status) {
        this.fail(state2, new TradeRepublicProtocolError(`Trade Republic protobuf resource failed (${frame2.status.code}): ${frame2.status.message}`));
        return;
      }
      if (!(frame2.payload instanceof Uint8Array)) {
        this.finish(state2);
        this.subscriptions.delete(state2.id);
        return;
      }
      if (typeof state2.message === "string") {
        this.fail(state2, new TradeRepublicProtocolError("Received a protobuf response for a JSON mapper subscription."));
        return;
      }
      try {
        this.push(state2, state2.message.decode(frame2.payload));
      } catch (error) {
        this.fail(state2, new TradeRepublicProtocolError("Could not decode Trade Republic protobuf resource payload.", { cause: error }));
      }
      return;
    }
    const message2 = socketText(event);
    logWire("message", message2);
    if (message2 === "connected") {
      this.clearHandshakeTimer();
      this.connected = true;
      for (const state2 of [...this.subscriptions.values()]) {
        if (this.socket !== socket || !this.connected) break;
        if (!state2.sent || state2.replayOnReconnect) this.sendSubscription(state2);
      }
      if (this.socket !== socket || !this.connected) return;
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
    if (message2.startsWith("echo") || message2.startsWith("connected")) return;
    const frame = parseSubscriptionFrame(message2);
    if (!frame) return;
    const state = this.subscriptions.get(frame.id);
    if (state) this.push(state, frame.payload);
  }
  sendSubscription(state) {
    const socket = this.socket;
    if (!socket || state.closed) return;
    const message2 = typeof state.message === "string" ? `sub ${state.id} ${state.message}` : Buffer.from(state.message.encode(state.id));
    logWire("send", message2);
    try {
      socket.send(message2);
      state.sent = true;
    } catch (error) {
      this.handleSocketEnd(socket, "sendFailure", [], error, true);
    }
  }
  handleSocketEnd(socket, reason, closeArgs = [], cause, closeSocket = false) {
    if (this.socket !== socket) return;
    const wasConnected = this.connected;
    this.socket = void 0;
    this.connected = false;
    this.clearHandshakeTimer();
    if (closeSocket) {
      try {
        socket.close(1e3, reason);
      } catch {
      }
    }
    if (wasConnected && !this.outage) {
      const disconnectedAtMs = Date.now();
      const details = closeEventDetails(closeArgs, cause);
      const disconnectEvent = {
        disconnectedAt: new Date(disconnectedAtMs).toISOString(),
        reconnectDelayMs: Math.max(0, this.options.reconnectDelayMs ?? 250),
        ...details.code !== void 0 ? { code: details.code } : {},
        ...details.reason ? { reason: details.reason } : {}
      };
      this.outage = { disconnectedAtMs, disconnectEvent, reconnectAttempts: 0 };
      invokeCallback(this.options.onDisconnect, disconnectEvent);
    }
    if (this.outage) {
      if (reason === "disconnect" || reason === "sendFailure") {
        this.failSentNonReplayableSubscriptions(reason, cause);
      }
      if (this.subscriptions.size > 0 || this.outage) this.scheduleReconnect();
      return;
    }
    this.failInitialSubscriptions(reason === "disconnect" ? "connectFailure" : reason, cause);
  }
  closeSubscription(state) {
    if (state.closed) return;
    if (this.connected && this.socket && state.sent) {
      try {
        const message2 = `unsub ${state.id}`;
        logWire("send", message2);
        this.socket.send(message2);
      } catch {
      }
    }
    this.subscriptions.delete(state.id);
    this.finish(state);
    if (this.subscriptions.size === 0 && !this.outage) this.closeIdleSocket();
  }
  closeIdleSocket() {
    this.clearReconnectTimer();
    this.clearHandshakeTimer();
    const socket = this.socket;
    this.socket = void 0;
    this.connected = false;
    if (socket) {
      try {
        socket.close(1e3, "idle");
      } catch {
      }
    }
    this.nextSubscriptionId = 1;
    this.options.onIdle?.();
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
  startHandshakeTimer(socket) {
    this.clearHandshakeTimer();
    const timeoutMs = Math.max(1, this.options.handshakeTimeoutMs ?? 1e4);
    this.handshakeTimer = setTimeout(() => {
      this.handshakeTimer = void 0;
      this.handleSocketEnd(socket, "handshakeTimeout", [], void 0, true);
    }, timeoutMs);
    this.handshakeTimer.unref?.();
  }
  clearHandshakeTimer() {
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    this.handshakeTimer = void 0;
  }
  clearReconnectTimer() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = void 0;
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
  fail(state, error) {
    state.closed = true;
    state.error = error;
    this.subscriptions.delete(state.id);
    while (state.waiters.length) state.waiters.shift()?.reject(error);
  }
  failInitialSubscriptions(reason, cause) {
    for (const state of [...this.subscriptions.values()]) {
      this.fail(state, requestError(reason, "notSent", void 0, cause));
    }
    if (this.subscriptions.size === 0) this.closeIdleSocket();
  }
  failSentNonReplayableSubscriptions(reason, cause) {
    for (const state of [...this.subscriptions.values()]) {
      if (!state.sent || state.replayOnReconnect) continue;
      const event = this.outage?.disconnectEvent;
      this.fail(state, requestError(reason, "sent", event, cause));
    }
  }
};
function mapperTimeoutError(resource, deliveryState) {
  const suffix = deliveryState === "sent" ? "The broker may have received the request." : "The request was not sent to the broker.";
  return requestError("timeout", deliveryState, void 0, void 0, `Timed out waiting for resource: ${resource}. ${suffix}`);
}
function requestError(reason, deliveryState, connectionLoss, cause, explicitMessage) {
  const subject = deliveryState === "sent" ? "The broker outcome is unknown." : "The request was not sent to the broker.";
  return new MapperRequestError(explicitMessage ?? `Mapper request ended because of ${reason}. ${subject}`, reason, deliveryState, connectionLoss, cause);
}
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
function closeEventDetails(args, cause) {
  const first = args[0];
  const code = typeof first === "number" ? first : first && typeof first === "object" && "code" in first && typeof first.code === "number" ? first.code : void 0;
  const rawReason = typeof first === "number" ? args[1] : first && typeof first === "object" && "reason" in first ? first.reason : void 0;
  const reason = Buffer.isBuffer(rawReason) ? rawReason.toString("utf8") : typeof rawReason === "string" ? rawReason : cause instanceof Error ? cause.message : void 0;
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
function socketBinary(event, isBinary) {
  const isMessageEvent = typeof event === "object" && event !== null && "data" in event;
  const data = isMessageEvent ? event.data : event;
  if (!isBinary && !(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) return void 0;
  if (Buffer.isBuffer(data)) return isBinary || isMessageEvent ? data : void 0;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return void 0;
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
  constructor(http, websocketUrl, websocketFactory, getSession, websocketMode = "shared", reconnectDelayMs = 250, handshakeTimeoutMs = 1e4, onWebSocketDisconnect, onWebSocketReconnect) {
    this.http = http;
    this.websocketUrl = websocketUrl;
    this.websocketFactory = websocketFactory;
    this.getSession = getSession;
    this.reconnectDelayMs = reconnectDelayMs;
    this.handshakeTimeoutMs = handshakeTimeoutMs;
    this.onWebSocketDisconnect = onWebSocketDisconnect;
    this.onWebSocketReconnect = onWebSocketReconnect;
    this.sharedConnection = websocketMode === "shared" ? this.createConnection() : void 0;
  }
  http;
  websocketUrl;
  websocketFactory;
  getSession;
  reconnectDelayMs;
  handshakeTimeoutMs;
  onWebSocketDisconnect;
  onWebSocketReconnect;
  sharedConnection;
  isolatedConnections = /* @__PURE__ */ new Set();
  request(request) {
    return this.http.request(request.method ?? "GET", request.path, request.body, request.query);
  }
  subscribe(topic, payload = {}, options = {}) {
    return this.subscribeResource({ ...asObject(payload), type: topic }, options);
  }
  subscribeResource(payload, options = {}) {
    const operation = options.operation ?? classifyMapperOperation(payload);
    return this.openSubscription(
      JSON.stringify({ ...payload, token: this.getSession()?.sessionToken }),
      { replayOnReconnect: operation === "mutation" ? false : options.replayOnReconnect }
    );
  }
  subscribeProtobufResource(topic, request = {}, options = {}) {
    return this.openSubscription(mapperProtobufCodec(topic, request), options);
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
        throw mapperTimeoutError(String(payload.type ?? "unknown"), subscription.deliveryState);
      }
      assertNoResourceErrors(result.value, payload);
      return result.value;
    } finally {
      subscription.close();
    }
  }
  async queryProtobufResource(topic, request = {}, options = {}) {
    const subscription = this.subscribeProtobufResource(topic, request, options);
    const iterator = subscription[Symbol.asyncIterator]();
    try {
      const result = await Promise.race([
        iterator.next(),
        delay2(options.timeoutMs ?? 15e3).then(() => ({ done: true, value: void 0, timedOut: true }))
      ]);
      if (result.done || "timedOut" in result && result.timedOut) {
        throw mapperTimeoutError(topic, subscription.deliveryState);
      }
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
    let connection;
    connection = this.createConnection(() => this.isolatedConnections.delete(connection));
    this.isolatedConnections.add(connection);
    const subscription = connection.subscribe(subscriptionMessage, options);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      subscription.close();
    };
    return {
      get deliveryState() {
        return subscription.deliveryState;
      },
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
  createConnection(onIdle) {
    return new MapperConnection({
      url: this.websocketUrl,
      websocketFactory: this.websocketFactory,
      headers: () => this.http.headers(),
      reconnectDelayMs: this.reconnectDelayMs,
      handshakeTimeoutMs: this.handshakeTimeoutMs,
      onDisconnect: this.onWebSocketDisconnect,
      onReconnect: this.onWebSocketReconnect,
      ...onIdle ? { onIdle } : {}
    });
  }
};
var MAPPER_MUTATION_RESOURCES = /* @__PURE__ */ new Set([
  "cancelOrder",
  "cancelPriceAlarm",
  "createPriceAlarm",
  "simpleCreateOrder"
]);
function classifyMapperOperation(payload) {
  return typeof payload.type === "string" && MAPPER_MUTATION_RESOURCES.has(payload.type) ? "mutation" : "read";
}
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
var DEFAULT_LOCALE = "de-DE";
var FIREFOX_VERSION = "152.0.6";
var DEFAULT_TR_HEADERS = {
  "x-tr-app-version": "15.101.0",
  "x-tr-platform": "web-pro"
};
var PLAUSIBLE_SCREENS = ["1920x1080x24", "2560x1440x24", "1536x864x24", "1366x768x24", "1920x1200x24"];
var GERMAN_LANGUAGE_PROFILES = [
  ["de-DE", "de", "en-US", "en"],
  ["de-DE", "de", "en-GB", "en"],
  ["de-DE", "de"]
];
var TradeRepublicClient = class _TradeRepublicClient {
  auth;
  raw;
  account;
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
  wafContext;
  deviceInfo;
  http;
  endpoints;
  resources;
  operations;
  runtime;
  validateRaw;
  constructor(options = {}) {
    if (options.session && !options.session.deviceInfo) {
      throw new TypeError("Trade Republic sessions must contain deviceInfo.");
    }
    this.deviceInfo = createDeviceInfo(options.session?.deviceInfo ?? options.deviceInfo);
    this.wafContext = options.wafContext ? normalizeTradeRepublicWafContext(options.wafContext) : void 0;
    this.session = withClientContext(options.session, options.webContext, this.deviceInfo);
    this.securitiesAccountNumber = options.session?.securitiesAccountNumber;
    this.validateRaw = createRawSchemaValidator(options.rawSchemaValidation, options.onRawSchemaValidationFailure);
    this.endpoints = new EndpointResolver(options.endpoints);
    this.http = new HttpClient({
      apiBaseUrl: options.apiBaseUrl ?? DEFAULT_API_BASE_URL,
      locale: options.locale ?? DEFAULT_LOCALE,
      userAgent: options.userAgent ?? firefoxUserAgent(),
      sdkHeaders: DEFAULT_TR_HEADERS,
      defaultHeaders: options.defaultHeaders,
      fetch: options.fetch ?? fetch,
      getSession: () => this.session,
      getDeviceInfo: () => this.deviceInfo,
      getWafContext: () => this.wafContext
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
      options.websocketHandshakeTimeoutMs,
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
  static async collectWafToken(options = {}) {
    const { browser, browserLaunchOptions, ...collectionOptions } = options;
    if (browser) {
      if (browserLaunchOptions) {
        throw new TypeError("browserLaunchOptions cannot be used with a caller-owned browser.");
      }
      return collectTradeRepublicWafContext(browser, collectionOptions);
    }
    let chromium;
    try {
      ({ chromium } = await import("playwright"));
    } catch (cause) {
      throw new Error(
        'Automatic Trade Republic WAF context collection requires the optional playwright package. Install it with "npm install playwright".',
        { cause }
      );
    }
    const launchedBrowser = await chromium.launch({ headless: false, ...browserLaunchOptions });
    try {
      return await collectTradeRepublicWafContext(launchedBrowser, collectionOptions);
    } finally {
      await launchedBrowser.close();
    }
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
    const withDeviceInfo = Object.keys(session).length > 0 ? { ...session, deviceInfo: structuredClone(session.deviceInfo ?? this.deviceInfo) } : session;
    const nextSession = shouldPreserveWebContext && this.session?.webContext ? { ...withDeviceInfo, webContext: this.session.webContext } : withDeviceInfo;
    this.session = structuredClone(nextSession);
    if (session.deviceInfo) this.deviceInfo = structuredClone(session.deviceInfo);
    this.raw?.refreshSession();
    if (session.securitiesAccountNumber) this.setSecuritiesAccountNumber(session.securitiesAccountNumber);
    else if (Object.keys(session).length === 0) this.securitiesAccountNumber = void 0;
  }
  useWebContext(webContext) {
    const session = {
      ...this.session ?? {},
      deviceInfo: structuredClone(this.deviceInfo),
      webContext: mergeTradeRepublicWebContexts(this.session?.webContext, normalizeTradeRepublicWebContext(webContext))
    };
    this.setSession(session);
    return this.getSession() ?? session;
  }
  useWafContext(wafContext) {
    this.wafContext = normalizeTradeRepublicWafContext(wafContext);
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
    const sessionWithDeviceInfo = {
      ...session,
      deviceInfo: structuredClone(session.deviceInfo ?? this.deviceInfo)
    };
    if (session.securitiesAccountNumber) {
      this.setSecuritiesAccountNumber(session.securitiesAccountNumber);
      return sessionWithDeviceInfo;
    }
    try {
      const accountNumber = await this.runtime.resolveSecuritiesAccountNumber(5e3);
      return { ...sessionWithDeviceInfo, securitiesAccountNumber: accountNumber };
    } catch {
      return sessionWithDeviceInfo;
    }
  }
  async resolveSecuritiesAccountNumberFromRest() {
    const account = await this.account.current();
    const accountNumber = firstStringByKey(account, "securitiesAccountNumber");
    if (accountNumber) this.setSecuritiesAccountNumber(accountNumber);
    return accountNumber;
  }
};
function withClientContext(session, webContext, deviceInfo) {
  if (!session && !webContext) return void 0;
  return {
    ...session ? structuredClone(session) : {},
    deviceInfo: structuredClone(deviceInfo),
    ...webContext ? { webContext: mergeTradeRepublicWebContexts(session?.webContext, webContext) } : {}
  };
}
function createDeviceInfo(overrides) {
  const runtime = runtimeDeviceInfo();
  return {
    ...runtime,
    ...definedProperties(overrides),
    preferredLanguages: overrides?.preferredLanguages ? [...overrides.preferredLanguages] : runtime.preferredLanguages
  };
}
function runtimeDeviceInfo() {
  const nodePlatform = platform();
  return {
    stableDeviceId: randomBytes(64).toString("hex"),
    browser: "Firefox",
    browserVersion: FIREFOX_VERSION,
    os: operatingSystemName(nodePlatform),
    osVersion: release(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset: (/* @__PURE__ */ new Date()).getTimezoneOffset(),
    screen: randomItem(PLAUSIBLE_SCREENS),
    preferredLanguages: [...randomItem(GERMAN_LANGUAGE_PROFILES)],
    numberOfCores: cpus().length,
    deviceMemory: Math.max(1, Math.round(totalmem() / 1024 ** 3))
  };
}
function operatingSystemName(nodePlatform) {
  if (nodePlatform === "win32") return "Windows";
  if (nodePlatform === "darwin") return "Mac OS";
  if (nodePlatform === "linux") return "Linux";
  return nodePlatform;
}
function firefoxUserAgent() {
  const majorVersion = FIREFOX_VERSION.split(".")[0];
  const nodePlatform = platform();
  const system = nodePlatform === "win32" ? `Windows NT 10.0; Win64; ${arch() === "arm64" ? "ARM64" : "x64"}` : nodePlatform === "darwin" ? "Macintosh; Intel Mac OS X 10.15" : `X11; Linux ${arch() === "arm64" ? "aarch64" : "x86_64"}`;
  return `Mozilla/5.0 (${system}; rv:${majorVersion}.0) Gecko/20100101 Firefox/${majorVersion}.0`;
}
function randomItem(values) {
  return values[randomInt(values.length)];
}
function definedProperties(value) {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter(([, property]) => property !== void 0)
  );
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
    const category = options.productType ? derivativeCategory(options.productType) : void 0;
    const categories = category ? [category] : DERIVATIVE_CATEGORIES;
    const requests = categories.flatMap((item) => {
      const directions = options.direction ? [options.direction] : item.directions;
      if (directions.some((direction) => !item.directions.includes(direction))) {
        throw new TypeError(`${options.direction} is not valid for derivative category ${item.name}.`);
      }
      return directions.map((direction) => ({
        type: "derivatives",
        jurisdiction: "DE",
        lang: "en",
        underlying: underlyingId,
        productCategory: item.resourceValue,
        optionType: direction,
        sortBy: item.sortBy,
        sortDirection: "asc",
        pageSize: null
      }));
    });
    const rawPages = await Promise.all(requests.map((request) => validated(
      this.validateRaw,
      "derivatives.listForUnderlying",
      this.raw.query(request)
    )));
    return rawPages.flatMap(arrayPayload).map(normalizeDerivative).slice(0, options.limit);
  }
  async get(derivativeId) {
    return normalizeDerivative(await validated(this.validateRaw, "assets.get", this.raw.query({ type: "instrument", id: derivativeId })));
  }
};
var DERIVATIVE_CATEGORIES = [
  { name: "knockouts", resourceValue: "knockOutProduct", directions: ["long", "short"], sortBy: "leverage" },
  { name: "warrants", resourceValue: "vanillaWarrant", directions: ["call", "put"], sortBy: "delta" },
  { name: "factors", resourceValue: "factorCertificate", directions: ["long", "short"], sortBy: "factor" }
];
function derivativeCategory(value) {
  const category = DERIVATIVE_CATEGORIES.find((item) => item.name === value || item.resourceValue === value);
  if (!category) throw new TypeError(`Unknown derivative category: ${value}`);
  return category;
}
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
    return toSubscription(this.raw.subscribeProtobufResource("orderUpdates", { accountNumber: secAccNo })).map((raw) => this.validateRaw("orders.orderUpdates", raw));
  }
  async rawOrderUpdates(secAccNo) {
    const accountNumber = secAccNo ?? await this.runtime.resolveSecuritiesAccountNumber();
    return validated(
      this.validateRaw,
      "orders.orderUpdates",
      this.raw.queryProtobufResource("orderUpdates", { accountNumber })
    );
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
  async submit(options, runtimeOptions = {}) {
    const order = isPreparedOrder(options) ? options : await this.prepare(options);
    const timeoutMs = runtimeOptions.timeoutMs ?? (isPreparedOrder(options) ? 12e4 : options.timeoutMs ?? 12e4);
    const payload = {
      type: "simpleCreateOrder",
      parameters: order.parameters,
      warningsShown: order.warningsShown,
      ...order.lastClientPrice !== void 0 ? { lastClientPrice: order.lastClientPrice } : {},
      clientProcessId: order.clientProcessId,
      secAccNo: order.secAccNo
    };
    const subscription = this.raw.subscribeResource(payload, { operation: "mutation" });
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
        const update = normalizeOrderMutationUpdate(raw);
        updates.push(update);
        const { status, orderId } = update;
        if (status === "succeeded" || orderId && !status) {
          return { status: "succeeded", orderId, clientProcessId: order.clientProcessId, updates, raw };
        }
        if (status === "failed") {
          return {
            status,
            ...orderId ? { orderId } : {},
            clientProcessId: order.clientProcessId,
            updates,
            error: update.error ?? normalizeOrderMutationError(void 0, update.message),
            raw
          };
        }
      }
      throw mapperTimeoutError("simpleCreateOrder", subscription.deliveryState);
    } catch (error) {
      if (!(error instanceof MapperRequestError) || error.deliveryState !== "sent") throw error;
      return {
        status: "outcomeUnknown",
        clientProcessId: order.clientProcessId,
        updates,
        outcomeReason: mutationOutcomeReason(error),
        ...error.connectionLoss ? { connectionLoss: error.connectionLoss } : {},
        error,
        raw: updates.at(-1)?.raw
      };
    } finally {
      subscription.close();
    }
  }
  async cancel(orderId, options = {}) {
    const id = requiredString(orderId, "orderId");
    const timeoutMs = options.timeoutMs ?? 15e3;
    const subscription = this.raw.subscribeResource(
      { type: "cancelOrder", orderId: id },
      { operation: "mutation" }
    );
    const iterator = subscription[Symbol.asyncIterator]();
    const updates = [];
    const deadline = Date.now() + timeoutMs;
    try {
      while (Date.now() < deadline) {
        const remaining = Math.max(1, deadline - Date.now());
        const result = await nextOrderUpdate(iterator, remaining);
        if (result.done || "timedOut" in result && result.timedOut) break;
        const raw = this.validateRaw("orders.cancel", result.value);
        throwResourceErrors(raw, "cancelOrder");
        const update = normalizeOrderMutationUpdate(raw);
        updates.push(update);
        const { status } = update;
        const resolvedOrderId = update.orderId ?? id;
        if (status === "succeeded") return { orderId: resolvedOrderId, status, updates, raw };
        if (status === "failed") {
          return {
            orderId: resolvedOrderId,
            status,
            updates,
            error: update.error ?? normalizeOrderMutationError(void 0, update.message),
            raw
          };
        }
      }
      throw mapperTimeoutError("cancelOrder", subscription.deliveryState);
    } catch (error) {
      if (!(error instanceof MapperRequestError) || error.deliveryState !== "sent") throw error;
      return {
        orderId: id,
        status: "outcomeUnknown",
        updates,
        outcomeReason: mutationOutcomeReason(error),
        ...error.connectionLoss ? { connectionLoss: error.connectionLoss } : {},
        error,
        raw: updates.at(-1)?.raw
      };
    } finally {
      subscription.close();
    }
  }
  async replace(orderId, replacement, options = {}) {
    const previousOrderId = requiredString(orderId, "orderId");
    const prepared = isPreparedOrder(replacement) ? replacement : await this.prepare(replacement);
    const submissionTimeoutMs = options.submissionTimeoutMs ?? (isPreparedOrder(replacement) ? void 0 : replacement.timeoutMs);
    const cancellation = await this.cancel(previousOrderId, {
      ...options.cancellationTimeoutMs !== void 0 ? { timeoutMs: options.cancellationTimeoutMs } : {}
    });
    if (cancellation.status === "failed") {
      return { status: "cancelFailed", previousOrderId, cancellation };
    }
    if (cancellation.status === "outcomeUnknown") {
      return { status: "cancelOutcomeUnknown", previousOrderId, cancellation };
    }
    try {
      const submission = await this.submit(prepared, {
        ...submissionTimeoutMs !== void 0 ? { timeoutMs: submissionTimeoutMs } : {}
      });
      switch (submission.status) {
        case "succeeded":
          return { status: submission.status, previousOrderId, cancellation, submission };
        case "failed":
          return { status: submission.status, previousOrderId, cancellation, submission };
        case "outcomeUnknown":
          return { status: submission.status, previousOrderId, cancellation, submission };
      }
    } catch (error) {
      if (error instanceof MapperRequestError && error.deliveryState === "notSent") {
        return { status: "replacementNotSent", previousOrderId, cancellation, error };
      }
      throw error;
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
  const expiry = normalizeOrderValidity(options.validity, options.expiry);
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
  return { type: expiry.type, value: normalizeOrderExpiryDate(expiry.value) };
}
function normalizeOrderExpiryDate(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date2 = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(date2.getTime()) && date2.toISOString().slice(0, 10) === value) return value;
  }
  if (typeof value === "string" && !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    throw new TypeError("A gtd expiry requires YYYY-MM-DD, an ISO timestamp, a Date, or a Unix timestamp in milliseconds.");
  }
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("A gtd expiry requires YYYY-MM-DD, an ISO timestamp, a Date, or a Unix timestamp in milliseconds.");
  }
  return date.toISOString().slice(0, 10);
}
function normalizeOrderValidity(validity, expiry) {
  if (validity !== void 0 && expiry !== void 0) {
    throw new TypeError("Provide either validity or expiry, not both.");
  }
  if (validity === void 0) return normalizeOrderExpiry(expiry);
  const preset = typeof validity === "string" ? validity : validity.type;
  if (preset === "day") return { type: "gfd" };
  if (preset === "goodTillCancelled") return { type: "gtc" };
  if (preset !== "month" && preset !== "year") {
    throw new TypeError('validity must be "day", "month", "year", or "goodTillCancelled".');
  }
  const referenceDate = typeof validity === "string" ? /* @__PURE__ */ new Date() : parseValidityReferenceDate(validity.referenceDate);
  referenceDate.setUTCDate(referenceDate.getUTCDate() + (preset === "month" ? 30 : 365));
  return { type: "gtd", value: referenceDate.toISOString().slice(0, 10) };
}
function parseValidityReferenceDate(value) {
  if (value === void 0) return /* @__PURE__ */ new Date();
  const date = value instanceof Date ? new Date(value.getTime()) : /^\d{4}-\d{2}-\d{2}$/.test(value) ? /* @__PURE__ */ new Date(`${value}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("validity.referenceDate must be a valid date.");
  return date;
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
var ORDER_MUTATION_STATUSES = [
  "received",
  "waiting",
  "confirmationNeeded",
  "succeeded",
  "failed"
];
function orderMutationStatus(value) {
  const status = firstStringAtPaths(value, ["status"], ["state"], ["result.status"]);
  if (!status) return void 0;
  const normalized = status.replaceAll("_", "").replaceAll("-", "").toLowerCase();
  if (normalized === "confirmationneeded") return "confirmationNeeded";
  return ORDER_MUTATION_STATUSES.find((candidate) => candidate.toLowerCase() === normalized);
}
function normalizeOrderMutationUpdate(value) {
  const status = orderMutationStatus(value);
  if (!status) throw new TradeRepublicProtocolError("Trade Republic returned an order mutation update without a known status.");
  const rawError = firstValueAtPaths(value, ["error"], ["errors"]);
  const message2 = firstStringAtPaths(value, ["message"]);
  return {
    status,
    orderId: firstStringAtPaths(value, ["orderId"], ["id"], ["order", "id"], ["order.id"]),
    message: message2,
    error: rawError === void 0 ? void 0 : normalizeOrderMutationError(rawError, message2),
    raw: value
  };
}
function normalizeOrderMutationError(value, fallbackMessage) {
  const record2 = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const rawDetails = record2.details;
  const detailsRecord = rawDetails && typeof rawDetails === "object" && !Array.isArray(rawDetails) ? rawDetails : void 0;
  const details = detailsRecord ? {
    exchangeId: firstStringAtPaths(detailsRecord, ["exchangeId"]),
    isin: firstStringAtPaths(detailsRecord, ["isin"]),
    orderId: firstStringAtPaths(detailsRecord, ["orderId"]),
    userId: firstStringAtPaths(detailsRecord, ["userId"]),
    clientProcessId: firstStringAtPaths(detailsRecord, ["clientProcessId"]),
    isNostro: typeof detailsRecord.isNostro === "boolean" ? detailsRecord.isNostro : void 0,
    raw: rawDetails
  } : void 0;
  return {
    code: firstStringAtPaths(record2, ["code"]),
    message: typeof value === "string" ? value : firstStringAtPaths(record2, ["message"]) ?? fallbackMessage,
    details,
    raw: value
  };
}
function mutationOutcomeReason(error) {
  switch (error.reason) {
    case "clientClosed":
    case "disconnect":
    case "sendFailure":
    case "sessionRefresh":
    case "timeout":
      return error.reason;
    case "connectFailure":
    case "handshakeTimeout":
      throw error;
  }
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
  const record2 = value;
  for (const key of keys) {
    const direct = record2[key];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
  }
  for (const item of Object.values(record2)) {
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
  const record2 = value;
  if ([record2.id, record2.exchangeId, record2.slug, record2.destinationId].some((candidate) => candidate === id)) return record2;
  for (const item of Object.values(record2)) {
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
  subscriptions() {
    return this.resources.query(marketSubscriptionsSpec, void 0);
  }
  entitlements(topic, options) {
    if (!topic.trim()) throw new TypeError("Market entitlement topic must not be empty.");
    if (options.exchangeIds.length === 0 || options.exchangeIds.some((exchangeId) => !exchangeId.trim())) {
      throw new TypeError("Market entitlements require at least one non-empty exchange ID.");
    }
    return this.resources.query(marketEntitlementsSpec, { topic, options });
  }
  candleQuery(options) {
    return new CandleQuery(this.resources, options);
  }
  candles(options) {
    return this.resources.query(candlesSpec, options);
  }
  candleSeries(options) {
    return this.resources.query(candleSeriesSpec, options);
  }
  availableCandleResolutions(options) {
    return this.resources.query(availableCandleResolutionsSpec, options);
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
    return this.resources.protobufStream(l2OrderBookSpec, options);
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
    return validated(
      this.validateRaw,
      "priceAlarms.notifications",
      this.raw.queryProtobufResource("priceAlarmNotifications", {}, pickTimeoutOptions(options))
    );
  }
  async create(options) {
    const { timeoutMs, isin, price } = options;
    const payload = { instrumentId: isin, targetPrice: price };
    const raw = await this.rawCreate(payload, timeoutMs === void 0 ? {} : { timeoutMs });
    return normalizePriceAlarmCreation(raw);
  }
  rawCreate(payload, options = {}) {
    return validated(this.validateRaw, "priceAlarms.create", this.raw.query({ type: "createPriceAlarm", ...payload }, pickTimeoutOptions(options)));
  }
  async cancel(id, options = {}) {
    return normalizePriceAlarmCancellation(await this.rawCancel(id, options), id);
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
  async priceForOrder(options, queryOptions = {}) {
    const instrumentId = requiredString(options.instrumentId ?? options.isin, "instrumentId");
    const exchangeId = requiredString(options.exchangeId, "exchangeId");
    const side = options.side.toLowerCase();
    if (side !== "buy" && side !== "sell") throw new TypeError('side must be "buy" or "sell".');
    const normalized = { ...options, exchangeId, side };
    const raw = await this.rawPriceForOrder(normalized, queryOptions);
    return normalizeOrderPriceQuote(raw, normalized, instrumentId);
  }
  rawPriceForOrder(options, queryOptions = {}) {
    const instrumentId = requiredString(options.instrumentId ?? options.isin, "instrumentId");
    const exchangeId = requiredString(options.exchangeId, "exchangeId");
    const side = options.side.toLowerCase();
    if (side !== "buy" && side !== "sell") throw new TypeError('side must be "buy" or "sell".');
    return validated(this.validateRaw, "trading.priceForOrder", this.raw.query({
      type: "priceForOrderV2",
      unit: options.unit?.trim() || "EUR",
      isin: instrumentId,
      exchangeId,
      side
    }, pickTimeoutOptions(queryOptions)));
  }
  async availableSize(instrumentId, secAccNo, options = {}) {
    const accountNumber = secAccNo ?? await this.resolveSecuritiesAccountNumber();
    return validated(this.validateRaw, "trading.availableSize", this.raw.query({ type: "availableSize", parameters: { instrumentId }, secAccNo: accountNumber }, pickTimeoutOptions(options)));
  }
  async orderDestinations(isin, query = {}) {
    return arrayPayload(await this.rawOrderDestinations(isin, query)).map(normalizeOrderDestination);
  }
  async homeOrderDestination(instrumentId, options = {}) {
    return normalizeOrderDestination(await this.rawHomeOrderDestination(instrumentId, options));
  }
  rawHomeOrderDestination(instrumentId, options = {}) {
    return validated(this.validateRaw, "trading.homeOrderDestination", this.raw.query({
      type: "homeInstrumentExchange",
      id: requiredString(instrumentId, "instrumentId")
    }, pickTimeoutOptions(options)));
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
  subscribe(payload, options = {}) {
    return toSubscription(this.raw.subscribeResource(payload, options));
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
    const mapperUnit = unit === "PKT" ? "PTS" : unit === "PRZ" ? "PCT" : unit;
    return this.subscribe({ type: "tape", isin, exchangeId, unit: mapperUnit });
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
  async iban() {
    return normalizeIbanInfo(await this.rawIban());
  }
  rawIban() {
    return this.request("GET", "/api/v1/customer/relationships/detailed");
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

// src/venues.ts
var VENUE_DISPLAY_NAMES = {
  TIB: "Best Price",
  LUS: "Lang & Schwarz",
  LSX: "Lang & Schwarz Exchange",
  LSXCS: "Lang & Schwarz Exchange",
  TDG: "Tradegate Exchange",
  XFRA: "Borse Frankfurt",
  XSWX: "SIX Swiss Exchange",
  SLT: "Soci\xE9t\xE9 G\xE9n\xE9rale",
  XETR: "Xetra",
  XPAR: "Euronext Paris",
  XBRU: "Euronext Brussels",
  XAMS: "Euronext Amsterdam",
  XLIS: "Euronext Lisbon",
  XOSL: "Euronext Oslo B\xF8rs",
  XNYS: "New York Stock Exchange",
  XNAS: "Nasdaq",
  XCSE: "Nasdaq Copenhagen",
  XHEL: "Nasdaq Helsinki",
  XSTO: "Nasdaq Stockholm",
  XMIL: "Borsa Italiana",
  XMAD: "Bolsa de Madrid",
  XWAR: "Warsaw Stock Exchange",
  XLON: "London Stock Exchange",
  XWBO: "Wiener B\xF6rse",
  XTSE: "Toronto Stock Exchange",
  XTSX: "TSX Venture Exchange",
  XSES: "Singapore (SGX)",
  XJPX: "Tokyo Stock Exchange",
  XASX: "Australian Securities Exchange",
  TUB: "HSBC Trinkaus & Burkhardt",
  BHS: "Tradias",
  B2C: "B2C2"
};
var MARKET_DATA_STREAM_TOPICS = {
  bidAsk: "tickerV3",
  orderBook: "L2"
};
function venueDisplayName(exchangeId) {
  const normalized = exchangeId.trim().toUpperCase();
  return VENUE_DISPLAY_NAMES[normalized] ?? exchangeId;
}
export {
  BOND_CANDLE_RESOLUTIONS,
  CANDLE_TIMEFRAME_MS,
  CandleQuery,
  DERIVATIVE_AND_CRYPTO_CANDLE_RESOLUTIONS,
  FileSessionStore,
  MARKET_DATA_STREAM_TOPICS,
  MapperRequestError,
  MemorySessionStore,
  STANDARD_CANDLE_RESOLUTIONS,
  TradeRepublicClient,
  TradeRepublicError,
  TradeRepublicHttpError,
  TradeRepublicProtocolError,
  TradeRepublicSchemaError,
  VENUE_DISPLAY_NAMES,
  candleResolutionMs,
  candleResolutionsForInstrumentType,
  classifyMapperOperation,
  collectTradeRepublicWafContext,
  collectTradeRepublicWebContext,
  redactSession,
  schemaCatalogMarkdown,
  schemaRegistry,
  validateRawResponse,
  venueDisplayName
};
//# sourceMappingURL=index.js.map