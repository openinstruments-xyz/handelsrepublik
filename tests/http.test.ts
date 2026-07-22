import assert from 'node:assert/strict';
import { describe, expect, it } from './test-compat.js';
import { HttpClient } from '../src/http.js';
import type { Session, TradeRepublicDeviceInfo } from '../src/types.js';

const deviceInfo: TradeRepublicDeviceInfo = {
  stableDeviceId: 'test-fingerprint',
  browser: 'Chrome',
  preferredLanguages: ['de-DE', 'de'],
  numberOfCores: 8,
};

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
      getDeviceInfo: () => deviceInfo,
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
      getDeviceInfo: () => deviceInfo,
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
      getDeviceInfo: () => deviceInfo,
    });

    const headers = client.headers();
    expect(headers['x-aws-waf-token']).toBe('waf-token');
    expect(headers['x-tr-app-version']).toBe('1.2.3');
    expect(headers['x-xsrf-token']).toBe('xsrf=token');
    expect(headers.cookie).toContain('tr_session=web-session');
    expect(headers.cookie).toContain('tr_claims=claims');
  });

  it('shares WAF proof while keeping account cookies isolated', () => {
    const wafToken = {
      awsWafToken: 'shared-waf-token',
      xsrfToken: 'anonymous-xsrf%3Dtoken',
    };
    const alice = new HttpClient({
      apiBaseUrl: 'https://api.traderepublic.com',
      locale: 'en',
      userAgent: 'test-agent',
      fetch,
      getSession: () => ({ cookies: { tr_session: 'alice-session' } }),
      getDeviceInfo: () => deviceInfo,
      getWafToken: () => wafToken,
    });
    const bob = new HttpClient({
      apiBaseUrl: 'https://api.traderepublic.com',
      locale: 'en',
      userAgent: 'test-agent',
      fetch,
      getSession: () => ({ cookies: { tr_session: 'bob-session' } }),
      getDeviceInfo: () => deviceInfo,
      getWafToken: () => wafToken,
    });

    const aliceHeaders = alice.headers();
    const bobHeaders = bob.headers();
    expect(aliceHeaders['x-aws-waf-token']).toBe('shared-waf-token');
    expect(bobHeaders['x-aws-waf-token']).toBe('shared-waf-token');
    expect(aliceHeaders['x-xsrf-token']).toBe('anonymous-xsrf=token');
    expect(aliceHeaders.cookie).toContain('aws-waf-token=shared-waf-token');
    expect(aliceHeaders.cookie).toContain('tr_session=alice-session');
    assert.doesNotMatch(aliceHeaders.cookie ?? '', /bob-session/);
    expect(bobHeaders.cookie).toContain('tr_session=bob-session');
    assert.doesNotMatch(bobHeaders.cookie ?? '', /alice-session/);
  });

  it('lets user headers override SDK and captured browser headers', () => {
    const client = new HttpClient({
      apiBaseUrl: 'https://api.traderepublic.com',
      locale: 'en',
      userAgent: 'test-agent',
      sdkHeaders: { 'x-tr-app-version': 'sdk' },
      defaultHeaders: { 'x-tr-app-version': 'user' },
      fetch,
      getSession: () => ({ webContext: { headers: { 'x-tr-app-version': 'browser' } } }),
      getDeviceInfo: () => deviceInfo,
    });

    expect(client.headers()['x-tr-app-version']).toBe('user');
  });

  it('only sends content-type for JSON body requests by default', () => {
    const client = new HttpClient({
      apiBaseUrl: 'https://api.traderepublic.com',
      locale: 'en',
      userAgent: 'test-agent',
      fetch,
      getSession: () => undefined,
      getDeviceInfo: () => deviceInfo,
    });

    expect(client.headers()['content-type']).toBeUndefined();
    expect(client.headers({}, true)['content-type']).toBe('application/json');
  });

  it('encodes the session device information as x-tr-device-info', () => {
    const client = new HttpClient({
      apiBaseUrl: 'https://api.traderepublic.com',
      locale: 'de',
      userAgent: 'test-agent',
      fetch,
      getSession: () => ({ deviceInfo }),
      getDeviceInfo: () => deviceInfo,
    });

    const decoded = JSON.parse(Buffer.from(client.headers()['x-tr-device-info']!, 'base64').toString('utf8'));
    expect(decoded).toEqual(deviceInfo);
  });
});
