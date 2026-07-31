import type { EndpointKey, EndpointMap } from './types.js';

export const DEFAULT_ENDPOINTS: Required<EndpointMap> = {
  'auth.qrChallenge': '/api/v2/auth/web/login/qr-challenges',
  'auth.qrStatus': '/api/v2/auth/web/login/qr-challenges/{challengeId}',
  'auth.login': '/api/v2/auth/web/login',
  'auth.loginProcess': '/api/v2/auth/web/login/processes/{processId}',
  'auth.account': '/api/v2/auth/account',
  'auth.session': '/api/v1/auth/web/session',
  'orders.all': '/web-trading-gateway/api/customer/v1/orders',
  'orders.mutualFunds': '/api-gateway/mutual-funds/api/v1/orders',
  'orders.privateMarkets': '/api/v1/private-markets/orders/all',
  'market.subscriptions': '/api-gateway/subscriptions/api/v1/subscriptions',
  'market.entitlements': '/api-gateway/subscriptions/api/v1/entitlements/topics/{topic}',
  'market.bondCandles': '/api-gateway/quotes-api/v1/instruments/{assetId}.{exchangeId}/ytm/aggregateHistory',
};

export class EndpointResolver {
  private readonly endpoints: Required<EndpointMap>;

  constructor(overrides: EndpointMap = {}) {
    this.endpoints = { ...DEFAULT_ENDPOINTS, ...overrides };
  }

  resolve(key: EndpointKey, params: Record<string, string | number> = {}): string {
    let path = this.endpoints[key];
    for (const [name, value] of Object.entries(params)) {
      path = path.replaceAll(`{${name}}`, encodeURIComponent(String(value)));
    }
    return path;
  }
}
