import { describe, expect, it } from './test-compat.js';
import { collectTradeRepublicWebContext } from '../src/waf.js';
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
        'x-aws-waf-token': 'waf-token',
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
});

class FakeBrowser implements TradeRepublicBrowserLike {
  context: FakeContext | undefined;

  async newContext(): Promise<TradeRepublicBrowserContextLike> {
    this.context = new FakeContext();
    return this.context;
  }
}

class FakeContext implements TradeRepublicBrowserContextLike {
  closed = false;
  private requestListeners: Array<(request: TradeRepublicRequestLike) => void> = [];

  async newPage(): Promise<TradeRepublicPageLike> {
    return new FakePage((request) => this.emitRequest(request));
  }

  async cookies(): Promise<TradeRepublicCookieLike[]> {
    return [
      { name: 'tr_session', value: 'session-cookie', domain: '.traderepublic.com' },
      { name: 'XSRF-TOKEN', value: 'xsrf-cookie', domain: '.traderepublic.com' },
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
      'x-aws-waf-token': 'waf-token',
      'x-tr-app-version': '1.2.3',
      'x-tr-platform': 'web',
      'x-tr-device-info': 'test-device',
      cookie: 'tr_claims=claims-cookie',
    });
    this.emitContextRequest(request);
    for (const listener of this.requestListeners) listener(request);
  }

  async waitForLoadState(): Promise<void> {}

  async waitForTimeout(): Promise<void> {}

  async evaluate<T>(): Promise<T> {
    return { awsWafToken: 'storage-waf-token' } as T;
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
