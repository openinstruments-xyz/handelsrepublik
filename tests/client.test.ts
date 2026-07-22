import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { cpus, platform, totalmem } from 'node:os';
import { describe, expect, it } from './test-compat.js';
import { MapperRequestError, TradeRepublicClient } from '../src/index.js';
import {
  decodeMapperProtobufRequest,
  encodeMapperProtobufDataEnvelope,
  encodeMapperProtobufTopicPayload,
} from '../src/mapper-protobuf.js';
import { FakeSocket } from './fake-socket.js';
import type { InstantLoginChallenge, TradeRepublicDeviceInfo, WebSocketLike } from '../src/types.js';

const TEST_DEVICE_INFO: TradeRepublicDeviceInfo = {
  stableDeviceId: 'test-fingerprint',
  browser: 'Chrome',
  preferredLanguages: ['de-DE', 'de'],
  numberOfCores: 8,
};

describe('TradeRepublicClient', () => {
  it('rejects sessions without device information', () => {
    assert.throws(() => TradeRepublicClient.create({
      session: {
        sessionToken: 'session-without-device-info',
      },
    }), /must contain deviceInfo/);
  });

  it('creates a QR challenge through the v2 login endpoint', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = TradeRepublicClient.create({
      fetch: mockFetch(calls, {
        id: 'challenge-1',
        qrCodeDataUrl: 'data:image/png;base64,abc',
      }),
    });

    let challenge: InstantLoginChallenge | undefined;
    await assert.rejects(client.auth.loginWithQr({
      deviceName: 'sdk-test',
      onChallengeUpdate(update) {
        challenge = update;
        throw new Error('challenge observed');
      },
    }), /challenge observed/);

    expect(challenge).toMatchObject({
      id: 'challenge-1',
      qrCodeDataUrl: 'data:image/png;base64,abc',
    });
    expect('createInstantLogin' in client.auth).toBe(false);
    expect('pollInstantLogin' in client.auth).toBe(false);
    expect(calls[0]?.url).toBe('https://api.traderepublic.com/api/v2/auth/web/login/qr-challenges');
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.body).toBe(JSON.stringify({ deviceName: 'sdk-test' }));
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['x-tr-app-version']).toBe('15.101.0');
    expect(headers['x-tr-platform']).toBe('web-pro');
    assert.match(headers['user-agent']!, /Firefox\/152\.0$/);
    const deviceInfo = JSON.parse(Buffer.from(headers['x-tr-device-info']!, 'base64').toString('utf8')) as Record<string, unknown>;
    expect(deviceInfo).toMatchObject({
      browser: 'Firefox',
      os: expectedOperatingSystem(),
    });
    assert.match(String(deviceInfo.stableDeviceId), /^[0-9a-f]{128}$/);
    assert.equal(deviceInfo.numberOfCores, cpus().length);
    assert.equal(deviceInfo.deviceMemory, Math.max(1, Math.round(totalmem() / 1024 ** 3)));
  });

  it('accepts spoofed device values and randomizes unspecified fingerprints per client', async () => {
    const firstCalls: Array<{ url: string; init: RequestInit }> = [];
    const secondCalls: Array<{ url: string; init: RequestInit }> = [];
    const first = TradeRepublicClient.create({
      deviceInfo: {
        stableDeviceId: 'spoofed-fingerprint',
        browser: 'Custom Browser',
        preferredLanguages: ['de-AT', 'de', 'en'],
        numberOfCores: 24,
        deviceMemory: 64,
      },
      fetch: mockFetch(firstCalls, { id: 'first', qrCodePayload: 'first-qr' }),
    });
    const second = TradeRepublicClient.create({
      fetch: mockFetch(secondCalls, { id: 'second', qrCodePayload: 'second-qr' }),
    });

    await assert.rejects(first.auth.loginWithQr({ onChallengeUpdate() { throw new Error('stop'); } }), /stop/);
    await assert.rejects(second.auth.loginWithQr({ onChallengeUpdate() { throw new Error('stop'); } }), /stop/);

    const firstHeaders = firstCalls[0]?.init.headers as Record<string, string>;
    const secondHeaders = secondCalls[0]?.init.headers as Record<string, string>;
    const firstDevice = JSON.parse(Buffer.from(firstHeaders['x-tr-device-info']!, 'base64').toString('utf8'));
    const secondDevice = JSON.parse(Buffer.from(secondHeaders['x-tr-device-info']!, 'base64').toString('utf8'));

    expect(firstDevice).toMatchObject({
      stableDeviceId: 'spoofed-fingerprint',
      browser: 'Custom Browser',
      preferredLanguages: ['de-AT', 'de', 'en'],
      numberOfCores: 24,
      deviceMemory: 64,
    });
    assert.match(secondDevice.stableDeviceId, /^[0-9a-f]{128}$/);
    assert.notEqual(firstDevice.stableDeviceId, secondDevice.stableDeviceId);
  });

  it('allows callers to override the SDK Trade Republic headers', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = TradeRepublicClient.create({
      defaultHeaders: {
        'x-tr-app-version': 'custom-version',
        'x-tr-platform': 'custom-platform',
        'x-tr-device-info': 'custom-device',
      },
      webContext: {
        headers: {
          'x-tr-app-version': 'captured-version',
          'x-tr-platform': 'captured-platform',
          'x-tr-device-info': Buffer.from(JSON.stringify({
            stableDeviceId: 'captured-fingerprint',
          })).toString('base64'),
        },
      },
      fetch: mockFetch(calls, { id: 'challenge-1', qrCodePayload: 'qr' }),
    });

    await assert.rejects(client.auth.loginWithQr({ onChallengeUpdate() { throw new Error('stop'); } }), /stop/);

    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['x-tr-app-version']).toBe('custom-version');
    expect(headers['x-tr-platform']).toBe('custom-platform');
    expect(headers['x-tr-device-info']).toBe('custom-device');
  });

  it('delivers the initial and rotated QR payloads through one challenge callback', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = TradeRepublicClient.create({
      fetch: mockFetchSequence(calls, [
        jsonResponse({
          id: 'challenge-1',
          qrCodePayload: 'https://example.test/login?token=initial',
          challengeExpiresAt: '2099-07-21T14:01:00.000Z',
          qrCodeTokenExpiresAt: '2099-07-21T14:00:00.000Z',
        }),
        jsonResponse({
          status: 'PENDING',
          qrCodePayload: 'https://example.test/login?token=one',
          challengeExpiresAt: '2099-07-21T14:01:00.000Z',
          qrCodeTokenExpiresAt: '2099-07-21T14:00:10.000Z',
        }),
        jsonResponse({
          status: 'PENDING',
          qrCodePayload: 'https://example.test/login?token=one',
          challengeExpiresAt: '2099-07-21T14:01:00.000Z',
          qrCodeTokenExpiresAt: '2099-07-21T14:00:10.000Z',
        }),
        jsonResponse({
          status: 'PENDING',
          qrCodePayload: 'https://example.test/login?token=two',
          challengeExpiresAt: '2099-07-21T14:01:00.000Z',
          qrCodeTokenExpiresAt: '2099-07-21T14:00:20.000Z',
        }),
      ]),
    });
    const updates: InstantLoginChallenge[] = [];

    await assert.rejects(
      client.auth.loginWithQr({
        intervalMs: 0,
        onChallengeUpdate(update) {
          updates.push(update);
          if (update.qrCode?.endsWith('token=two')) throw new Error('stop after rotated token');
        },
      }),
      /stop after rotated token/,
    );

    expect(updates).toEqual([
      expect.objectContaining({
        qrCode: 'https://example.test/login?token=initial',
        challengeExpiresAt: '2099-07-21T14:01:00.000Z',
        qrCodeTokenExpiresAt: '2099-07-21T14:00:00.000Z',
      }),
      expect.objectContaining({
        qrCode: 'https://example.test/login?token=one',
        challengeExpiresAt: '2099-07-21T14:01:00.000Z',
        qrCodeTokenExpiresAt: '2099-07-21T14:00:10.000Z',
      }),
      expect.objectContaining({
        qrCode: 'https://example.test/login?token=two',
        challengeExpiresAt: '2099-07-21T14:01:00.000Z',
        qrCodeTokenExpiresAt: '2099-07-21T14:00:20.000Z',
      }),
    ]);
    expect(calls).toHaveLength(4);
  });

  it('replaces an expired instant-login challenge behind the callback', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = TradeRepublicClient.create({
      fetch: mockFetchSequence(calls, [
        jsonResponse({ id: 'challenge-1', qrCodePayload: 'https://example.test/login?token=one' }),
        jsonResponse({ status: 'EXPIRED' }),
        jsonResponse({ id: 'challenge-2', qrCodePayload: 'https://example.test/login?token=two' }),
      ]),
    });
    const challengeIds: string[] = [];

    await assert.rejects(
      client.auth.loginWithQr({
        deviceName: 'callback-test',
        intervalMs: 0,
        onChallengeUpdate(update) {
          challengeIds.push(update.id);
          if (update.id === 'challenge-2') throw new Error('observed replacement challenge');
        },
      }),
      /observed replacement challenge/,
    );

    expect(challengeIds).toEqual(['challenge-1', 'challenge-2']);
    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ['POST', 'https://api.traderepublic.com/api/v2/auth/web/login/qr-challenges'],
      ['GET', 'https://api.traderepublic.com/api/v2/auth/web/login/qr-challenges/challenge-1'],
      ['POST', 'https://api.traderepublic.com/api/v2/auth/web/login/qr-challenges'],
    ]);
  });

  it('reuses WAF token across account clients without persisting it in either session', async () => {
    const wafToken = {
      awsWafToken: 'shared-waf-token',
      xsrfToken: 'shared-xsrf',
    };
    const savedAliceSessions: unknown[] = [];
    const savedBobSessions: unknown[] = [];
    const aliceCalls: Array<{ url: string; init: RequestInit }> = [];
    const bobCalls: Array<{ url: string; init: RequestInit }> = [];
    const alice = TradeRepublicClient.create({
      wafToken,
      session: {
        deviceInfo: TEST_DEVICE_INFO,
        cookies: { tr_session: 'alice-session' },
      },
      sessionStore: memorySessionStore(savedAliceSessions),
      fetch: mockFetch(aliceCalls, { id: 'alice-challenge', qrCodePayload: 'alice-qr' }),
    });
    const bob = TradeRepublicClient.create({
      wafToken,
      session: {
        deviceInfo: TEST_DEVICE_INFO,
        cookies: { tr_session: 'bob-session' },
      },
      sessionStore: memorySessionStore(savedBobSessions),
      fetch: mockFetch(bobCalls, { id: 'bob-challenge', qrCodePayload: 'bob-qr' }),
    });

    await assert.rejects(alice.auth.loginWithQr({ onChallengeUpdate() { throw new Error('stop'); } }), /stop/);
    await assert.rejects(bob.auth.loginWithQr({ onChallengeUpdate() { throw new Error('stop'); } }), /stop/);
    await alice.auth.saveSession();
    await bob.auth.saveSession();

    const aliceHeaders = aliceCalls[0]?.init.headers as Record<string, string>;
    const bobHeaders = bobCalls[0]?.init.headers as Record<string, string>;
    expect(aliceHeaders['x-aws-waf-token']).toBe('shared-waf-token');
    expect(bobHeaders['x-aws-waf-token']).toBe('shared-waf-token');
    expect(aliceHeaders.cookie).toContain('tr_session=alice-session');
    assert.doesNotMatch(aliceHeaders.cookie ?? '', /bob-session/);
    expect(bobHeaders.cookie).toContain('tr_session=bob-session');
    assert.doesNotMatch(bobHeaders.cookie ?? '', /alice-session/);
    assert.equal('wafToken' in (alice.getSession() ?? {}), false);
    assert.equal('wafToken' in (bob.getSession() ?? {}), false);
    assert.equal(JSON.stringify(savedAliceSessions).includes('shared-waf-token'), false);
    assert.equal(JSON.stringify(savedBobSessions).includes('shared-waf-token'), false);

    alice.useWafToken({ awsWafToken: 'renewed-waf-token' });
    await assert.rejects(alice.auth.loginWithQr({ onChallengeUpdate() { throw new Error('stop'); } }), /stop/);
    const renewedHeaders = aliceCalls[1]?.init.headers as Record<string, string>;
    expect(renewedHeaders['x-aws-waf-token']).toBe('renewed-waf-token');
  });

  it('logs in with phone and PIN through the v2 web login endpoint', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const saved: unknown[] = [];
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      sessionStore: {
        async load() {
          return undefined;
        },
        async save(session) {
          saved.push(session);
        },
        async clear() {},
      },
      fetch: mockFetchSequence(calls, [
        jsonResponse({
          status: 'CONFIRMED',
          processId: 'process-1',
        }, 200, {
          'set-cookie': 'JSESSIONID=start-session; Path=/; Secure; HttpOnly',
        }),
        jsonResponse({
          status: 'COMPLETED',
        }, 200, {
          'set-cookie': 'JSESSIONID=complete-session; Path=/; Secure; HttpOnly',
        }),
        jsonResponse({
          session: {
            connectionToken: 'session-token',
          },
        }),
      ]),
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') {
            socket.emit('message', `${id} A ${JSON.stringify(accountPairsPayload())}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.auth.loginWithPin({
      phoneNumber: '+491234567890',
      pin: '1234',
      intervalMs: 0,
    })).resolves.toMatchObject({
      sessionToken: 'session-token',
      securitiesAccountNumber: '0000000001',
      cookies: {
        JSESSIONID: 'complete-session',
      },
    });

    expect(calls[0]?.url).toBe('https://api.traderepublic.com/api/v2/auth/web/login');
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.body).toBe(JSON.stringify({ phoneNumber: '+491234567890', pin: '1234' }));
    expect(calls[1]?.url).toBe('https://api.traderepublic.com/api/v2/auth/web/login/processes/process-1');
    expect(calls[2]?.url).toBe('https://api.traderepublic.com/api/v1/auth/web/session');
    expect(saved).toEqual([expect.objectContaining({ securitiesAccountNumber: '0000000001' })]);
  });

  it('carries QR login cookies across poll steps before completing the web session', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const saved: unknown[] = [];
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      sessionStore: {
        async load() {
          return undefined;
        },
        async save(session) {
          saved.push(session);
        },
        async clear() {},
      },
      fetch: mockFetchSequence(calls, [
        jsonResponse({ id: 'challenge-1' }),
        jsonResponse({
          status: 'CLAIMED',
          processId: 'process-1',
        }, 200, {
          'set-cookie': 'JSESSIONID=claim-session; Path=/; Secure; HttpOnly',
        }),
        jsonResponse({
          status: 'CONFIRMED',
        }, 200, {
          'set-cookie': 'tr_external_id=external-1; Path=/; Domain=traderepublic.com; Secure; SameSite=Strict',
        }),
        jsonResponse({
          status: 'COMPLETED',
        }, 200, {
          'set-cookie': 'JSESSIONID=complete-session; Path=/; Secure; HttpOnly',
        }),
        jsonResponse({
          session: {
            connectionToken: 'session-token',
          },
        }),
      ]),
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') {
            socket.emit('message', `${id} A ${JSON.stringify(accountPairsPayload())}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.auth.loginWithQr({
      intervalMs: 0,
      onChallengeUpdate() {},
    })).resolves.toMatchObject({
      sessionToken: 'session-token',
      securitiesAccountNumber: '0000000001',
      cookies: {
        JSESSIONID: 'complete-session',
        tr_external_id: 'external-1',
      },
    });

    const sessionCall = calls[4];
    expect(sessionCall?.url).toBe('https://api.traderepublic.com/api/v1/auth/web/session');
    const sessionHeaders = sessionCall?.init.headers as Record<string, string>;
    expect(sessionHeaders.cookie).toContain('JSESSIONID=complete-session');
    expect(sessionHeaders.cookie).toContain('tr_external_id=external-1');
    expect(client.securitiesAccountNumber).toBe('0000000001');
    expect(client.getSession()).toMatchObject({ securitiesAccountNumber: '0000000001' });
    expect(saved).toEqual([expect.objectContaining({ securitiesAccountNumber: '0000000001' })]);
    expect(parseSubPayload(sockets[0]?.sent[1])).toMatchObject({ type: 'accountPairs' });
  });

  it('completes QR login when the current web flow remains confirmed', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      fetch: mockFetchSequence(calls, [
        jsonResponse({ id: 'challenge-1' }),
        jsonResponse({ status: 'CLAIMED', processId: 'process-1' }, 200, {
          'set-cookie': 'JSESSIONID=claim-session; Path=/; Secure; HttpOnly',
        }),
        jsonResponse({ status: 'CONFIRMED' }, 200, {
          'set-cookie': 'tr_external_id=external-1; Path=/; Secure; SameSite=Strict',
        }),
        jsonResponse({ status: 'CONFIRMED' }, 200, {
          'set-cookie': 'JSESSIONID=confirmed-session; Path=/; Secure; HttpOnly',
        }),
        jsonResponse({ session: { connectionToken: 'session-token' } }),
      ]),
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') {
            socket.emit('message', `${id} A ${JSON.stringify(accountPairsPayload())}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.auth.loginWithQr({
      intervalMs: 0,
      onChallengeUpdate() {},
    })).resolves.toMatchObject({
      sessionToken: 'session-token',
      cookies: {
        JSESSIONID: 'confirmed-session',
        tr_external_id: 'external-1',
      },
    });
    expect(calls[4]?.url).toBe('https://api.traderepublic.com/api/v1/auth/web/session');
  });

  it('refreshes the saved web session cookies', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const saved: unknown[] = [];
    const client = TradeRepublicClient.create({
      session: {
        deviceInfo: TEST_DEVICE_INFO,
        cookies: {
          tr_claims: 'old-claims',
          tr_session: 'old-session',
        },
        securitiesAccountNumber: '0000000000',
      },
      sessionStore: {
        async load() {
          return undefined;
        },
        async save(session) {
          saved.push(session);
        },
        async clear() {},
      },
      fetch: mockFetchSequence(calls, [
        jsonResponse({ status: 'ok' }, 200, {
          'set-cookie': [
            'tr_claims=new-claims; Path=/; Domain=traderepublic.com; Secure; SameSite=Strict',
            'tr_session=new-session; Path=/; Domain=traderepublic.com; Secure; SameSite=Strict',
          ].join(', '),
        }),
      ]),
    });

    await expect(client.auth.refreshSession()).resolves.toMatchObject({
      cookies: {
        tr_claims: 'new-claims',
        tr_session: 'new-session',
      },
      securitiesAccountNumber: '0000000000',
    });
    expect(calls[0]?.url).toBe('https://api.traderepublic.com/api/v1/auth/web/session');
    const refreshHeaders = calls[0]?.init.headers as Record<string, string>;
    expect(refreshHeaders.cookie).toContain('tr_claims=old-claims');
    expect(refreshHeaders.cookie).toContain('tr_session=old-session');
    expect(saved).toHaveLength(1);
  });

  it('initializes the public securities account number from an existing session', () => {
    const client = TradeRepublicClient.create({
      session: {
        deviceInfo: TEST_DEVICE_INFO,
        securitiesAccountNumber: '0000000000',
      },
    });

    expect(client.securitiesAccountNumber).toBe('0000000000');
    expect(client.getSession()).toMatchObject({ securitiesAccountNumber: '0000000000' });
  });

  it('attaches web context per client and preserves it when saving sessions', async () => {
    const saved: unknown[] = [];
    const first = TradeRepublicClient.create({
      deviceInfo: {
        stableDeviceId: 'captured-fingerprint',
        browser: 'Firefox',
        preferredLanguages: ['de-DE', 'de'],
        numberOfCores: 8,
      },
      sessionStore: {
        async load() {
          return undefined;
        },
        async save(session) {
          saved.push(session);
        },
        async clear() {},
      },
    });
    const second = TradeRepublicClient.create();

    first.useWebContext({
      awsWafToken: 'waf-token',
      cookies: {
        tr_session: 'web-session',
      },
    });
    await first.auth.saveSession();

    expect(first.getSession()).toMatchObject({
      deviceInfo: {
        stableDeviceId: 'captured-fingerprint',
        preferredLanguages: ['de-DE', 'de'],
        numberOfCores: 8,
      },
      webContext: {
        awsWafToken: 'waf-token',
        cookies: {
          tr_session: 'web-session',
        },
      },
    });
    expect(second.getSession()).toBeUndefined();
    expect(saved).toEqual([
      expect.objectContaining({
        deviceInfo: expect.objectContaining({ stableDeviceId: 'captured-fingerprint' }),
        webContext: expect.objectContaining({ awsWafToken: 'waf-token' }),
      }),
    ]);
  });

  it('rejects drifted raw payloads by default', async () => {
    const client = TradeRepublicClient.create({
      fetch: mockFetch([], { unexpected: true }),
    });

    await assert.rejects(
      () => client.account.current(),
      /Trade Republic schema validation failed for auth\.account/,
    );
  });

  it('can disable raw schema validation for drifted payloads', async () => {
    const payload = { unexpected: true };
    const client = TradeRepublicClient.create({
      rawSchemaValidation: false,
      fetch: mockFetch([], payload),
    });

    await expect(client.account.current()).resolves.toEqual(payload);
  });

  it('can validate drifted payloads without throwing', async () => {
    const payload = { unexpected: true };
    const failures: unknown[] = [];
    const client = TradeRepublicClient.create({
      rawSchemaValidation: 'passthrough',
      onRawSchemaValidationFailure: (failure) => failures.push(failure),
      fetch: mockFetch([], payload),
    });

    await expect(client.account.current()).resolves.toEqual(payload);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      schemaName: 'auth.account',
      value: payload,
      error: expect.any(Error),
    });
  });

  it('normalizes portfolio and cash payloads', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') {
            socket.emit('message', `${id} A ${JSON.stringify(accountPairsPayload())}`);
          }
          if (payload.type === 'availableCash') {
            socket.emit('message', `${id} availableCash ${JSON.stringify([{ accountNumber: '0000000002', currencyId: 'EUR', amount: 12.5 }])}`);
          }
          if (payload.type === 'compactPortfolioByTypeV2') {
            expect(payload.secAccNo).toBe('0000000001');
            socket.emit('message', `${id} portfolio ${JSON.stringify({ positions: [{ instrumentId: 'US1', instrumentName: 'Example', shares: '2', marketValue: { amount: '42', currency: 'EUR' } }] })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.portfolio.current()).resolves.toEqual({
      positions: [
        expect.objectContaining({ id: 'US1', name: 'Example', quantity: 2, value: 42, currency: 'EUR' }),
      ],
      raw: expect.any(Object),
    });
    expect(sockets[0]?.sent[0]).toMatch(/^connect 34 /);
    expect(sockets[0]?.sent[1]).toBe('sub 1 {"type":"accountPairs"}');
    expect(sockets[1]?.sent[1]).toBe('sub 1 {"type":"compactPortfolioByTypeV2","secAccNo":"0000000001"}');
    await expect(client.portfolio.cash()).resolves.toEqual(expect.objectContaining({ amount: 12.5, currency: 'EUR' }));
    expect(sockets[2]?.sent[1]).toBe('sub 1 {"type":"availableCash"}');
  });

  it('flattens current category-based portfolio payloads', async () => {
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') socket.emit('message', `${id} A ${JSON.stringify(accountPairsPayload())}`);
          if (payload.type === 'compactPortfolioByTypeV2') {
            socket.emit('message', `${id} portfolio ${JSON.stringify({
              categories: [
                { categoryType: 'stocks', positions: [{ instrumentId: 'US1', shares: '2' }] },
                { categoryType: 'crypto', positions: [{ instrumentId: 'BTC', quantity: '0.1' }] },
              ],
            })}`);
          }
        });
        return socket;
      },
    });

    await expect(client.portfolio.current()).resolves.toEqual({
      positions: [
        expect.objectContaining({ id: 'US1', quantity: 2, categoryType: 'stocks' }),
        expect.objectContaining({ id: 'BTC', quantity: 0.1, categoryType: 'crypto' }),
      ],
      raw: expect.any(Object),
    });
  });

  it('refreshes a stale cached securities account number before portfolio queries', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      session: {
        deviceInfo: TEST_DEVICE_INFO,
        securitiesAccountNumber: '0000000002',
      },
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') {
            socket.emit('message', `${id} A ${JSON.stringify(accountPairsPayload())}`);
          }
          if (payload.type === 'compactPortfolioByTypeV2') {
            expect(payload.secAccNo).toBe('0000000001');
            socket.emit('message', `${id} portfolio ${JSON.stringify([])}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.portfolio.current()).resolves.toEqual({
      positions: [],
      raw: [],
    });
    expect(client.securitiesAccountNumber).toBe('0000000001');
  });

  it('lists orders through the web-trading customer orders endpoint', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      session: {
        deviceInfo: TEST_DEVICE_INFO,
        cookies: {
          tr_session: 'restored-session',
        },
      },
      fetch: mockFetchSequence(calls, [
        jsonResponse([{ id: 'o1', instrumentId: 'US1', side: 'BUY', submittedAt: '2026-07-03T10:00:00.000Z', trades: [] }]),
        jsonResponse([{ id: 'o2', instrumentId: 'US2', side: 'SELL', executedAt: '2026-07-03T11:00:00.000Z' }]),
        jsonResponse([{ id: 'o3', instrumentId: 'US3', side: 'BUY', submittedAt: '2026-07-03T12:00:00.000Z' }]),
      ]),
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') {
            socket.emit('message', `${id} A ${JSON.stringify(accountPairsPayload())}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.orders.open({ limit: 25 })).resolves.toEqual([expect.objectContaining({ id: 'o1', status: 'open' })]);
    await expect(client.orders.closed({ cursor: '2' })).resolves.toEqual([expect.objectContaining({ id: 'o2', status: 'executed' })]);
    await expect(client.orders.all({ sort: 'createdAt,asc', instrumentId: 'US3' })).resolves.toEqual([expect.objectContaining({ id: 'o3' })]);

    expect(sockets).toHaveLength(3);
    expectOrderCall(calls[0], {
      secAccNo: '0000000001',
      page: '1',
      pageSize: '25',
      sort: 'orderUpdatedAt,desc',
    });
    expectOrderCall(calls[1], {
      secAccNo: '0000000001',
      page: '2',
      pageSize: '100',
      sort: 'orderUpdatedAt,desc',
    });
    expectOrderCall(calls[2], {
      secAccNo: '0000000001',
      page: '1',
      pageSize: '100',
      sort: 'createdAt,asc',
      instrumentId: 'US3',
    });
    expect(client.securitiesAccountNumber).toBe('0000000001');
  });

  it('returns only filled and partially filled account executions', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = TradeRepublicClient.create({
      fetch: mockFetch(calls, [
        { id: 'filled', status: 'EXECUTED', instrument: { name: 'Apple' }, executedAt: '2026-07-03T10:00:00.000Z', executedQuantity: '2', averageExecutionPrice: '123.45' },
        { id: 'partial', status: 'PARTIALLY_FILLED', trades: [{ executionSize: '1', executionPrice: '100', executionTime: '2026-07-03T11:00:00.000Z' }] },
        { id: 'cancelled', status: 'CANCELLED', cancelledAt: '2026-07-03T12:00:00.000Z' },
        { id: 'rejected', status: 'REJECTED', rejectedAt: '2026-07-03T12:00:00.000Z' },
        { id: 'open', status: 'OPEN', trades: [] },
      ]),
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') socket.emit('message', `${id} A ${JSON.stringify(accountPairsPayload())}`);
        });
        return socket;
      },
      session: { deviceInfo: TEST_DEVICE_INFO, securitiesAccountNumber: '0000000001' },
    });

    await expect(client.orders.executed()).resolves.toEqual([
      expect.objectContaining({ id: 'filled', name: 'Apple', executedQuantity: 2, executionPrice: 123.45 }),
      expect.objectContaining({ id: 'partial', executedQuantity: 1, executionPrice: 100, executedAt: '2026-07-03T11:00:00.000Z' }),
    ]);
  });

  it('normalizes quote fields and nested L2 exchange candidates', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'ticker') {
            socket.emit('message', `${id} ticker ${JSON.stringify({
              last: { price: '275.8', size: '359', time: 1784055758749 },
              bid: { price: '275.8', size: '359' },
              ask: { price: '276.1', size: '42' },
              currency: 'EUR',
            })}`);
          }
          if (payload.type === 'instrument') {
            socket.emit('message', `${id} instrument ${JSON.stringify({ exchanges: [{ id: 'LSX', name: 'Lang & Schwarz' }, { exchangeId: 'XETRA', name: 'Xetra' }] })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.market.quote('US1', 'LSX')).resolves.toEqual(expect.objectContaining({
      assetId: 'US1', exchangeId: 'LSX', last: 275.8, lastSize: 359, bid: 275.8, ask: 276.1, askSize: 42,
      time: new Date(1784055758749).toISOString(),
    }));
    await expect(client.market.availableL2Books('US1')).resolves.toEqual([
      expect.objectContaining({ exchangeId: 'LSX', name: 'Lang & Schwarz' }),
      expect.objectContaining({ exchangeId: 'XETRA', name: 'Xetra' }),
    ]);
    expect(parseSubPayload(sockets[0]?.sent[1])).toEqual({ type: 'ticker', id: 'US1.LSX' });
    expect(parseSubPayload(sockets[1]?.sent[1])).toEqual({ type: 'instrument', id: 'US1' });
  });

  it('loads the first cloud watchlist and its ranked items', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = TradeRepublicClient.create({
      fetch: mockFetchSequence(calls, [
        jsonResponse({ data: [{ id: 'wl-1', name: 'My Watchlist' }, { id: 'wl-2', name: 'Ignored' }] }),
        jsonResponse({ items: [
          { instrumentId: 'US2', itemRank: 2, instrument: { name: 'Second', exchanges: [{ id: 'XETRA' }] } },
          { isin: 'US1', itemRank: 1, 'core.shortName': 'First', exchangeIds: ['LSX'] },
        ] }),
      ]),
    });

    await expect(client.discovery.cloudWatchlist()).resolves.toEqual(expect.objectContaining({
      id: 'wl-1',
      name: 'My Watchlist',
      items: [
        expect.objectContaining({ id: 'US1', name: 'First', rank: 1, exchangeIds: ['LSX'] }),
        expect.objectContaining({ id: 'US2', name: 'Second', rank: 2, exchangeIds: ['XETRA'] }),
      ],
    }));
    expect(new URL(calls[1]?.url ?? 'https://invalid.local/').pathname).toBe('/api-gateway/watchlists/api/v2/watchlists/wl-1/items');
    expect(new URL(calls[1]?.url ?? 'https://invalid.local/').searchParams.get('pageSize')).toBe('200');
  });

  it('falls back to the auth account profile when accountPairs has no securities account number', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      session: {
        deviceInfo: TEST_DEVICE_INFO,
        cookies: {
          tr_session: 'restored-session',
        },
      },
      fetch: mockFetchSequence(calls, [
        jsonResponse(authAccountPayload()),
        jsonResponse([{ id: 'o1', instrumentId: 'US1', side: 'BUY', submittedAt: '2026-07-03T10:00:00.000Z' }]),
      ]),
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') {
            socket.emit('message', `${id} A ${JSON.stringify({ accounts: [] })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.orders.all()).resolves.toEqual([expect.objectContaining({ id: 'o1' })]);

    expect(sockets[0]?.sent[1]).toBe('sub 1 {"type":"accountPairs"}');
    expect(calls[0]?.url).toBe('https://api.traderepublic.com/api/v2/auth/account');
    expectOrderCall(calls[1], {
      secAccNo: '0000000001',
      page: '1',
      pageSize: '100',
      sort: 'orderUpdatedAt,desc',
    });
    expect(client.securitiesAccountNumber).toBe('0000000001');
    expect(client.getSession()).toMatchObject({ securitiesAccountNumber: '0000000001' });
  });

  it('queries assets through neonSearch and instrument resources', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'neonSearch') {
            socket.emit('message', `${id} neonSearch ${JSON.stringify({ results: [{ isin: 'US1', name: 'Apple Inc.', type: 'stock' }] })}`);
          }
          if (payload.type === 'instrument') {
            socket.emit('message', `${id} instrument ${JSON.stringify({ isin: payload.id, name: 'Apple Inc.', issuer: { name: 'Issuer' } })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.assets.search('apple', { limit: 5 })).resolves.toEqual([
      expect.objectContaining({ id: 'US1', name: 'Apple Inc.', type: 'stock' }),
    ]);
    await expect(client.assets.listAll({ cursor: '2', limit: 10 })).resolves.toEqual([
      expect.objectContaining({ id: 'US1' }),
    ]);
    await expect(client.assets.get('US1')).resolves.toEqual(expect.objectContaining({ id: 'US1', issuer: 'Issuer' }));

    expect(parseSubPayload(sockets[0]?.sent[1])).toMatchObject({
      type: 'neonSearch',
      data: {
        q: 'apple',
        page: 1,
        pageSize: 5,
        filter: [{ key: 'type', value: 'stock' }, { key: 'jurisdiction', value: 'DE' }],
      },
    });
    expect(parseSubPayload(sockets[1]?.sent[1])).toMatchObject({
      type: 'neonSearch',
      data: { q: '', page: 2, pageSize: 10 },
    });
    expect(parseSubPayload(sockets[2]?.sent[1])).toEqual({ type: 'instrument', id: 'US1' });
  });

  it('maps ETF and mutual-fund searches to Trade Republic neonSearch types', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'neonSearch') {
            socket.emit('message', `${id} neonSearch ${JSON.stringify({ results: [] })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await client.assets.search('bitcoin', { type: 'etf' });
    await client.assets.search('income', { type: 'mutualFund' });

    expect(parseSubPayload(sockets[0]?.sent[1])).toMatchObject({
      type: 'neonSearch',
      data: { filter: [{ key: 'type', value: 'fund' }, { key: 'jurisdiction', value: 'DE' }] },
    });
    expect(parseSubPayload(sockets[1]?.sent[1])).toMatchObject({
      type: 'neonSearch',
      data: { filter: [{ key: 'type', value: 'mutualFund' }, { key: 'jurisdiction', value: 'DE' }] },
    });
  });

  it('queries derivatives through neonSearch, derivatives, and instrument resources', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'neonSearch') {
            socket.emit('message', `${id} neonSearch ${JSON.stringify({ results: [{ isin: 'DE1', productType: 'knockout', underlyingId: 'US1' }] })}`);
          }
          if (payload.type === 'derivatives') {
            socket.emit('message', `${id} derivatives ${JSON.stringify({ results: [{ isin: 'DE2', productCategory: 'knockouts', underlyingId: payload.underlying }] })}`);
          }
          if (payload.type === 'instrument') {
            socket.emit('message', `${id} instrument ${JSON.stringify({ isin: payload.id, productType: 'warrant', underlying: { id: 'US1' } })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.derivatives.search('tesla', { underlyingId: 'US1', direction: 'long', limit: 7 })).resolves.toEqual([
      expect.objectContaining({ id: 'DE1', productType: 'knockout', underlyingId: 'US1' }),
    ]);
    await expect(client.derivatives.listForUnderlying('US1', { direction: 'short', productType: 'knockouts', limit: 11 })).resolves.toEqual([
      expect.objectContaining({ id: 'DE2', underlyingId: 'US1' }),
    ]);
    await expect(client.derivatives.get('DE3')).resolves.toEqual(expect.objectContaining({ id: 'DE3', productType: 'warrant', underlyingId: 'US1' }));

    expect(parseSubPayload(sockets[0]?.sent[1])).toMatchObject({
      type: 'neonSearch',
      data: {
        q: 'tesla',
        page: 1,
        pageSize: 7,
        filter: [
          { key: 'type', value: 'derivative' },
          { key: 'jurisdiction', value: 'DE' },
          { key: 'underlying', value: 'US1' },
          { key: 'optionType', value: 'long' },
        ],
      },
    });
    expect(parseSubPayload(sockets[1]?.sent[1])).toEqual({
      type: 'derivatives',
      jurisdiction: 'DE',
      lang: 'en',
      underlying: 'US1',
      productCategory: 'knockOutProduct',
      optionType: 'short',
      sortBy: 'leverage',
      sortDirection: 'asc',
      pageSize: null,
    });
    expect(parseSubPayload(sockets[2]?.sent[1])).toEqual({ type: 'instrument', id: 'DE3' });
  });

  it('subscribes to order updates by securities account number', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    });

    const subscription = client.orders.orderUpdates('0000000000');
    await Promise.resolve();
    await Promise.resolve();

    expect(decodeMapperProtobufRequest(sockets[0]!.binarySent[0]!)).toEqual({
      subscriptionId: 1,
      topic: 'orderUpdates',
      accountNumber: '0000000000',
    });
    subscription.close();
  });

  it('previews order fees without submitting an order', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'orderFeesV2') {
            socket.emit('message', `${id} A ${JSON.stringify({
              fees: [{ name: 'External costs', absolute: { value: 1, currency: 'EUR' } }],
              total: { absolute: { value: 1, currency: 'EUR' } },
            })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.orders.preview({
      instrumentId: 'US0378331005',
      exchangeId: 'LSX',
      side: 'buy',
      mode: 'limit',
      size: 2,
      limit: 100,
      secAccNo: '0000000000',
    })).resolves.toMatchObject({
      totalFees: 1,
      currency: 'EUR',
      estimatedGross: 200,
      estimatedTotal: 201,
      fees: [{ name: 'External costs', amount: 1, currency: 'EUR' }],
      order: {
        parameters: {
          instrumentId: 'US0378331005',
          exchangeId: 'LSX',
          type: 'buy',
          mode: 'limit',
          size: 2,
          limit: 100,
          expiry: { type: 'gfd' },
        },
      },
    });
    expect(parseSubPayload(sockets[0]?.sent[1])).toMatchObject({
      type: 'orderFeesV2',
      parameters: { instrumentId: 'US0378331005', exchangeId: 'LSX', type: 'buy', mode: 'limit', size: 2, limit: 100, currency: 'EUR' },
      secAccNo: '0000000000',
    });
  });

  it('waits through order confirmation states until submission succeeds', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type !== 'simpleCreateOrder') return;
          socket.emit('message', `${id} A ${JSON.stringify({ status: 'received' })}`);
          socket.emit('message', `${id} A ${JSON.stringify({ status: 'confirmationNeeded' })}`);
          socket.emit('message', `${id} A ${JSON.stringify({ status: 'succeeded', orderId: 'order-1' })}`);
        });
        sockets.push(socket);
        return socket;
      },
    });

    const result = await client.orders.submit({
      instrumentId: 'US0378331005',
      exchangeId: 'LSX',
      side: 'buy',
      mode: 'market',
      size: 1,
      lastClientPrice: 201.5,
      clientProcessId: 'process-1',
      secAccNo: '0000000000',
    });

    expect(result).toMatchObject({ status: 'succeeded', orderId: 'order-1', clientProcessId: 'process-1' });
    expect(result.updates).toHaveLength(3);
    expect(parseSubPayload(sockets[0]?.sent[1])).toEqual({
      type: 'simpleCreateOrder',
      parameters: {
        instrumentId: 'US0378331005', exchangeId: 'LSX', mode: 'market', size: 1, type: 'buy',
        expiry: { type: 'gfd' }, sellFractions: false, settlementCurrency: 'EUR',
      },
      warningsShown: [],
      lastClientPrice: 201.5,
      clientProcessId: 'process-1',
      secAccNo: '0000000000',
    });
  });

  it('returns a definitive failed result from the broker', async () => {
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'simpleCreateOrder') {
            socket.emit('message', `${id} A ${JSON.stringify({
              status: 'failed',
              message: 'Exchange is closed',
              error: {
                code: 'exchangeClosed',
                message: 'Exchange is closed',
                details: {
                  exchangeId: 'LSX',
                  isin: 'US0378331005',
                  isNostro: false,
                  clientProcessId: 'failed-process-1',
                },
              },
            })}`);
          }
        });
        return socket;
      },
    });

    const result = await client.orders.submit({
      instrumentId: 'US0378331005', exchangeId: 'LSX', side: 'buy', mode: 'market', size: 1,
      lastClientPrice: 201.5, clientProcessId: 'failed-process-1', secAccNo: '0000000000',
    });

    expect(result).toMatchObject({
      status: 'failed',
      error: {
        code: 'exchangeClosed',
        message: 'Exchange is closed',
        details: {
          exchangeId: 'LSX',
          isin: 'US0378331005',
          isNostro: false,
          clientProcessId: 'failed-process-1',
        },
      },
    });
    client.close();
  });

  it('returns outcomeUnknown and never replays an order after connection loss', async () => {
    const sockets: FakeSocket[] = [];
    const submittedPayloads: Record<string, unknown>[] = [];
    const disconnects: unknown[] = [];
    const reconnects: unknown[] = [];
    const client = TradeRepublicClient.create({
      websocketReconnectDelayMs: 0,
      onWebSocketDisconnect: (event) => { disconnects.push(event); },
      onWebSocketReconnect: (event) => { reconnects.push(event); },
      websocketFactory: () => {
        const socket = new FakeSocket((payload) => {
          if (payload.type !== 'simpleCreateOrder') return;
          submittedPayloads.push(payload);
          if (submittedPayloads.length === 1) {
            queueMicrotask(() => socket.emit('close', 1006, Buffer.from('network lost')));
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    const result = await client.orders.submit({
      instrumentId: 'US0378331005',
      exchangeId: 'LSX',
      side: 'buy',
      mode: 'market',
      size: 1,
      lastClientPrice: 201.5,
      clientProcessId: 'lost-process-1',
      secAccNo: '0000000000',
    });

    expect(result).toMatchObject({
      status: 'outcomeUnknown',
      outcomeReason: 'disconnect',
      clientProcessId: 'lost-process-1',
      connectionLoss: { code: 1006, reason: 'network lost' },
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(sockets).toHaveLength(2);
    expect(submittedPayloads).toHaveLength(1);
    expect(disconnects).toHaveLength(1);
    expect(reconnects).toHaveLength(1);
    client.close();
  });

  it('returns outcomeUnknown when an order submission times out', async () => {
    const client = TradeRepublicClient.create({ websocketFactory: () => new FakeSocket() });

    const result = await client.orders.submit({
      instrumentId: 'US0378331005', exchangeId: 'LSX', side: 'buy', mode: 'market', size: 1,
      lastClientPrice: 201.5, clientProcessId: 'timed-out-process-1', secAccNo: '0000000000', timeoutMs: 1,
    });

    expect(result).toMatchObject({
      status: 'outcomeUnknown',
      outcomeReason: 'timeout',
      clientProcessId: 'timed-out-process-1',
    });
    client.close();
  });

  it('rejects a submission timeout when the order was definitely not sent', async () => {
    const client = TradeRepublicClient.create({
      websocketFactory: () => new EventEmitterOnlySocket(),
    });

    await assert.rejects(client.orders.submit({
      instrumentId: 'US0378331005', exchangeId: 'LSX', side: 'buy', mode: 'market', size: 1,
      lastClientPrice: 201.5, clientProcessId: 'not-sent-process-1', secAccNo: '0000000000', timeoutMs: 1,
    }), (error: unknown) => {
      assert.ok(error instanceof MapperRequestError);
      assert.equal(error.reason, 'timeout');
      assert.equal(error.deliveryState, 'notSent');
      assert.equal(error.outcomeUnknown, false);
      return true;
    });
    client.close();
  });

  it('returns outcomeUnknown when the session changes after submission was sent', async () => {
    let client: TradeRepublicClient;
    client = TradeRepublicClient.create({
      websocketFactory: () => new FakeSocket((payload) => {
        if (payload.type === 'simpleCreateOrder') queueMicrotask(() => client.setSession({ sessionToken: 'fresh' }));
      }),
    });

    const result = await client.orders.submit({
      instrumentId: 'US0378331005', exchangeId: 'LSX', side: 'buy', mode: 'market', size: 1,
      lastClientPrice: 201.5, clientProcessId: 'refreshed-process-1', secAccNo: '0000000000',
    });

    expect(result).toMatchObject({ status: 'outcomeUnknown', outcomeReason: 'sessionRefresh' });
    client.close();
  });

  it('returns outcomeUnknown when the client closes after submission was sent', async () => {
    let client: TradeRepublicClient;
    client = TradeRepublicClient.create({
      websocketFactory: () => new FakeSocket((payload) => {
        if (payload.type === 'simpleCreateOrder') queueMicrotask(() => client.close());
      }),
    });

    const result = await client.orders.submit({
      instrumentId: 'US0378331005', exchangeId: 'LSX', side: 'buy', mode: 'market', size: 1,
      lastClientPrice: 201.5, clientProcessId: 'closed-process-1', secAccNo: '0000000000',
    });

    expect(result).toMatchObject({ status: 'outcomeUnknown', outcomeReason: 'clientClosed' });
  });

  it('supports current amount-based order payloads while previewing fees by derived size', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'instrument') {
            socket.emit('message', `${id} A ${JSON.stringify({ id: 'XF000BTC0017', type: 'crypto' })}`);
          }
          if (payload.type === 'orderFeesV2') {
            socket.emit('message', `${id} A ${JSON.stringify({ total: { absolute: { value: 1, currency: 'EUR' } } })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });
    const preview = await client.orders.preview({
      instrumentId: 'XF000BTC0017', exchangeId: 'BHS', side: 'buy', mode: 'market', amount: 1,
      lastClientPrice: 56_700, secAccNo: '0000000000', clientProcessId: 'amount-1',
    });
    expect(preview).toMatchObject({ estimatedGross: 1, estimatedTotal: 2, order: { parameters: { size: 0.000017, amount: 1 } } });
    const feePayload = parseSubPayload(sockets[1]?.sent[1]) as { parameters: Record<string, unknown> };
    expect(feePayload).toMatchObject({
      type: 'orderFeesV2', parameters: { size: 0.000017, currency: 'EUR' },
    });
    assert.equal('amount' in feePayload.parameters, false);
  });

  it('cancels an order through the current cancelOrder resource', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'cancelOrder') {
            socket.emit('message', `${id} A ${JSON.stringify({ status: 'received', orderId: 'order-1' })}`);
            socket.emit('message', `${id} A ${JSON.stringify({ status: 'succeeded', orderId: 'order-1' })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });
    await expect(client.orders.cancel('order-1')).resolves.toMatchObject({ orderId: 'order-1', status: 'succeeded', updates: [{ status: 'received' }, { status: 'succeeded' }] });
    expect(parseSubPayload(sockets[0]?.sent[1])).toEqual({ type: 'cancelOrder', orderId: 'order-1' });
  });

  it('replaces an order through the captured cancel-then-create sequence', async () => {
    const payloads: Record<string, unknown>[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          payloads.push(payload);
          if (payload.type === 'cancelOrder') {
            socket.emit('message', `${id} A ${JSON.stringify({ status: 'succeeded', orderId: 'old-order' })}`);
          }
          if (payload.type === 'simpleCreateOrder') {
            socket.emit('message', `${id} A ${JSON.stringify({ status: 'succeeded', orderId: 'new-order' })}`);
          }
        });
        return socket;
      },
    });

    const result = await client.orders.replace('old-order', preparedReplacement(), { cancellationTimeoutMs: 100 });

    expect(result).toMatchObject({
      status: 'succeeded',
      previousOrderId: 'old-order',
      cancellation: { status: 'succeeded' },
      submission: { status: 'succeeded', orderId: 'new-order' },
    });
    expect(payloads).toEqual([
      { type: 'cancelOrder', orderId: 'old-order' },
      {
        type: 'simpleCreateOrder',
        parameters: expect.objectContaining({ mode: 'limit', limit: 1.51 }),
        warningsShown: ['appropriatenessTestingAppropriateUser'],
        clientProcessId: 'replacement-process',
        secAccNo: '0000000000',
      },
    ]);
  });

  it('never submits a replacement after a definitive cancellation failure', async () => {
    const payloads: Record<string, unknown>[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          payloads.push(payload);
          if (payload.type === 'cancelOrder') {
            socket.emit('message', `${id} A ${JSON.stringify({
              status: 'failed',
              orderId: 'old-order',
              message: 'Could not find the order',
              error: {
                code: 'orderNotFound',
                message: 'Order not found',
                details: { orderId: 'old-order', userId: 'user-1' },
              },
            })}`);
          }
        });
        return socket;
      },
    });

    await expect(client.orders.replace('old-order', preparedReplacement())).resolves.toMatchObject({
      status: 'cancelFailed',
      previousOrderId: 'old-order',
      cancellation: {
        status: 'failed',
        error: {
          code: 'orderNotFound',
          message: 'Order not found',
          details: { orderId: 'old-order', userId: 'user-1' },
        },
      },
    });
    expect(payloads).toEqual([{ type: 'cancelOrder', orderId: 'old-order' }]);
  });

  it('never submits a replacement after an ambiguous cancellation', async () => {
    const payloads: Record<string, unknown>[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => new FakeSocket((payload) => { payloads.push(payload); }),
    });

    await expect(client.orders.replace('old-order', preparedReplacement(), {
      cancellationTimeoutMs: 1,
    })).resolves.toMatchObject({
      status: 'cancelOutcomeUnknown',
      previousOrderId: 'old-order',
      cancellation: { status: 'outcomeUnknown', outcomeReason: 'timeout' },
    });
    expect(payloads).toEqual([{ type: 'cancelOrder', orderId: 'old-order' }]);
    client.close();
  });

  it('reports when cancellation succeeded but the replacement was definitely not sent', async () => {
    let connection = 0;
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        connection += 1;
        if (connection > 1) return new EventEmitterOnlySocket();
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'cancelOrder') {
            socket.emit('message', `${id} A ${JSON.stringify({ status: 'succeeded', orderId: 'old-order' })}`);
          }
        });
        return socket;
      },
    });

    await expect(client.orders.replace('old-order', preparedReplacement(), {
      submissionTimeoutMs: 1,
    })).resolves.toMatchObject({
      status: 'replacementNotSent',
      previousOrderId: 'old-order',
      cancellation: { status: 'succeeded' },
      error: { deliveryState: 'notSent', outcomeUnknown: false },
    });
    client.close();
  });

  it('returns outcomeUnknown and never replays cancellation after connection loss', async () => {
    const payloads: Record<string, unknown>[] = [];
    const client = TradeRepublicClient.create({
      websocketReconnectDelayMs: 0,
      websocketFactory: () => {
        const socket = new FakeSocket((payload) => {
          if (payload.type !== 'cancelOrder') return;
          payloads.push(payload);
          if (payloads.length === 1) queueMicrotask(() => socket.emit('close', 1006, Buffer.from('network lost')));
        });
        return socket;
      },
    });

    const result = await client.orders.cancel('order-1');

    expect(result).toMatchObject({
      orderId: 'order-1',
      status: 'outcomeUnknown',
      outcomeReason: 'disconnect',
      connectionLoss: { code: 1006, reason: 'network lost' },
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(payloads).toHaveLength(1);
    client.close();
  });

  it('returns outcomeUnknown when a sent cancellation times out', async () => {
    const client = TradeRepublicClient.create({ websocketFactory: () => new FakeSocket() });

    const result = await client.orders.cancel('order-1', { timeoutMs: 1 });

    expect(result).toMatchObject({
      orderId: 'order-1',
      status: 'outcomeUnknown',
      outcomeReason: 'timeout',
    });
    client.close();
  });

  it('finishes the isolated reconnect lifecycle after an ambiguous mutation', async () => {
    const disconnects: unknown[] = [];
    const reconnects: unknown[] = [];
    let submissions = 0;
    const client = TradeRepublicClient.create({
      websocketMode: 'isolated',
      websocketReconnectDelayMs: 0,
      onWebSocketDisconnect: (event) => { disconnects.push(event); },
      onWebSocketReconnect: (event) => { reconnects.push(event); },
      websocketFactory: () => {
        const socket = new FakeSocket((payload) => {
          if (payload.type !== 'simpleCreateOrder') return;
          submissions += 1;
          if (submissions === 1) queueMicrotask(() => socket.emit('close', 1006, Buffer.from('network lost')));
        });
        return socket;
      },
    });

    const pending = client.orders.submit({
      instrumentId: 'US0378331005', exchangeId: 'LSX', side: 'buy', mode: 'market', size: 1,
      lastClientPrice: 201.5, clientProcessId: 'isolated-process-1', secAccNo: '0000000000',
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const result = await pending;

    expect(result.status).toBe('outcomeUnknown');
    expect(submissions).toBe(1);
    expect(disconnects).toHaveLength(1);
    expect(reconnects).toHaveLength(1);
    client.close();
  });

  it('rejects malformed order options before opening a websocket', async () => {
    let sockets = 0;
    const client = TradeRepublicClient.create({ websocketFactory: () => { sockets += 1; return new FakeSocket(); } });
    await assert.rejects(client.orders.prepare({
      instrumentId: 'US0378331005', exchangeId: 'LSX', side: 'buy', mode: 'limit', size: 1, secAccNo: '1',
    }), /limit is required/);
    assert.equal(sockets, 0);
  });

  it('exposes timeline and price alarm mapper APIs through SDK namespaces', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'timelineActivityLog') {
            expect(payload.after).toBe('cursor-1');
            socket.emit('message', `${id} timelineActivityLog ${JSON.stringify({ activities: [{ id: 'tl1', type: 'ORDER', title: 'Order filled' }] })}`);
          }
          if (payload.type === 'timelineActionsV2') {
            socket.emit('message', `${id} timelineActionsV2 ${JSON.stringify({ actions: [{ id: 'act1', type: 'download', title: 'Download' }] })}`);
          }
          if (payload.type === 'timelineDetailV2') {
            expect(payload.orderId).toBe('order-1');
            socket.emit('message', `${id} timelineDetailV2 ${JSON.stringify({ id: 'detail-1', type: 'ORDER' })}`);
          }
          if (payload.type === 'priceAlarms') {
            socket.emit('message', `${id} priceAlarms ${JSON.stringify({ obj: { items: [{ alarmId: 'pa1', isin: 'US1', price: { value: '123.45', currency: 'EUR' } }] } })}`);
          }
        }, (binary) => {
          const request = decodeMapperProtobufRequest(binary);
          if (request.topic !== 'priceAlarmNotifications') return;
          const payload = encodeMapperProtobufTopicPayload(request.topic, {
            priceAlarms: [{
              alarmId: { id: Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2]) },
              isin: 'US1',
              name: 'Apple',
              price: { value: { unscaled: Uint8Array.from([0x3a, 0x98]), scale: 2 }, currency: 1 },
            }],
          });
          socket.emit('message', encodeMapperProtobufDataEnvelope(request.subscriptionId, payload), true);
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.timeline.list({ after: 'cursor-1' })).resolves.toEqual([
      expect.objectContaining({ id: 'tl1', type: 'ORDER', title: 'Order filled', raw: expect.any(Object) }),
    ]);
    await expect(client.timeline.actions()).resolves.toEqual([
      expect.objectContaining({ id: 'act1', type: 'download', title: 'Download' }),
    ]);
    await expect(client.timeline.detail('order-1', 'order')).resolves.toEqual(
      expect.objectContaining({ id: 'detail-1', type: 'ORDER', raw: expect.any(Object) }),
    );
    await expect(client.priceAlarms.list()).resolves.toEqual([
      expect.objectContaining({ id: 'pa1', isin: 'US1', price: 123.45, currency: 'EUR' }),
    ]);
    await expect(client.priceAlarms.notifications()).resolves.toEqual([
      expect.objectContaining({ id: '00000000-0000-0000-0000-000000000002', name: 'Apple', price: 150 }),
    ]);

    expect(parseSubPayload(sockets[0]?.sent[1])).toEqual({ type: 'timelineActivityLog', after: 'cursor-1' });
    expect(parseSubPayload(sockets[1]?.sent[1])).toEqual({ type: 'timelineActionsV2' });
    expect(parseSubPayload(sockets[2]?.sent[1])).toEqual({ type: 'timelineDetailV2', orderId: 'order-1' });
    expect(parseSubPayload(sockets[3]?.sent[1])).toEqual({ type: 'priceAlarms' });
    expect(decodeMapperProtobufRequest(sockets[4]!.binarySent[0]!)).toEqual({
      subscriptionId: 1,
      topic: 'priceAlarmNotifications',
    });
  });

  it('exposes portfolio extras and auto-resolves securities account numbers', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      fetch: mockFetch(calls, { data: [{ time: '2026-07-03T00:00:00.000Z', value: 100 }] }),
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') {
            socket.emit('message', `${id} A ${JSON.stringify(accountPairsPayload())}`);
          }
          if (payload.type === 'savingsPlans') {
            expect(payload.secAccNo).toBe('0000000001');
            socket.emit('message', `${id} savingsPlans ${JSON.stringify({ items: [{ savingsPlanId: 'sp1', isin: 'US1', amount: { value: '25', currency: 'EUR' } }] })}`);
          }
          if (payload.type === 'privateMarketsPositions') {
            expect(payload.secAccNo).toBe('0000000001');
            socket.emit('message', `${id} privateMarketsPositions ${JSON.stringify({ positions: [{ id: 'pm1' }] })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.portfolio.savingsPlans()).resolves.toEqual([
      expect.objectContaining({ id: 'sp1', isin: 'US1', amount: 25, currency: 'EUR' }),
    ]);
    await expect(client.portfolio.privateMarketsPositions()).resolves.toEqual({ positions: [{ id: 'pm1' }] });
    await expect(client.portfolio.portfolioChart(undefined, '1m', { currency: 'EUR' })).resolves.toEqual({
      points: [{ time: '2026-07-03T00:00:00.000Z', value: 100 }],
      raw: { data: [{ time: '2026-07-03T00:00:00.000Z', value: 100 }] },
    });

    const chartUrl = new URL(calls[0]?.url ?? 'https://invalid.local/');
    expect(chartUrl.pathname).toBe('/api-gateway/portfolio-chart/v2/chart');
    expect(chartUrl.searchParams.get('secAccNo')).toBe('0000000001');
    expect(chartUrl.searchParams.get('range')).toBe('1m');
    expect(chartUrl.searchParams.get('currency')).toBe('EUR');
    expect(parseSubPayload(sockets[1]?.sent[1])).toEqual({ type: 'savingsPlans', secAccNo: '0000000001' });
    expect(parseSubPayload(sockets[3]?.sent[1])).toEqual({ type: 'privateMarketsPositions', secAccNo: '0000000001' });
  });

  it('exposes instrument and trading mapper APIs through SDK namespaces', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') {
            socket.emit('message', `${id} A ${JSON.stringify(accountPairsPayload())}`);
          }
          if (payload.type === 'neonNews') {
            expect(payload.isin).toBe('US1');
            socket.emit('message', `${id} neonNews ${JSON.stringify({ items: [{ newsId: 'n1', headline: 'News' }] })}`);
          }
          if (payload.type === 'etfDetails' || payload.type === 'etfComposition' || payload.type === 'mutualFundDetails' || payload.type === 'mutualFundComposition' || payload.type === 'cryptoDetails' || payload.type === 'yieldToMaturity') {
            socket.emit('message', `${id} ${payload.type} ${JSON.stringify({ ok: true, id: payload.id })}`);
          }
          if (payload.type === 'priceForOrderV2') {
            socket.emit('message', `${id} priceForOrderV2 ${JSON.stringify({ price: 1 })}`);
          }
          if (payload.type === 'availableSize') {
            expect(payload.secAccNo).toBe('0000000001');
            expect(payload.parameters).toEqual({ instrumentId: 'US1' });
            socket.emit('message', `${id} availableSize ${JSON.stringify({ size: 2 })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.instruments.news('US1')).resolves.toEqual([
      expect.objectContaining({ id: 'n1', title: 'News' }),
    ]);
    await expect(client.instruments.etfDetails('US1')).resolves.toEqual({ ok: true, id: 'US1' });
    await expect(client.instruments.etfComposition('US1', 'cursor')).resolves.toEqual({ ok: true, id: 'US1' });
    await expect(client.instruments.fundDetails('US1')).resolves.toEqual({ ok: true, id: 'US1' });
    await expect(client.instruments.fundComposition('US1', 'cursor')).resolves.toEqual({ ok: true, id: 'US1' });
    await expect(client.instruments.cryptoDetails('US1')).resolves.toEqual({ ok: true, id: 'US1' });
    await expect(client.instruments.yieldToMaturity('US1')).resolves.toEqual({ ok: true, id: 'US1' });
    await expect(client.trading.priceForOrder({ isin: 'US1', exchangeId: 'LSX', side: 'BUY' })).resolves.toEqual({ price: 1 });
    await expect(client.trading.availableSize('US1')).resolves.toEqual({ size: 2 });

    expect(parseSubPayload(sockets[2]?.sent[1])).toEqual({ type: 'etfComposition', id: 'US1', after: 'cursor' });
    expect(parseSubPayload(sockets[7]?.sent[1])).toEqual({ type: 'priceForOrderV2', unit: 'EUR', isin: 'US1', exchangeId: 'LSX', side: 'buy' });
  });

  it('exposes REST-backed discovery, account, docs, tax, payment, and trading APIs', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = TradeRepublicClient.create({
      fetch: mockFetchSequence(calls, [
        jsonResponse({ data: [{ exchangeId: 'LSX', name: 'Lang & Schwarz' }] }),
        jsonResponse({ exchangeId: 'LSX', sessions: [] }),
        jsonResponse({ isin: 'US1', exchangeId: 'LSX', status: 'OPEN' }),
        jsonResponse({ watchlists: [{ id: 'wl-1', name: 'Main', items: [] }] }),
        jsonResponse({ screeners: [] }),
        jsonResponse({ options: [] }),
        jsonResponse({ theme: 'dark' }),
        jsonResponse({
          destinations: [{ exchangeId: 'LSX', name: 'Lang & Schwarz' }],
          preferredMarketDataProvider: 'LSX',
          preferredOrderDestination: 'LSX',
        }),
        jsonResponse({ trades: [{ tradeId: 't1', isin: 'US1', amount: { value: '12', currency: 'EUR' } }] }),
        jsonResponse({ pnl: 1 }),
        jsonResponse({ account: true }),
        jsonResponse({ name: 'Example' }),
        jsonResponse({
          relationships: [{
            customerId: 'customer-1',
            firstName: 'Example',
            lastName: 'Person',
            relationshipType: 'SELF',
            bankingInfo: { iban: 'DE00', bic: 'TRBKDEBBXXX' },
          }],
        }),
        jsonResponse({ cards: [] }),
        jsonResponse({ documents: [] }),
        jsonResponse({ paymentMethods: [] }),
        jsonResponse({
          relationships: [
            {
              customerId: 'child-1',
              firstName: 'Child',
              lastName: 'Account',
              relationshipType: 'CHILD',
              bankingInfo: { iban: 'DE11', bic: 'CHILDXXX' },
            },
            {
              customerId: 'customer-1',
              firstName: 'Example',
              lastName: 'Person',
              relationshipType: 'SELF',
              bankingInfo: { iban: 'DE00', bic: 'TRBKDEBBXXX' },
            },
          ],
        }),
        jsonResponse({ tax: true }),
        jsonResponse({ exemptionOrder: true }),
        jsonResponse({ taxResidencies: [] }),
        jsonResponse({ countries: [] }),
        jsonResponse({ interest: true }),
      ]),
    });

    await expect(client.discovery.exchangeDetails()).resolves.toEqual([
      expect.objectContaining({ id: 'LSX', name: 'Lang & Schwarz' }),
    ]);
    await expect(client.discovery.exchangeSchedule('LSX')).resolves.toEqual(expect.objectContaining({ exchangeId: 'LSX' }));
    await expect(client.discovery.instrumentStatus('US1', 'LSX')).resolves.toEqual(expect.objectContaining({ isin: 'US1', exchangeId: 'LSX', status: 'OPEN' }));
    await expect(client.discovery.watchlists()).resolves.toEqual([
      {
        id: 'wl-1',
        name: 'Main',
        items: [],
        raw: { id: 'wl-1', name: 'Main', items: [] },
      },
    ]);
    await expect(client.discovery.screeners()).resolves.toEqual({ screeners: [] });
    await expect(client.discovery.screenerOptions()).resolves.toEqual({ options: [] });
    await expect(client.discovery.userPreferences()).resolves.toEqual({ theme: 'dark' });
    await expect(client.trading.orderDestinations('US1', { side: 'BUY' })).resolves.toEqual([
      expect.objectContaining({ id: 'LSX', name: 'Lang & Schwarz' }),
    ]);
    await expect(client.trading.trades({ page: 1 })).resolves.toEqual([
      expect.objectContaining({ id: 't1', isin: 'US1', amount: 12, currency: 'EUR' }),
    ]);
    await expect(client.trading.dailyPnl([{ id: 'US1' }])).resolves.toEqual({ pnl: 1 });
    await expect(client.account.accountSettings()).resolves.toEqual({ account: true });
    await expect(client.account.personalDetails()).resolves.toEqual({ name: 'Example' });
    await expect(client.account.relationships()).resolves.toEqual([
      {
        customerId: 'customer-1',
        firstName: 'Example',
        lastName: 'Person',
        relationshipType: 'SELF',
        bankingInfo: {
          iban: 'DE00',
          bic: 'TRBKDEBBXXX',
          raw: { iban: 'DE00', bic: 'TRBKDEBBXXX' },
        },
        raw: {
          customerId: 'customer-1',
          firstName: 'Example',
          lastName: 'Person',
          relationshipType: 'SELF',
          bankingInfo: { iban: 'DE00', bic: 'TRBKDEBBXXX' },
        },
      },
    ]);
    await expect(client.account.cardsHome()).resolves.toEqual({ cards: [] });
    await expect(client.documents.documents()).resolves.toEqual({ documents: [] });
    await expect(client.payments.paymentMethods()).resolves.toEqual({ paymentMethods: [] });
    await expect(client.payments.iban()).resolves.toEqual({
      iban: 'DE00',
      bic: 'TRBKDEBBXXX',
      accountHolder: 'Example Person',
      customerId: 'customer-1',
      relationshipType: 'SELF',
      raw: {
        customerId: 'customer-1',
        firstName: 'Example',
        lastName: 'Person',
        relationshipType: 'SELF',
        bankingInfo: { iban: 'DE00', bic: 'TRBKDEBBXXX' },
      },
    });
    await expect(client.tax.taxInformation()).resolves.toEqual({ tax: true });
    await expect(client.tax.exemptionOrder()).resolves.toEqual({ exemptionOrder: true });
    await expect(client.tax.taxResidencies()).resolves.toEqual({ taxResidencies: [] });
    await expect(client.tax.taxResidencyCountries()).resolves.toEqual({ countries: [] });
    const paths = calls.map((call) => new URL(call.url).pathname);
    expect(paths).toEqual([
      '/api-gateway/instrument-universe/api/v1/exchanges-details',
      '/api-gateway/instrument-universe/api/v1/exchanges/LSX/schedule',
      '/api-gateway/instrument-universe/api/v1/instruments/US1/status/LSX',
      '/api-gateway/watchlists/api/v2/watchlists',
      '/api-gateway/screeners/api/v2/screeners',
      '/api-gateway/screeners/api/v2/screeners/options',
      '/api-gateway/pro-trading/api/v1/user-preferences',
      '/api-gateway/order-router/api/v2/instruments/US1/destinations',
      '/web-trading-gateway/api/customer/v1/trades',
      '/web-trading-gateway/api/customer/v1/pnl/daily',
      '/api/v2/auth/account',
      '/api/v1/customer/personal-details',
      '/api/v1/customer/relationships/detailed',
      '/api/v1/card/cards/home',
      '/api/v1/documents/all',
      '/api/v2/payment/methods',
      '/api/v1/customer/relationships/detailed',
      '/api/v1/taxes/information',
      '/api/v1/taxes/exemptionorders',
      '/api/v1/auth/account/change/taxresidencies',
      '/api/v1/country/taxresidency',
    ]);
    expect(new URL(calls[7]?.url ?? 'https://invalid.local/').searchParams.get('side')).toBe('BUY');
    expect(new URL(calls[7]?.url ?? 'https://invalid.local/').searchParams.get('jurisdiction')).toBe('DE');
    expect(new URL(calls[8]?.url ?? 'https://invalid.local/').searchParams.get('page')).toBe('1');
    expect(calls[9]?.init.method).toBe('POST');
    expect(calls[9]?.init.body).toBe(JSON.stringify({ items: [{ id: 'US1' }] }));
  });

  it('exposes low-risk price alarm mapper mutations', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'createPriceAlarm') {
            socket.emit('message', `${id} createPriceAlarm ${JSON.stringify({ status: 'created', alarmId: 'alarm-1' })}`);
          }
          if (payload.type === 'cancelPriceAlarm') {
            socket.emit('message', `${id} cancelPriceAlarm ${JSON.stringify({ status: 'ok', id: payload.id })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.priceAlarms.create({ isin: 'US1', price: 123.45 })).resolves.toEqual({
      alarmId: 'alarm-1',
      status: 'created',
      raw: { status: 'created', alarmId: 'alarm-1' },
    });
    await expect(client.priceAlarms.cancel('alarm-1')).resolves.toEqual({
      alarmId: 'alarm-1',
      status: 'ok',
      raw: { status: 'ok', id: 'alarm-1' },
    });

    expect(parseSubPayload(sockets[0]?.sent[1])).toEqual({
      type: 'createPriceAlarm',
      instrumentId: 'US1',
      targetPrice: 123.45,
    });
    expect(parseSubPayload(sockets[1]?.sent[1])).toEqual({ type: 'cancelPriceAlarm', id: 'alarm-1' });
  });

  it('classifies built-in price alarm mutations as non-replayable', async () => {
    let sends = 0;
    const client = TradeRepublicClient.create({
      websocketReconnectDelayMs: 0,
      websocketFactory: () => {
        const socket = new FakeSocket((payload) => {
          if (payload.type !== 'createPriceAlarm') return;
          sends += 1;
          if (sends === 1) queueMicrotask(() => socket.emit('close', 1006));
        });
        return socket;
      },
    });

    await assert.rejects(client.priceAlarms.create({ isin: 'US1', price: 123.45 }), (error: unknown) => {
      assert.ok(error instanceof MapperRequestError);
      assert.equal(error.deliveryState, 'sent');
      assert.equal(error.outcomeUnknown, true);
      return true;
    });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(sends).toBe(1);
    client.close();
  });

  it('exposes low-risk watchlist REST mutations', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = TradeRepublicClient.create({
      fetch: mockFetchSequence(calls, [
        jsonResponse({ id: 'watchlist-1', name: 'sdk-test-watchlist-copy' }),
        jsonResponse({ id: 'watchlist-1', name: 'sdk-test-watchlist-renamed' }),
        jsonResponse({ id: 'watchlist-1', instrumentId: 'US1' }),
        new Response(null, { status: 204 }),
        new Response(null, { status: 204 }),
      ]),
    });

    await expect(client.discovery.cloneWatchlist('source-watchlist')).resolves.toEqual({ id: 'watchlist-1', name: 'sdk-test-watchlist-copy' });
    await expect(client.discovery.renameWatchlist('watchlist-1', 'sdk-test-watchlist-renamed')).resolves.toEqual({ id: 'watchlist-1', name: 'sdk-test-watchlist-renamed' });
    await expect(client.discovery.addWatchlistItem('watchlist-1', 'US1')).resolves.toEqual({ id: 'watchlist-1', instrumentId: 'US1' });
    await expect(client.discovery.removeWatchlistItem('watchlist-1', 'US1')).resolves.toEqual(undefined);
    await expect(client.discovery.deleteWatchlist('watchlist-1')).resolves.toEqual(undefined);

    expect(calls.map((call) => [call.init.method, new URL(call.url).pathname, call.init.body])).toEqual([
      ['POST', '/api-gateway/watchlists/api/v2/watchlists/source-watchlist/clone', undefined],
      ['PUT', '/api-gateway/watchlists/api/v2/watchlists/watchlist-1', JSON.stringify({ name: 'sdk-test-watchlist-renamed' })],
      ['POST', '/api-gateway/watchlists/api/v2/watchlists/watchlist-1/items', JSON.stringify({ instrument_id: 'US1', item_rank: -1 })],
      ['DELETE', '/api-gateway/watchlists/api/v2/watchlists/watchlist-1/items/US1', undefined],
      ['DELETE', '/api-gateway/watchlists/api/v2/watchlists/watchlist-1', undefined],
    ]);
  });

  it('normalizes candle arrays', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          expect(payload).toMatchObject({ type: 'aggregateHistoryLightV2', isin: 'US1', exchangeId: 'LSX' });
          socket.emit('message', `${id} aggregateHistoryLightV2 ${JSON.stringify({ data: [['2026-07-02T12:00:00.000Z', 1, 2, 0.5, 1.5, 10]] })}`);
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.market.candles({
      assetId: 'US1',
      exchangeId: 'LSX',
      timeframe: '1h',
      from: '2026-07-01T00:00:00.000Z',
    })).resolves.toEqual([
      expect.objectContaining({ time: '2026-07-02T12:00:00.000Z', open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }),
    ]);
    expect(sockets[0]?.sent[0]).toMatch(/^connect 34 /);
  });
});

function preparedReplacement() {
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

function expectedOperatingSystem(): string {
  const nodePlatform = platform();
  if (nodePlatform === 'win32') return 'Windows';
  if (nodePlatform === 'darwin') return 'Mac OS';
  if (nodePlatform === 'linux') return 'Linux';
  return nodePlatform;
}

function mockFetch(calls: Array<{ url: string; init: RequestInit }>, responseBody: unknown): typeof fetch {
  return (async (url: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return jsonResponse(responseBody);
  }) as typeof fetch;
}

function memorySessionStore(saved: unknown[]) {
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

function mockFetchSequence(calls: Array<{ url: string; init: RequestInit }>, responses: Response[]): typeof fetch {
  return (async (url: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const response = responses.shift();
    return response ?? jsonResponse({ error: 'not found' }, 404);
  }) as typeof fetch;
}

function expectOrderCall(call: { url: string; init: RequestInit } | undefined, expected: Record<string, string>): void {
  expect(call).toBeDefined();
  const url = new URL(call?.url ?? 'https://invalid.local/');
  expect(url.origin).toBe('https://api.traderepublic.com');
  expect(url.pathname).toBe('/web-trading-gateway/api/customer/v1/orders');
  for (const [key, value] of Object.entries(expected)) {
    expect(url.searchParams.get(key)).toBe(value);
  }
}

function parseSubPayload(message: string | undefined): unknown {
  expect(message).toBeDefined();
  const text = String(message ?? '');
  const secondSpace = text.indexOf(' ', text.indexOf(' ') + 1);
  return JSON.parse(text.slice(secondSpace + 1));
}

function accountPairsPayload(): unknown {
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

function authAccountPayload(): unknown {
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

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

class EventEmitterOnlySocket extends EventEmitter implements WebSocketLike {
  send(): void {}
  close(): void {
    this.emit('close');
  }
}
