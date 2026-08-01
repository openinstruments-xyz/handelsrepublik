import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildLiveBadgePublications } from '../scripts/ci-publish-live-results.js';
import { resultIdsForSuite, type LiveSuiteReport } from '../scripts/ci-live-validation.js';
import { liveSuiteDefinitions } from '../scripts/live-suites/index.js';
import type { CiTestResult } from '../scripts/ci-test-report.js';

const environment = {
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_SERVER_URL: 'https://github.com',
  GITHUB_REPOSITORY: 'openinstruments-xyz/handelsrepublik',
  GITHUB_EVENT_NAME: 'schedule',
  GITHUB_SHA: 'abcdef1234567890',
};

function resultFor(suiteId: string, status: 'passed' | 'failed' | 'skipped'): CiTestResult {
  const suite = liveSuiteDefinitions.find((candidate) => candidate.id === suiteId);
  assert.ok(suite);
  const id = resultIdsForSuite(suite)[0]!;
  return { id, name: id, status, durationMs: 1, note: 'validated' };
}

function suiteReport(
  id: LiveSuiteReport['id'],
  status: LiveSuiteReport['status'],
): LiveSuiteReport {
  const suite = liveSuiteDefinitions.find((candidate) => candidate.id === id);
  assert.ok(suite);
  return { id, name: suite.name, status, note: 'reported' };
}

describe('live badge result publisher', () => {
  it('publishes the combined account badge only when all member suites were selected', () => {
    const results = [
      resultFor('read-only', 'passed'),
      resultFor('mutations', 'failed'),
      resultFor('open-market-data', 'skipped'),
    ];
    const complete = buildLiveBadgePublications(results, {
      suites: [
        suiteReport('read-only', 'passed'),
        suiteReport('mutations', 'failed'),
        suiteReport('open-market-data', 'skipped'),
      ],
    }, environment, new Date('2026-07-31T12:00:00Z'));

    assert.deepEqual(complete.map((item) => item.alias), ['account-market-mutations']);
    assert.equal(complete[0]?.payload.conclusion, 'failure');
    assert.equal(complete[0]?.payload.results.length, 3);

    const partial = buildLiveBadgePublications([resultFor('read-only', 'passed')], {
      suites: [suiteReport('read-only', 'passed')],
    }, environment);
    assert.deepEqual(partial, []);
  });

  it('publishes an eligible independently selected suite and preserves skipped history', () => {
    const eligible = buildLiveBadgePublications([resultFor('closed-market-data', 'passed')], {
      suites: [suiteReport('closed-market-data', 'passed')],
    }, environment);
    assert.deepEqual(eligible.map((item) => item.alias), ['destinations']);

    const skipped = buildLiveBadgePublications([resultFor('closed-market-data', 'skipped')], {
      suites: [suiteReport('closed-market-data', 'skipped')],
    }, environment);
    assert.deepEqual(skipped, []);
  });
});
