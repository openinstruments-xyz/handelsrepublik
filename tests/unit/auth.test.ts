import type { Session } from '../../src/types.js';
import assert from 'node:assert/strict';
import { cpus, totalmem } from 'node:os';
import { describe, expect, it } from '../test-compat.js';
import { TradeRepublicClient } from '../../src/index.js';
import { FakeSocket } from '../fake-socket.js';
import type { InstantLoginChallenge } from '../../src/types.js';
import { TEST_DEVICE_INFO, expectedOperatingSystem, mockFetch, memorySessionStore, mockFetchSequence, expectOrderCall, parseSubPayload, accountPairsPayload, authAccountPayload, jsonResponse } from './test-helpers.js';

describe('auth namespace', () => {
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

    alice.setWafToken({ awsWafToken: 'renewed-waf-token' });
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

  it('treats stored sessions without device information as unrestorable', async () => {
    const client = TradeRepublicClient.create({
      sessionStore: {
        async load() {
          return { sessionToken: 'session-without-device-info' };
        },
        async save() {},
        async clear() {},
      },
    });

    assert.equal(await client.auth.restoreSession(), undefined);
    expect(client.getSession()).toBeUndefined();
    await assert.rejects(
      () => client.auth.refreshSession(),
      /must contain deviceInfo/,
    );
  });

  it('restores, clears, and directly polls a login process', async () => {
    const stored: Session = {
      sessionToken: 'stored-token',
      securitiesAccountNumber: '0000000001',
      deviceInfo: {
        stableDeviceId: 'stored-fingerprint',
        browser: 'Chrome',
        preferredLanguages: ['de-DE', 'de'],
        numberOfCores: 8,
      },
    };
    let cleared = false;
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = TradeRepublicClient.create({
      sessionStore: {
        async load() {
          return stored;
        },
        async save() {},
        async clear() {
          cleared = true;
        },
      },
      fetch: mockFetchSequence(calls, [
        jsonResponse({ status: 'COMPLETED', session: { connectionToken: 'process-token' } }),
        jsonResponse({ session: { connectionToken: 'web-token' } }),
      ]),
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') {
            socket.emit('message', `${id} accountPairs ${JSON.stringify(accountPairsPayload())}`);
          }
        });
        return socket;
      },
    });

    await expect(client.auth.restoreSession()).resolves.toEqual(stored);
    expect(client.getSession()).toEqual(stored);

    await expect(client.auth.pollLoginProcess('process-1', { intervalMs: 0 })).resolves.toMatchObject({
      sessionToken: 'web-token',
      securitiesAccountNumber: '0000000001',
    });
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      '/api/v2/auth/web/login/processes/process-1',
      '/api/v1/auth/web/session',
    ]);

    await client.auth.clearSession();
    expect(cleared).toBe(true);
    expect(client.getSession()).toEqual({});
  });
});
