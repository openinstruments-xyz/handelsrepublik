import { TradeRepublicHttpError } from './errors.js';
import type {
  HttpMethod,
  RequestOptions,
  Session,
  TradeRepublicDefaultHeaders,
  TradeRepublicDeviceInfo,
  TradeRepublicWafContext,
} from './types.js';

export interface HttpClientOptions {
  apiBaseUrl: string;
  locale: string;
  userAgent: string;
  sdkHeaders?: Record<string, string> | undefined;
  defaultHeaders?: TradeRepublicDefaultHeaders | undefined;
  fetch: typeof fetch;
  getSession: () => Session | undefined;
  getDeviceInfo: () => TradeRepublicDeviceInfo;
  getWafContext?: (() => TradeRepublicWafContext | undefined) | undefined;
}

export class HttpClient {
  constructor(private readonly options: HttpClientOptions) {}

  async request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
    requestOptions: RequestOptions = {},
  ): Promise<T> {
    const url = new URL(path, this.options.apiBaseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers = this.headers(requestOptions.headers, body !== undefined);
    const init: RequestInit = {
      method,
      headers,
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    if (requestOptions.signal) init.signal = requestOptions.signal;
    const response = await this.options.fetch(url, init);
    const responseBody = await parseResponseBody(response);
    if (!response.ok) {
      throw new TradeRepublicHttpError(`Trade Republic request failed: ${method} ${url.pathname}`, response.status, responseBody);
    }
    return responseBody as T;
  }

  async requestDetailed<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
    requestOptions: RequestOptions = {},
  ): Promise<{ body: T; headers: Headers; status: number; url: string }> {
    const url = new URL(path, this.options.apiBaseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers = this.headers(requestOptions.headers, body !== undefined);
    const init: RequestInit = {
      method,
      headers,
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    if (requestOptions.signal) init.signal = requestOptions.signal;
    const response = await this.options.fetch(url, init);
    const responseBody = await parseResponseBody(response);
    if (!response.ok) {
      throw new TradeRepublicHttpError(`Trade Republic request failed: ${method} ${url.pathname}`, response.status, responseBody);
    }
    return { body: responseBody as T, headers: response.headers, status: response.status, url: response.url };
  }

  headers(extra: Record<string, string> = {}, hasJsonBody = false): Record<string, string> {
    const session = this.options.getSession();
    const webContext = session?.webContext;
    const wafContext = this.options.getWafContext?.();
    const xsrfToken = session?.cookies?.['XSRF-TOKEN']
      ?? wafContext?.xsrfToken
      ?? webContext?.cookies?.['XSRF-TOKEN']
      ?? webContext?.xsrfToken;
    const webContextHeaders = normalizeHeaderRecord(webContext?.headers);
    if (wafContext) {
      deleteHeader(webContextHeaders, 'x-aws-waf-token');
      deleteHeader(webContextHeaders, 'x-xsrf-token');
    }
    const headers: Record<string, string> = {
      accept: 'application/json, text/plain, */*',
      'accept-language': this.options.locale,
      origin: 'https://app.traderepublic.com',
      referer: 'https://app.traderepublic.com/',
      'user-agent': this.options.userAgent,
      ...webContextHeaders,
      ...normalizeHeaderRecord(this.options.sdkHeaders),
      'x-tr-device-info': encodeDeviceInfo(this.options.getDeviceInfo()),
      ...normalizeHeaderRecord(this.options.defaultHeaders),
      ...extra,
    };
    if (hasJsonBody && !hasHeader(headers, 'content-type')) headers['content-type'] = 'application/json';
    if (session?.accessToken) headers.authorization = `Bearer ${session.accessToken}`;
    if (session?.sessionToken) headers['x-tr-session'] = session.sessionToken;
    const awsWafToken = wafContext?.awsWafToken ?? webContext?.awsWafToken;
    if (awsWafToken && !hasHeader(headers, 'x-aws-waf-token')) headers['x-aws-waf-token'] = awsWafToken;
    if (xsrfToken && !hasHeader(headers, 'x-xsrf-token')) headers['x-xsrf-token'] = decodeCookieValue(xsrfToken);
    const cookies = { ...(webContext?.cookies ?? {}), ...(session?.cookies ?? {}) };
    if (wafContext?.awsWafToken) cookies['aws-waf-token'] = wafContext.awsWafToken;
    if (wafContext?.xsrfToken && !cookies['XSRF-TOKEN']) cookies['XSRF-TOKEN'] = wafContext.xsrfToken;
    const cookieHeader = mergeCookieHeaders(
      [headers.cookie, webContext?.cookieHeader].filter((value): value is string => Boolean(value)).join('; '),
      cookies,
    );
    if (cookieHeader) {
      headers.cookie = cookieHeader;
    }
    return headers;
  }
}

function encodeDeviceInfo(deviceInfo: TradeRepublicDeviceInfo): string {
  return Buffer.from(JSON.stringify(deviceInfo), 'utf8').toString('base64');
}

function normalizeHeaderRecord(headers: Record<string, string | undefined> | undefined): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (typeof value === 'string' && value.length > 0) normalized[name] = value;
  }
  return normalized;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lowerName = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lowerName);
}

function deleteHeader(headers: Record<string, string>, name: string): void {
  const lowerName = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lowerName) delete headers[key];
  }
}

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function mergeCookieHeaders(defaultCookieHeader: string | undefined, sessionCookies: Record<string, string> | undefined): string {
  const cookies = new Map<string, string>();
  for (const part of (defaultCookieHeader ?? '').split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    cookies.set(trimmed.slice(0, separator), trimmed.slice(separator + 1));
  }
  for (const [key, value] of Object.entries(sessionCookies ?? {})) {
    if (value) cookies.set(key, value);
  }
  return Array.from(cookies.entries()).map(([key, value]) => `${key}=${value}`).join('; ');
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return response.json();
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
