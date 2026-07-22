import assert from 'node:assert/strict';
import { describe, expect, it } from './test-compat.js';
import { collectTradeRepublicWafContext, collectTradeRepublicWebContext } from '../src/waf.js';
import { TradeRepublicClient } from '../src/index.js';
import type {
  TradeRepublicBrowserContextLike,
  TradeRepublicBrowserLike,
  TradeRepublicCookieLike,
  TradeRepublicPageLike,
  TradeRepublicRequestLike,
} from '../src/index.js';

describe('collectTradeRepublicWebContext', () => {
  it('extracts WAF headers and cookies from a Playwright-like browser', async () => {
    const browser = new FakeBrowser();

    const context = await collectTradeRepublicWebContext(browser, {
      timeoutMs: 1_000,
      settleMs: 0,
    });

    expect(context).toMatchObject({
      awsWafToken: 'waf-token',
      xsrfToken: 'xsrf-cookie',
      headers: {
        'x-tr-app-version': '1.2.3',
        'x-tr-platform': 'web',
        'x-tr-device-info': 'test-device',
      },
      cookies: {
        tr_session: 'session-cookie',
        'XSRF-TOKEN': 'xsrf-cookie',
      },
    });
    expect(context.cookieHeader).toContain('tr_session=session-cookie');
    expect(browser.context?.closed).toBe(true);
  });

  it('decodes the WAF token storage value without confusing it with the refresh timestamp', async () => {
    const browser = new FakeBrowser(false);

    const context = await collectTradeRepublicWebContext(browser, {
      timeoutMs: 1_000,
      settleMs: 0,
    });

    expect(context.awsWafToken).toBe('storage-waf-token');
  });

  it('returns a shareable WAF context without account cookies or browser headers', async () => {
    const context = await collectTradeRepublicWafContext(new FakeBrowser(), {
      timeoutMs: 1_000,
      settleMs: 0,
    });

    expect(context).toMatchObject({
      awsWafToken: 'waf-token',
      xsrfToken: 'xsrf-cookie',
    });
    assert.deepEqual(Object.keys(context).sort(), ['awsWafToken', 'capturedAt', 'xsrfToken']);
    assert.equal('cookies' in context, false);
    assert.equal('headers' in context, false);
  });

  it('accepts a caller-owned browser without closing it', async () => {
    const browser = new FakeBrowser();

    const context = await TradeRepublicClient.collectWafToken({
      browser,
      timeoutMs: 1_000,
      settleMs: 0,
    });

    expect(context.awsWafToken).toBe('waf-token');
    expect(browser.context?.closed).toBe(true);
    expect(browser.closed).toBe(false);
  });

  it('rejects launch options for a caller-owned browser', async () => {
    const browser = new FakeBrowser();

    await assert.rejects(
      () => TradeRepublicClient.collectWafToken({
        browser,
        browserLaunchOptions: { headless: true },
      } as never),
      /browserLaunchOptions cannot be used/,
    );
    expect(browser.closed).toBe(false);
  });
});

class FakeBrowser implements TradeRepublicBrowserLike {
  context: FakeContext | undefined;
  closed = false;

  constructor(private readonly includeWafCookie = true) {}

  async newContext(): Promise<TradeRepublicBrowserContextLike> {
    this.context = new FakeContext(this.includeWafCookie);
    return this.context;
  }

  close(): void {
    this.closed = true;
  }
}

class FakeContext implements TradeRepublicBrowserContextLike {
  closed = false;
  private requestListeners: Array<(request: TradeRepublicRequestLike) => void> = [];

  constructor(private readonly includeWafCookie: boolean) {}

  async newPage(): Promise<TradeRepublicPageLike> {
    return new FakePage((request) => this.emitRequest(request));
  }

  async cookies(): Promise<TradeRepublicCookieLike[]> {
    return [
      { name: 'tr_session', value: 'session-cookie', domain: '.traderepublic.com' },
      { name: 'XSRF-TOKEN', value: 'xsrf-cookie', domain: '.traderepublic.com' },
      ...(this.includeWafCookie ? [{ name: 'aws-waf-token', value: 'waf-token', domain: '.traderepublic.com' }] : []),
    ];
  }

  close(): void {
    this.closed = true;
  }

  on(event: 'request', listener: (request: TradeRepublicRequestLike) => void): void {
    if (event === 'request') this.requestListeners.push(listener);
  }

  private emitRequest(request: TradeRepublicRequestLike): void {
    for (const listener of this.requestListeners) listener(request);
  }
}

class FakePage implements TradeRepublicPageLike {
  private requestListeners: Array<(request: TradeRepublicRequestLike) => void> = [];

  constructor(private readonly emitContextRequest: (request: TradeRepublicRequestLike) => void) {}

  async goto(): Promise<void> {
    const request = new FakeRequest('https://api.traderepublic.com/api/v2/auth/web/login/qr-challenges', {
      'x-tr-app-version': '1.2.3',
      'x-tr-platform': 'web',
      'x-tr-device-info': 'test-device',
      cookie: 'tr_claims=claims-cookie',
    });
    this.emitContextRequest(request);
    for (const listener of this.requestListeners) listener(request);
  }

  async waitForLoadState(): Promise<void> {
    throw new Error('WAF collection must not wait for networkidle');
  }

  async waitForTimeout(): Promise<void> {}

  async evaluate<T>(): Promise<T> {
    return {
      awswaf_token_refresh_timestamp: 'not-a-token',
      awswaf_session_storage: JSON.stringify('storage-waf-token'),
    } as T;
  }

  on(event: 'request', listener: (request: TradeRepublicRequestLike) => void): void {
    if (event === 'request') this.requestListeners.push(listener);
  }
}

class FakeRequest implements TradeRepublicRequestLike {
  constructor(
    private readonly requestUrl: string,
    private readonly requestHeaders: Record<string, string>,
  ) {}

  url(): string {
    return this.requestUrl;
  }

  headers(): Record<string, string> {
    return this.requestHeaders;
  }
}
