import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  isClosedMarketWindow,
  isOpenMarketWindow,
  isWeekdayClosedMarketWindow,
  isWeekendWindow,
  resultIdsForSuite,
  runLiveValidation,
  selectLiveSuites,
  type LiveSuiteAdapter,
} from '../scripts/ci-live-validation.js';
import { liveSuiteDefinitions } from '../scripts/live-suites/index.js';
import { liveSuiteManifest } from '../scripts/live-suites/manifest.js';

describe('live validation orchestration', () => {
  it('keeps each independently reported suite in its own definition', () => {
    assert.deepEqual(
      liveSuiteDefinitions.map((suite) => suite.id),
      [
        'read-only',
        'mutations',
        'open-market-data',
        'closed-market-data',
        'closed-limit-order-rejection',
        'closed-market-order-rejection',
        'open-limit-order-lifecycle',
        'weekend-limit-order-rejection',
      ],
    );
    assert.deepEqual(
      liveSuiteDefinitions.map(({ id, name }) => ({ id, name })),
      liveSuiteManifest.map(({ id, name }) => ({ id, name })),
    );
    assert.ok(liveSuiteDefinitions.every((suite) => resultIdsForSuite(suite).length > 0));
  });

  it('selects one suite manually and omits the automatic-ineligible market-order rejection', () => {
    assert.deepEqual(selectLiveSuites('mutations').map((suite) => suite.id), ['mutations']);
    assert.equal(
      selectLiveSuites('automatic').some((suite) => suite.id === 'closed-market-order-rejection'),
      false,
    );
    assert.throws(() => selectLiveSuites('unknown'), /Unknown live suite unknown/);
  });

  it('applies distinct open and closed Berlin time gates', () => {
    assert.equal(isOpenMarketWindow(new Date('2026-07-30T09:00:00Z')), true);
    assert.equal(isOpenMarketWindow(new Date('2026-07-31T20:40:00Z')), false);
    assert.equal(isClosedMarketWindow(new Date('2026-07-30T23:00:00Z')), true);
    assert.equal(isClosedMarketWindow(new Date('2026-07-30T20:59:00Z')), false);
    assert.equal(isWeekdayClosedMarketWindow(new Date('2026-07-30T23:00:00Z')), true);
    assert.equal(isWeekdayClosedMarketWindow(new Date('2026-07-31T23:00:00Z')), false);
    assert.equal(isWeekendWindow(new Date('2026-08-01T09:00:00Z')), true);
    assert.equal(isWeekendWindow(new Date('2026-08-03T09:00:00Z')), false);
  });

  it('records one suite failure and continues with later eligible suites', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'handelsrepublik-live-validation-'));
    const resultFile = join(directory, 'results.ndjson');
    const reportFile = join(directory, 'report.json');
    const githubOutputFile = join(directory, 'github-output.txt');
    const calls: string[] = [];
    const adapter: LiveSuiteAdapter = async (suite) => {
      calls.push(suite.id);
      const id = resultIdsForSuite(suite)[0]!;
      const failed = suite.id === 'mutations';
      return {
        exitCode: failed ? 1 : 0,
        results: [{
          id,
          name: id,
          status: failed ? 'failed' : 'passed',
          durationMs: 1,
          note: failed ? 'test failure' : 'validated',
        }],
      };
    };

    try {
      const report = await runLiveValidation({
        selection: 'all',
        now: new Date('2026-07-30T09:00:00Z'),
        allowOrderRequests: true,
        resultFile,
        reportFile,
        githubOutputFile,
      }, adapter);

      assert.deepEqual(calls, [
        'read-only',
        'mutations',
        'open-market-data',
        'open-limit-order-lifecycle',
      ]);
      assert.equal(report.suites.find((suite) => suite.id === 'read-only')?.status, 'passed');
      assert.equal(report.suites.find((suite) => suite.id === 'mutations')?.status, 'failed');
      assert.equal(report.suites.find((suite) => suite.id === 'open-market-data')?.status, 'passed');
      assert.equal(report.suites.find((suite) => suite.id === 'closed-market-data')?.status, 'skipped');
      assert.equal(report.suites.find((suite) => suite.id === 'weekend-limit-order-rejection')?.status, 'skipped');
      assert.match(await readFile(reportFile, 'utf8'), /"mutations"/);
      const githubOutput = await readFile(githubOutputFile, 'utf8');
      assert.match(githubOutput, /^status_read_only=passed$/m);
      assert.match(githubOutput, /^status_mutations=failed$/m);
      assert.match(githubOutput, /^status_closed_market_data=skipped$/m);
      assert.doesNotMatch(githubOutput, /^statuses=/m);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('does not execute an unconfirmed manually selected order suite', async () => {
    let called = false;
    const report = await runLiveValidation({
      selection: 'closed-limit-order-rejection',
      now: new Date('2026-07-30T23:00:00Z'),
      allowOrderRequests: false,
    }, async () => {
      called = true;
      return { exitCode: 0, results: [] };
    });

    assert.equal(called, false);
    assert.equal(report.suites[0]?.status, 'skipped');
    assert.match(report.suites[0]?.note ?? '', /confirmation/);
  });

  it('fails an eligible suite that exits without recording a result', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'handelsrepublik-live-validation-'));
    try {
      const report = await runLiveValidation({
        selection: 'read-only',
        resultFile: join(directory, 'results.ndjson'),
      }, async () => ({ exitCode: 0, results: [] }));

      assert.equal(report.suites[0]?.status, 'failed');
      assert.equal(report.results[0]?.id, 'suite.read-only');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
