import { EventEmitter } from 'node:events';
import { platform } from 'node:os';
import { expect } from '../test-compat.js';
import type { TradeRepublicDeviceInfo, WebSocketLike } from '../../src/types.js';

export const TEST_DEVICE_INFO: TradeRepublicDeviceInfo = {
  stableDeviceId: 'test-fingerprint',
  browser: 'Chrome',
  preferredLanguages: ['de-DE', 'de'],
  numberOfCores: 8,
};

export function preparedReplacement() {
  return {
    parameters: {
      instrumentId: 'DE000FC9RTV1', exchangeId: 'SGL', mode: 'limit', size: 2, type: 'buy', limit: 1.51,
      expiry: { type: 'gfd' }, sellFractions: false, settlementCurrency: 'EUR', tradingCurrency: 'EUR',
    },
    clientProcessId: 'replacement-process',
    secAccNo: '0000000000',
    warningsShown: ['appropriatenessTestingAppropriateUser'],
  };
}

export function expectedOperatingSystem(): string {
  const nodePlatform = platform();
  if (nodePlatform === 'win32') return 'Windows';
  if (nodePlatform === 'darwin') return 'Mac OS';
  if (nodePlatform === 'linux') return 'Linux';
  return nodePlatform;
}

export function mockFetch(calls: Array<{ url: string; init: RequestInit }>, responseBody: unknown): typeof fetch {
  return (async (url: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return jsonResponse(responseBody);
  }) as typeof fetch;
}

export function memorySessionStore(saved: unknown[]) {
  return {
    async load() {
      return undefined;
    },
    async save(session: unknown) {
      saved.push(structuredClone(session));
    },
    async clear() {},
  };
}

export function mockFetchSequence(calls: Array<{ url: string; init: RequestInit }>, responses: Response[]): typeof fetch {
  return (async (url: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const response = responses.shift();
    return response ?? jsonResponse({ error: 'not found' }, 404);
  }) as typeof fetch;
}

export function expectOrderCall(call: { url: string; init: RequestInit } | undefined, expected: Record<string, string>): void {
  expect(call).toBeDefined();
  const url = new URL(call?.url ?? 'https://invalid.local/');
  expect(url.origin).toBe('https://api.traderepublic.com');
  expect(url.pathname).toBe('/web-trading-gateway/api/customer/v1/orders');
  for (const [key, value] of Object.entries(expected)) {
    expect(url.searchParams.get(key)).toBe(value);
  }
}

export function parseSubPayload(message: string | undefined): unknown {
  expect(message).toBeDefined();
  const text = String(message ?? '');
  const secondSpace = text.indexOf(' ', text.indexOf(' ') + 1);
  return JSON.parse(text.slice(secondSpace + 1));
}

export function accountPairsPayload(): unknown {
  return {
    authAccountId: 'auth-account-1',
    accounts: [
      {
        securitiesAccountNumber: '0000000001',
        cashAccountNumber: '0000000002',
        productType: 'DEFAULT',
        currency: 'EUR',
        accountAccessType: 'OWNER',
      },
    ],
  };
}

export function authAccountPayload(): unknown {
  return {
    phoneNumber: '+491234567890',
    jurisdiction: 'DE',
    name: {
      firstName: 'Example',
      lastName: 'User',
    },
    email: {
      address: 'example@example.invalid',
    },
    cashAccount: {
      iban: 'DE00000000000000000000',
    },
    securitiesAccountNumber: '0000000001',
    personId: 'person-1',
  };
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

export class EventEmitterOnlySocket extends EventEmitter implements WebSocketLike {
  send(): void {}
  close(): void {
    this.emit('close');
  }
}
