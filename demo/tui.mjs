import blessed from 'blessed';
import qrcodeTerminal from 'qrcode-terminal';
import jsQR from 'jsqr';
import { chromium } from 'playwright';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import { PNG } from 'pngjs';
import { FileSessionStore, TradeRepublicClient, collectTradeRepublicWebContext } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const sessionPath = process.env.TR_SESSION_FILE || join(here, '.demo-session.json');
const defaultInstrumentQuery = cleanString(process.env.TR_TUI_INSTRUMENT) || 'AAPL';
const deviceName = cleanString(process.env.TR_DEVICE_NAME) || 'handelsrepublik tui demo';
const loginPhoneNumber = cleanString(process.env.TR_PHONE_NUMBER);
const loginPin = cleanString(process.env.TR_PIN);
const wafLoadingFrames = ['Collecting WAF.', 'Collecting WAF..', 'Collecting WAF...'];
const qrRefreshSkewMs = 2_000;
const minQrDisplayMs = 4_000;
const nearExpiredQrRetryMs = 500;

const screen = blessed.screen({
  smartCSR: true,
  dockBorders: true,
  cursor: false,
  title: 'handelsrepublik tui',
});

screen.program.hideCursor();
screen.enableMouse();

const sessionStore = new FileSessionStore(sessionPath);

const state = {
  phase: 'booting',
  status: 'Booting browser in the background and collecting the WAF token.',
  error: '',
  client: undefined,
  browser: undefined,
  webContext: undefined,
  session: undefined,
  login: {
    challenge: undefined,
    qrText: '',
    expiresAt: undefined,
    refreshAt: undefined,
    countdown: '',
    error: '',
    pollAbort: undefined,
    expiryTimer: undefined,
    retryTimer: undefined,
    requestInFlight: false,
    serial: 0,
    active: false,
  },
  dashboard: {
    instrumentQuery: defaultInstrumentQuery,
    instrument: undefined,
    watchlists: [],
    watchlistIndex: 0,
    account: undefined,
    cash: undefined,
    portfolio: undefined,
    quote: undefined,
    trades: [],
    orderBook: undefined,
    venueId: undefined,
    venueName: undefined,
    loading: {
      account: false,
      watchlists: false,
      instrument: false,
      quote: false,
      trades: false,
      book: false,
    },
    timers: [],
    domSubscription: undefined,
  },
  search: {
    visible: false,
    query: '',
    results: [],
    selected: 0,
    loading: false,
    error: '',
  },
};

const statusBox = blessed.box({
  parent: screen,
  top: 0,
  left: 0,
  width: '100%',
  height: 3,
  border: 'line',
  style: {
    border: { fg: 'cyan' },
    fg: 'white',
  },
  tags: true,
  padding: { left: 1, right: 1 },
  content: '',
});

const loginBox = blessed.box({
  parent: screen,
  top: 3,
  left: 0,
  width: '100%',
  bottom: 3,
  hidden: true,
  border: 'line',
  label: ' Login ',
  style: {
    border: { fg: 'magenta' },
    fg: 'white',
  },
  tags: true,
  padding: { left: 1, right: 1, top: 1, bottom: 1 },
  scrollable: true,
  alwaysScroll: true,
  keys: true,
  mouse: true,
  vi: true,
  wrap: true,
  content: '',
});

const watchlistBox = panel('Watchlist');
const instrumentBox = panel('Current Instrument');
const accountBox = panel('Account');
const quoteBox = panel('Quotes');
const tradesBox = panel('Past Trades');
const domBox = panel('DOM');
const keysBox = panel('Keybinds');

const dashboardBoxes = [watchlistBox, instrumentBox, accountBox, quoteBox, tradesBox, domBox];

const searchOverlay = blessed.box({
  parent: screen,
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  hidden: true,
  border: 'line',
  label: ' Search ',
  style: {
    border: { fg: 'yellow' },
    fg: 'white',
  },
  tags: true,
  padding: { left: 1, right: 1, top: 1, bottom: 1 },
});

const searchHeading = blessed.text({
  parent: searchOverlay,
  top: 0,
  left: 2,
  right: 2,
  height: 1,
  content: 'Type a query and press Enter, then select a result with Enter again.',
  style: {
    fg: 'white',
  },
});

const searchInput = blessed.textbox({
  parent: searchOverlay,
  top: 2,
  left: 2,
  right: 2,
  height: 3,
  border: 'line',
  label: ' Query ',
  inputOnFocus: true,
  keys: true,
  mouse: true,
  vi: true,
  style: {
    border: { fg: 'yellow' },
    focus: { border: { fg: 'green' } },
  },
});

const searchResults = blessed.list({
  parent: searchOverlay,
  top: 6,
  left: 2,
  right: 2,
  bottom: 1,
  border: 'line',
  label: ' Results ',
  keys: true,
  mouse: true,
  vi: true,
  scrollable: true,
  alwaysScroll: true,
  style: {
    border: { fg: 'yellow' },
    selected: { bg: 'blue', fg: 'white' },
    item: { fg: 'white' },
  },
  items: [],
});

screen.append(statusBox);
screen.append(loginBox);
screen.append(searchOverlay);
screen.append(watchlistBox);
screen.append(instrumentBox);
screen.append(accountBox);
screen.append(quoteBox);
screen.append(tradesBox);
screen.append(domBox);
screen.append(keysBox);

screen.key(['C-c'], () => {
  void shutdown();
});

screen.key(['escape'], () => {
  if (state.search.visible) closeSearch();
});

screen.key(['q'], () => {
  if (state.search.visible) closeSearch();
});

screen.key(['/', 's'], () => {
  if (state.phase !== 'dashboard') return;
  openSearch();
});

screen.key(['r'], () => {
  if (state.phase === 'dashboard') void refreshDashboard(true);
});

screen.key(['l'], () => {
  if (state.phase === 'dashboard') void relogin();
});

screen.key(['['], () => {
  if (state.phase === 'dashboard') cycleWatchlist(-1);
});

screen.key([']'], () => {
  if (state.phase === 'dashboard') cycleWatchlist(1);
});

screen.key(['enter'], () => {
  if (state.phase === 'login' && !state.search.visible) void startLogin('manual');
});

searchInput.on('submit', async (value) => {
  const query = cleanString(value);
  state.search.query = query;
  if (!query) {
    state.search.error = 'Search query is empty.';
    render();
    searchInput.focus();
    return;
  }

  state.search.loading = true;
  state.search.error = '';
  state.search.results = [];
  searchResults.setItems(['Searching...']);
  render();

  try {
    const results = await state.client.assets.search(query, { limit: 12 });
    state.search.results = results;
    state.search.selected = 0;
    searchResults.setItems(results.length > 0
      ? results.map((item, index) => formatSearchResult(item, index))
      : ['No results.']);
    if (results.length > 0) searchResults.select(0);
  } catch (error) {
    state.search.error = formatError(error);
    state.search.results = [];
    searchResults.setItems([`Search failed: ${state.search.error}`]);
  } finally {
    state.search.loading = false;
    render();
    searchResults.focus();
  }
});

searchResults.on('select', async (_, index) => {
  const result = state.search.results[index];
  if (!result) return;
  closeSearch();
  await setInstrument(result, { query: state.search.query || result.name || result.id });
});

searchResults.on('keypress', (ch, key) => {
  if (key.name === 'escape') closeSearch();
});

searchInput.on('keypress', (ch, key) => {
  if (key.name === 'escape') closeSearch();
});

loginBox.key(['escape'], () => {
  if (state.phase === 'login') void startLogin('manual');
});

screen.on('resize', () => {
  layout();
  render();
});

setInterval(() => {
  if (state.phase !== 'login') return;
  const countdownTargetMs = parseDateMs(state.login.refreshAt) || parseDateMs(state.login.expiresAt);
  if (!countdownTargetMs) return;
  state.login.countdown = formatCountdown(countdownTargetMs);
  render();
}, 1000).unref?.();

process.on('uncaughtException', (error) => {
  state.error = formatError(error);
  state.status = 'Fatal error.';
  render();
  void shutdown(1);
});

process.on('unhandledRejection', (reason) => {
  state.error = formatError(reason);
  state.status = 'Unhandled rejection.';
  render();
  void shutdown(1);
});

await boot();

async function boot() {
  try {
    layout();
    render();
    state.browser = await launchBrowser();
    const stopWafLoading = startWafLoading();
    try {
      state.webContext = await collectTradeRepublicWebContext(state.browser, {
        timeoutMs: 20_000,
        settleMs: 0,
      });
    } finally {
      stopWafLoading();
    }
    await state.browser.close().catch(() => undefined);
    state.browser = undefined;

    state.client = TradeRepublicClient.create({
      webContext: state.webContext,
      sessionStore,
    });

    await state.client.auth.restoreSession();
    const restored = state.client.getSession();
    if (hasUsableSession(restored)) {
      state.status = 'Restored a saved session. Validating it before loading the dashboard.';
      render();
      const refreshed = await validateRestoredSession();
      if (refreshed) {
        state.session = refreshed;
        state.status = 'Restored a saved session. Loading the dashboard.';
        render();
        await enterDashboard();
        return;
      }
    }

    state.status = hasPinLoginConfig()
      ? 'WAF token is ready. Starting phone and PIN login.'
      : 'WAF token is ready. Requesting a QR login challenge.';
    state.phase = 'login';
    showLogin();
    render();
    await startLogin('initial');
  } catch (error) {
    state.phase = 'error';
    state.error = formatError(error);
    state.status = 'Startup failed.';
    render();
  } finally {
    if (state.browser) {
      await state.browser.close().catch(() => undefined);
      state.browser = undefined;
    }
  }
}

async function launchBrowser() {
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

function startWafLoading() {
  let index = 0;
  const tick = () => {
    state.status = wafLoadingFrames[index % wafLoadingFrames.length];
    index += 1;
    render();
  };
  tick();
  const timer = setInterval(tick, 500);
  timer.unref?.();
  return () => clearInterval(timer);
}

async function startLogin(reason) {
  if (hasPinLoginConfig()) {
    await loginWithPin(reason);
    return;
  }

  await requestFreshQr(reason);
}

async function validateRestoredSession() {
  if (!state.client) return undefined;
  try {
    return await state.client.auth.refreshSession();
  } catch (error) {
    await discardSavedSession();
    state.login.error = `Saved session is no longer valid. Please log in again. ${formatError(error)}`;
    state.status = 'Saved session expired. Starting login.';
    render();
    return undefined;
  }
}

async function discardSavedSession() {
  if (!state.client) return;
  await state.client.auth.clearSession().catch(() => undefined);
  if (state.webContext) state.client.useWebContext(state.webContext);
  state.session = undefined;
}

async function handleUnauthorized(error) {
  if (!isUnauthorizedError(error) || state.phase !== 'dashboard') return false;
  state.status = 'Session expired. Starting login.';
  state.login.error = `Session expired. Please log in again. ${formatError(error)}`;
  await relogin();
  return true;
}

async function loginWithPin(reason) {
  if (!state.client) return;
  const previousAbort = state.login.pollAbort;
  previousAbort?.abort();
  clearTimeout(state.login.expiryTimer);
  state.login.expiryTimer = undefined;
  state.login.pollAbort = undefined;
  state.login.active = false;
  state.login.error = '';
  state.login.qrText = '';
  state.login.expiresAt = undefined;
  state.login.refreshAt = undefined;
  state.login.countdown = '';
  state.login.challenge = undefined;

  try {
    state.status = reason === 'manual'
      ? 'Restarting phone and PIN login. Confirm in the Trade Republic app if prompted.'
      : 'Starting phone and PIN login. Confirm in the Trade Republic app if prompted.';
    render();
    const session = await state.client.auth.loginWithPin({
      phoneNumber: loginPhoneNumber,
      pin: loginPin,
      intervalMs: 1_500,
      timeoutMs: 10 * 60_000,
    });
    state.session = session;
    state.status = 'Logged in. Loading the dashboard.';
    render();
    await enterDashboard();
  } catch (error) {
    state.login.error = formatError(error);
    state.status = 'Phone and PIN login failed.';
    render();
  }
}

async function requestFreshQr(reason) {
  if (!state.client) return;
  if (state.login.requestInFlight) return;
  state.login.requestInFlight = true;
  clearTimeout(state.login.retryTimer);
  state.login.retryTimer = undefined;
  state.login.error = '';

  try {
    state.status = reason === 'manual'
      ? 'Fresh QR requested.'
      : reason === 'refresh'
        ? 'Refreshing QR.'
        : 'Requesting a QR login challenge.';
    render();

    const challenge = await state.client.auth.createInstantLogin({
      ...(loginPhoneNumber ? { phoneNumber: loginPhoneNumber } : {}),
      deviceName,
    });
    state.status = 'QR challenge created. Resolving the QR payload.';
    render();
    const details = await resolveQrChallengeDetails(state.client, challenge);
    const payload = details.payload || challenge.qrCode || challenge.deepLink;
    if (!payload) {
      const challengeSummary = summarizeQrPayloadState(challenge);
      const detailSummary = summarizeQrPayloadState(details.rawDetail);
      throw new Error(`Trade Republic did not return a QR payload, deep link, or decodable QR image. Challenge: ${challengeSummary}. Detail: ${detailSummary}.`);
    }

    const nextExpiresAt = details.expiresAt || challenge.expiresAt;
    const expiresAtMs = parseDateMs(nextExpiresAt);
    if (expiresAtMs && expiresAtMs - Date.now() <= minQrDisplayMs) {
      state.status = 'QR payload was already near expiry. Requesting a fresh QR.';
      render();
      scheduleQrRetry('retry', nearExpiredQrRetryMs, state.login.serial);
      return;
    }

    const previousAbort = state.login.pollAbort;
    previousAbort?.abort();
    clearTimeout(state.login.expiryTimer);
    state.login.expiryTimer = undefined;
    state.login.pollAbort = undefined;
    state.login.serial += 1;
    const serial = state.login.serial;
    state.login.challenge = challenge;
    state.login.expiresAt = nextExpiresAt;
    state.status = 'Rendering QR code.';
    render();
    state.login.qrText = renderTerminalQr(payload);
    state.login.active = true;
    state.login.error = '';
    if (expiresAtMs) {
      scheduleQrExpiry(expiresAtMs, serial);
    } else {
      state.login.refreshAt = undefined;
      state.login.countdown = '';
    }
    state.status = 'Scan the QR code in the Trade Republic app.';
    showLogin();
    render();

    const pollAbort = new AbortController();
    state.login.pollAbort = pollAbort;
    void pollForLogin(challenge, pollAbort, serial);
  } catch (error) {
    state.login.error = formatError(error);
    state.status = 'Failed to create a QR challenge.';
    render();
    if (state.phase === 'login') {
      scheduleQrRetry('retry', 2000);
    }
  } finally {
    state.login.requestInFlight = false;
  }
}

async function pollForLogin(challenge, abortController, serial) {
  try {
    const session = await state.client.auth.pollInstantLogin(challenge, {
      intervalMs: 1500,
      timeoutMs: 20 * 60_000,
      signal: abortController.signal,
    });
    if (serial !== state.login.serial || state.phase !== 'login') return;
    state.session = session;
    state.status = 'Login approved.';
    state.login.active = false;
    render();
    await enterDashboard();
  } catch (error) {
    if (abortController.signal.aborted || serial !== state.login.serial || state.phase !== 'login') return;
    state.login.error = formatError(error);
    state.status = 'QR polling failed. Requesting a new challenge.';
    render();
    scheduleQrRetry('retry', 2000, serial);
  }
}

function scheduleQrRetry(reason, delayMs, serial) {
  clearTimeout(state.login.retryTimer);
  state.login.retryTimer = setTimeout(() => {
    state.login.retryTimer = undefined;
    if (state.phase !== 'login') return;
    if (serial !== undefined && serial !== state.login.serial) return;
    void requestFreshQr(reason);
  }, delayMs);
  state.login.retryTimer.unref?.();
}

function scheduleQrExpiry(expiresAtMs, serial) {
  const refreshAtMs = qrRefreshAtMs(expiresAtMs);
  const delay = Math.max(0, refreshAtMs - Date.now());
  state.login.refreshAt = new Date(refreshAtMs).toISOString();
  state.login.countdown = formatCountdown(refreshAtMs);
  render();
  state.login.expiryTimer = setTimeout(() => {
    if (state.phase !== 'login' || serial !== state.login.serial) return;
    void requestFreshQr('refresh');
  }, delay);
  state.login.expiryTimer.unref?.();
}

function qrRefreshAtMs(expiresAtMs) {
  const now = Date.now();
  const lifetimeMs = Math.max(0, expiresAtMs - now);
  const skewMs = Math.min(qrRefreshSkewMs, Math.floor(lifetimeMs * 0.2));
  return Math.max(now + 1000, expiresAtMs - skewMs);
}

async function enterDashboard() {
  if (!state.client) return;
  state.phase = 'dashboard';
  clearTimeout(state.login.expiryTimer);
  clearTimeout(state.login.retryTimer);
  state.login.expiryTimer = undefined;
  state.login.retryTimer = undefined;
  state.login.pollAbort = undefined;
  state.login.requestInFlight = false;
  state.login.active = false;
  state.login.countdown = '';
  state.login.qrText = '';
  state.login.expiresAt = undefined;
  state.login.refreshAt = undefined;
  hideLogin();
  hideSearch();
  state.status = 'Dashboard ready.';
  render();
  layout();
  startDashboardLoops();
  await refreshDashboard(true);
}

async function refreshDashboard(force = false) {
  if (!state.client || state.phase !== 'dashboard') return;
  await Promise.allSettled([
    refreshAccount(),
    refreshWatchlists(),
    refreshInstrument(force),
    refreshTrades(),
  ]);
  render();
}

async function refreshAccount() {
  if (!state.client || state.phase !== 'dashboard') return;
  state.dashboard.loading.account = true;
  try {
    const [account, cash, portfolio] = await Promise.all([
      state.client.account.current(),
      state.client.portfolio.cash(),
      state.client.portfolio.current({ timeoutMs: 20_000 }),
    ]);
    state.dashboard.account = account;
    state.dashboard.cash = cash;
    state.dashboard.portfolio = portfolio;
    state.dashboard.accountError = '';
  } catch (error) {
    if (await handleUnauthorized(error)) return;
    state.dashboard.accountError = formatError(error);
  } finally {
    state.dashboard.loading.account = false;
  }
}

async function refreshWatchlists() {
  if (!state.client || state.phase !== 'dashboard') return;
  state.dashboard.loading.watchlists = true;
  try {
    const payload = await state.client.discovery.watchlists();
    state.dashboard.watchlists = normalizeWatchlists(payload);
    state.dashboard.watchlistIndex = clamp(state.dashboard.watchlistIndex, 0, Math.max(0, state.dashboard.watchlists.length - 1));
    state.dashboard.watchlistsError = '';
  } catch (error) {
    if (await handleUnauthorized(error)) return;
    state.dashboard.watchlistsError = formatError(error);
    state.dashboard.watchlists = [];
  } finally {
    state.dashboard.loading.watchlists = false;
  }
}

async function refreshInstrument(force = false) {
  if (!state.client || state.phase !== 'dashboard') return;
  state.dashboard.loading.instrument = true;
  try {
    if (force || !state.dashboard.instrument) {
      const resolved = await resolveInstrument(state.client, state.dashboard.instrumentQuery);
      state.dashboard.instrument = resolved;
      state.dashboard.instrumentError = '';
      await refreshQuote();
      await refreshDom();
    }
  } catch (error) {
    if (await handleUnauthorized(error)) return;
    state.dashboard.instrumentError = formatError(error);
  } finally {
    state.dashboard.loading.instrument = false;
  }
}

async function refreshQuote() {
  if (!state.client || state.phase !== 'dashboard') return;
  const instrument = state.dashboard.instrument;
  if (!instrument?.assetId || !instrument?.exchangeId) return;
  state.dashboard.loading.quote = true;
  try {
    const quote = await state.client.raw.query({
      type: 'ticker',
      id: `${instrument.assetId}.${instrument.exchangeId}`,
    }, { timeoutMs: 15_000 });
    state.dashboard.quote = quote;
    state.dashboard.quoteError = '';
  } catch (error) {
    if (await handleUnauthorized(error)) return;
    state.dashboard.quoteError = formatError(error);
  } finally {
    state.dashboard.loading.quote = false;
  }
}

async function refreshTrades() {
  if (!state.client || state.phase !== 'dashboard') return;
  const instrument = state.dashboard.instrument;
  if (!instrument?.assetId) return;
  state.dashboard.loading.trades = true;
  try {
    const trades = await state.client.trading.trades({
      instrumentId: instrument.assetId,
      page: 1,
      pageSize: 8,
    });
    state.dashboard.trades = trades;
    state.dashboard.tradesError = '';
  } catch (error) {
    if (await handleUnauthorized(error)) return;
    state.dashboard.tradesError = formatError(error);
    state.dashboard.trades = [];
  } finally {
    state.dashboard.loading.trades = false;
  }
}

async function refreshDom() {
  if (!state.client || state.phase !== 'dashboard') return;
  const instrument = state.dashboard.instrument;
  if (!instrument?.assetId) return;

  state.dashboard.loading.book = true;
  try {
    const venues = await state.client.market.availableL2Books(instrument.assetId);
    const selectedVenue = pickVenue(venues, instrument.exchangeId);
    state.dashboard.venueId = selectedVenue?.exchangeId;
    state.dashboard.venueName = selectedVenue?.name || selectedVenue?.exchangeId;
    if (!state.dashboard.venueId) {
      state.dashboard.orderBook = undefined;
      state.dashboard.bookError = '';
      return;
    }

    state.dashboard.domSubscription?.close?.();
    state.dashboard.domSubscription = state.client.market.subscribeL2OrderBook({
      assetId: instrument.assetId,
      exchangeId: state.dashboard.venueId,
      depth: 5,
    });

    void consumeOrderBookStream(state.dashboard.domSubscription);
    state.dashboard.bookError = '';
  } catch (error) {
    if (await handleUnauthorized(error)) return;
    state.dashboard.bookError = formatError(error);
    state.dashboard.orderBook = undefined;
  } finally {
    state.dashboard.loading.book = false;
  }
}

async function consumeOrderBookStream(subscription) {
  try {
    for await (const book of subscription) {
      if (state.phase !== 'dashboard') break;
      state.dashboard.orderBook = book;
      render();
    }
  } catch (error) {
    if (state.phase === 'dashboard') {
      if (await handleUnauthorized(error)) return;
      state.dashboard.bookError = formatError(error);
      render();
    }
  }
}

async function setInstrument(asset, options = {}) {
  if (!state.client) return;
  state.dashboard.instrumentQuery = cleanString(options.query) || asset.name || asset.id;
  state.dashboard.instrument = {
    assetId: asset.isin || asset.id,
    isin: asset.isin || asset.id,
    name: asset.name || asset.id,
    exchangeId: firstString(asset.exchangeIds) || 'LSX',
  };
  state.status = `Loading ${state.dashboard.instrument.name || state.dashboard.instrument.assetId}.`;
  render();

  try {
    const detailed = await state.client.assets.get(state.dashboard.instrument.assetId);
    state.dashboard.instrument = {
      assetId: detailed.isin || detailed.id,
      isin: detailed.isin || detailed.id,
      name: detailed.name || detailed.id,
      exchangeId: firstString(detailed.exchangeIds) || state.dashboard.instrument.exchangeId || 'LSX',
    };
  } catch {
    // Keep the search result fallback when instrument detail lookup is not available.
  }

  await Promise.allSettled([
    refreshQuote(),
    refreshTrades(),
    refreshDom(),
  ]);
  render();
}

function startDashboardLoops() {
  stopDashboardLoops();
  state.dashboard.timers = [
    setInterval(() => {
      if (state.phase === 'dashboard') void refreshAccount();
    }, 20_000),
    setInterval(() => {
      if (state.phase === 'dashboard') void refreshWatchlists();
    }, 30_000),
    setInterval(() => {
      if (state.phase === 'dashboard') void refreshQuote();
    }, 5_000),
    setInterval(() => {
      if (state.phase === 'dashboard') void refreshTrades();
    }, 45_000),
  ];
  for (const timer of state.dashboard.timers) timer.unref?.();
}

function stopDashboardLoops() {
  for (const timer of state.dashboard.timers) clearInterval(timer);
  state.dashboard.timers = [];
  state.dashboard.domSubscription?.close?.();
  state.dashboard.domSubscription = undefined;
}

async function relogin() {
  if (!state.client) return;
  stopDashboardLoops();
  await discardSavedSession();
  clearTimeout(state.login.expiryTimer);
  clearTimeout(state.login.retryTimer);
  state.login.expiryTimer = undefined;
  state.login.retryTimer = undefined;
  state.login.pollAbort = undefined;
  state.login.requestInFlight = false;
  state.login.active = false;
  state.login.countdown = '';
  state.login.qrText = '';
  state.login.expiresAt = undefined;
  state.login.refreshAt = undefined;
  state.dashboard.instrument = undefined;
  state.dashboard.account = undefined;
  state.dashboard.cash = undefined;
  state.dashboard.portfolio = undefined;
  state.dashboard.watchlists = [];
  state.dashboard.watchlistIndex = 0;
  state.dashboard.quote = undefined;
  state.dashboard.orderBook = undefined;
  state.dashboard.trades = [];
  state.dashboard.venueId = undefined;
  state.dashboard.venueName = undefined;
  state.dashboard.accountError = '';
  state.dashboard.watchlistsError = '';
  state.dashboard.instrumentError = '';
  state.dashboard.quoteError = '';
  state.dashboard.tradesError = '';
  state.dashboard.bookError = '';
  state.dashboard.loading.account = false;
  state.dashboard.loading.watchlists = false;
  state.dashboard.loading.instrument = false;
  state.dashboard.loading.quote = false;
  state.dashboard.loading.trades = false;
  state.dashboard.loading.book = false;
  state.phase = 'login';
  showLogin();
  render();
  await startLogin('manual');
}

function openSearch() {
  if (state.phase !== 'dashboard') return;
  state.search.visible = true;
  state.search.query = '';
  state.search.results = [];
  state.search.selected = 0;
  state.search.loading = false;
  state.search.error = '';
  searchOverlay.show();
  searchOverlay.setFront();
  searchInput.setValue('');
  searchResults.setItems(['Type a query and press Enter.']);
  searchInput.focus();
  render();
}

function closeSearch() {
  state.search.visible = false;
  searchOverlay.hide();
  render();
}

function showLogin() {
  loginBox.show();
  loginBox.setFront();
  hideDashboard();
  hideSearch();
  layout();
  render();
}

function hideLogin() {
  loginBox.hide();
}

function hideDashboard() {
  for (const box of dashboardBoxes) box.hide();
  keysBox.hide();
}

function showDashboard() {
  for (const box of dashboardBoxes) box.show();
  keysBox.show();
}

function hideSearch() {
  state.search.visible = false;
  searchOverlay.hide();
}

function layout() {
  const width = screen.width || 120;
  const height = screen.height || 40;
  const topBar = 3;
  const keyBar = 3;
  const bodyHeight = Math.max(12, height - topBar - keyBar);

  if (state.phase === 'dashboard') {
    showDashboard();
    const cols = width >= 130 ? 3 : width >= 100 ? 2 : 1;
    const rows = cols === 3 ? 2 : cols === 2 ? 3 : 6;
    const colWidth = Math.max(24, Math.floor(width / cols));
    const rowHeight = Math.max(7, Math.floor(bodyHeight / rows));
    const gap = cols === 1 ? 0 : 1;

    dashboardBoxes.forEach((box, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      const left = col * colWidth;
      const top = topBar + row * rowHeight;
      const boxHeight = row === rows - 1 ? Math.max(7, bodyHeight - rowHeight * (rows - 1)) : rowHeight;
      box.top = top;
      box.left = left + (col === 0 ? 0 : gap);
      box.width = Math.max(24, col === cols - 1 ? width - left - (col === 0 ? 0 : gap) : colWidth - gap);
      box.height = boxHeight;
    });

    keysBox.top = height - keyBar;
    keysBox.left = 0;
    keysBox.width = '100%';
    keysBox.height = keyBar;
    return;
  }

  hideDashboard();
  loginBox.top = topBar;
  loginBox.left = 0;
  loginBox.width = '100%';
  loginBox.height = Math.max(8, height - topBar - keyBar);
}

function render() {
  updateStatusBox();
  if (state.phase === 'login') {
    renderLoginBox();
  } else if (state.phase === 'dashboard') {
    renderDashboardBoxes();
    renderKeysBox();
  } else if (state.phase === 'error') {
    loginBox.show();
    loginBox.setContent(formatErrorScreen());
  }

  if (state.search.visible) {
    searchOverlay.show();
  }

  screen.render();
}

function updateStatusBox() {
  const parts = [
    `{cyan-fg}handelsrepublik{/cyan-fg}`,
    `{gray-fg}${state.phase}{/gray-fg}`,
  ];
  if (state.client?.getSession()) {
    parts.push(`session: {green-fg}ready{/green-fg}`);
  } else if (state.phase === 'booting') {
    parts.push(`{yellow-fg}${escapeTags(state.status || 'Collecting WAF.')}{/yellow-fg}`);
  } else if (state.phase === 'login') {
    parts.push('{yellow-fg}waiting for qr approval{/yellow-fg}');
  }
  if (state.dashboard.instrument?.name) {
    parts.push(`instrument: {white-fg}${escapeTags(state.dashboard.instrument.name)}{/white-fg}`);
  }
  statusBox.setContent([
    parts.join('  |  '),
    state.phase !== 'booting' && state.status ? `${state.status}${state.login.countdown ? `  |  QR refreshes in ${state.login.countdown}` : ''}` : '',
    state.error ? `{red-fg}${escapeTags(state.error)}{/red-fg}` : '',
  ].filter(Boolean).join('\n'));
}

function renderLoginBox() {
  const lines = [];
  if (hasPinLoginConfig()) {
    lines.push('Logging in with phone number and PIN.');
    lines.push('Confirm the login in the Trade Republic app if prompted.');
    lines.push('Press {yellow-fg}Enter{/yellow-fg} to restart login.');
  } else {
    lines.push('Scan the QR code in the Trade Republic app.');
    lines.push('Press {yellow-fg}Enter{/yellow-fg} to request a fresh QR challenge.');
  }
  lines.push('Press {yellow-fg}Ctrl-C{/yellow-fg} to quit.');
  lines.push('');
  if (state.login.error) {
    lines.push(`{red-fg}${escapeTags(state.login.error)}{/red-fg}`);
    lines.push('');
  }
  if (state.login.qrText) {
    lines.push(state.login.qrText);
  } else if (hasPinLoginConfig()) {
    lines.push('Waiting for phone and PIN login to complete...');
  } else {
    lines.push('Waiting for QR payload...');
  }
  lines.push('');
  lines.push(`Challenge: ${state.login.challenge?.id || 'pending'}`);
  const countdownTargetMs = parseDateMs(state.login.refreshAt) || parseDateMs(state.login.expiresAt);
  if (countdownTargetMs) {
    lines.push(`Refresh in: ${state.login.countdown || formatCountdown(countdownTargetMs)}`);
  }
  loginBox.setContent(lines.join('\n'));
}

function renderDashboardBoxes() {
  const watchlist = state.dashboard.watchlists[state.dashboard.watchlistIndex];
  watchlistBox.setContent(formatWatchlistBox(watchlist));
  instrumentBox.setContent(formatInstrumentBox());
  accountBox.setContent(formatAccountBox());
  quoteBox.setContent(formatQuoteBox());
  tradesBox.setContent(formatTradesBox());
  domBox.setContent(formatDomBox());
}

function renderKeysBox() {
  const lines = state.phase === 'login'
    ? [
        hasPinLoginConfig() ? 'Enter: restart login' : 'Enter: fresh QR',
        'Ctrl-C: quit',
      ]
    : [
        '/ or s: search instrument',
        'q: close search',
        '[ ]: cycle watchlist',
        'r: refresh data',
        'l: clear session and relogin',
        'Ctrl-C: quit',
      ];
  keysBox.setContent(lines.join('   |   '));
}

function formatWatchlistBox(watchlist) {
  const lines = [];
  if (!state.dashboard.watchlists.length) {
    lines.push('No watchlists available.');
    if (state.dashboard.watchlistsError) lines.push(`Error: ${state.dashboard.watchlistsError}`);
    return lines.join('\n');
  }
  lines.push(`Selected: ${watchlist?.name || watchlist?.id || 'unknown'}`);
  lines.push(`Count: ${Array.isArray(watchlist?.items) ? watchlist.items.length : 0}`);
  lines.push('');
  const items = Array.isArray(watchlist?.items) ? watchlist.items.slice(0, 8) : [];
  if (!items.length) {
    lines.push('No items to display.');
    return lines.join('\n');
  }
  for (const item of items) {
    lines.push(`- ${formatWatchlistItem(item)}`);
  }
  return lines.join('\n');
}

function formatInstrumentBox() {
  const instrument = state.dashboard.instrument;
  const lines = [];
  if (!instrument) {
    lines.push('No instrument selected.');
    lines.push('Press / to search for an instrument.');
    return lines.join('\n');
  }
  lines.push(`Query: ${state.dashboard.instrumentQuery}`);
  lines.push(`Name: ${instrument.name || instrument.assetId}`);
  lines.push(`Asset: ${instrument.assetId}`);
  lines.push(`Exchange: ${state.dashboard.venueId || instrument.exchangeId || 'unknown'}`);
  if (state.dashboard.venueName) lines.push(`Venue: ${state.dashboard.venueName}`);
  if (state.dashboard.instrumentError) lines.push(`Error: ${state.dashboard.instrumentError}`);
  return lines.join('\n');
}

function formatAccountBox() {
  const lines = [];
  const session = state.client?.getSession();
  lines.push(`Session: ${session?.securitiesAccountNumber || 'unknown'}`);
  if (state.dashboard.loading.account) lines.push('Loading account data...');
  if (state.dashboard.account) {
    lines.push(...summarizeObject(state.dashboard.account, ['name', 'displayName', 'account', 'type', 'status'], 4));
  }
  if (state.dashboard.cash) {
    lines.push('');
    lines.push(`Cash: ${formatMoney(state.dashboard.cash.amount, state.dashboard.cash.currency)}`);
  }
  if (state.dashboard.portfolio) {
    const positions = Array.isArray(state.dashboard.portfolio.positions) ? state.dashboard.portfolio.positions : [];
    lines.push(`Positions: ${positions.length}`);
    const total = positions.reduce((sum, position) => sum + (Number.isFinite(position.value) ? Number(position.value) : 0), 0);
    if (total > 0) lines.push(`Value: ${formatMoney(total, guessCurrency(state.dashboard.cash?.currency))}`);
  }
  if (state.dashboard.accountError) lines.push(`Error: ${state.dashboard.accountError}`);
  return lines.join('\n');
}

function formatQuoteBox() {
  const lines = [];
  const quote = state.dashboard.quote;
  if (state.dashboard.loading.quote) lines.push('Refreshing quote...');
  if (!quote) {
    lines.push('No quote data yet.');
    return lines.join('\n');
  }
  lines.push(...summarizeObject(quote, ['price', 'last', 'bid', 'ask', 'change', 'changePercent', 'currency', 'time', 'timestamp', 'updatedAt'], 6));
  if (state.dashboard.quoteError) lines.push(`Error: ${state.dashboard.quoteError}`);
  return lines.join('\n');
}

function formatTradesBox() {
  const lines = [];
  if (state.dashboard.loading.trades) lines.push('Refreshing trades...');
  if (!state.dashboard.trades.length) {
    lines.push('No recent trades.');
    if (state.dashboard.tradesError) lines.push(`Error: ${state.dashboard.tradesError}`);
    return lines.join('\n');
  }
  for (const trade of state.dashboard.trades.slice(0, 6)) {
    const qty = trade.quantity != null ? ` x${trade.quantity}` : '';
    const amount = trade.amount != null ? ` ${formatMoney(trade.amount, trade.currency)}` : '';
    const when = trade.executedAt ? ` ${formatShortDate(trade.executedAt)}` : '';
    lines.push(`- ${trade.side || 'TRADE'}${qty}${amount}${when}`.trim());
  }
  return lines.join('\n');
}

function formatDomBox() {
  const lines = [];
  if (state.dashboard.loading.book) lines.push('Refreshing DOM...');
  if (!state.dashboard.orderBook) {
    lines.push('No order book data yet.');
    if (state.dashboard.bookError) lines.push(`Error: ${state.dashboard.bookError}`);
    return lines.join('\n');
  }
  const bids = Array.isArray(state.dashboard.orderBook.bids) ? state.dashboard.orderBook.bids : [];
  const asks = Array.isArray(state.dashboard.orderBook.asks) ? state.dashboard.orderBook.asks : [];
  lines.push('Bids:');
  for (const [price, size] of bids.slice(0, 5)) {
    lines.push(`- ${formatNumber(price)} x ${formatNumber(size)}`);
  }
  lines.push('');
  lines.push('Asks:');
  for (const [price, size] of asks.slice(0, 5)) {
    lines.push(`- ${formatNumber(price)} x ${formatNumber(size)}`);
  }
  return lines.join('\n');
}

function formatErrorScreen() {
  return [
    '{bold}Startup failed.{/bold}',
    '',
    state.error || 'Unknown error.',
    '',
    'Press q to quit.',
  ].join('\n');
}

function formatSearchResult(item, index) {
  const side = item.type ? ` ${item.type}` : '';
  const isin = item.isin ? ` ${item.isin}` : '';
  return `${String(index + 1).padStart(2, '0')}. ${item.name || item.id}${side}${isin}`;
}

function formatWatchlistItem(item) {
  return firstString(item?.name, item?.title, item?.instrumentName, item?.isin, item?.instrumentId, item?.id) || safeInspect(item, 1);
}

function summarizeObject(value, preferredKeys, maxLines = 6) {
  if (!value || typeof value !== 'object') return [String(value)];
  const lines = [];
  for (const key of preferredKeys) {
    const found = deepFind(value, key);
    if (found === undefined || found === null || found === '') continue;
    lines.push(`${prettyKey(key)}: ${formatValue(found)}`);
    if (lines.length >= maxLines) return lines;
  }
  if (lines.length === 0) {
    const record = value;
    for (const [key, item] of Object.entries(record)) {
      if (item === undefined || item === null || item === '') continue;
      lines.push(`${prettyKey(key)}: ${formatValue(item)}`);
      if (lines.length >= maxLines) break;
    }
  }
  return lines.length > 0 ? lines : [safeInspect(value, 2)];
}

function resolveInstrument(client, query) {
  return client.assets.search(query, { limit: 10 }).then((results) => {
    const asset = results[0];
    if (!asset) throw new Error(`No instrument found for "${query}".`);
    return {
      assetId: asset.isin || asset.id,
      isin: asset.isin || asset.id,
      name: asset.name || asset.id,
      exchangeId: firstString(asset.exchangeIds) || 'LSX',
    };
  });
}

async function resolveQrChallengeDetails(client, challenge) {
  const inlinePayload = extractQrPayloadCandidate(challenge, challenge.raw);
  const inlineExpiresAt = firstString(
    deepFindString(challenge, 'qrCodeTokenExpiresAt'),
    deepFindString(challenge.raw, 'qrCodeTokenExpiresAt'),
    challenge.expiresAt,
  );
  if (inlinePayload) {
    return {
      payload: inlinePayload,
      expiresAt: inlineExpiresAt,
      rawDetail: challenge.raw,
    };
  }

  const inlineDataUrl = extractQrDataUrlCandidate(challenge, challenge.raw);
  if (inlineDataUrl) {
    const decoded = decodeQrDataUrl(inlineDataUrl);
    if (decoded) {
      return {
        payload: decoded,
        expiresAt: inlineExpiresAt,
        rawDetail: challenge.raw,
      };
    }
  }

  if (!challenge.id) return { rawDetail: challenge.raw };
  try {
    const detail = await client.raw.request({
      path: `/api/v2/auth/web/login/qr-challenges/${encodeURIComponent(challenge.id)}`,
    });
    if (!detail || typeof detail !== 'object') return { rawDetail: detail };
    const detailDataUrl = extractQrDataUrlCandidate(detail);
    const detailPayload = extractQrPayloadCandidate(detail);
    const decoded = detailDataUrl ? decodeQrDataUrl(detailDataUrl) : undefined;
    return {
      payload: detailPayload || decoded,
      expiresAt: firstString(detail.qrCodeTokenExpiresAt, detail.expiresAt, detail.expiration, detail.challengeExpiresAt),
      rawDetail: detail,
    };
  } catch (error) {
    return { rawDetail: { error: formatError(error) } };
  }
}

function hasPinLoginConfig() {
  return Boolean(loginPhoneNumber && loginPin);
}

function decodeQrDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return undefined;
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex <= 0) return undefined;
  const meta = dataUrl.slice(0, commaIndex);
  const rawData = dataUrl.slice(commaIndex + 1).trim();
  if (!rawData) return undefined;
  try {
    const buffer = /;base64/i.test(meta)
      ? Buffer.from(rawData, 'base64')
      : Buffer.from(decodeURIComponent(rawData), 'utf8');
    const image = PNG.sync.read(buffer);
    const decoded = jsQR(new Uint8ClampedArray(image.data), image.width, image.height);
    return decoded?.data || undefined;
  } catch {
    return undefined;
  }
}

function extractQrPayloadCandidate(...values) {
  return firstString(
    ...values.flatMap((value) => [
      pickLikelyQrPayloadString(value),
      deepFindString(value, 'qrCodePayload'),
      deepFindString(value, 'qrCode'),
      deepFindString(value, 'deepLink'),
      deepFindString(value, 'loginUrl'),
      deepFindString(value, 'url'),
    ]),
  );
}

function extractQrDataUrlCandidate(...values) {
  return firstString(
    ...values.flatMap((value) => [
      pickLikelyDataUrlString(value),
      deepFindString(value, 'qrCodeDataUrl'),
      deepFindString(value, 'qrDataUrl'),
    ]),
  );
}

function pickLikelyQrPayloadString(value) {
  for (const candidate of collectNestedStrings(value)) {
    if (candidate.startsWith('data:image/')) continue;
    if (candidate.startsWith('http://') || candidate.startsWith('https://')) return candidate;
    if (candidate.includes('traderepublic')) return candidate;
    if (candidate.startsWith('tr:')) return candidate;
  }
  return undefined;
}

function pickLikelyDataUrlString(value) {
  for (const candidate of collectNestedStrings(value)) {
    if (candidate.startsWith('data:image/')) return candidate;
  }
  return undefined;
}

function collectNestedStrings(value, results = [], seen = new Set()) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) results.push(trimmed);
    return results;
  }
  if (!value || typeof value !== 'object') return results;
  if (seen.has(value)) return results;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectNestedStrings(item, results, seen);
    return results;
  }
  for (const item of Object.values(value)) {
    collectNestedStrings(item, results, seen);
  }
  return results;
}

function summarizeQrPayloadState(value) {
  if (!value || typeof value !== 'object') return String(value ?? 'none');
  const keys = Object.keys(value).sort();
  const qrCode = firstString(value.qrCode, deepFindString(value, 'qrCode'));
  const qrCodePayload = firstString(value.qrCodePayload, deepFindString(value, 'qrCodePayload'));
  const deepLink = firstString(value.deepLink, value.loginUrl, value.url, deepFindString(value, 'deepLink'), deepFindString(value, 'loginUrl'), deepFindString(value, 'url'));
  const dataUrl = firstString(value.qrCodeDataUrl, value.qrDataUrl, deepFindString(value, 'qrCodeDataUrl'), deepFindString(value, 'qrDataUrl'));
  const nestedStringPreview = collectNestedStrings(value).slice(0, 5).map((candidate) => previewString(candidate));
  const flags = [
    `keys=${keys.join(',') || 'none'}`,
    `qrCode=${describeValue(qrCode ?? value.qrCode)}`,
    `qrCodePayload=${describeValue(qrCodePayload ?? value.qrCodePayload)}`,
    `deepLink=${describeValue(deepLink ?? value.deepLink ?? value.loginUrl ?? value.url)}`,
    `dataUrl=${describeValue(dataUrl ?? value.qrCodeDataUrl ?? value.qrDataUrl)}`,
    `expiresAt=${firstString(value.qrCodeTokenExpiresAt, value.expiresAt, value.expiration, value.challengeExpiresAt) || 'none'}`,
    `strings=${nestedStringPreview.join(',') || 'none'}`,
  ];
  return flags.join(' ');
}

function describeValue(value) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') {
    return value.length === 0 ? 'string(0)' : `string(${value.length})`;
  }
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === 'object') return `object(${Object.keys(value).length})`;
  return typeof value;
}

function previewString(value) {
  if (value.length <= 24) return JSON.stringify(value);
  return JSON.stringify(`${value.slice(0, 18)}...${value.slice(-4)}`);
}

function normalizeWatchlists(payload) {
  const record = payload && typeof payload === 'object' ? payload : {};
  const watchlists = Array.isArray(record.watchlists) ? record.watchlists : Array.isArray(payload) ? payload : [];
  return watchlists.map((watchlist) => ({
    id: firstString(watchlist.id, watchlist.watchlistId, watchlist.slug) || 'unknown',
    name: firstString(watchlist.name, watchlist.title) || 'Unnamed watchlist',
    items: Array.isArray(watchlist.items) ? watchlist.items : [],
    raw: watchlist,
  }));
}

function pickVenue(venues, preferredId) {
  if (!Array.isArray(venues) || venues.length === 0) return undefined;
  if (preferredId) {
    const match = venues.find((venue) => venue.exchangeId === preferredId);
    if (match) return match;
  }
  return venues[0];
}

function formatCountdown(expiresAtMs) {
  const remainingMs = expiresAtMs - Date.now();
  if (remainingMs <= 0) return '00:00';
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatShortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatMoney(amount, currency) {
  if (!Number.isFinite(Number(amount))) return '-';
  const value = Number(amount);
  const formatted = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: Math.abs(value) < 100 ? 2 : 0,
    maximumFractionDigits: 4,
  }).format(value);
  return currency ? `${formatted} ${currency}` : formatted;
}

function formatNumber(value) {
  if (!Number.isFinite(Number(value))) return '-';
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 4,
  }).format(Number(value));
}

function formatValue(value) {
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return safeInspect(value, 1);
}

function formatError(error) {
  if (error && typeof error === 'object' && typeof error.message === 'string') {
    const status = typeof error.status === 'number' ? ` (${error.status})` : '';
    const responseBody = 'responseBody' in error && error.responseBody !== undefined
      ? ` ${safeInspect(error.responseBody, 2)}`
      : '';
    return `${error.message}${status}${responseBody}`;
  }
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return safeInspect(error, 2);
}

function isUnauthorizedError(error) {
  if (!error) return false;
  if (typeof error === 'object') {
    if (error.status === 401) return true;
    if ('cause' in error && isUnauthorizedError(error.cause)) return true;
    if (typeof error.message === 'string' && /\b401\b/.test(error.message)) return true;
  }
  return typeof error === 'string' && /\b401\b/.test(error);
}

function guessCurrency(currency) {
  return cleanString(currency) || 'EUR';
}

function safeInspect(value, depth = 2) {
  return inspect(value, {
    colors: false,
    depth,
    compact: true,
    breakLength: 120,
    maxArrayLength: 12,
    maxStringLength: 200,
    sorted: false,
  });
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function firstStringArray(values) {
  if (!Array.isArray(values)) return [];
  return values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim());
}

function deepFindString(value, key) {
  const found = deepFind(value, key);
  return typeof found === 'string' && found.trim() ? found.trim() : undefined;
}

function deepFind(value, key) {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepFind(item, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = value;
  if (key in record && record[key] !== undefined) return record[key];
  for (const item of Object.values(record)) {
    const found = deepFind(item, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function prettyKey(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function renderTerminalQr(payload) {
  let rendered = '';
  qrcodeTerminal.generate(payload, { small: true }, (output) => {
    rendered = output;
  });
  return rendered;
}

function parseDateMs(value) {
  if (!value) return undefined;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

function hasUsableSession(session) {
  if (!session) return false;
  const cookieNames = Object.keys(session.cookies || {}).length;
  return Boolean(session.accessToken || session.sessionToken || session.refreshToken || cookieNames);
}

function escapeTags(value) {
  return String(value)
    .replaceAll('{', '\\{')
    .replaceAll('}', '\\}');
}

function panel(title) {
  return blessed.box({
    parent: screen,
    border: 'line',
    label: ` ${title} `,
    style: {
      border: { fg: 'cyan' },
      fg: 'white',
    },
    tags: true,
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    mouse: true,
    vi: true,
    wrap: true,
    hidden: true,
    content: '',
  });
}

function cycleWatchlist(direction) {
  const list = state.dashboard.watchlists;
  if (!list.length) return;
  state.dashboard.watchlistIndex = (state.dashboard.watchlistIndex + direction + list.length) % list.length;
  render();
}

async function shutdown(code = 0) {
  try {
    stopDashboardLoops();
    clearTimeout(state.login.expiryTimer);
    clearTimeout(state.login.retryTimer);
    state.login.pollAbort?.abort();
    if (state.browser) await state.browser.close().catch(() => undefined);
  } finally {
    screen.program.showCursor();
    screen.destroy();
    process.exit(code);
  }
}
