import type { TradeRepublicWafToken, TradeRepublicWebContext } from './types.js';

export interface TradeRepublicBrowserLike {
  newContext(options?: TradeRepublicBrowserContextOptions): Promise<TradeRepublicBrowserContextLike>;
}

export type TradeRepublicBrowserContextOptions = Record<string, unknown>;

export interface CollectTradeRepublicWafTokenOptions {
  appUrl?: string | undefined;
  apiUrl?: string | undefined;
  contextOptions?: TradeRepublicBrowserContextOptions | undefined;
  timeoutMs?: number | undefined;
  settleMs?: number | undefined;
  waitUntil?: string | undefined;
}

export interface TradeRepublicBrowserContextLike {
  newPage(): Promise<TradeRepublicPageLike>;
  cookies(urls?: string | string[]): Promise<TradeRepublicCookieLike[]>;
  close(): Promise<void> | void;
  on?(event: 'request', listener: (request: TradeRepublicRequestLike) => void): void;
}

export interface TradeRepublicPageLike {
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  waitForLoadState?(state?: string, options?: { timeout?: number }): Promise<unknown>;
  waitForTimeout?(timeout: number): Promise<unknown>;
  evaluate?<T>(fn: () => T): Promise<T>;
  on?(event: 'request', listener: (request: TradeRepublicRequestLike) => void): void;
}

export interface TradeRepublicRequestLike {
  url(): string;
  headers(): Record<string, string>;
}

export interface TradeRepublicCookieLike {
  name: string;
  value: string;
  domain?: string | undefined;
  path?: string | undefined;
  expires?: number | undefined;
}

const DEFAULT_APP_URL = 'https://app.traderepublic.com/';
const DEFAULT_API_URL = 'https://api.traderepublic.com/';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_SETTLE_MS = 0;
const WAF_POLL_INTERVAL_MS = 50;

const RELEVANT_HEADER_NAMES = new Set([
  'accept-language',
  'cookie',
  'x-aws-waf-token',
  'x-xsrf-token',
  'x-tr-app-version',
  'x-tr-device-info',
  'x-tr-platform',
]);

export async function collectTradeRepublicWebContext(
  browser: TradeRepublicBrowserLike,
  options: CollectTradeRepublicWafTokenOptions = {},
): Promise<TradeRepublicWebContext> {
  const appUrl = options.appUrl ?? DEFAULT_APP_URL;
  const apiUrl = options.apiUrl ?? DEFAULT_API_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const waitUntil = options.waitUntil ?? 'domcontentloaded';
  const capturedHeaders: Record<string, string> = {};
  const capturedCookies: Record<string, string> = {};
  const startedAt = Date.now();

  const context = await browser.newContext(options.contextOptions);
  try {
    context.on?.('request', (request) => captureRequest(request, appUrl, apiUrl, capturedHeaders, capturedCookies));
    const page = await context.newPage();
    page.on?.('request', (request) => captureRequest(request, appUrl, apiUrl, capturedHeaders, capturedCookies));
    await page.goto(appUrl, { waitUntil, timeout: timeoutMs });
    let webContext = await buildWebContext(context, appUrl, apiUrl, capturedHeaders, capturedCookies, page);
    if (!hasWafToken(webContext) && settleMs > 0) {
      await wait(page, settleMs);
      webContext = await buildWebContext(context, appUrl, apiUrl, capturedHeaders, capturedCookies, page);
    }
    while (!hasWafToken(webContext) && Date.now() - startedAt < timeoutMs) {
      await wait(page, WAF_POLL_INTERVAL_MS);
      webContext = await buildWebContext(context, appUrl, apiUrl, capturedHeaders, capturedCookies, page);
    }
    if (!hasWafToken(webContext)) {
      const missing = missingWafToken(webContext);
      throw new Error(formatLoginContextError(webContext, missing));
    }
    return webContext;
  } finally {
    await context.close();
  }
}

export async function collectTradeRepublicWafToken(
  browser: TradeRepublicBrowserLike,
  options: CollectTradeRepublicWafTokenOptions = {},
): Promise<TradeRepublicWafToken> {
  return toTradeRepublicWafToken(await collectTradeRepublicWebContext(browser, options));
}

export function toTradeRepublicWafToken(context: TradeRepublicWebContext): TradeRepublicWafToken {
  const normalized = normalizeTradeRepublicWebContext(context);
  if (!normalized.awsWafToken) {
    throw new TypeError('Trade Republic WAF token requires an AWS WAF token.');
  }
  return {
    awsWafToken: normalized.awsWafToken,
    ...(normalized.xsrfToken ? { xsrfToken: normalized.xsrfToken } : {}),
    ...(normalized.capturedAt ? { capturedAt: normalized.capturedAt } : {}),
  };
}

export function normalizeTradeRepublicWafToken(token: TradeRepublicWafToken): TradeRepublicWafToken {
  const awsWafToken = normalizeString(token.awsWafToken);
  if (!awsWafToken) {
    throw new TypeError('Trade Republic WAF token requires an AWS WAF token.');
  }
  const xsrfToken = normalizeString(token.xsrfToken);
  const capturedAt = normalizeString(token.capturedAt);
  return {
    awsWafToken,
    ...(xsrfToken ? { xsrfToken } : {}),
    ...(capturedAt ? { capturedAt } : {}),
  };
}

export function normalizeTradeRepublicWebContext(context: TradeRepublicWebContext): TradeRepublicWebContext {
  const headers = normalizeHeaders(context.headers);
  const cookieHeader = normalizeString(context.cookieHeader ?? headers.cookie);
  const cookies = {
    ...parseCookieHeader(cookieHeader),
    ...normalizeRecord(context.cookies),
  };
  const xsrfToken = normalizeString(context.xsrfToken ?? headers['x-xsrf-token'] ?? cookies['XSRF-TOKEN']);
  const awsWafToken = normalizeString(context.awsWafToken ?? headers['x-aws-waf-token']);
  const result: TradeRepublicWebContext = {};
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

export function mergeTradeRepublicWebContexts(
  current: TradeRepublicWebContext | undefined,
  next: TradeRepublicWebContext | undefined,
): TradeRepublicWebContext | undefined {
  if (!current && !next) return undefined;
  const left = current ? normalizeTradeRepublicWebContext(current) : {};
  const right = next ? normalizeTradeRepublicWebContext(next) : {};
  return normalizeTradeRepublicWebContext({
    headers: { ...(left.headers ?? {}), ...(right.headers ?? {}) },
    cookies: { ...(left.cookies ?? {}), ...(right.cookies ?? {}) },
    cookieHeader: [left.cookieHeader, right.cookieHeader].filter(Boolean).join('; '),
    awsWafToken: right.awsWafToken ?? left.awsWafToken,
    xsrfToken: right.xsrfToken ?? left.xsrfToken,
    capturedAt: right.capturedAt ?? left.capturedAt,
    metadata: { ...(left.metadata ?? {}), ...(right.metadata ?? {}) },
  });
}

function captureRequest(
  request: TradeRepublicRequestLike,
  appUrl: string,
  apiUrl: string,
  headers: Record<string, string>,
  cookies: Record<string, string>,
): void {
  const url = request.url();
  if (!isTradeRepublicUrl(url, appUrl, apiUrl)) return;
  const requestHeaders = normalizeHeaders(request.headers());
  for (const [name, value] of Object.entries(requestHeaders)) {
    if (!RELEVANT_HEADER_NAMES.has(name) || !value) continue;
    headers[name] = value;
  }
  Object.assign(cookies, parseCookieHeader(requestHeaders.cookie));
}

async function buildWebContext(
  context: TradeRepublicBrowserContextLike,
  appUrl: string,
  apiUrl: string,
  headers: Record<string, string>,
  requestCookies: Record<string, string>,
  page: TradeRepublicPageLike,
): Promise<TradeRepublicWebContext> {
  const browserCookies = cookieArrayToRecord(await context.cookies([appUrl, apiUrl]));
  const storageTokens = await readStorageTokens(page);
  return normalizeTradeRepublicWebContext({
    headers,
    cookies: { ...requestCookies, ...browserCookies },
    awsWafToken: headers['x-aws-waf-token'] ?? browserCookies['aws-waf-token'] ?? storageTokens.awsWafToken,
    xsrfToken: headers['x-xsrf-token'] ?? browserCookies['XSRF-TOKEN'] ?? storageTokens.xsrfToken,
    capturedAt: new Date().toISOString(),
    metadata: {
      source: 'playwright',
      appUrl,
      apiUrl,
    },
  });
}

async function readStorageTokens(page: TradeRepublicPageLike): Promise<{ awsWafToken?: string; xsrfToken?: string }> {
  if (!page.evaluate) return {};
  try {
    const storage = await page.evaluate(() => {
      const entries: Record<string, string> = {};
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
      'awswaf_session_storage',
      'x-aws-waf-token',
      'awsWafToken',
      'aws-waf-token',
    ]));
    const xsrfToken = firstStorageValue(storage, ['x-xsrf-token', 'xsrf']);
    return {
      ...(awsWafToken ? { awsWafToken } : {}),
      ...(xsrfToken ? { xsrfToken } : {}),
    };
  } catch {
    return {};
  }
}

function firstStorageValue(storage: Record<string, string>, needles: string[]): string | undefined {
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
  return undefined;
}

function decodeStorageToken(value: string | undefined): string | undefined {
  let current = value?.trim();
  if (!current) return undefined;
  for (let depth = 0; depth < 2; depth += 1) {
    try {
      const parsed = JSON.parse(current) as unknown;
      if (typeof parsed !== 'string' || !parsed.trim()) break;
      current = parsed.trim();
    } catch {
      break;
    }
  }
  return current;
}

function hasWafToken(context: TradeRepublicWebContext): boolean {
  return missingWafToken(context).length === 0;
}

function missingWafToken(context: TradeRepublicWebContext): string[] {
  const headers = context.headers ?? {};
  const missing = [];
  if (!(context.awsWafToken || headers['x-aws-waf-token'])) missing.push('x-aws-waf-token');
  if (!(context.cookieHeader || Object.keys(context.cookies ?? {}).length > 0)) missing.push('cookie');
  return missing;
}

function formatLoginContextError(context: TradeRepublicWebContext, missing: string[]): string {
  const headers = context.headers ?? {};
  const presentHeaders = [
    'x-aws-waf-token',
    'x-xsrf-token',
    'x-tr-app-version',
    'x-tr-platform',
    'x-tr-device-info',
    'accept-language',
    'cookie',
  ].filter((name) => Boolean(headers[name]));
  const cookieNames = Object.keys(context.cookies ?? {}).sort();
  const details = [
    `Missing: ${missing.join(', ') || 'none'}`,
    `Present headers: ${presentHeaders.join(', ') || 'none'}`,
    `Header preview: ${formatHeaderPreview(headers)}`,
    `Cookie names: ${cookieNames.join(', ') || 'none'}`,
  ];
  return `Trade Republic login context was incomplete after loading the web app. ${details.join(' | ')}`;
}

function formatHeaderPreview(headers: Record<string, string>): string {
  const previewNames = ['x-tr-app-version', 'x-tr-platform', 'x-tr-device-info', 'x-aws-waf-token', 'x-xsrf-token'];
  const preview = previewNames
    .flatMap((name) => {
      const value = headers[name];
      return value ? [`${name}=${redactHeaderValue(value)}`] : [];
    });
  return preview.join(', ') || 'none';
}

function redactHeaderValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 16) return trimmed;
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-4)}`;
}

function normalizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers ?? {})
      .map(([key, value]) => [key.toLowerCase(), value.trim()] as const)
      .filter(([key, value]) => key.length > 0 && value.length > 0),
  );
}

function normalizeRecord(record: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record ?? {}).filter(([key, value]) => key.length > 0 && value.length > 0),
  );
}

function normalizeString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cookieArrayToRecord(cookies: TradeRepublicCookieLike[]): Record<string, string> {
  return Object.fromEntries(cookies.filter((cookie) => cookie.name && cookie.value).map((cookie) => [cookie.name, cookie.value]));
}

function parseCookieHeader(value: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (value ?? '').split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    cookies[trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
  }
  return cookies;
}

function serializeCookies(cookies: Record<string, string>): string {
  return Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join('; ');
}

function isTradeRepublicUrl(value: string, appUrl: string, apiUrl: string): boolean {
  try {
    const url = new URL(value);
    return [new URL(appUrl), new URL(apiUrl)].some((base) => url.hostname === base.hostname || url.hostname.endsWith(`.${base.hostname}`));
  } catch {
    return false;
  }
}

async function wait(page: TradeRepublicPageLike, timeout: number): Promise<void> {
  if (page.waitForTimeout) {
    await page.waitForTimeout(timeout);
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, timeout));
}
