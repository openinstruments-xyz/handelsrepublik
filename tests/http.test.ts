import { describe, expect, it } from './test-compat.js';
import { HttpClient } from '../src/http.js';
import type { Session } from '../src/types.js';

describe('HttpClient headers', () => {
  it('derives x-xsrf-token from XSRF-TOKEN cookie', () => {
    const session: Session = {
      cookies: {
        'XSRF-TOKEN': 'abc%3D123',
      },
    };

    const client = new HttpClient({
      apiBaseUrl: 'https://api.traderepublic.com',
      locale: 'en',
      userAgent: 'test-agent',
      fetch,
      getSession: () => session,
    });

    const headers = client.headers();
    expect(headers['x-xsrf-token']).toBe('abc=123');
    expect(headers.cookie).toContain('XSRF-TOKEN=abc%3D123');
  });

  it('preserves explicit default headers', () => {
    const client = new HttpClient({
      apiBaseUrl: 'https://api.traderepublic.com',
      locale: 'en',
      userAgent: 'test-agent',
      defaultHeaders: {
        'x-aws-waf-token': 'waf-token',
      },
      fetch,
      getSession: () => undefined,
    });

    const headers = client.headers();
    expect(headers['x-aws-waf-token']).toBe('waf-token');
  });

  it('sends web context headers and cookies from the session', () => {
    const session: Session = {
      webContext: {
        headers: {
          'x-aws-waf-token': 'waf-token',
          'x-tr-app-version': '1.2.3',
        },
        cookies: {
          tr_session: 'web-session',
          'XSRF-TOKEN': 'xsrf%3Dtoken',
        },
      },
      cookies: {
        tr_claims: 'claims',
      },
    };

    const client = new HttpClient({
      apiBaseUrl: 'https://api.traderepublic.com',
      locale: 'en',
      userAgent: 'test-agent',
      fetch,
      getSession: () => session,
    });

    const headers = client.headers();
    expect(headers['x-aws-waf-token']).toBe('waf-token');
    expect(headers['x-tr-app-version']).toBe('1.2.3');
    expect(headers['x-xsrf-token']).toBe('xsrf=token');
    expect(headers.cookie).toContain('tr_session=web-session');
    expect(headers.cookie).toContain('tr_claims=claims');
  });

  it('only sends content-type for JSON body requests by default', () => {
    const client = new HttpClient({
      apiBaseUrl: 'https://api.traderepublic.com',
      locale: 'en',
      userAgent: 'test-agent',
      fetch,
      getSession: () => undefined,
    });

    expect(client.headers()['content-type']).toBeUndefined();
    expect(client.headers({}, true)['content-type']).toBe('application/json');
  });
});
