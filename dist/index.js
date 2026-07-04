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
  return [];
}
function normalizeAsset(value) {
  const record = asRecord(value);
  return {
    id: stringValue(record.id, record.instrumentId, record.isin, record.slug),
    isin: optionalString(record.isin),
    name: optionalString(record.name, record.shortName, record.title),
    type: optionalString(record.type, record.instrumentType, record.assetType),
    exchangeIds: arrayOfStrings(record.exchangeIds, record.exchanges),
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
  const amount = moneyAmount(record.amount) ?? moneyAmount(record.cashQuantity) ?? optionalNumber(record.amount, asRecord(record.amount).value, asRecord(record.cashQuantity).amount);
  const currency = moneyCurrency(record.amount) ?? moneyCurrency(record.cashQuantity) ?? optionalString(record.currency, record.currencyId, asRecord(record.amount).currency, asRecord(record.cashQuantity).currency);
  const executedAt = optionalString(record.executedAt);
  const cancelledAt = optionalString(record.cancelledAt, record.canceledAt);
  const expiredAt = optionalString(record.expiredAt);
  const rejectedAt = optionalString(record.rejectedAt);
  return {
    id: stringValue(record.id, record.orderId),
    status: optionalString(record.status, record.state) ?? inferOrderStatus(record),
    isin: optionalString(record.isin, record.instrumentId),
    instrumentId: optionalString(record.instrumentId, record.isin),
    side: optionalString(record.side, record.action),
    type: optionalString(record.type, record.mode, record.orderType),
    createdAt: optionalString(record.createdAt, record.created, record.createdTime, record.submittedAt),
    submittedAt: optionalString(record.submittedAt),
    updatedAt: optionalString(record.updatedAt),
    closedAt: optionalString(record.closedAt, executedAt, cancelledAt, expiredAt, rejectedAt),
    executedAt,
    cancelledAt,
    expiredAt,
    rejectedAt,
    quantity: optionalNumber(record.quantity, record.size, record.estimatedSize),
    amount,
    currency,
    raw: value
  };
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
  const positions = arrayPayload(value).flatMap((item) => {
    const record = asRecord(item);
    if (Array.isArray(record.positions)) return record.positions.map((position) => normalizePortfolioPosition({ ...asRecord(position), categoryType: record.categoryType }));
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
        return optionalString(record.id, record.exchangeId) ? [optionalString(record.id, record.exchangeId)] : [];
      });
      if (strings.length) return strings;
    }
  }
  return void 0;
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
    const raw = await this.http.request(
      "POST",
      this.endpoints.resolve("auth.qrChallenge"),
      stripUndefined({
        phoneNumber: options.phoneNumber,
        deviceName: options.deviceName
      }),
      void 0,
      { signal: options.signal }
    );
    return normalizeChallenge(raw);
  }
  async pollInstantLogin(challenge, options = {}) {
    const intervalMs = options.intervalMs ?? 1500;
    const timeoutMs = options.timeoutMs ?? 12e4;
    const startedAt = Date.now();
    let processId;
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
        const processSession = processState.session ?? (isAuthenticatedStatus(processStatus) ? accumulatedSession : void 0);
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
};
function normalizeChallenge(raw) {
  const record = asRecord(raw);
  const id = stringValue2(record.id, record.challengeId, record.processId);
  return {
    id,
    qrCode: optionalString2(record.qrCode, record.qrCodePayload, record.qr, record.code),
    qrCodeDataUrl: optionalString2(record.qrCodeDataUrl, record.qrDataUrl),
    deepLink: optionalString2(record.deepLink, record.loginUrl, record.url),
    expiresAt: optionalString2(record.expiresAt, record.challengeExpiresAt, record.qrCodeTokenExpiresAt, record.expiration),
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
  normalize: (raw) => arrayPayload(raw).map(normalizeL2Venue)
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

// src/endpoints.ts
var DEFAULT_ENDPOINTS = {
  "auth.qrChallenge": "/api/v2/auth/web/login/qr-challenges",
  "auth.qrStatus": "/api/v2/auth/web/login/qr-challenges/{challengeId}",
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
    const xsrfToken = session?.cookies?.["XSRF-TOKEN"];
    const headers = {
      accept: "application/json, text/plain, */*",
      "accept-language": this.options.locale,
      origin: "https://app.traderepublic.com",
      referer: "https://app.traderepublic.com/",
      "user-agent": this.options.userAgent,
      ...normalizeHeaderRecord(this.options.defaultHeaders),
      ...extra
    };
    if (hasJsonBody && !hasHeader(headers, "content-type")) headers["content-type"] = "application/json";
    if (session?.accessToken) headers.authorization = `Bearer ${session.accessToken}`;
    if (session?.sessionToken) headers["x-tr-session"] = session.sessionToken;
    if (xsrfToken && !hasHeader(headers, "x-xsrf-token")) headers["x-xsrf-token"] = decodeCookieValue(xsrfToken);
    const cookieHeader = mergeCookieHeaders(headers.cookie, session?.cookies);
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

// src/raw.ts
import EventEmitter from "eventemitter3";
import WebSocket from "ws";
var RawApi = class {
  constructor(http, websocketUrl, websocketFactory, getSession) {
    this.http = http;
    this.websocketUrl = websocketUrl;
    this.websocketFactory = websocketFactory;
    this.getSession = getSession;
  }
  http;
  websocketUrl;
  websocketFactory;
  getSession;
  request(request) {
    return this.http.request(request.method ?? "GET", request.path, request.body, request.query);
  }
  subscribe(topic, payload = {}) {
    return this.subscribeResource({ ...asObject(payload), type: topic });
  }
  subscribeLegacy(topic, payload = {}) {
    return this.openSubscription(JSON.stringify({ type: "subscribe", topic, payload, token: this.getSession()?.sessionToken }));
  }
  subscribeResource(payload) {
    return this.openSubscription(JSON.stringify({ ...payload, token: this.getSession()?.sessionToken }));
  }
  query(payload, options = {}) {
    return this.queryResource(payload, options);
  }
  async queryResource(payload, options = {}) {
    const subscription = this.subscribeResource(payload);
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
  openSubscription(subscriptionMessage) {
    const headers = this.http.headers();
    const socket = this.websocketFactory(this.websocketUrl, headers);
    const emitter = new EventEmitter();
    const messages = [];
    const waiters = [];
    let closed = false;
    let connected = false;
    let subscriptionId = 0;
    const push = (message) => {
      const waiter = waiters.shift();
      if (waiter) waiter({ done: false, value: message });
      else messages.push(message);
      emitter.emit("message", message);
    };
    const finish = () => {
      closed = true;
      while (waiters.length) waiters.shift()?.({ done: true, value: void 0 });
    };
    addListener(socket, "open", () => {
      const message = `connect 34 ${JSON.stringify(connectPayload())}`;
      logWire("send", message);
      socket.send(message);
    });
    addListener(socket, "message", (event) => {
      const message = parseSocketMessage(event);
      logWire("message", message);
      if (message === "connected") {
        connected = true;
        subscriptionId += 1;
        const subscribeMessage = `sub ${subscriptionId} ${subscriptionMessage}`;
        logWire("send", subscribeMessage);
        socket.send(subscribeMessage);
        return;
      }
      if (typeof message === "string" && (message.startsWith("echo") || message.startsWith("connected"))) return;
      if (!connected) return;
      push(message);
    });
    addListener(socket, "error", (event) => emitter.emit("error", event));
    addListener(socket, "close", finish);
    return {
      close() {
        if (subscriptionId > 0) {
          try {
            const unsubscribeMessage = `unsub ${subscriptionId}`;
            logWire("send", unsubscribeMessage);
            socket.send(unsubscribeMessage);
          } catch {
          }
        }
        finish();
        socket.close();
      },
      [Symbol.asyncIterator]() {
        return {
          next() {
            const value = messages.shift();
            if (value !== void 0) return Promise.resolve({ done: false, value });
            if (closed) return Promise.resolve({ done: true, value: void 0 });
            return new Promise((resolve) => waiters.push(resolve));
          }
        };
      }
    };
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
function addListener(socket, event, listener) {
  if (socket.addEventListener) socket.addEventListener(event, listener);
  else if (socket.on) socket.on(event, listener);
  else throw new TradeRepublicProtocolError("Unsupported WebSocket implementation.");
}
function parseSocketMessage(event) {
  const data = typeof event === "object" && event !== null && "data" in event ? event.data : event;
  const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
  const framed = parseSubscriptionFrame(text);
  if (framed) return framed.payload;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
function parseSubscriptionFrame(text) {
  const firstSpace = text.indexOf(" ");
  if (firstSpace <= 0) return void 0;
  const secondSpace = text.indexOf(" ", firstSpace + 1);
  if (secondSpace <= firstSpace) return void 0;
  const id = Number(text.slice(0, firstSpace));
  if (!Number.isFinite(id)) return void 0;
  const type = text.slice(firstSpace + 1, secondSpace);
  const rawPayload = text.slice(secondSpace + 1);
  let payload = rawPayload;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
  }
  return { id, type, payload };
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
function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function delay2(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function logWire(direction, value) {
  if (process.env.TR_SDK_LOG_WIRE !== "1") return;
  console.log(`[handelsrepublik] websocket:${direction}`, value);
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
  z.strictObject({ priceAlarmId: z.string() }),
  z.strictObject({ status: z.string().optional(), id: z.string().optional() })
]);
var watchlistMutationSchema = z.union([
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
  entry("assets.search", "Asset search", "websocket", "read", "neonSearch", normalizedArrayWrappers, { variants: ["stock", "crypto", "fund", "etf", "bond"] }),
  entry("assets.get", "Instrument detail", "websocket", "read", "instrument", jsonRecord),
  entry("derivatives.search", "Derivative search", "websocket", "read", "neonSearch type=derivative", normalizedArrayWrappers),
  entry("derivatives.listForUnderlying", "Derivatives for underlying", "websocket", "read", "derivatives", normalizedArrayWrappers),
  entry("orders.all", "Orders list", "rest", "read", "GET /web-trading-gateway/api/customer/v1/orders", normalizedArrayWrappers),
  entry("orders.mutualFunds", "Mutual fund orders", "rest", "read", "GET /api-gateway/mutual-funds/api/v1/orders", normalizedArrayWrappers),
  entry("orders.privateMarkets", "Private market orders", "rest", "read", "GET /api/v1/private-markets/orders/all", normalizedArrayWrappers),
  entry("orders.orderUpdates", "Order update stream", "websocket", "read", "orderUpdates", jsonValue, { live: { sample: "stream" } }),
  entry("portfolio.current", "Portfolio positions", "websocket", "read", "compactPortfolioByTypeV2", z.union([jsonRecord, normalizedArrayWrappers])),
  entry("portfolio.cash", "Available cash", "websocket", "read", "availableCash", z.array(availableCashItemSchema)),
  entry("portfolio.markToMarketValue", "Portfolio status", "websocket", "read", "portfolioStatus", jsonValue),
  entry("portfolio.savingsPlans", "Savings plans", "websocket", "read", "savingsPlans", normalizedArrayWrappers),
  entry("portfolio.privateMarketsPositions", "Private markets positions", "websocket", "read", "privateMarketsPositions", jsonValue),
  entry("portfolio.portfolioChart", "Portfolio chart", "rest", "read", "GET /api-gateway/portfolio-chart/v2/chart", jsonValue),
  entry("market.subscriptions", "Market subscriptions", "websocket", "read", "accountPairs", z.union([z.array(accountPairSchema), normalizedArrayWrappers])),
  entry("market.candles", "Price history candles", "websocket", "read", "aggregateHistoryLightV2", jsonValue, { variants: ["stock", "crypto"] }),
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
  entry("trading.orderDestinations", "Order destinations", "rest", "read", "GET /api-gateway/order-router/api/v2/instruments/{isin}/destinations", normalizedArrayWrappers),
  entry("trading.trades", "Trades", "rest", "read", "GET /web-trading-gateway/api/customer/v1/trades", normalizedArrayWrappers),
  entry("trading.dailyPnl", "Daily PnL", "rest", "read", "POST /web-trading-gateway/api/customer/v1/pnl/daily", jsonValue),
  entry("discovery.exchangeDetails", "Exchange details", "rest", "read", "GET /api-gateway/instrument-universe/api/v1/exchanges-details", normalizedArrayWrappers),
  entry("discovery.exchangeSchedule", "Exchange schedule", "rest", "read", "GET /api-gateway/instrument-universe/api/v1/exchanges/{exchange}/schedule", jsonRecord),
  entry("discovery.instrumentStatus", "Instrument status", "rest", "read", "GET /api-gateway/instrument-universe/api/v1/instruments/{isin}/status/{exchange}", jsonRecord),
  entry("discovery.watchlists", "Watchlists", "rest", "read", "GET /api-gateway/watchlists/api/v2/watchlists", jsonValue),
  entry("discovery.watchlists.create", "Create watchlist", "rest", "lowRiskMutation", "POST /api-gateway/watchlists/api/v2/watchlists", watchlistMutationSchema, { live: { sample: "cleanup" } }),
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
  entry("tax.taxResidencies", "Tax residencies", "rest", "read", "GET /api/v1/auth/account/change/taxresidencies", jsonValue, { live: { optionalStatuses: [404, 500] } }),
  entry("tax.taxResidencyCountries", "Tax residency countries", "rest", "read", "GET /api/v1/country/taxresidency", jsonValue),
  entry("payments.paymentMethods", "Payment methods", "rest", "read", "GET /api/v2/payment/methods", jsonValue),
  entry("payments.iban", "IBAN", "rest", "read", "GET /api/v1/auth/account/iban", z.union([jsonRecord, emptyOrErrorResponse]), { live: { optionalStatuses: [404, 500] } }),
  entry("payments.interestDetails", "Interest details", "rest", "read", "GET /api/v1/interest/details", z.union([jsonRecord, emptyOrErrorResponse]), { live: { optionalStatuses: [404, 500] } }),
  entry("blocked.orderMutations", "Order placement/change/cancel/confirm", "websocket", "blockedMutation", "simpleCreateOrder|confirmOrder|cancelOrder|changeOrder", jsonValue),
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
  lines.push("`blockedMutation` entries are documented so integration tests can assert they are not executed live.");
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

// src/traderepublic-client.ts
var DEFAULT_API_BASE_URL = "https://api.traderepublic.com";
var DEFAULT_WEBSOCKET_URL = "wss://api.traderepublic.com";
var DEFAULT_LOCALE = "en";
var DEFAULT_USER_AGENT = "handelsrepublik/0.1.0";
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
  validateRaw;
  constructor(options = {}) {
    this.session = options.session;
    this.securitiesAccountNumber = options.session?.securitiesAccountNumber;
    this.validateRaw = createRawSchemaValidator(options.rawSchemaValidation, options.onRawSchemaValidationFailure);
    this.endpoints = new EndpointResolver(options.endpoints);
    this.http = new HttpClient({
      apiBaseUrl: options.apiBaseUrl ?? DEFAULT_API_BASE_URL,
      locale: options.locale ?? DEFAULT_LOCALE,
      userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
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
      () => this.session
    );
    this.account = new AccountApi(this.http, this.endpoints, this.validateRaw);
    this.boards = new BoardsApi(this.http, this.endpoints, this.validateRaw);
    this.resources = new ResourceClient(this.http, this.endpoints, this.raw, this.validateRaw);
    this.assets = new AssetsApi(this.raw, this.validateRaw);
    this.derivatives = new DerivativesApi(this.raw, this.validateRaw);
    this.orders = new OrdersApi(this.http, this.endpoints, this.raw, this.validateRaw, () => this.securitiesAccountNumber, (value) => this.setSecuritiesAccountNumber(value));
    this.portfolio = new PortfolioApi(this.http, this.endpoints, this.raw, this.validateRaw, () => this.securitiesAccountNumber, (value) => this.setSecuritiesAccountNumber(value));
    this.market = new MarketApi(this.resources);
    this.timeline = new TimelineApi(this.raw, this.validateRaw);
    this.priceAlarms = new PriceAlarmsApi(this.raw, this.validateRaw);
    this.instruments = new InstrumentsApi(this.raw, this.validateRaw);
    this.trading = new TradingApi(this.http, this.raw, this.validateRaw, () => this.securitiesAccountNumber, (value) => this.setSecuritiesAccountNumber(value));
    this.discovery = new DiscoveryApi(this.http, this.validateRaw);
    this.documents = new DocumentsApi(this.http, this.validateRaw);
    this.tax = new TaxApi(this.http, this.validateRaw);
    this.payments = new PaymentsApi(this.http, this.validateRaw);
    this.web = new WebApi(this.http, this.raw, () => this.securitiesAccountNumber, (value) => this.setSecuritiesAccountNumber(value));
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
    this.session = structuredClone(session);
    if (session.securitiesAccountNumber) this.setSecuritiesAccountNumber(session.securitiesAccountNumber);
    else if (Object.keys(session).length === 0) this.securitiesAccountNumber = void 0;
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
      const accountNumber = await resolveSecuritiesAccountNumber(this.raw, this.securitiesAccountNumber, (value) => this.setSecuritiesAccountNumber(value), 5e3);
      return { ...session, securitiesAccountNumber: accountNumber };
    } catch {
      return session;
    }
  }
};
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
var AccountApi = class {
  constructor(http, endpoints, validateRaw) {
    this.http = http;
    this.endpoints = endpoints;
    this.validateRaw = validateRaw;
  }
  http;
  endpoints;
  validateRaw;
  current() {
    return validated(this.validateRaw, "auth.account", this.http.request("GET", this.endpoints.resolve("auth.account")));
  }
  session() {
    return validated(this.validateRaw, "auth.session", this.http.request("GET", this.endpoints.resolve("auth.session")));
  }
  accountSettings() {
    return this.current();
  }
  personalDetails() {
    return validated(this.validateRaw, "account.personalDetails", this.http.request("GET", "/api/v1/customer/personal-details"));
  }
  relationships() {
    return validated(this.validateRaw, "account.relationships", this.http.request("GET", "/api/v1/customer/relationships/detailed"));
  }
  cardsHome() {
    return validated(this.validateRaw, "account.cardsHome", this.http.request("GET", "/api/v1/card/cards/home"));
  }
};
var BoardsApi = class {
  constructor(http, endpoints, validateRaw) {
    this.http = http;
    this.endpoints = endpoints;
    this.validateRaw = validateRaw;
  }
  http;
  endpoints;
  validateRaw;
  async list() {
    const raw = await validated(this.validateRaw, "boards.list", this.http.request("GET", this.endpoints.resolve("boards.list")));
    return arrayPayload(raw).map(normalizeBoard);
  }
  async get(boardId) {
    return normalizeBoard(await validated(this.validateRaw, "boards.detail", this.http.request("GET", this.endpoints.resolve("boards.detail", { boardId }))));
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
  constructor(http, endpoints, raw, validateRaw, getSecuritiesAccountNumber, setSecuritiesAccountNumber) {
    this.http = http;
    this.endpoints = endpoints;
    this.raw = raw;
    this.validateRaw = validateRaw;
    this.getSecuritiesAccountNumber = getSecuritiesAccountNumber;
    this.setSecuritiesAccountNumber = setSecuritiesAccountNumber;
  }
  http;
  endpoints;
  raw;
  validateRaw;
  getSecuritiesAccountNumber;
  setSecuritiesAccountNumber;
  async open(options = {}) {
    const orders = await this.all(options);
    return orders.filter(isOpenOrder);
  }
  async closed(options = {}) {
    const orders = await this.all(options);
    return orders.filter((order) => !isOpenOrder(order));
  }
  async all(options = {}) {
    return arrayPayload(await this.rawAll(options)).map(normalizeOrder);
  }
  async rawAll(options = {}) {
    const { filters, secAccNo: providedSecAccNo, ...rest } = options;
    const secAccNo = providedSecAccNo ?? await resolveSecuritiesAccountNumber(this.raw, this.getSecuritiesAccountNumber?.(), this.setSecuritiesAccountNumber);
    return validated(this.validateRaw, "orders.all", this.http.request("GET", this.endpoints.resolve("orders.all"), void 0, {
      secAccNo,
      page: rest.page ?? numberString(rest.cursor) ?? 1,
      pageSize: rest.pageSize ?? rest.limit ?? 100,
      sort: rest.sort ?? "orderUpdatedAt,desc",
      instrumentId: rest.instrumentId,
      instrumentCategory: rest.instrumentCategory,
      accountType: rest.accountType,
      ...filters
    }));
  }
  async mutualFunds(options = {}) {
    return arrayPayload(await this.rawMutualFunds(options)).map(normalizeOrder);
  }
  async rawMutualFunds(options = {}) {
    const { filters, ...rest } = options;
    return validated(this.validateRaw, "orders.mutualFunds", this.http.request("GET", this.endpoints.resolve("orders.mutualFunds"), void 0, {
      openOnly: false,
      excludeQuantityNull: false,
      page: 1,
      pageSize: 100,
      ...rest,
      ...filters
    }));
  }
  async privateMarkets(options = {}) {
    return arrayPayload(await this.rawPrivateMarkets(options)).map(normalizeOrder);
  }
  async rawPrivateMarkets(options = {}) {
    const { filters, ...rest } = options;
    return validated(this.validateRaw, "orders.privateMarkets", this.http.request("GET", this.endpoints.resolve("orders.privateMarkets"), void 0, {
      sortBy: "CREATED_AT",
      sortAscending: false,
      pageNumber: 1,
      pageSize: 100,
      ...rest,
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
    const accountNumber = secAccNo ?? await resolveSecuritiesAccountNumber(this.raw, this.getSecuritiesAccountNumber?.(), this.setSecuritiesAccountNumber);
    return validated(this.validateRaw, "orders.orderUpdates", this.raw.query({
      type: "orderUpdates",
      selector: { case: "bySecAccNo", value: { accountNumber } }
    }));
  }
};
function isOpenOrder(order) {
  const status = order.status?.toUpperCase();
  return status === "OPEN" || status === "OPENED" || status === "PARTIALLYFILLED" || status === "PARTIALLY_FILLED" || status === "RECEIVED";
}
var PortfolioApi = class {
  constructor(http, endpoints, raw, validateRaw, getSecuritiesAccountNumber, setSecuritiesAccountNumber) {
    this.http = http;
    this.endpoints = endpoints;
    this.raw = raw;
    this.validateRaw = validateRaw;
    this.getSecuritiesAccountNumber = getSecuritiesAccountNumber;
    this.setSecuritiesAccountNumber = setSecuritiesAccountNumber;
  }
  http;
  endpoints;
  raw;
  validateRaw;
  getSecuritiesAccountNumber;
  setSecuritiesAccountNumber;
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
    return resolveSecuritiesAccountNumber(this.raw, this.getSecuritiesAccountNumber?.(), this.setSecuritiesAccountNumber);
  }
};
function pickTimeoutOptions(options) {
  return options.timeoutMs ? { timeoutMs: options.timeoutMs } : void 0;
}
async function resolveSecuritiesAccountNumber(raw, cached, remember, timeoutMs) {
  try {
    const accountPairs = await raw.query({ type: "accountPairs" }, timeoutMs ? { timeoutMs } : void 0);
    const accountNumber = firstStringByKey(accountPairs, "securitiesAccountNumber");
    if (accountNumber) {
      remember?.(accountNumber);
      return accountNumber;
    }
  } catch {
    if (cached) return cached;
    throw new Error("Trade Republic securities account number was not available from accountPairs.");
  }
  if (cached) return cached;
  throw new Error("Trade Republic securities account number was not available from accountPairs.");
}
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
function numberString(value) {
  if (!value) return void 0;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : void 0;
}
function neonSearchFilters(type, filters = {}) {
  return [
    { key: "type", value: type },
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
    const { timeoutMs, currency = "EUR", price, ...rest } = options;
    const payload = { ...rest, price: { value: String(price), currency } };
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
  constructor(http, raw, validateRaw, getSecuritiesAccountNumber, setSecuritiesAccountNumber) {
    this.http = http;
    this.raw = raw;
    this.validateRaw = validateRaw;
    this.getSecuritiesAccountNumber = getSecuritiesAccountNumber;
    this.setSecuritiesAccountNumber = setSecuritiesAccountNumber;
  }
  http;
  raw;
  validateRaw;
  getSecuritiesAccountNumber;
  setSecuritiesAccountNumber;
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
    return validated(this.validateRaw, "trading.orderDestinations", this.http.request("GET", `/api-gateway/order-router/api/v2/instruments/${encodeURIComponent(isin)}/destinations`, void 0, query));
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
    return resolveSecuritiesAccountNumber(this.raw, this.getSecuritiesAccountNumber?.(), this.setSecuritiesAccountNumber);
  }
};
var DiscoveryApi = class {
  constructor(http, validateRaw) {
    this.http = http;
    this.validateRaw = validateRaw;
  }
  http;
  validateRaw;
  async exchangeDetails() {
    return arrayPayload(await this.rawExchangeDetails()).map(normalizeExchangeDetails);
  }
  rawExchangeDetails() {
    return validated(this.validateRaw, "discovery.exchangeDetails", this.http.request("GET", "/api-gateway/instrument-universe/api/v1/exchanges-details", void 0, { includeMaintenanceWindow: false }));
  }
  async exchangeSchedule(exchange) {
    return normalizeExchangeSchedule(await this.rawExchangeSchedule(exchange));
  }
  rawExchangeSchedule(exchange) {
    return validated(this.validateRaw, "discovery.exchangeSchedule", this.http.request("GET", `/api-gateway/instrument-universe/api/v1/exchanges/${encodeURIComponent(exchange)}/schedule`));
  }
  async instrumentStatus(isin, exchange) {
    return normalizeInstrumentStatus(await this.rawInstrumentStatus(isin, exchange));
  }
  rawInstrumentStatus(isin, exchange) {
    return validated(this.validateRaw, "discovery.instrumentStatus", this.http.request("GET", `/api-gateway/instrument-universe/api/v1/instruments/${encodeURIComponent(isin)}/status/${encodeURIComponent(exchange)}`));
  }
  watchlists() {
    return this.rawWatchlists();
  }
  rawWatchlists() {
    return validated(this.validateRaw, "discovery.watchlists", this.http.request("GET", "/api-gateway/watchlists/api/v2/watchlists"));
  }
  createWatchlist(name) {
    return this.rawCreateWatchlist(name);
  }
  rawCreateWatchlist(name) {
    return validated(this.validateRaw, "discovery.watchlists.create", this.http.request("POST", "/api-gateway/watchlists/api/v2/watchlists", { name }));
  }
  renameWatchlist(watchlistId, name) {
    return this.rawRenameWatchlist(watchlistId, name);
  }
  rawRenameWatchlist(watchlistId, name) {
    return validated(this.validateRaw, "discovery.watchlists.rename", this.http.request("PUT", `/api-gateway/watchlists/api/v2/watchlists/${encodeURIComponent(watchlistId)}`, { name }));
  }
  deleteWatchlist(watchlistId) {
    return this.rawDeleteWatchlist(watchlistId);
  }
  rawDeleteWatchlist(watchlistId) {
    return validated(this.validateRaw, "discovery.watchlists.delete", this.http.request("DELETE", `/api-gateway/watchlists/api/v2/watchlists/${encodeURIComponent(watchlistId)}`));
  }
  addWatchlistItem(watchlistId, instrumentId, options = {}) {
    return this.rawAddWatchlistItem(watchlistId, instrumentId, options);
  }
  rawAddWatchlistItem(watchlistId, instrumentId, options = {}) {
    return validated(this.validateRaw, "discovery.watchlists.addItem", this.http.request("POST", `/api-gateway/watchlists/api/v2/watchlists/${encodeURIComponent(watchlistId)}/items`, { instrument_id: instrumentId, item_rank: -1, ...options }));
  }
  removeWatchlistItem(watchlistId, instrumentId) {
    return this.rawRemoveWatchlistItem(watchlistId, instrumentId);
  }
  rawRemoveWatchlistItem(watchlistId, instrumentId) {
    return validated(this.validateRaw, "discovery.watchlists.removeItem", this.http.request("DELETE", `/api-gateway/watchlists/api/v2/watchlists/${encodeURIComponent(watchlistId)}/items/${encodeURIComponent(instrumentId)}`));
  }
  screeners() {
    return this.rawScreeners();
  }
  rawScreeners() {
    return validated(this.validateRaw, "discovery.screeners", this.http.request("GET", "/api-gateway/screeners/api/v2/screeners"));
  }
  screenerOptions() {
    return this.rawScreenerOptions();
  }
  rawScreenerOptions() {
    return validated(this.validateRaw, "discovery.screenerOptions", this.http.request("GET", "/api-gateway/screeners/api/v2/screeners/options"));
  }
  userPreferences() {
    return this.rawUserPreferences();
  }
  rawUserPreferences() {
    return validated(this.validateRaw, "discovery.userPreferences", this.http.request("GET", "/api-gateway/pro-trading/api/v1/user-preferences"));
  }
};
var DocumentsApi = class {
  constructor(http, validateRaw) {
    this.http = http;
    this.validateRaw = validateRaw;
  }
  http;
  validateRaw;
  documents() {
    return this.rawDocuments();
  }
  rawDocuments() {
    return validated(this.validateRaw, "documents.documents", this.http.request("GET", "/api/v1/documents/all"));
  }
};
var TaxApi = class {
  constructor(http, validateRaw) {
    this.http = http;
    this.validateRaw = validateRaw;
  }
  http;
  validateRaw;
  taxInformation() {
    return this.rawTaxInformation();
  }
  rawTaxInformation() {
    return validated(this.validateRaw, "tax.taxInformation", this.http.request("GET", "/api/v1/taxes/information"));
  }
  exemptionOrder() {
    return this.rawExemptionOrder();
  }
  rawExemptionOrder() {
    return validated(this.validateRaw, "tax.exemptionOrder", this.http.request("GET", "/api/v1/taxes/exemptionorders"));
  }
  taxResidencies() {
    return this.rawTaxResidencies();
  }
  rawTaxResidencies() {
    return validated(this.validateRaw, "tax.taxResidencies", this.http.request("GET", "/api/v1/auth/account/change/taxresidencies"));
  }
  taxResidencyCountries() {
    return this.rawTaxResidencyCountries();
  }
  rawTaxResidencyCountries() {
    return validated(this.validateRaw, "tax.taxResidencyCountries", this.http.request("GET", "/api/v1/country/taxresidency"));
  }
};
var PaymentsApi = class {
  constructor(http, validateRaw) {
    this.http = http;
    this.validateRaw = validateRaw;
  }
  http;
  validateRaw;
  paymentMethods() {
    return this.rawPaymentMethods();
  }
  rawPaymentMethods() {
    return validated(this.validateRaw, "payments.paymentMethods", this.http.request("GET", "/api/v2/payment/methods"));
  }
  iban() {
    return this.rawIban();
  }
  rawIban() {
    return validated(this.validateRaw, "payments.iban", this.http.request("GET", "/api/v1/auth/account/iban"));
  }
  interestDetails() {
    return this.rawInterestDetails();
  }
  rawInterestDetails() {
    return validated(this.validateRaw, "payments.interestDetails", this.http.request("GET", "/api/v1/interest/details"));
  }
};
var WebApi = class {
  constructor(http, raw, getSecuritiesAccountNumber, setSecuritiesAccountNumber) {
    this.http = http;
    this.raw = raw;
    this.getSecuritiesAccountNumber = getSecuritiesAccountNumber;
    this.setSecuritiesAccountNumber = setSecuritiesAccountNumber;
  }
  http;
  raw;
  getSecuritiesAccountNumber;
  setSecuritiesAccountNumber;
  request(method, path, options = {}) {
    return this.http.request(method, path, options.body, options.query);
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
    const accountNumber = secAccNo ?? await resolveSecuritiesAccountNumber(this.raw, this.getSecuritiesAccountNumber?.(), this.setSecuritiesAccountNumber);
    return fn(accountNumber);
  }
};

// src/session.ts
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { dirname } from "path";
var SECRET_KEYS = /* @__PURE__ */ new Set(["accessToken", "refreshToken", "sessionToken", "cookies"]);
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
  redactSession,
  schemaCatalogMarkdown,
  schemaRegistry,
  validateRawResponse
};
//# sourceMappingURL=index.js.map