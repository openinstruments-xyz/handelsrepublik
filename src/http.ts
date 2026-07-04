import { TradeRepublicHttpError } from './errors.js';
import type { HttpMethod, RequestOptions, Session } from './types.js';

export interface HttpClientOptions {
  apiBaseUrl: string;
  locale: string;
  userAgent: string;
  defaultHeaders?: Record<string, string> | undefined;
  fetch: typeof fetch;
  getSession: () => Session | undefined;
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
    const xsrfToken = session?.cookies?.['XSRF-TOKEN'];
    const headers: Record<string, string> = {
      accept: 'application/json, text/plain, */*',
      'accept-language': this.options.locale,
      origin: 'https://app.traderepublic.com',
      referer: 'https://app.traderepublic.com/',
      'user-agent': this.options.userAgent,
      ...normalizeHeaderRecord(this.options.defaultHeaders),
      ...extra,
    };
    if (hasJsonBody && !hasHeader(headers, 'content-type')) headers['content-type'] = 'application/json';
    if (session?.accessToken) headers.authorization = `Bearer ${session.accessToken}`;
    if (session?.sessionToken) headers['x-tr-session'] = session.sessionToken;
    if (xsrfToken && !hasHeader(headers, 'x-xsrf-token')) headers['x-xsrf-token'] = decodeCookieValue(xsrfToken);
    const cookieHeader = mergeCookieHeaders(headers.cookie, session?.cookies);
    if (cookieHeader) {
      headers.cookie = cookieHeader;
    }
    return headers;
  }
}

function normalizeHeaderRecord(headers: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers ?? {}).filter(([, value]) => typeof value === 'string' && value.length > 0),
  );
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lowerName = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lowerName);
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
