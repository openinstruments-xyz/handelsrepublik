import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCiBadgeResultPayload } from '../scripts/ci-publish-results.js';
import type { CiTestResult } from '../scripts/ci-test-report.js';

const environment = {
  CI_BADGE_WORKFLOW: 'account-market-mutations',
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '2',
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_REPOSITORY: 'openinstruments-xyz/handelsrepublik',
  GITHUB_EVENT_NAME: 'schedule',
  GITHUB_SHA: 'abc123',
};

describe('CI badge result publisher', () => {
  it('builds a successful payload from structured case results', () => {
    const results: CiTestResult[] = [{
      id: 'account.current',
      name: 'account.current',
      status: 'passed',
      durationMs: 42,
      note: 'validated',
    }];
    const payload = buildCiBadgeResultPayload(
      results,
      environment,
      new Date('2026-07-31T12:00:00.000Z'),
    );

    assert.deepEqual(payload, {
      schemaVersion: 1,
      workflow: 'account-market-mutations',
      runId: 123,
      runAttempt: 2,
      runUrl: 'https://github.com/openinstruments-xyz/handelsrepublik/actions/runs/123',
      event: 'schedule',
      sha: 'abc123',
      createdAt: '2026-07-31T12:00:00.000Z',
      conclusion: 'success',
      results,
    });
  });

  it('marks empty and failed result sets as failures', () => {
    assert.equal(buildCiBadgeResultPayload([], environment).conclusion, 'failure');
    assert.equal(buildCiBadgeResultPayload([{
      id: 'account.current',
      name: 'account.current',
      status: 'failed',
      durationMs: 42,
      note: 'failed',
    }], environment).conclusion, 'failure');
  });
});
