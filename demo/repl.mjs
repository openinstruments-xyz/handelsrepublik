import vm from 'node:vm';
import readline from 'node:readline';
import { inspect } from 'node:util';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import qrcodeTerminal from 'qrcode-terminal';
import { collectTradeRepublicWebContext, FileSessionStore, TradeRepublicClient } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const sessionPath = process.env.TR_SESSION_FILE || join(here, '.demo-session.json');
const configPath = process.env.TR_CONFIG_FILE || join(here, '.demo-config.json');
const legacyScratchpadConfigPath = join(here, '..', 'scratchpad', '.scratchpad-config.json');
const sessionStoreConfig = createSessionStore();
const sessionStore = sessionStoreConfig.store;
let runtimeConfig = await loadRuntimeConfig();
const EXAMPLE_ASSET_ID = 'US0378331005';
const EXAMPLE_QUERY = 'apple';
const EXAMPLE_QUOTE_EXCHANGE_ID = 'LSX';
const EXAMPLE_L2_EXCHANGE_ID = 'TIB';

const client = TradeRepublicClient.create({
  sessionStore,
  defaultHeaders: defaultHeadersFromConfig(runtimeConfig),
});
useRuntimeWebContext(runtimeConfig);
let sessionRefreshTimer = null;
let sessionRefreshInFlight = false;
let replInterface;
let replEvaluating = false;
let replPrompt = 'traderepublic> ';
let inputQueue = Promise.resolve();
let pendingOrderConfirmation = null;
let pendingCancelConfirmation = null;
const confirmationLifetimeMs = 2 * 60_000;

const helperSignatures = new Map([
  ['loginQr', 'loginQr(options?: { deviceName?: string; intervalMs?: number; timeoutMs?: number; debug?: boolean })'],
  ['restore', 'restore()'],
  ['refresh', 'refresh()'],
  ['clear', 'clear()'],
  ['session', 'session()'],
  ['account', 'account()'],
  ['cash', 'cash()'],
  ['portfolio', 'portfolio()'],
  ['positions', 'positions(secAccNo?: string, options?: { timeoutMs?: number })'],
  ['markToMarket', 'markToMarket()'],
  ['orders', 'orders(options?: { limit?: number; secAccNo?: string; cursor?: string; page?: number; pageSize?: number })'],
  ['ordersOpen', 'ordersOpen(options?: { limit?: number; secAccNo?: string })'],
  ['ordersClosed', 'ordersClosed(options?: { limit?: number; secAccNo?: string })'],
  ['buy', 'buy({ instrumentId, exchangeId?, size? | amount?, mode?: "market" | "limit" | "stopMarket", limit?, stop? }) -> preview only'],
  ['sell', 'sell({ instrumentId, exchangeId?, size? | amount?, mode?: "market" | "limit" | "stopMarket", limit?, stop? }) -> preview only'],
  ['confirmOrder', 'confirmOrder(code) -> submits the pending preview'],
  ['pendingOrder', 'pendingOrder()'],
  ['discardOrder', 'discardOrder()'],
  ['cancelOrder', 'cancelOrder(orderId) -> stages cancellation only'],
  ['confirmCancel', 'confirmCancel(code) -> executes the pending cancellation'],
  ['mutualFundOrders', 'mutualFundOrders(options?: object)'],
  ['privateMarketOrders', 'privateMarketOrders(options?: object)'],
  ['orderUpdates', 'orderUpdates(secAccNo?: string)'],
  ['secAccNo', 'secAccNo()'],
  ['assets', 'assets(query?: string, options?: { limit?: number; page?: number; type?: string; filters?: object })'],
  ['asset', 'asset(assetId?: string)'],
  ['assetList', 'assetList(options?: { cursor?: string; limit?: number; type?: string; filters?: object })'],
  ['derivatives', 'derivatives(query?: string, options?: { underlyingId?: string; direction?: "long" | "short"; limit?: number })'],
  ['derivativesFor', 'derivativesFor(underlyingId?: string, options?: { direction?: "long" | "short"; productType?: string; limit?: number })'],
  ['derivative', 'derivative(derivativeId: string)'],
  ['boards', 'boards()'],
  ['board', 'board(boardId: string)'],
  ['candles', 'candles(assetId?: string, exchangeId?: string, timeframe?: string, options?: { from?: string | Date; to?: string | Date; limit?: number })'],
  ['downloadCandles', 'downloadCandles(assetId?: string, exchangeId?: string, timeframe?: string, options?: { from?: string | Date; to?: string | Date; maxCandlesPerRequest?: number })'],
  ['marketSubscriptions', 'marketSubscriptions(options?: { assetId?: string; exchangeId?: string; type?: string })'],
  ['venues', 'venues(assetId?: string)'],
  ['quoteVenues', 'quoteVenues(assetId?: string)'],
  ['depthVenues', 'depthVenues(assetId?: string)'],
  ['quotes', 'quotes(assetId?: string, exchangeId?: string, options?: { fields?: string[] })'],
  ['quoteSearch', 'quoteSearch(query?: string, options?: { type?: string; exchangeId?: string; unit?: string })'],
  ['quoteWatch', 'quoteWatch(query?: string, options?: { type?: string; exchangeId?: string; unit?: string })'],
  ['priceSearch', 'priceSearch(query?: string, options?: { type?: string; exchangeId?: string })'],
  ['l2Venues', 'l2Venues(assetId?: string)'],
  ['l2', 'l2(assetId?: string, exchangeId?: string, options?: { depth?: number; throttleMs?: number })'],
  ['next', 'next(subscription?: AsyncIterable, options?: { timeoutMs?: number; close?: boolean })'],
  ['collect', 'collect(subscription?: AsyncIterable, count?: number, options?: { timeoutMs?: number; close?: boolean })'],
  ['watch', 'watch(subscription?: AsyncIterable, options?: { label?: string; limit?: number })'],
  ['close', 'close(subscriptionOrWatcher)'],
  ['rawQuery', 'rawQuery(payload?: object, options?: { timeoutMs?: number })'],
  ['rawSubscribe', 'rawSubscribe(topicOrPayload?: string | object, payload?: object)'],
  ['webRequest', 'webRequest(method?: string, path?: string, options?: { body?: unknown; query?: object })'],
  ['mapper', 'mapper(payload?: object, options?: { timeoutMs?: number })'],
  ['stream', 'stream(payload?: object)'],
  ['apiCatalog', 'apiCatalog()'],
  ['timeline', 'timeline(after?: string)'],
  ['timelineActions', 'timelineActions()'],
  ['timelineDetail', 'timelineDetail(id: string, kind?: "timeline" | "order" | "savingsPlan")'],
  ['savingsPlans', 'savingsPlans(secAccNo?: string)'],
  ['priceAlarms', 'priceAlarms()'],
  ['priceAlarmNotifications', 'priceAlarmNotifications()'],
  ['news', 'news(isin?: string)'],
  ['portfolioChart', 'portfolioChart(secAccNo?: string, range?: string, options?: object)'],
  ['watchlists', 'watchlists()'],
  ['screeners', 'screeners()'],
  ['screenerOptions', 'screenerOptions()'],
  ['userPreferences', 'userPreferences()'],
  ['exchangeDetails', 'exchangeDetails()'],
  ['exchangeSchedule', 'exchangeSchedule(exchange?: string)'],
  ['instrumentStatus', 'instrumentStatus(isin?: string, exchange?: string)'],
  ['orderDestinations', 'orderDestinations(isin?: string, query?: object)'],
  ['trades', 'trades(query?: object)'],
  ['dailyPnl', 'dailyPnl(items?: unknown[])'],
  ['documents', 'documents()'],
  ['personalDetails', 'personalDetails()'],
  ['relationships', 'relationships()'],
  ['cardsHome', 'cardsHome()'],
  ['accountSettings', 'accountSettings()'],
  ['paymentMethods', 'paymentMethods()'],
  ['iban', 'iban()'],
  ['taxInformation', 'taxInformation()'],
  ['exemptionOrder', 'exemptionOrder()'],
  ['taxResidencies', 'taxResidencies()'],
  ['taxResidencyCountries', 'taxResidencyCountries()'],
  ['interestDetails', 'interestDetails()'],
  ['etfDetails', 'etfDetails(isin?: string)'],
  ['etfComposition', 'etfComposition(isin?: string, after?: string)'],
  ['fundDetails', 'fundDetails(isin?: string)'],
  ['fundComposition', 'fundComposition(isin?: string, after?: string)'],
  ['cryptoDetails', 'cryptoDetails(id?: string)'],
  ['yieldToMaturity', 'yieldToMaturity(isin?: string)'],
  ['priceForOrder', 'priceForOrder(options?: { isin?: string; exchangeId?: string; side?: string; unit?: string })'],
  ['availableSize', 'availableSize(instrumentId?: string, secAccNo?: string)'],
  ['tape', 'tape(isin?: string, exchangeId?: string, unit?: string)'],
  ['tradeHistory', 'tradeHistory(isin?: string, exchangeId?: string, resolution?: string, from?: string, until?: string)'],
  ['privateMarketsPositions', 'privateMarketsPositions(secAccNo?: string)'],
  ['bondValuation', 'bondValuation(instrumentId?: string, secAccNo?: string)'],
  ['fixedSavingsValuation', 'fixedSavingsValuation(instrumentId?: string, secAccNo?: string)'],
  ['authContext', 'authContext()'],
  ['help', 'help()'],
]);

const restoredSession = await client.auth.restoreSession();
if (hasUsableSession(restoredSession)) {
  announceRestoredSession(restoredSession);
  scheduleSessionRefresh(restoredSession, { announce: false });
}

function createSessionStore() {
  return {
    kind: 'file',
    label: `file:${sessionPath}`,
    store: new FileSessionStore(sessionPath),
    async close() {
    },
  };
}

async function loginQr(options = {}) {
  await ensureLoginContext(options);

  const challenge = await client.auth.createInstantLogin({
    deviceName: options.deviceName ?? 'handelsrepublik demo repl',
  });

  const qrDetails = await resolveQrChallengeDetails(challenge);
  const displayedChallenge = {
    ...challenge,
    deepLink: challenge.deepLink ?? qrDetails.deepLink,
    expiresAt: qrDetails.expiresAt ?? challenge.expiresAt,
  };

  if (qrDetails.payload) {
    await writeConsoleLine(renderTerminalQr(qrDetails.payload));
  } else {
    throw new Error(`Trade Republic did not return a QR payload for challenge ${challenge.id}.`);
  }
  if (options.debug) {
    console.log({
      challengeId: challenge.id,
      expiresAt: displayedChallenge.expiresAt ?? null,
      deepLink: displayedChallenge.deepLink ?? null,
    });
  }

  const stopCountdown = startQrCountdown(displayedChallenge.expiresAt, qrDetails.serverTime ?? challenge.serverTime);
  try {
    const session = await client.auth.pollInstantLogin(challenge, {
      intervalMs: options.intervalMs ?? 1500,
      timeoutMs: options.timeoutMs ?? 10 * 60_000,
      debug: options.debug ?? false,
    });
    const profile = await loginProfile();
    scheduleSessionRefresh(session, {
      messagePrefix: `Logged in successfully with security account number ${profile.securitiesAccountNumber ?? 'unknown'}, name: "${profile.name ?? 'unknown'}".`,
    });
    return session;
  } finally {
    stopCountdown();
  }
}

async function ensureLoginContext(options = {}) {
  runtimeConfig = currentRuntimeConfig();
  const missingContext = missingLoginContext(runtimeConfig);
  if (missingContext.length === 0) {
    useRuntimeWebContext(runtimeConfig);
    return;
  }

  const browser = await launchBrowserForLoginContext();
  try {
    console.log(`Collecting Trade Republic web context (${missingContext.join(', ')} missing)...`);
    const webContext = await collectTradeRepublicWebContext(browser, {
      timeoutMs: options.webContextTimeoutMs ?? options.contextTimeoutMs ?? 60_000,
      settleMs: options.webContextSettleMs ?? 1_000,
    });
    client.useWebContext(webContext);
    runtimeConfig = {
      ...runtimeConfig,
      ...runtimeConfigFromWebContext(webContext),
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function launchBrowserForLoginContext() {
  const { chromium } = await import('playwright');
  try {
    return await chromium.launch({ headless: false, channel: 'chrome' });
  } catch {
    try {
      return await chromium.launch({ headless: false });
    } catch {
      return await chromium.launch({ headless: true });
    }
  }
}

async function loginProfile() {
  const securitiesAccountNumber = client.securitiesAccountNumber ?? client.getSession()?.securitiesAccountNumber;
  let account;
  try {
    account = await client.account.current();
  } catch (error) {
    printFullError(error);
  }
  return {
    securitiesAccountNumber,
    name: account ? extractDisplayName(account) : undefined,
    rawAccount: account,
  };
}

async function resolveQrChallengeDetails(challenge) {
  const inlinePayload = challenge.qrCode ?? challenge.deepLink;
  const inlineExpiresAt = firstString(challenge.expiresAt);
  if (inlinePayload) {
    return {
      payload: inlinePayload,
      deepLink: challenge.deepLink,
      expiresAt: inlineExpiresAt,
    };
  }
  if (!challenge.id) return {};
  try {
    const response = await client.web.requestDetailed('GET', `/api/v2/auth/web/login/qr-challenges/${encodeURIComponent(challenge.id)}`);
    const detail = response.body;
    if (!detail || typeof detail !== 'object') return {};
    return {
      payload: firstString(detail.qrCodePayload, detail.qrCode, detail.deepLink),
      deepLink: firstString(detail.deepLink, detail.qrCodePayload),
      // Trade Republic uses challengeExpiresAt for the QR display lifetime;
      // qrCodeTokenExpiresAt is a separate polling/token deadline.
      expiresAt: firstString(detail.challengeExpiresAt, detail.expiresAt, detail.expiration, detail.qrCodeTokenExpiresAt),
      serverTime: response.headers.get('date'),
    };
  } catch (error) {
    printFullError(error);
    return {};
  }
}

function startQrCountdown(expiresAt, serverTime) {
  if (!expiresAt) {
    console.log('QR countdown: unavailable');
    return () => {};
  }
  const expiresAtMs = calibratedExpiryMs(expiresAt, serverTime);
  if (!Number.isFinite(expiresAtMs)) {
    console.log('QR countdown: unavailable');
    return () => {};
  }

  let stopped = false;
  const render = () => {
    if (stopped) return;
    const text = formatCountdown(expiresAtMs);
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`QR countdown: ${text}`);
  };
  render();
  const timer = setInterval(render, 1000);
  timer.unref?.();

  return () => {
    stopped = true;
    clearInterval(timer);
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write('\n');
  };
}

function calibratedExpiryMs(expiresAt, serverTime) {
  const expiryMs = new Date(expiresAt).getTime();
  const serverMs = serverTime ? new Date(serverTime).getTime() : NaN;
  if (!Number.isFinite(expiryMs) || !Number.isFinite(serverMs)) return expiryMs;
  return expiryMs - (serverMs - Date.now());
}

function renderTerminalQr(payload) {
  let rendered = '';
  qrcodeTerminal.generate(payload, { small: true }, (output) => {
    rendered = output;
  });
  return rendered;
}

function writeConsoleLine(value) {
  return new Promise((resolve) => {
    process.stdout.write(`${value}\n`, resolve);
  });
}

function formatCountdown(expiresAtMs) {
  const remainingMs = expiresAtMs - Date.now();
  if (remainingMs <= 0) return 'expired';
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function restore() {
  return client.auth.restoreSession();
}

async function refresh() {
  const session = await client.auth.refreshSession({ debug: false });
  scheduleSessionRefresh(session, { messagePrefix: 'Session refreshed successfully.' });
  return session;
}

async function clear() {
  stopSessionRefresh();
  await client.auth.clearSession();
  return null;
}

function session() {
  return client.getSession() ?? null;
}

async function ensureSession() {
  await client.auth.restoreSession();
}

async function account() {
  await ensureSession();
  return client.account.current();
}

async function cash() {
  await ensureSession();
  return client.portfolio.cash();
}

async function portfolio(options = {}) {
  await ensureSession();
  return client.portfolio.current({ timeoutMs: options.timeoutMs ?? 60_000 });
}

async function positions(secAccNo, options = {}) {
  if (!secAccNo) return portfolio(options);
  await ensureSession();
  return client.portfolio.positionsForAccount(secAccNo, options);
}

async function markToMarket() {
  await ensureSession();
  return client.portfolio.markToMarketValue();
}

async function orders(options = {}) {
  await ensureSession();
  return client.orders.all(options);
}

async function ordersOpen(options = {}) {
  await ensureSession();
  return client.orders.open(options);
}

async function ordersClosed(options = {}) {
  await ensureSession();
  return client.orders.closed(options);
}

async function buy(options) {
  return stageOrder('buy', options);
}

async function sell(options) {
  return stageOrder('sell', options);
}

async function stageOrder(side, options) {
  if (!options || typeof options !== 'object') {
    throw new Error(`${side}() requires an options object with instrumentId and exactly one of size or amount.`);
  }
  await ensureSession();
  const instrumentId = cleanString(options.instrumentId ?? options.isin);
  if (!instrumentId) throw new Error(`${side}() requires instrumentId.`);
  const hasSize = options.size !== undefined;
  const hasAmount = options.amount !== undefined;
  if (hasSize === hasAmount) throw new Error(`${side}() requires exactly one of size or amount.`);
  const size = hasSize ? Number(options.size) : undefined;
  const amount = hasAmount ? Number(options.amount) : undefined;
  if (hasSize && (!Number.isFinite(size) || size <= 0)) throw new Error(`${side}() requires size greater than zero.`);
  if (hasAmount && (!Number.isFinite(amount) || amount <= 0)) throw new Error(`${side}() requires amount greater than zero.`);
  const mode = options.mode ?? 'market';
  let exchangeId = cleanString(options.exchangeId);
  if (!exchangeId) {
    const destinations = await client.trading.orderDestinations(instrumentId, { side: side.toUpperCase() });
    exchangeId = destinations.find((destination) => destinationSupportsOrder(destination, mode, side))?.id;
  }
  if (!exchangeId) throw new Error(`No order destination is available for ${instrumentId}. Pass exchangeId explicitly if Trade Republic offers one.`);
  let lastClientPrice = options.lastClientPrice;
  let quote;
  if (mode === 'market' && lastClientPrice === undefined) {
    quote = await client.market.quote(instrumentId, exchangeId);
    lastClientPrice = side === 'buy' ? quote.ask ?? quote.last : quote.bid ?? quote.last;
    if (lastClientPrice === undefined) throw new Error('No current executable price is available. The order was not staged.');
  }
  const orderOptions = {
    ...options,
    instrumentId,
    exchangeId,
    side,
    mode,
    ...(size !== undefined ? { size } : {}),
    ...(amount !== undefined ? { amount } : {}),
    ...(lastClientPrice !== undefined ? { lastClientPrice } : {}),
  };
  const preview = await client.orders.preview(orderOptions);
  const code = confirmationCode();
  pendingOrderConfirmation = {
    code,
    expiresAt: Date.now() + confirmationLifetimeMs,
    order: preview.order,
    summary: { side, instrumentId, exchangeId, size, amount, mode, quote, preview },
  };
  pendingCancelConfirmation = null;
  return {
    warning: 'PREVIEW ONLY. No order has been sent.',
    ...pendingOrderConfirmation.summary,
    confirmationCode: code,
    expiresAt: new Date(pendingOrderConfirmation.expiresAt).toISOString(),
    next: `confirmOrder("${code}")`,
  };
}

function pendingOrder() {
  if (!pendingOrderConfirmation) return null;
  if (Date.now() >= pendingOrderConfirmation.expiresAt) {
    pendingOrderConfirmation = null;
    return null;
  }
  return {
    warning: 'No order has been sent.',
    ...pendingOrderConfirmation.summary,
    confirmationCode: pendingOrderConfirmation.code,
    expiresAt: new Date(pendingOrderConfirmation.expiresAt).toISOString(),
  };
}

function discardOrder() {
  const discarded = Boolean(pendingOrderConfirmation);
  pendingOrderConfirmation = null;
  return discarded;
}

async function confirmOrder(code) {
  const pending = consumeConfirmation('order', code);
  const result = await client.orders.submit(pending.order);
  return { warning: 'ORDER WAS SUBMITTED.', ...result };
}

function cancelOrder(orderId) {
  const id = cleanString(orderId);
  if (!id) throw new Error('cancelOrder(orderId) requires an order id from ordersOpen().');
  const code = confirmationCode();
  pendingCancelConfirmation = { code, orderId: id, expiresAt: Date.now() + confirmationLifetimeMs };
  pendingOrderConfirmation = null;
  return {
    warning: 'CANCELLATION PREVIEW ONLY. The order is still active.',
    orderId: id,
    confirmationCode: code,
    expiresAt: new Date(pendingCancelConfirmation.expiresAt).toISOString(),
    next: `confirmCancel("${code}")`,
  };
}

async function confirmCancel(code) {
  const pending = consumeConfirmation('cancel', code);
  const result = await client.orders.cancel(pending.orderId);
  return { warning: 'CANCELLATION WAS SENT.', ...result };
}

function consumeConfirmation(kind, code) {
  const pending = kind === 'order' ? pendingOrderConfirmation : pendingCancelConfirmation;
  if (!pending) throw new Error(`There is no pending ${kind} confirmation.`);
  if (Date.now() >= pending.expiresAt) {
    if (kind === 'order') pendingOrderConfirmation = null;
    else pendingCancelConfirmation = null;
    throw new Error(`The ${kind} confirmation expired. Create a fresh preview.`);
  }
  if (code !== pending.code) throw new Error(`Confirmation code does not match. Nothing was sent.`);
  if (kind === 'order') pendingOrderConfirmation = null;
  else pendingCancelConfirmation = null;
  return pending;
}

function confirmationCode() {
  return randomBytes(3).toString('hex').toUpperCase();
}

function destinationSupportsOrder(destination, mode, side) {
  const modes = destination?.raw?.orderModes;
  if (Array.isArray(modes) && !modes.includes(mode)) return false;
  if (mode === 'market' && destination?.raw?.open === false) return false;
  const maintenance = destination?.raw?.maintenanceWindow;
  const now = Date.now();
  if (maintenance && now >= Number(maintenance.validFrom) && now <= Number(maintenance.validUntil)) {
    if (side === 'buy' && maintenance.buyAllowed === false) return false;
    if (side === 'sell' && maintenance.sellAllowed === false) return false;
  }
  return Boolean(destination?.id);
}

async function mutualFundOrders(options = {}) {
  await ensureSession();
  return client.orders.mutualFunds(options);
}

async function privateMarketOrders(options = {}) {
  await ensureSession();
  return client.orders.privateMarkets(options);
}

async function orderUpdates(secAccNo) {
  await ensureSession();
  if (secAccNo) return client.orders.orderUpdates(secAccNo);
  return client.raw.subscribeResource({
    type: 'orderUpdates',
    selector: { case: 'bySecAccNo', value: { accountNumber: client.securitiesAccountNumber ?? client.getSession()?.securitiesAccountNumber } },
  });
}

async function secAccNo() {
  await ensureSession();
  const accountPairs = await client.web.query({ type: 'accountPairs' });
  const accountNumber = firstStringByKey(accountPairs, 'securitiesAccountNumber');
  if (!accountNumber) throw new Error('No securitiesAccountNumber found in accountPairs.');
  return accountNumber;
}

async function assets(query, options = {}) {
  query ??= EXAMPLE_QUERY;
  await ensureSession();
  return client.assets.search(query, options);
}

async function asset(assetId) {
  assetId ??= EXAMPLE_ASSET_ID;
  await ensureSession();
  return client.assets.get(assetId);
}

async function assetList(options = {}) {
  await ensureSession();
  return client.assets.listAll(options);
}

async function derivatives(query, options = {}) {
  query ??= EXAMPLE_QUERY;
  await ensureSession();
  return client.derivatives.search(query, options);
}

async function derivativesFor(underlyingId, options = {}) {
  underlyingId ??= EXAMPLE_ASSET_ID;
  await ensureSession();
  return client.derivatives.listForUnderlying(underlyingId, options);
}

async function derivative(derivativeId) {
  derivativeId ??= EXAMPLE_ASSET_ID;
  await ensureSession();
  return client.derivatives.get(derivativeId);
}

async function boards() {
  await ensureSession();
  return client.boards.list();
}

async function board(boardId) {
  if (!boardId) {
    const items = await boards();
    return items[0] ?? null;
  }
  await ensureSession();
  return client.boards.get(boardId);
}

async function candles(assetId, exchangeId, timeframe = '1h', options = {}) {
  assetId ??= EXAMPLE_ASSET_ID;
  exchangeId ??= EXAMPLE_QUOTE_EXCHANGE_ID;
  await ensureSession();
  return client.market.candles({
    assetId,
    exchangeId,
    timeframe,
    from: options.from ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    to: options.to,
    limit: options.limit,
  });
}

async function downloadCandles(assetId, exchangeId, timeframe = '1h', options = {}) {
  assetId ??= EXAMPLE_ASSET_ID;
  exchangeId ??= EXAMPLE_QUOTE_EXCHANGE_ID;
  await ensureSession();
  return client.market.downloadCandles({
    assetId,
    exchangeId,
    timeframe,
    from: options.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    to: options.to,
    limit: options.limit,
  }, {
    maxCandlesPerRequest: options.maxCandlesPerRequest,
  });
}

async function marketSubscriptions(options = {}) {
  await ensureSession();
  return client.market.subscriptions(options);
}

async function venues(assetId = EXAMPLE_ASSET_ID) {
  await ensureSession();
  const detail = await client.assets.get(assetId);
  const exchanges = normalizeInstrumentVenues(detail.raw);
  return {
    assetId,
    primaryExchange: firstStringByKey(detail.raw, 'primaryExchange') ?? null,
    homeExchangeId: firstStringByKey(detail.raw, 'homeExchangeId') ?? firstStringByKey(detail.raw, 'homeExchange') ?? null,
    exchangeIds: exchanges.map((exchange) => exchange.exchangeId),
    exchanges,
    raw: detail.raw,
  };
}

async function quoteVenues(assetId = EXAMPLE_ASSET_ID) {
  const result = await venues(assetId);
  return result.exchanges;
}

async function depthVenues(assetId = EXAMPLE_ASSET_ID) {
  return l2Venues(assetId);
}

function quotes(assetId, exchangeId, options = {}) {
  assetId ??= EXAMPLE_ASSET_ID;
  exchangeId ??= EXAMPLE_QUOTE_EXCHANGE_ID;
  return client.market.subscribeLiveFeed({
    assetId,
    exchangeId,
    fields: options.fields,
  });
}

async function quoteSearch(query = EXAMPLE_QUERY, options = {}) {
  return quoteWatch(query, options);
}

async function quoteWatch(query = EXAMPLE_QUERY, options = {}) {
  const resolved = await resolveSearchQuoteTarget(query, options);
  const candidates = quoteSubscriptionCandidates(resolved.assetId, resolved.exchangeId, options.unit ?? 'EUR');
  const label = options.label ?? `${resolved.name} ${resolved.assetId}/${resolved.exchangeId}`;
  let closed = false;
  let activeSubscription;
  let lastPriceKey;

  logAbovePrompt(`[quote:${label}] using exchange ${resolved.exchangeId} (${resolved.exchangeSource}). Available exchanges: ${formatExchangeIds(resolved.exchanges)}`);

  const run = async () => {
    for (const candidate of candidates) {
      if (closed) return;
      activeSubscription = client.raw.subscribeResource(candidate.payload);
      try {
        const usable = await consumeQuoteStream(activeSubscription, {
          label,
          source: candidate.name,
          onPrice(quote) {
            const priceKey = `${quote.price ?? ''}:${quote.bid ?? ''}:${quote.ask ?? ''}`;
            if (priceKey === lastPriceKey) return;
            lastPriceKey = priceKey;
            logAbovePrompt(`[quote:${label}] ${JSON.stringify(quote, null, 2)}`);
          },
          isClosed: () => closed,
        });
        if (usable) return;
      } catch (error) {
        logAbovePrompt(`[quote:${label}] ${candidate.name} failed: ${formatErrorMessage(error)}`);
      } finally {
        activeSubscription?.close();
        activeSubscription = undefined;
      }
    }
    if (!closed) logAbovePrompt(`[quote:${label}] no live quote subscription worked. Try priceSearch("${query}", { exchangeId: "${resolved.exchangeId}" }) for a one-shot quote.`);
  };

  void run();
  return {
    asset: resolved.asset,
    assetId: resolved.assetId,
    exchangeId: resolved.exchangeId,
    exchangeSource: resolved.exchangeSource,
    exchanges: resolved.exchanges,
    candidates: candidates.map((candidate) => candidate.name),
    close() {
      closed = true;
      activeSubscription?.close();
    },
  };
}

function quoteSubscriptionCandidates(assetId, exchangeId, unit) {
  return [
    {
      name: 'tickerV3:selector',
      payload: {
        type: 'tickerV3',
        isin: assetId,
        exchangeId,
        unit,
        selector: {
          case: 'byInstrument',
          value: {
            instrumentId: { isin: String(assetId), exchangeId: String(exchangeId) },
            currency: unit,
          },
        },
      },
    },
    {
      name: 'tickerV3',
      payload: { type: 'tickerV3', isin: assetId, exchangeId, unit },
    },
    {
      name: 'tickerV2',
      payload: { type: 'tickerV2', isin: assetId, exchangeId, unit },
    },
    {
      name: 'ticker',
      payload: { type: 'ticker', id: `${assetId}.${exchangeId}` },
    },
    {
      name: 'tape',
      payload: { type: 'tape', isin: assetId, exchangeId, unit },
    },
  ];
}

async function consumeQuoteStream(subscription, options) {
  const iterator = subscription[Symbol.asyncIterator]();
  let sawQuote = false;
  while (!options.isClosed()) {
    const result = await Promise.race([
      iterator.next(),
      delay(5_000).then(() => ({ timedOut: true })),
    ]);
    if (result.timedOut) return sawQuote;
    if (result.done) return sawQuote;
    if (isResourceError(result.value)) {
      if (!sawQuote) return false;
      options.onPrice({
        at: new Date().toISOString(),
        source: options.source,
        error: result.value,
      });
      continue;
    }
    const quote = normalizeQuoteEvent(result.value, options.source);
    if (!quote.price && !quote.bid && !quote.ask) continue;
    sawQuote = true;
    options.onPrice(quote);
  }
  return sawQuote;
}

function isResourceError(value) {
  return Array.isArray(value?.errors) || Array.isArray(value?.raw?.errors);
}

function normalizeQuoteEvent(value, source) {
  const raw = value?.raw && typeof value.raw === 'object' ? value.raw : value;
  return {
    at: new Date().toISOString(),
    source,
    price: firstNumberByKey(raw, 'price', 'last', 'lastPrice', 'prePrice', 'openPrice'),
    bid: firstNumberByKey(raw, 'bidPrice', 'bid'),
    ask: firstNumberByKey(raw, 'askPrice', 'ask'),
    currency: firstStringByKey(raw, 'currencyOrUnit') ?? firstStringByKey(raw, 'currency') ?? firstStringByKey(raw, 'unit'),
    raw,
  };
}

function firstNumberByKey(value, ...keys) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = firstNumberByKey(item, ...keys);
      if (match !== undefined) return match;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  for (const key of keys) {
    const direct = numericValue(value[key]);
    if (direct !== undefined) return direct;
  }
  for (const item of Object.values(value)) {
    const match = firstNumberByKey(item, ...keys);
    if (match !== undefined) return match;
  }
  return undefined;
}

function numericValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  if (value && typeof value === 'object') {
    return numericValue(value.value ?? value.amount ?? value.decimal ?? value.float);
  }
  return undefined;
}

async function priceSearch(query = EXAMPLE_QUERY, options = {}) {
  const resolved = await resolveSearchQuoteTarget(query, options);
  return priceSnapshot(resolved.assetId, resolved.exchangeId, resolved);
}

async function resolveSearchQuoteTarget(query, options = {}) {
  await ensureSession();
  const searchLimit = options.limit ?? 10;
  let results = await client.assets.search(query, {
    limit: searchLimit,
    type: options.type ?? 'stock',
  });
  if (results.length === 0 && !options.type) {
    results = await client.assets.search(query, {
      limit: searchLimit,
      type: 'crypto',
    });
  }
  if (results.length === 0) throw new Error(`No Trade Republic instrument found for query: ${query}`);

  const asset = pickSearchResult(results, query);
  const assetId = asset.id;
  const venueResolution = await resolveQuoteExchangeId(assetId, asset, options.exchangeId);
  return {
    asset,
    assetId,
    exchangeId: venueResolution.exchangeId,
    exchangeSource: venueResolution.source,
    exchanges: venueResolution.exchanges,
    venueResult: venueResolution.venueResult,
    name: asset.name ?? assetId,
  };
}

function pickSearchResult(results, query) {
  const normalizedQuery = query.trim().toLowerCase();
  return results.find((item) => item.name?.toLowerCase() === normalizedQuery)
    ?? results.find((item) => item.raw?.subtitle?.toString?.().toLowerCase?.() === normalizedQuery)
    ?? results[0];
}

async function resolveQuoteExchangeId(assetId, asset, preferredExchangeId) {
  if (preferredExchangeId) {
    return { exchangeId: preferredExchangeId, source: 'explicit option', exchanges: [], venueResult: null };
  }
  const explicit = asset.exchangeIds?.[0];
  if (explicit) return { exchangeId: explicit, source: 'search result', exchanges: asset.exchangeIds ?? [explicit], venueResult: null };
  try {
    const venueResult = await venues(assetId);
    const exchangeId = venueResult.primaryExchange
      ?? venueResult.homeExchangeId
      ?? venueResult.exchangeIds[0];
    if (exchangeId) {
      return {
        exchangeId,
        source: venueResult.primaryExchange ? 'instrument primaryExchange' : venueResult.homeExchangeId ? 'instrument homeExchange' : 'instrument exchanges[0]',
        exchanges: venueResult.exchanges,
        venueResult,
      };
    }
  } catch {
  }
  return { exchangeId: EXAMPLE_QUOTE_EXCHANGE_ID, source: 'demo fallback', exchanges: [], venueResult: null };
}

async function priceSnapshot(assetId, exchangeId, resolved = {}) {
  await ensureSession();
  const [buy, sell] = await Promise.allSettled([
    client.trading.priceForOrder({ isin: assetId, exchangeId, side: 'BUY', unit: 'EUR' }),
    client.trading.priceForOrder({ isin: assetId, exchangeId, side: 'SELL', unit: 'EUR' }),
  ]);
  return {
    assetId,
    exchangeId,
    name: resolved.name ?? resolved.asset?.name,
    exchangeSource: resolved.exchangeSource,
    exchanges: resolved.exchanges,
    buy: settledValue(buy),
    sell: settledValue(sell),
    at: new Date().toISOString(),
  };
}

function formatExchangeIds(exchanges) {
  if (!Array.isArray(exchanges) || exchanges.length === 0) return 'none discovered';
  return exchanges.map((exchange) => typeof exchange === 'string' ? exchange : exchange.exchangeId).filter(Boolean).join(', ') || 'none discovered';
}

function settledValue(result) {
  if (result.status === 'fulfilled') return result.value;
  return {
    error: formatErrorMessage(result.reason),
    responseBody: result.reason?.responseBody,
  };
}

async function l2Venues(assetId) {
  assetId ??= EXAMPLE_ASSET_ID;
  await ensureSession();
  return client.market.availableL2Books(assetId);
}

function l2(assetId, exchangeId, options = {}) {
  assetId ??= EXAMPLE_ASSET_ID;
  exchangeId ??= EXAMPLE_L2_EXCHANGE_ID;
  return client.market.subscribeL2OrderBook({
    assetId,
    exchangeId,
    depth: options.depth ?? 10,
    throttleMs: options.throttleMs ?? 250,
  });
}

async function next(subscription, options = {}) {
  subscription ??= quotes();
  const [value] = await collect(subscription, 1, options);
  return value;
}

async function collect(subscription, count = 1, options = {}) {
  subscription ??= quotes();
  if (!subscription || typeof subscription[Symbol.asyncIterator] !== 'function') {
    throw new Error(`Expected a subscription/AsyncIterable. Example: await collect(quotes("${EXAMPLE_ASSET_ID}", "${EXAMPLE_QUOTE_EXCHANGE_ID}"), 5)`);
  }
  const timeoutMs = options.timeoutMs ?? 15_000;
  const closeWhenDone = options.close ?? true;
  const iterator = subscription[Symbol.asyncIterator]();
  const results = [];
  try {
    while (results.length < count) {
      const result = await Promise.race([
        iterator.next(),
        delay(timeoutMs).then(() => ({ done: true, timedOut: true })),
      ]);
      if (result.done || result.timedOut) break;
      results.push(result.value);
    }
    return results;
  } finally {
    if (closeWhenDone) close(subscription);
  }
}

function watch(subscription, options = {}) {
  subscription ??= quotes();
  if (!subscription || typeof subscription[Symbol.asyncIterator] !== 'function') {
    throw new Error(`Expected a subscription/AsyncIterable. Example: watch(quotes("${EXAMPLE_ASSET_ID}", "${EXAMPLE_QUOTE_EXCHANGE_ID}"))`);
  }
  let closed = false;
  let seen = 0;
  const label = options.label ?? 'stream';
  const limit = options.limit ?? Infinity;
  const controller = {
    close() {
      closed = true;
      close(subscription);
    },
  };
  void (async () => {
    try {
      for await (const value of subscription) {
        if (closed) break;
        seen += 1;
        logAbovePrompt(`[${label}] ${JSON.stringify(value, null, 2)}`);
        if (seen >= limit) {
          controller.close();
          break;
        }
      }
    } catch (error) {
      if (!closed) logAbovePrompt(`[${label}] error: ${formatErrorMessage(error)}`);
    }
  })();
  return controller;
}

function close(subscriptionOrWatcher) {
  if (subscriptionOrWatcher && typeof subscriptionOrWatcher.close === 'function') {
    subscriptionOrWatcher.close();
    return true;
  }
  return false;
}

async function rawQuery(payload, options = {}) {
  payload ??= { type: 'availableCash' };
  await ensureSession();
  return client.raw.query(payload, options);
}

function rawSubscribe(topicOrPayload, payload = {}) {
  topicOrPayload ??= 'tickerV3';
  if (topicOrPayload === 'tickerV3' && Object.keys(payload).length === 0) {
    payload = { isin: EXAMPLE_ASSET_ID, exchangeId: EXAMPLE_QUOTE_EXCHANGE_ID, unit: 'EUR' };
  }
  if (typeof topicOrPayload === 'string') return client.raw.subscribe(topicOrPayload, payload);
  return client.raw.subscribeResource(topicOrPayload);
}

async function webRequest(method = 'GET', path = '/api/v2/auth/account', options = {}) {
  await ensureSession();
  return client.web.request(method.toUpperCase(), path, options);
}

async function mapper(payload = { type: 'availableCash' }, options = {}) {
  await ensureSession();
  return client.web.query(payload, options);
}

function stream(payload = { type: 'tickerV3', isin: EXAMPLE_ASSET_ID, exchangeId: EXAMPLE_QUOTE_EXCHANGE_ID, unit: 'EUR' }) {
  return client.web.subscribe(payload);
}

function apiCatalog() {
  return {
    generic: {
      webRequest: 'REST: webRequest("GET", "/api/v2/auth/account", { query, body })',
      mapper: 'Mapper one-shot: mapper({ type: "availableCash" })',
      stream: 'Mapper stream: const s = stream({ type: "tickerV3", isin, exchangeId, unit: "EUR" })',
    },
    account: ['account', 'accountSettings', 'personalDetails', 'relationships', 'cardsHome', 'appUsageConsents', 'iban'],
    portfolio: ['portfolio', 'cash', 'markToMarket', 'portfolioChart', 'privateMarketsPositions', 'savingsPlans'],
    orders: ['orders', 'ordersOpen', 'ordersClosed', 'buy', 'sell', 'pendingOrder', 'confirmOrder', 'discardOrder', 'cancelOrder', 'confirmCancel', 'orderUpdates', 'orderDestinations'],
    market: ['assets', 'asset', 'venues', 'quoteVenues', 'depthVenues', 'candles', 'downloadCandles', 'quoteSearch', 'quoteWatch', 'priceSearch', 'quotes', 'l2', 'tape', 'tradeHistory'],
    instruments: ['news', 'etfDetails', 'etfComposition', 'fundDetails', 'fundComposition', 'cryptoDetails', 'yieldToMaturity', 'priceForOrder', 'availableSize'],
    discovery: ['exchangeDetails', 'exchangeSchedule', 'instrumentStatus', 'watchlists', 'screeners', 'screenerOptions', 'userPreferences'],
    documentsTaxPayments: ['documents', 'paymentMethods', 'taxInformation', 'exemptionOrder', 'taxResidencies', 'taxResidencyCountries', 'interestDetails'],
    timeline: ['timeline', 'timelineActions', 'timelineDetail'],
    priceAlarms: ['priceAlarms', 'priceAlarmNotifications'],
  };
}

async function timeline(after) {
  await ensureSession();
  return client.timeline.list(after ? { after } : {});
}

async function timelineActions() {
  await ensureSession();
  return client.timeline.actions();
}

async function timelineDetail(id, kind = 'timeline') {
  if (!id) throw new Error('timelineDetail(id, kind?) needs an id from timeline().');
  await ensureSession();
  return client.timeline.detail(id, kind);
}

async function savingsPlans(accountNumber) {
  await ensureSession();
  return client.portfolio.savingsPlans(accountNumber);
}

async function priceAlarms() {
  await ensureSession();
  return client.priceAlarms.list();
}

async function priceAlarmNotifications() {
  await ensureSession();
  return client.priceAlarms.notifications();
}

async function news(isin = EXAMPLE_ASSET_ID) {
  await ensureSession();
  return client.instruments.news(isin);
}

async function portfolioChart(accountNumber, range = '1y', options = {}) {
  await ensureSession();
  return client.portfolio.portfolioChart(accountNumber, range, options);
}

async function watchlists() {
  await ensureSession();
  return client.discovery.watchlists();
}

async function screeners() {
  await ensureSession();
  return client.discovery.screeners();
}

async function screenerOptions() {
  await ensureSession();
  return client.discovery.screenerOptions();
}

async function userPreferences() {
  await ensureSession();
  return client.discovery.userPreferences();
}

async function exchangeDetails() {
  await ensureSession();
  return client.discovery.exchangeDetails();
}

async function exchangeSchedule(exchange = EXAMPLE_L2_EXCHANGE_ID) {
  await ensureSession();
  return client.discovery.exchangeSchedule(exchange);
}

async function instrumentStatus(isin = EXAMPLE_ASSET_ID, exchange = EXAMPLE_QUOTE_EXCHANGE_ID) {
  await ensureSession();
  return client.discovery.instrumentStatus(isin, exchange);
}

async function orderDestinations(isin = EXAMPLE_ASSET_ID, query = {}) {
  await ensureSession();
  return client.trading.orderDestinations(isin, query);
}

async function trades(query = {}) {
  await ensureSession();
  return client.trading.trades(query);
}

async function dailyPnl(items = []) {
  await ensureSession();
  return client.trading.dailyPnl(items);
}

async function documents() {
  await ensureSession();
  return client.documents.documents();
}

async function personalDetails() {
  await ensureSession();
  return client.account.personalDetails();
}

async function relationships() {
  await ensureSession();
  return client.account.relationships();
}

async function cardsHome() {
  await ensureSession();
  return client.account.cardsHome();
}

async function accountSettings() {
  await ensureSession();
  return client.account.accountSettings();
}

async function appUsageConsents() {
  await ensureSession();
  return client.web.appUsageConsents();
}

async function paymentMethods() {
  await ensureSession();
  return client.payments.paymentMethods();
}

async function iban() {
  await ensureSession();
  return client.payments.iban();
}

async function taxInformation() {
  await ensureSession();
  return client.tax.taxInformation();
}

async function exemptionOrder() {
  await ensureSession();
  return client.tax.exemptionOrder();
}

async function taxResidencies() {
  await ensureSession();
  return client.tax.taxResidencies();
}

async function taxResidencyCountries() {
  await ensureSession();
  return client.tax.taxResidencyCountries();
}

async function interestDetails() {
  await ensureSession();
  return client.payments.interestDetails();
}

async function etfDetails(isin = EXAMPLE_ASSET_ID) {
  await ensureSession();
  return client.instruments.etfDetails(isin);
}

async function etfComposition(isin = EXAMPLE_ASSET_ID, after) {
  await ensureSession();
  return client.instruments.etfComposition(isin, after);
}

async function fundDetails(isin = EXAMPLE_ASSET_ID) {
  await ensureSession();
  return client.instruments.fundDetails(isin);
}

async function fundComposition(isin = EXAMPLE_ASSET_ID, after) {
  await ensureSession();
  return client.instruments.fundComposition(isin, after);
}

async function cryptoDetails(id = EXAMPLE_ASSET_ID) {
  await ensureSession();
  return client.instruments.cryptoDetails(id);
}

async function yieldToMaturity(isin = EXAMPLE_ASSET_ID) {
  await ensureSession();
  return client.instruments.yieldToMaturity(isin);
}

async function priceForOrder(options = {}) {
  await ensureSession();
  return client.trading.priceForOrder({
    isin: options.isin ?? EXAMPLE_ASSET_ID,
    exchangeId: options.exchangeId ?? EXAMPLE_QUOTE_EXCHANGE_ID,
    side: options.side ?? 'BUY',
    unit: options.unit ?? 'EUR',
  });
}

async function availableSize(instrumentId = EXAMPLE_ASSET_ID, accountNumber) {
  await ensureSession();
  return client.trading.availableSize(instrumentId, accountNumber);
}

function tape(isin = EXAMPLE_ASSET_ID, exchangeId = EXAMPLE_QUOTE_EXCHANGE_ID, unit = 'EUR') {
  return client.web.tape(isin, exchangeId, unit);
}

async function tradeHistory(
  isin = EXAMPLE_ASSET_ID,
  exchangeId = EXAMPLE_QUOTE_EXCHANGE_ID,
  resolution = '1d',
  from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  until,
) {
  await ensureSession();
  return client.web.tradeAggregateHistory(isin, exchangeId, resolution, from, until);
}

async function privateMarketsPositions(accountNumber) {
  await ensureSession();
  return client.portfolio.privateMarketsPositions(accountNumber);
}

async function bondValuation(instrumentId = EXAMPLE_ASSET_ID, accountNumber) {
  await ensureSession();
  return client.web.bondValuation(instrumentId, accountNumber);
}

async function fixedSavingsValuation(instrumentId = EXAMPLE_ASSET_ID, accountNumber) {
  await ensureSession();
  return client.web.fixedSavingsValuation(instrumentId, accountNumber);
}

function authContext() {
  const config = currentRuntimeConfig();
  return {
    configPath,
    legacyScratchpadConfigPath,
    hasAwsWafToken: Boolean(config.awsWafToken),
    hasCookie: Boolean(config.cookie),
    hasXsrfToken: Boolean(config.xsrfToken),
    hasTrAppVersion: Boolean(config.trAppVersion),
    hasTrPlatform: Boolean(config.trPlatform),
    hasTrDeviceInfo: Boolean(config.trDeviceInfo),
    hasSessionWebContext: Boolean(client.getSession()?.webContext),
    acceptLanguage: config.acceptLanguage || null,
    missingForLogin: missingLoginContext(config),
  };
}

async function loadRuntimeConfig() {
  const fileConfig = {
    ...await readJsonFile(legacyScratchpadConfigPath),
    ...await readJsonFile(configPath),
  };
  return {
    awsWafToken: cleanString(process.env.TR_AWS_WAF_TOKEN ?? fileConfig.awsWafToken),
    xsrfToken: cleanString(process.env.TR_XSRF_TOKEN ?? fileConfig.xsrfToken),
    cookie: cleanString(process.env.TR_COOKIE ?? fileConfig.cookie),
    trAppVersion: cleanString(process.env.TR_APP_VERSION ?? fileConfig.trAppVersion),
    trPlatform: cleanString(process.env.TR_PLATFORM ?? fileConfig.trPlatform),
    trDeviceInfo: cleanString(process.env.TR_DEVICE_INFO ?? fileConfig.trDeviceInfo),
    acceptLanguage: cleanString(process.env.TR_ACCEPT_LANGUAGE ?? fileConfig.acceptLanguage),
  };
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return {};
    throw error;
  }
}

function defaultHeadersFromConfig(config) {
  const headers = {};
  if (config.awsWafToken) headers['x-aws-waf-token'] = config.awsWafToken;
  if (config.xsrfToken) headers['x-xsrf-token'] = config.xsrfToken;
  if (config.cookie) headers.cookie = config.cookie;
  if (config.trAppVersion) headers['x-tr-app-version'] = config.trAppVersion;
  if (config.trPlatform) headers['x-tr-platform'] = config.trPlatform;
  if (config.trDeviceInfo) headers['x-tr-device-info'] = config.trDeviceInfo;
  if (config.acceptLanguage) headers['accept-language'] = config.acceptLanguage;
  return headers;
}

function useRuntimeWebContext(config) {
  const webContext = webContextFromRuntimeConfig(config);
  if (webContext) client.useWebContext(webContext);
}

function webContextFromRuntimeConfig(config) {
  const headers = defaultHeadersFromConfig(config);
  const cookies = parseCookieHeader(config.cookie);
  const webContext = {};
  if (Object.keys(headers).length > 0) webContext.headers = headers;
  if (Object.keys(cookies).length > 0) webContext.cookies = cookies;
  if (config.cookie) webContext.cookieHeader = config.cookie;
  if (config.awsWafToken) webContext.awsWafToken = config.awsWafToken;
  if (config.xsrfToken) webContext.xsrfToken = config.xsrfToken;
  return Object.keys(webContext).length > 0 ? webContext : undefined;
}

function runtimeConfigFromWebContext(webContext) {
  const headers = normalizeHeaderNames(webContext.headers);
  const cookies = webContext.cookies ?? {};
  return {
    awsWafToken: cleanString(webContext.awsWafToken ?? headers['x-aws-waf-token']),
    xsrfToken: cleanString(webContext.xsrfToken ?? headers['x-xsrf-token'] ?? cookies['XSRF-TOKEN']),
    cookie: cleanString(webContext.cookieHeader ?? serializeCookieRecord(cookies)),
    trAppVersion: cleanString(headers['x-tr-app-version']),
    trPlatform: cleanString(headers['x-tr-platform']),
    trDeviceInfo: cleanString(headers['x-tr-device-info']),
    acceptLanguage: cleanString(headers['accept-language']),
  };
}

function currentRuntimeConfig() {
  return mergeRuntimeConfig(
    runtimeConfig,
    runtimeConfigFromWebContext(client.getSession()?.webContext ?? {}),
  );
}

function mergeRuntimeConfig(...configs) {
  const result = {};
  for (const config of configs) {
    for (const [key, value] of Object.entries(config ?? {})) {
      if (cleanString(value)) result[key] = cleanString(value);
    }
  }
  return result;
}

function normalizeHeaderNames(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([, value]) => typeof value === 'string' && value.length > 0)
      .map(([key, value]) => [key.toLowerCase(), value]),
  );
}

function parseCookieHeader(cookieHeader) {
  const cookies = {};
  for (const part of (cookieHeader ?? '').split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    cookies[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return cookies;
}

function serializeCookieRecord(cookies) {
  return Object.entries(cookies ?? {})
    .filter(([, value]) => typeof value === 'string' && value.length > 0)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

function missingLoginContext(config) {
  const missing = [];
  if (!config.awsWafToken) missing.push('TR_AWS_WAF_TOKEN');
  if (!config.cookie) missing.push('TR_COOKIE');
  if (!config.trAppVersion) missing.push('TR_APP_VERSION');
  if (!config.trPlatform) missing.push('TR_PLATFORM');
  if (!config.trDeviceInfo) missing.push('TR_DEVICE_INFO');
  return missing;
}

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function extractDisplayName(value) {
  const direct = firstStringByKey(value, 'displayName')
    ?? firstStringByKey(value, 'fullName')
    ?? fullNameFromNameObject(firstObjectByKey(value, 'name'))
    ?? joinNameParts(firstStringByKey(value, 'firstName'), firstStringByKey(value, 'lastName'))
    ?? firstStringByKey(value, 'name');
  return direct?.trim() || undefined;
}

function fullNameFromNameObject(value) {
  if (!value || typeof value !== 'object') return undefined;
  const record = value;
  return firstString(record.fullName, record.displayName)
    ?? joinNameParts(firstString(record.firstName, record.givenName), firstString(record.lastName, record.familyName))
    ?? firstString(record.name);
}

function joinNameParts(...parts) {
  const name = parts.filter((part) => typeof part === 'string' && part.trim()).join(' ').trim();
  return name || undefined;
}

function firstStringByKey(value, key) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = firstStringByKey(item, key);
      if (match) return match;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value;
  const direct = record[key];
  if (typeof direct === 'string' && direct.length > 0) return direct;
  for (const item of Object.values(record)) {
    const match = firstStringByKey(item, key);
    if (match) return match;
  }
  return undefined;
}

function firstObjectByKey(value, key) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = firstObjectByKey(item, key);
      if (match) return match;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value;
  const direct = record[key];
  if (direct && typeof direct === 'object') return direct;
  for (const item of Object.values(record)) {
    const match = firstObjectByKey(item, key);
    if (match) return match;
  }
  return undefined;
}

function normalizeInstrumentVenues(raw) {
  const record = raw && typeof raw === 'object' ? raw : {};
  const directExchanges = Array.isArray(record.exchanges)
    ? record.exchanges
    : record.exchanges && typeof record.exchanges === 'object'
      ? Object.entries(record.exchanges).map(([exchangeId, value]) => ({ exchangeId, ...objectValue(value) }))
      : [];
  const primaryExchange = objectValue(record.primaryExchange);
  const combined = [
    ...directExchanges,
    Object.keys(primaryExchange).length > 0 ? { ...primaryExchange, isPrimary: true } : undefined,
  ].filter(Boolean);
  const seen = new Set();
  return combined.flatMap((exchange) => {
    const exchangeRecord = objectValue(exchange);
    const exchangeId = firstString(exchangeRecord.exchangeId, exchangeRecord.id, exchangeRecord.slug, exchangeRecord.exchange);
    if (!exchangeId || seen.has(exchangeId)) return [];
    seen.add(exchangeId);
    return [{
      exchangeId,
      name: firstString(exchangeRecord.name, exchangeRecord.nameAtExchange, exchangeRecord.title) ?? null,
      symbol: firstString(exchangeRecord.symbol, exchangeRecord.symbolAtExchange) ?? null,
      active: typeof exchangeRecord.active === 'boolean' ? exchangeRecord.active : null,
      isPrimary: Boolean(exchangeRecord.isPrimary),
      hasFractionalTrading: exchangeRecord.fractionalTrading != null,
      hasDmaTrading: exchangeRecord.dmaTrading != null,
      raw: exchangeRecord,
    }];
  });
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function help() {
  return {
    client: 'TradeRepublicClient instance',
    tr: 'Alias for client',
    loginQr: 'loginQr() requests a QR code and waits for approval in the Trade Republic app',
    restore: 'restore()',
    refresh: 'refresh()',
    clear: 'await clear()',
    session: 'session() returns the raw session',
    authContext: 'authContext() shows which web headers/cookies are loaded',
    cash: 'cash()',
    portfolio: 'portfolio(options?: { timeoutMs?: number })',
    orders: 'orders({ limit: 25 })',
    orderEntry: `buy({ instrumentId: "${EXAMPLE_ASSET_ID}", size: 1 }) and sell(...) only create a fee preview. A separate confirmOrder(code) call is required to submit.`,
    assets: `assets() -> assets("${EXAMPLE_QUERY}", { limit: 20 }); asset() -> asset("${EXAMPLE_ASSET_ID}")`,
    derivatives: `derivatives() -> derivatives("${EXAMPLE_QUERY}"); derivativesFor() -> derivativesFor("${EXAMPLE_ASSET_ID}")`,
    candles: `candles() -> candles("${EXAMPLE_ASSET_ID}", "${EXAMPLE_QUOTE_EXCHANGE_ID}", "1h", { from: last 7 days })`,
    venues: `venues() lists all known Apple venues; quoteVenues() lists quote venues; depthVenues() lists L2/depth venues`,
    quotes: `quoteSearch("bitcoin") / quoteWatch("bitcoin") searches and logs live price changes with timestamps. priceSearch("bitcoin") returns one current buy/sell snapshot.`,
    l2: `const book = l2() -> live order-book depth stream for Apple/${EXAMPLE_L2_EXCHANGE_ID}`,
    streamHelpers: 'Streams do not print by themselves. Use next(q) for one update, collect(q, 5) for five, watch(q) for continuous logging, close(q) to stop.',
    raw: 'rawQuery() -> availableCash; rawSubscribe() is a low-level mapper stream helper.',
    web: 'apiCatalog() lists broad web-app wrappers; webRequest(), mapper(), stream() are generic escape hatches.',
    sessionStore: sessionStoreConfig.label,
    sessionPath,
  };
}

const replContext = vm.createContext({
  console,
  process,
  Buffer,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  URL,
  Date,
});

Object.assign(replContext, {
  client,
  tr: client,
  sessionStore,
  sessionStoreInfo: sessionStoreConfig,
  sessionPath,
  loginQr,
  restore,
  refresh,
  clear,
  session,
  account,
  cash,
  portfolio,
  positions,
  markToMarket,
  orders,
  ordersOpen,
  ordersClosed,
  buy,
  sell,
  confirmOrder,
  pendingOrder,
  discardOrder,
  cancelOrder,
  confirmCancel,
  mutualFundOrders,
  privateMarketOrders,
  orderUpdates,
  secAccNo,
  assets,
  asset,
  assetList,
  derivatives,
  derivativesFor,
  derivative,
  boards,
  board,
  candles,
  downloadCandles,
  marketSubscriptions,
  venues,
  quoteVenues,
  depthVenues,
  quotes,
  quoteSearch,
  quoteWatch,
  priceSearch,
  l2Venues,
  l2,
  next,
  collect,
  watch,
  close,
  rawQuery,
  rawSubscribe,
  webRequest,
  mapper,
  stream,
  apiCatalog,
  timeline,
  timelineActions,
  timelineDetail,
  savingsPlans,
  priceAlarms,
  priceAlarmNotifications,
  news,
  portfolioChart,
  watchlists,
  screeners,
  screenerOptions,
  userPreferences,
  exchangeDetails,
  exchangeSchedule,
  instrumentStatus,
  orderDestinations,
  trades,
  dailyPnl,
  documents,
  personalDetails,
  relationships,
  cardsHome,
  accountSettings,
  appUsageConsents,
  paymentMethods,
  iban,
  taxInformation,
  exemptionOrder,
  taxResidencies,
  taxResidencyCountries,
  interestDetails,
  etfDetails,
  etfComposition,
  fundDetails,
  fundComposition,
  cryptoDetails,
  yieldToMaturity,
  priceForOrder,
  availableSize,
  tape,
  tradeHistory,
  privateMarketsPositions,
  bondValuation,
  fixedSavingsValuation,
  authContext,
  help,
});

replInterface = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: replPrompt,
  completer: completeInput,
  historySize: 1000,
});

replInterface.on('line', (line) => {
  inputQueue = inputQueue
    .then(() => handleInputLine(line))
    .catch((error) => {
      printFullError(error);
      console.error(error);
    });
});

replInterface.on('SIGINT', () => {
  if (replPrompt !== 'traderepublic> ') {
    inputBuffer = '';
    setPrompt('traderepublic> ');
    replInterface.prompt();
    return;
  }
  replInterface.close();
});

replInterface.on('close', () => {
  stopSessionRefresh();
  void inputQueue.finally(() => sessionStoreConfig.close()).finally(() => process.exit(0));
});

let inputBuffer = '';
console.log(replWriter(help()));
replInterface.prompt();

async function handleInputLine(line) {
  const trimmedLine = line.trim();
  if (!inputBuffer && (trimmedLine === '.exit' || trimmedLine === 'exit' || trimmedLine === 'quit')) {
    replInterface.close();
    return;
  }

  const source = inputBuffer ? `${inputBuffer}\n${line}` : line;
  if (!source.trim()) {
    inputBuffer = '';
    setPrompt('traderepublic> ');
    replInterface.prompt();
    return;
  }

  if (!isCompleteInput(source)) {
    inputBuffer = source;
    setPrompt('............> ');
    replInterface.prompt();
    return;
  }

  inputBuffer = '';
  setPrompt('traderepublic> ');
  replEvaluating = true;
  try {
    const result = await evaluateCommand(source.trim(), replContext);
    if (result !== undefined) console.log(replWriter(result));
  } catch (error) {
    printFullError(error);
    console.error(error);
  } finally {
    replEvaluating = false;
    replInterface.prompt();
  }
}

function setPrompt(prompt) {
  replPrompt = prompt;
  replInterface.setPrompt(prompt);
}

async function evaluateCommand(source, context) {
  try {
    return await vm.runInContext(`(async () => (${source}))()`, context);
  } catch (error) {
    if (!isSyntaxError(error)) throw error;
    try {
      return vm.runInContext(source, context);
    } catch (statementError) {
      if (!isSyntaxError(statementError)) throw statementError;
      return await vm.runInContext(`(async () => { ${source} })()`, context);
    }
  }
}

function printFullError(error) {
  if (!error || typeof error !== 'object') return;
  if ('responseBody' in error) {
    console.error('Full responseBody:');
    console.error(JSON.stringify(error.responseBody, null, 2));
  }
}

function isSyntaxError(error) {
  return error instanceof SyntaxError || error?.name === 'SyntaxError';
}

function isCompleteInput(source) {
  const trimmed = source.trim();
  if (!trimmed) return true;
  try {
    parse(trimmed, { ecmaVersion: 'latest', allowAwaitOutsideFunction: true });
    return true;
  } catch (error) {
    if (!error || typeof error !== 'object') return true;
    const position = typeof error.pos === 'number' ? error.pos : undefined;
    return position === undefined || position < trimmed.length - 1;
  }
}

function replWriter(value) {
  return inspect(value, {
    colors: true,
    depth: null,
    maxArrayLength: null,
    maxStringLength: null,
    breakLength: 120,
    compact: false,
    sorted: false,
  });
}

function completeInput(line) {
  const match = line.match(/(?:^|[^\w$])([\w$]*)$/);
  if (!match) return [[], line];

  const token = match[1] ?? '';
  const helperMatches = [...helperSignatures.keys()]
    .filter((name) => name.startsWith(token))
    .map((name) => `${name}()`);

  return [helperMatches, token];
}

function scheduleSessionRefresh(session, options = {}) {
  stopSessionRefresh();
  if (!hasUsableSession(session)) return;

  const delayMs = nextSessionRefreshDelayMs(session);
  const nextRefreshAt = new Date(Date.now() + delayMs);
  if (options.announce !== false) {
    logAbovePrompt(`${options.messagePrefix ?? 'Session active.'} We will now poll next time at ${formatClockTime(nextRefreshAt)} (in ${formatDuration(delayMs)}).`);
  }

  sessionRefreshTimer = setTimeout(() => {
    sessionRefreshTimer = null;
    void runScheduledSessionRefresh();
  }, delayMs);
  sessionRefreshTimer.unref?.();
}

function announceRestoredSession(session) {
  const expiresAtMs = sessionExpiryMs(session);
  const delayMs = nextSessionRefreshDelayMs(session);
  const nextRefreshAt = new Date(Date.now() + delayMs);
  const validFor = expiresAtMs
    ? formatDuration(Math.max(0, expiresAtMs - Date.now()))
    : 'unknown';
  console.log(`Found existing session. Checking how long it is still valid: ${validFor}. We will poll next time at ${formatClockTime(nextRefreshAt)} (in ${formatDuration(delayMs)}).`);
}

function stopSessionRefresh() {
  if (!sessionRefreshTimer) return;
  clearTimeout(sessionRefreshTimer);
  sessionRefreshTimer = null;
}

async function runScheduledSessionRefresh() {
  if (sessionRefreshInFlight) return;
  sessionRefreshInFlight = true;
  try {
    await client.auth.restoreSession();
    const refreshedSession = await client.auth.refreshSession({ debug: false });
    await client.portfolio.cash();
    scheduleSessionRefresh(refreshedSession, { messagePrefix: 'Session refreshed successfully.' });
  } catch (error) {
    printFullError(error);
    const retryMs = 30_000;
    logAbovePrompt(`Session refresh failed: ${formatErrorMessage(error)}. We will retry at ${formatClockTime(new Date(Date.now() + retryMs))} (in ${formatDuration(retryMs)}).`);
    sessionRefreshTimer = setTimeout(() => {
      sessionRefreshTimer = null;
      void runScheduledSessionRefresh();
    }, retryMs);
    sessionRefreshTimer.unref?.();
  } finally {
    sessionRefreshInFlight = false;
  }
}

function nextSessionRefreshDelayMs(session) {
  const expiresAtMs = sessionExpiryMs(session);
  if (!expiresAtMs || !Number.isFinite(expiresAtMs)) return 2 * 60_000;
  const refreshAtMs = expiresAtMs - 60_000;
  return Math.max(1_000, refreshAtMs - Date.now());
}

function sessionExpiryMs(session) {
  const claims = decodeClaimsCookie(session?.cookies?.tr_claims);
  const expiresAtMs = typeof claims?.exp === 'number' ? claims.exp * 1000 : undefined;
  return expiresAtMs && Number.isFinite(expiresAtMs) ? expiresAtMs : undefined;
}

function decodeClaimsCookie(value) {
  if (!value) return undefined;
  try {
    const tokenPart = value.includes('.') ? value.split('.')[1] : value;
    if (!tokenPart) return undefined;
    const normalized = tokenPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return undefined;
  }
}

function hasUsableSession(session) {
  if (!session) return false;
  const cookieNames = Object.keys(session.cookies ?? {}).filter((name) => !isContextOnlyCookie(name));
  return Boolean(session.accessToken || session.sessionToken || session.refreshToken || cookieNames.length);
}

function isContextOnlyCookie(name) {
  const lower = name.toLowerCase();
  return lower === 'jsessionid' || lower === 'xsrftoken' || lower === 'xsrf-token' || lower.includes('waf');
}

function logAbovePrompt(message) {
  if (!replInterface || replEvaluating) {
    console.log(message);
    return;
  }
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(`${message}\n`);
  replInterface.prompt(true);
}

function formatClockTime(date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m${String(seconds).padStart(2, '0')}s`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
