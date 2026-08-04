import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runCiReauth } from '../scripts/reauth-ci.js';

const options = {
  repo: 'VIEWVIEWVIEW/handelsrepublik',
  secret: 'TR_SESSION_JSON',
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

  it('refreshes the supplied session file without interactive enrollment', async () => {
    const calls: string[] = [];
    await runCiReauth('ci-session.json', options, {
      async refresh(sessionPath) {
        calls.push(`refresh:${sessionPath}`);
      },
      async enroll() {
        calls.push('enroll');
      },
    });
    assert.deepEqual(calls, ['refresh:ci-session.json']);
  });
});
