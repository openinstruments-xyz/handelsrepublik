import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkCiSession, completeFreshEnrollmentSession, isCiPinLoginAllowed, loginWithCiPin,
  runCiReauth, SavedSessionUnavailableError,
} from '../scripts/reauth-ci.js';
import { TradeRepublicClient, TradeRepublicHttpError } from '../src/index.js';

const options = {
  repo: 'openinstruments-xyz/handelsrepublik',
  secret: 'TR_SESSION_JSON',
  environment: 'Live Integration Tests',
  deviceName: 'test',
  timeoutMs: 1_000,
  debug: false,
};

describe('CI session reauthentication mode', () => {
  it('runs explicit PIN login without attempting refresh or QR enrollment', async () => {
    const calls: string[] = [];
    await runCiReauth('ci-session.json', options, {
      async refresh() { calls.push('refresh'); },
      async enroll() { calls.push('enroll'); },
      async pin(path) { calls.push(`pin:${path}`); return true; },
    }, 'pin');
    assert.deepEqual(calls, ['pin:ci-session.json']);
  });

  it('requires both credentials before attempting PIN login', async () => {
    const client = TradeRepublicClient.create();
    try {
      await assert.rejects(() => loginWithCiPin(client, { phoneNumber: '+491234567890' }),
        /TR_PHONE_NUMBER and TR_PIN are required/);
    } finally { client.close(); }
  });

  it('requests app approval with a two-minute deadline and never logs credentialed API errors', async () => {
    const client = TradeRepublicClient.create();
    let calls = 0;
    client.auth.loginWithPin = async (login) => {
      calls += 1;
      assert.equal(login.phoneNumber, '+491234567890');
      assert.equal(login.pin, '0000');
      assert.equal(login.otpLess, true);
      assert.equal(login.timeoutMs, 120_000);
      assert.ok(login.signal);
      throw new TradeRepublicHttpError('sensitive response', 401, { secret: 'do-not-log' });
    };
    try {
      await assert.rejects(() => loginWithCiPin(client, { phoneNumber: ' +491234567890\n', pin: '0000\n' }),
        (error: Error) => {
          assert.equal(error.message, 'Trade Republic CI PIN login failed (HTTP 401).');
          assert.equal(error.cause, undefined);
          return true;
        });
      assert.equal(calls, 1);
    } finally { client.close(); }
  });

  it('starts interactive enrollment when TR_SESSION_FILE is absent', async () => {
    const calls: string[] = [];
    await runCiReauth(undefined, options, {
      async refresh() {
        calls.push('refresh');
      },
      async enroll() {
        calls.push('enroll');
      },
    });
    assert.deepEqual(calls, ['enroll']);
  });

  it('starts fresh interactive enrollment even if a stale session path is inherited', async () => {
    const calls: string[] = [];
    await runCiReauth('ci-session.json', options, {
      async refresh() {
        calls.push('refresh');
      },
      async enroll() {
        calls.push('enroll');
      },
    });
    assert.deepEqual(calls, ['enroll']);
  });

  it('refreshes the supplied session file only in explicit refresh mode', async () => {
    const calls: string[] = [];
    await runCiReauth('ci-session.json', options, {
      async refresh(sessionPath) {
        calls.push(`refresh:${sessionPath}`);
      },
      async enroll() {
        calls.push('enroll');
      },
    }, 'refresh');
    assert.deepEqual(calls, ['refresh:ci-session.json']);
  });

  it('requires a saved session file in explicit refresh mode', async () => {
    await assert.rejects(
      () => runCiReauth(undefined, options, {
        async refresh() {},
        async enroll() {},
      }, 'refresh'),
      /TR_SESSION_FILE is required/,
    );
  });

  it('replaces any partial context with the fresh complete browser context before upload', () => {
    const freshWebContext = {
      awsWafToken: 'fresh-waf-token',
      xsrfToken: 'fresh-xsrf-token',
      headers: { 'x-tr-platform': 'web' },
      cookies: { tr_session: 'fresh-web-cookie' },
    };
    const session = completeFreshEnrollmentSession({
      sessionToken: 'new-login-token',
      deviceInfo: { stableDeviceId: 'device' },
      webContext: { awsWafToken: 'old-waf-token', cookies: { tr_session: 'old-cookie' } },
    }, freshWebContext);

    assert.deepEqual(session.webContext, freshWebContext);
  });

  it('refuses to upload an enrollment session without WAF proof and browser cookies', () => {
    assert.throws(
      () => completeFreshEnrollmentSession({
        sessionToken: 'new-login-token',
        deviceInfo: { stableDeviceId: 'device' },
      }, {
        headers: { 'x-tr-platform': 'web' },
      }),
      /WAF token/,
    );
  });
});

describe('CI session availability and daily approval policy', () => {
  it('reports valid sessions without enrolling a new login', async () => {
    let calls = 0;
    const valid = await runCiReauth('ci-session.json', options, {
      async refresh() { calls += 1; },
      async enroll() { assert.fail('must not start QR login'); },
      async pin() { assert.fail('must not start PIN login'); },
    }, 'check-session');
    assert.equal(valid, true);
    assert.equal(calls, 1);
  });

  it('reports missing and rejected sessions as unavailable but preserves other failures', async () => {
    for (const error of [new SavedSessionUnavailableError(), new TradeRepublicHttpError('unauthorized', 401, {})]) {
      assert.equal(await checkCiSession(async () => { throw error; }), false);
    }
    for (const error of [new TradeRepublicHttpError('server error', 500, {}), new Error('network failure')]) {
      await assert.rejects(() => checkCiSession(async () => { throw error; }), (actual) => actual === error);
    }
  });

  const scheduled = { eventName: 'schedule', schedule: '0 15 * * *', runAttempt: '1' };

  it('allows one scheduled approval window at 15:00 Berlin in winter and summer', () => {
    assert.equal(isCiPinLoginAllowed(scheduled, new Date('2026-10-30T14:00:00Z')), true);
    assert.equal(isCiPinLoginAllowed(scheduled, new Date('2026-07-30T13:09:59Z')), true);
  });

  it('rejects nighttime, early or delayed runs, manual dispatches, and reruns', () => {
    for (const date of ['2026-10-30T02:00:00Z', '2026-10-30T13:59:59Z', '2026-10-30T14:10:00Z']) {
      assert.equal(isCiPinLoginAllowed(scheduled, new Date(date)), false);
    }
    const now = new Date('2026-10-30T14:00:00Z');
    assert.equal(isCiPinLoginAllowed({ ...scheduled, eventName: 'workflow_dispatch' }, now), false);
    assert.equal(isCiPinLoginAllowed({ ...scheduled, schedule: '17 */2 * * *' }, now), false);
    assert.equal(isCiPinLoginAllowed({ ...scheduled, runAttempt: '2' }, now), false);
  });
});
