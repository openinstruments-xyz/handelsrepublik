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
