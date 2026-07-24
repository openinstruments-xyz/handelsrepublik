import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  appendCiResult,
  parseNodeTestSummary,
  readCiResults,
  renderCiSummary,
  type CiTestResult,
} from '../scripts/ci-test-report.js';

describe('CI test reporting', () => {
  it('extracts Node test totals from the spec reporter', () => {
    assert.equal(parseNodeTestSummary([
      'ℹ tests 116',
      'ℹ suites 13',
      'ℹ pass 114',
      'ℹ fail 2',
      'ℹ skipped 0',
    ].join('\n')), '116 tests · 114 passed · 2 failed · 0 skipped');
  });

  it('renders a safe Markdown result table', () => {
    const results: CiTestResult[] = [
      {
        id: 'account.current',
        name: 'validate account | response',
        status: 'passed',
        durationMs: 1_250,
        note: 'schema\nmatched',
      },
      {
        id: 'candles.crypto',
        name: 'validate crypto candles',
        status: 'failed',
        durationMs: 65_000,
        note: 'See the step log.',
      },
    ];

    const summary = renderCiSummary('Live results', results);
    assert.match(summary, /\*\*1 passed · 1 failed · 0 skipped\*\*/);
    assert.match(summary, /validate account \\\| response \| ✅ Passed \| 1\.3 s \| schema matched/);
    assert.match(summary, /validate crypto candles \| ❌ Failed \| 1m 5s/);
  });

  it('marks an empty report as a failed setup', () => {
    const summary = renderCiSummary('Empty', []);
    assert.match(summary, /No test results recorded \| ❌ Failed/);
  });
  it('serializes concurrent result appends', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'handelsrepublik-ci-results-'));
    const path = join(directory, 'results.ndjson');
    try {
      await Promise.all(Array.from({ length: 32 }, (_, index) => appendCiResult({
        id: `case-${index}`,
        name: `case ${index}`,
        status: 'passed',
        durationMs: index,
        note: 'recorded concurrently',
      }, path)));
      const results = await readCiResults(path);
      assert.equal(results.length, 32);
      assert.equal(new Set(results.map((result) => result.id)).size, 32);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
