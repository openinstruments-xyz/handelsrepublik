import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { completeFreshEnrollmentSession, runCiReauth } from '../scripts/reauth-ci.js';

const options = {
  repo: 'openinstruments-xyz/handelsrepublik',
  secret: 'TR_SESSION_JSON',
  environment: 'Live Integration Tests',
  deviceName: 'test',
  timeoutMs: 1_000,
  debug: false,
};

describe('CI session reauthentication mode', () => {
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
