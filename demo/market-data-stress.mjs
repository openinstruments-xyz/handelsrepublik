import { createWriteStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileSessionStore, TradeRepublicClient } from '../dist/index.js';

// A deliberately read-only, long-running market-data soak test. It creates one
// TradeRepublicClient and lets its shared mapper connection multiplex every
// subscription below.
const EXCHANGE_ID = 'TIB';
const here = dirname(fileURLToPath(import.meta.url));
const sessionPath = process.env.TR_SESSION_FILE || join(here, '.demo-session.json');
const configPath = process.env.TR_CONFIG_FILE || join(here, '.demo-config.json');
const logFilePath = resolve(process.cwd(), process.env.TR_STRESS_LOG_FILE || 'demo/market-data-stress.ndjson');
const stockCount = atLeast(process.env.TR_STRESS_STOCKS, 500, 'TR_STRESS_STOCKS');
const pageSize = positiveInteger(process.env.TR_STRESS_PAGE_SIZE, 100);
const maxPages = positiveInteger(process.env.TR_STRESS_MAX_PAGES, 100);
const subscriptionBatchSize = positiveInteger(process.env.TR_STRESS_SUBSCRIPTION_BATCH, 25);
const batchDelayMs = nonNegativeInteger(process.env.TR_STRESS_BATCH_DELAY_MS, 100);
const statusIntervalMs = atLeast(process.env.TR_STRESS_STATUS_MS, 5_000, 'TR_STRESS_STATUS_MS', 1_000);
const durationMs = optionalPositiveInteger(process.env.TR_STRESS_DURATION_MS);
const refreshSessionOnStartup = booleanSetting(process.env.TR_STRESS_REFRESH_SESSION, true);

const monitor = createMonitor();
let client;
let stopping = false;
let exitCode = 0;
const streamStates = [];
let statusTimer;
let durationTimer;
let eventLog;
let logFailureReported = false;

process.on('unhandledRejection', (error) => {
  monitor.error('unhandled rejection', error);
});

process.on('uncaughtException', (error) => {
  monitor.error('uncaught exception', error);
  exitCode = 1;
  void shutdown('uncaught exception');
});

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  eventLog = await openEventLog(logFilePath);
  await eventLog.write({
    type: 'run_started',
    at: new Date().toISOString(),
    exchangeId: EXCHANGE_ID,
    stockCount,
  });
  console.log(`Writing all market-data results to ${logFilePath}.`);
  const runtimeConfig = await loadRuntimeConfig(configPath);
  const headers = defaultHeadersFromConfig(runtimeConfig);
  client = TradeRepublicClient.create({
    sessionStore: new FileSessionStore(sessionPath),
    defaultHeaders: headers,
    // Do not make this configurable: the point of this demo is one client and
    // one multiplexed mapper socket for all quote, trade, and L2 streams.
    websocketMode: 'shared',
    websocketReconnectDelayMs: positiveInteger(process.env.TR_WEBSOCKET_RECONNECT_MS, 250),
    rawSchemaValidation: 'passthrough',
    onRawSchemaValidationFailure({ schemaName, error }) {
      monitor.error(`schema drift in ${schemaName}`, error);
    },
    onWebSocketDisconnect(event) {
      monitor.disconnect(event);
    },
    onWebSocketReconnect(event) {
      monitor.reconnect(event);
    },
  });
  useRuntimeWebContext(client, runtimeConfig);

  let session = await client.auth.restoreSession();
  if (!hasUsableSession(session)) {
    throw new Error(`No usable session was restored from ${sessionPath}. Re-authenticate with demo:repl or set TR_SESSION_FILE.`);
  }
  if (refreshSessionOnStartup) {
    console.log('Refreshing the saved session before opening mapper subscriptions...');
    session = await client.auth.refreshSession();
    if (!hasUsableSession(session)) throw new Error('Session refresh did not return a usable Trade Republic session.');
  }

  console.log(`Using saved demo authentication from ${sessionPath}.`);
  console.log(`Finding ${stockCount} stock instruments for ${EXCHANGE_ID} subscriptions...`);
  const stocks = await findStocks(client, stockCount);
  console.log(`Starting ${stocks.length * 3} subscriptions for ${stocks.length} ${EXCHANGE_ID} stocks (quote, trade, L2).`);

  for (let index = 0; index < stocks.length; index += 1) {
    const stock = stocks[index];
    startStream('quote', stock.id, () => client.market.liveFeed(stock.id, { exchangeId: EXCHANGE_ID }));
    startStream('trade', stock.id, () => client.trading.tape(stock.id, EXCHANGE_ID));
    startStream('l2', stock.id, () => client.market.l2OrderBook(stock.id, EXCHANGE_ID));

    if ((index + 1) % subscriptionBatchSize === 0 && index + 1 < stocks.length) {
      console.log(`Opened ${(index + 1) * 3}/${stocks.length * 3} subscriptions...`);
      await delay(batchDelayMs);
    }
  }

  console.log('All subscriptions are open. Press Ctrl+C to close them cleanly.');
  printStatus();
  statusTimer = setInterval(printStatus, statusIntervalMs);
  if (durationMs) {
    durationTimer = setTimeout(() => void shutdown(`TR_STRESS_DURATION_MS (${durationMs} ms) elapsed`), durationMs);
  }
} catch (error) {
  monitor.error('startup failed', error);
  const hint = authenticationFailureHint(error);
  if (hint) {
    console.error(`[AUTHENTICATION] ${hint}`);
    recordLog({ type: 'guidance', at: new Date().toISOString(), message: hint });
  }
  exitCode = 1;
  await shutdown('startup failure');
}

async function findStocks(tr, count) {
  const selected = new Map();
  for (let page = 1; page <= maxPages && selected.size < count; page += 1) {
    const assets = await tr.assets.listAll({ cursor: String(page), limit: pageSize, type: 'stock' });
    for (const asset of assets) {
      // The live catalogue does not include venue lists for these stock records.
      // TIB is instead selected explicitly for every downstream subscription.
      if (asset.id) selected.set(asset.id, asset);
      if (selected.size === count) break;
    }
    console.log(`Scanned page ${page}: ${selected.size}/${count} stocks selected for ${EXCHANGE_ID}.`);
    if (assets.length < pageSize) break;
  }
  if (selected.size < count) {
    throw new Error(`Only found ${selected.size}/${count} stock instruments. Increase TR_STRESS_MAX_PAGES or try again when the catalogue is available.`);
  }
  return [...selected.values()];
}

function startStream(kind, assetId, open) {
  let subscription;
  try {
    subscription = open();
  } catch (error) {
    monitor.error(`${kind} subscription could not open for ${assetId}`, error);
    return;
  }

  const state = { kind, assetId, subscription, events: 0, lastEventAt: undefined, failed: false, consumer: undefined };
  streamStates.push(state);
  monitor.opened(kind);
  state.consumer = consumeStream(state);
}

async function consumeStream(state) {
  try {
    for await (const event of state.subscription) {
      const receivedAt = new Date().toISOString();
      await writeMarketEvent({
        type: 'market_data',
        at: receivedAt,
        exchangeId: EXCHANGE_ID,
        stream: state.kind,
        instrumentId: state.assetId,
        result: event,
      });
      state.events += 1;
      state.lastEventAt = Date.now();
      monitor.received(state.kind);
    }
    if (!stopping) {
      state.failed = true;
      monitor.error(`${state.kind} subscription ended unexpectedly for ${state.assetId}`, new Error('stream ended without an explicit close'));
    }
  } catch (error) {
    if (!stopping) {
      state.failed = true;
      monitor.error(`${state.kind} subscription failed for ${state.assetId}`, error);
    }
  }
}

async function shutdown(reason) {
  if (stopping) return;
  stopping = true;
  clearInterval(statusTimer);
  clearTimeout(durationTimer);
  console.log(`Closing ${streamStates.length} subscriptions (${reason})...`);
  for (const state of streamStates) {
    try {
      state.subscription.close();
    } catch (error) {
      monitor.error(`could not close ${state.kind} subscription for ${state.assetId}`, error);
      exitCode = 1;
    }
  }
  client?.close();
  await Promise.allSettled(streamStates.flatMap((state) => state.consumer ? [state.consumer] : []));
  printStatus(true);
  try {
    await eventLog?.close();
  } catch (error) {
    console.error(`\u0007[ERROR ${new Date().toISOString()}] could not close result log ${logFilePath}: ${safeErrorMessage(error)}`);
    exitCode = 1;
  }
  process.exitCode = exitCode;
}

function createMonitor() {
  const opened = { quote: 0, trade: 0, l2: 0 };
  const received = { quote: 0, trade: 0, l2: 0 };
  let errors = 0;
  let disconnects = 0;
  let reconnects = 0;
  let lastReportedReceived = { ...received };
  const startedAt = Date.now();

  return {
    opened(kind) {
      opened[kind] += 1;
    },
    received(kind) {
      received[kind] += 1;
    },
    error(context, error) {
      errors += 1;
      // The terminal bell and stderr make failures visible during an unattended
      // soak run. Keep the message compact and strip common auth-value forms.
      const at = new Date().toISOString();
      console.error(`\u0007[ERROR ${at}] ${context}: ${formatErrorDetails(error)}`);
      recordLog({ type: 'error', at, context, error: logErrorDetails(error) });
    },
    disconnect(event) {
      disconnects += 1;
      const message = `reconnecting in ${event.reconnectDelayMs} ms${event.code === undefined ? '' : ` (code ${event.code})`}${event.reason ? `: ${event.reason}` : ''}`;
      console.error(`\u0007[CONNECTION LOST ${event.disconnectedAt}] ${message}`);
      recordLog({ type: 'websocket_disconnected', at: event.disconnectedAt, ...event });
    },
    reconnect(event) {
      reconnects += 1;
      console.log(`[RECONNECTED ${event.reconnectedAt}] downtime=${event.downtimeMs} ms, attempts=${event.reconnectAttempts}`);
      recordLog({ type: 'websocket_reconnected', ...event });
    },
    snapshot() {
      return { opened, received, errors, disconnects, reconnects, startedAt };
    },
    receivedSinceLastStatus() {
      const value = {
        quote: received.quote - lastReportedReceived.quote,
        trade: received.trade - lastReportedReceived.trade,
        l2: received.l2 - lastReportedReceived.l2,
      };
      lastReportedReceived = { ...received };
      return value;
    },
  };
}

function printStatus(final = false) {
  const snapshot = monitor.snapshot();
  const failed = streamStates.filter((state) => state.failed).length;
  const active = streamStates.length - failed;
  const memory = process.memoryUsage();
  const prefix = final ? 'FINAL' : 'STATUS';
  const at = new Date().toISOString();
  const processedSinceLastStatus = monitor.receivedSinceLastStatus();
  const message =
    `[${prefix} ${at}] uptime=${formatDuration(Date.now() - snapshot.startedAt)} `
    + `started quote/trade/L2=${snapshot.opened.quote}/${snapshot.opened.trade}/${snapshot.opened.l2} active=${active} `
    + `processed-last-${statusIntervalMs}ms quote/trade/L2=${processedSinceLastStatus.quote}/${processedSinceLastStatus.trade}/${processedSinceLastStatus.l2} `
    + `processed-total quote/trade/L2=${snapshot.received.quote}/${snapshot.received.trade}/${snapshot.received.l2} `
    + `failed=${failed} errors=${snapshot.errors} disconnects=${snapshot.disconnects} reconnects=${snapshot.reconnects} `
    + `rss=${formatMiB(memory.rss)} heap=${formatMiB(memory.heapUsed)}`;
  console.log(message);
  recordLog({
    type: final ? 'run_finished' : 'status',
    at,
    uptimeMs: Date.now() - snapshot.startedAt,
    started: snapshot.opened,
    processedSinceLastStatus,
    received: snapshot.received,
    active,
    failed,
    errors: snapshot.errors,
    disconnects: snapshot.disconnects,
    reconnects: snapshot.reconnects,
    memory: { rss: memory.rss, heapUsed: memory.heapUsed },
  });
}

async function loadRuntimeConfig(filePath) {
  const fileConfig = await readJsonFile(filePath);
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
    if (error && typeof error === 'object' && error.code === 'ENOENT') return {};
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

function useRuntimeWebContext(tr, config) {
  const headers = defaultHeadersFromConfig(config);
  const webContext = {};
  if (Object.keys(headers).length > 0) webContext.headers = headers;
  if (config.cookie) webContext.cookieHeader = config.cookie;
  if (config.awsWafToken) webContext.awsWafToken = config.awsWafToken;
  if (config.xsrfToken) webContext.xsrfToken = config.xsrfToken;
  if (Object.keys(webContext).length > 0) tr.useWebContext(webContext);
}

function hasUsableSession(session) {
  if (!session) return false;
  const cookieNames = Object.keys(session.cookies ?? {}).filter((name) => !/^aws-waf-token$/i.test(name));
  return Boolean(session.accessToken || session.sessionToken || session.refreshToken || cookieNames.length);
}

function atLeast(value, fallback, name, minimum = fallback) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < minimum) throw new TypeError(`${name} must be an integer of at least ${minimum}.`);
  return parsed;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new TypeError('Expected a positive integer.');
  return parsed;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 0) throw new TypeError('Expected a non-negative integer.');
  return parsed;
}

function optionalPositiveInteger(value) {
  if (value === undefined || value === '') return undefined;
  return positiveInteger(value, 0);
}

function booleanSetting(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new TypeError('Expected a boolean environment setting.');
}

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function safeErrorMessage(error) {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === 'object' && typeof error.message === 'string'
      ? error.message
      : String(error);
  return message
    .replace(/(authorization|cookie|token|session|secret|password)([=:]\s*)[^\s,;]+/gi, '$1$2[redacted]')
    .replace(/bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .slice(0, 1_000);
}

function formatErrorDetails(error) {
  const details = logErrorDetails(error);
  const cause = details.cause ? `; cause: ${details.cause.message}` : '';
  return `${details.message}${details.reason ? ` (reason: ${details.reason})` : ''}${cause}`;
}

function logErrorDetails(error) {
  const value = error && typeof error === 'object' ? error : undefined;
  const cause = value?.cause && typeof value.cause === 'object' ? value.cause : undefined;
  return {
    name: error instanceof Error || typeof value?.name === 'string' ? value.name : undefined,
    message: safeErrorMessage(error),
    ...(typeof value?.reason === 'string' ? { reason: value.reason } : {}),
    ...(typeof value?.deliveryState === 'string' ? { deliveryState: value.deliveryState } : {}),
    ...(cause ? {
      cause: {
        ...(cause instanceof Error || typeof cause.name === 'string' ? { name: cause.name } : {}),
        message: safeErrorMessage(cause),
        ...(typeof cause.code === 'string' || typeof cause.code === 'number' ? { code: cause.code } : {}),
      },
    } : {}),
  };
}

function authenticationFailureHint(error) {
  const cause = error && typeof error === 'object' ? error.cause : undefined;
  if (error?.reason !== 'connectFailure' || !/\b401\b/.test(safeErrorMessage(cause))) return undefined;
  return 'The mapper websocket handshake was rejected with HTTP 401 after the startup session refresh. Open demo:tui so it can validate or replace the saved login, or use demo:repl and run loginQr(), then restart this demo.';
}

async function writeMarketEvent(record) {
  try {
    await eventLog?.write(record);
  } catch (error) {
    reportLogFailure(error);
    throw error;
  }
}

function recordLog(record) {
  if (!eventLog || logFailureReported) return;
  void eventLog.write(record).catch(reportLogFailure);
}

function reportLogFailure(error) {
  if (logFailureReported) return;
  logFailureReported = true;
  exitCode = 1;
  console.error(`\u0007[ERROR ${new Date().toISOString()}] result log failed at ${logFilePath}: ${safeErrorMessage(error)}`);
  void shutdown('result log failure');
}

async function openEventLog(path) {
  await mkdir(dirname(path), { recursive: true });
  const stream = createWriteStream(path, { flags: 'a', encoding: 'utf8' });
  await Promise.race([
    once(stream, 'open'),
    once(stream, 'error').then(([error]) => Promise.reject(error)),
  ]);
  let closed = false;
  let streamError;
  stream.on('error', (error) => {
    streamError = error;
  });

  return {
    async write(record) {
      if (closed) throw new Error('Result log is closed.');
      if (streamError) throw streamError;
      const line = `${JSON.stringify(record, logJsonReplacer)}\n`;
      if (stream.write(line)) return;
      await Promise.race([
        once(stream, 'drain'),
        once(stream, 'error').then(([error]) => Promise.reject(error)),
      ]);
    },
    async close() {
      if (closed) return;
      closed = true;
      if (streamError) throw streamError;
      await new Promise((resolve, reject) => {
        stream.once('error', reject);
        stream.end(resolve);
      });
    },
  };
}

function logJsonReplacer(_key, value) {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Error) return logErrorDetails(value);
  return value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h${minutes}m${seconds}s`;
}

function formatMiB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MiB`;
}
