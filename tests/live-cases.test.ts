import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type { TradeRepublicClient } from '../src/index.js';
import { liveSuiteDefinitions } from '../scripts/live-suites/index.js';
import { liveCases } from './integration/live-cases.js';

describe('live integration case manifest', () => {
  it('uses stable unique case ids', () => {
    const ids = liveCases.map((testCase) => testCase.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.every((id) => /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(id)));
  });

  it('covers every non-order live suite', () => {
    const suites = new Set(liveCases.map((testCase) => testCase.suite));
    assert.deepEqual([...suites].sort(), ['closed-venue', 'mutations', 'open-venue', 'read']);
  });

  it('runs separately defined live suites behind one session refresh', () => {
    const workflow = readFileSync(
      join(process.cwd(), '.github', 'workflows', 'live-validation.yml'),
      'utf8',
    );
    const testSource = readFileSync(
      join(process.cwd(), 'tests', 'integration', 'read-live.test.ts'),
      'utf8',
    );
    const readCaseIds = liveCases
      .filter((testCase) => testCase.suite === 'read')
      .map((testCase) => testCase.id);

    assert.ok(readCaseIds.includes('session.restore'));
    assert.ok(!readCaseIds.includes('session.restore-refresh'));
    assert.match(workflow, /run: npm run test:integration:consolidated/);
    assert.equal(workflow.match(/ci-session\.ts refresh/g)?.length, 1);
    assert.equal(workflow.match(/gh secret set TR_SESSION_JSON/g)?.length, 1);
    assert.match(workflow, /name: Live \/ \$\{\{ matrix\.suite\.name \}\}/);
    for (const suite of liveSuiteDefinitions) {
      assert.match(workflow, new RegExp(`          - ${escapeRegex(suite.id)}(?:\\r?\\n|$)`));
      assert.equal(
        existsSync(join(process.cwd(), 'scripts', 'live-suites', `${suite.id}.ts`)),
        true,
      );
    }
    for (const removed of [
      'validate-account-market-data-and-reversible-mutations.yml',
      'validate-order-destinations-during-closed-market-hours.yml',
      'validate-closed-venue-limit-order-rejection.yml',
      'validate-closed-venue-market-order-rejection.yml',
      'validate-open-venue-limit-order-lifecycle.yml',
      'validate-weekend-limit-order-lifecycle.yml',
    ]) {
      assert.equal(existsSync(join(process.cwd(), '.github', 'workflows', removed)), false);
    }
    assert.match(testSource, /const READ_LIVE_CONCURRENCY = 4/);
    assert.match(testSource, /describe\('read-only live validations', \{ concurrency: READ_LIVE_CONCURRENCY \}/);
    assert.match(testSource, /liveCases\.filter\(\(testCase\) => testCase\.suite === 'read'\)/);
  });

  it('does not call the auth session endpoint again inside the read suite', () => {
    assert.ok(!liveCases.some((candidate) => candidate.id === 'account.session'));
  });

  it('loads and rotates the live session through repository secrets', () => {
    const workflowDirectory = join(process.cwd(), '.github', 'workflows');
    const workflows = readdirSync(workflowDirectory).filter((file) => file.endsWith('.yml'));
    for (const workflow of workflows) {
      const source = readFileSync(join(workflowDirectory, workflow), 'utf8');
      if (!source.includes('TR_SESSION_JSON:')) continue;
      if (source.includes('  pull_request:')) {
        assert.match(
          source,
          /environment: Live Integration Tests/,
          `${workflow} must require live-environment approval before a PR can access session secrets`,
        );
      }
      if (!source.includes('gh secret set TR_SESSION_JSON')) {
        assert.doesNotMatch(
          source,
          /GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION|ci-session\.ts refresh/,
          `${workflow} must not expose session-rotation credentials to PR code`,
        );
        continue;
      }
      assert.match(
        source,
        /gh secret set TR_SESSION_JSON --repo /,
        `${workflow} must rotate the shared repository secret`,
      );
      assert.match(
        source,
        /ci-session\.ts refresh/,
        `${workflow} must refresh the shared session before rotating it`,
      );
      assert.doesNotMatch(
        source,
        /gh secret set TR_SESSION_JSON --env /,
        `${workflow} must not rotate an unavailable environment secret`,
      );
    }

    const reauthSource = readFileSync(
      join(process.cwd(), 'scripts', 'reauth-ci.ts'),
      'utf8',
    );
    assert.doesNotMatch(reauthSource, /ensureEnvironment|sessionEnvironment|--env/);
    assert.match(
      reauthSource,
      /const DEFAULT_REPOSITORY = 'openinstruments-xyz\/handelsrepublik';/,
    );
    assert.match(reauthSource, /'secret',\s*'set',\s*options\.secret,\s*'--repo',\s*repo/s);
  });

  it('keeps the live-case runtime restore-only', () => {
    const source = readFileSync(
      join(process.cwd(), 'tests', 'integration', 'live-runtime.ts'),
      'utf8',
    );
    assert.match(source, /client\.auth\.restoreSession\(\)/);
    assert.doesNotMatch(source, /refreshSession|saveSession|clearSession/);
  });

  it('refreshes the shared session every 20 minutes only while no other workflow is active', () => {
    const source = readFileSync(join(process.cwd(), '.github', 'workflows', 'refresh-session.yml'), 'utf8');
    assert.match(source, /cron: "\*\/20 \* \* \* \*"/);
    assert.match(source, /actions: read/);
    assert.match(source, /actions\/runs\?status=in_progress&per_page=100/);
    assert.match(source, /select\(\.id != \$GITHUB_RUN_ID\)/);
    assert.match(source, /needs: check_activity/);
    assert.match(source, /if: needs\.check_activity\.outputs\.should_refresh == 'true'/);
    assert.match(source, /group: live-integration-tests-main/);
    assert.match(source, /id: confirm_idle/);
    assert.match(source, /if: steps\.confirm_idle\.outputs\.should_refresh == 'true'/);
  });

  it('allows continuously available asset classes in the closed-market destination check', async () => {
    const testCase = liveCases.find((candidate) => candidate.id === 'closed-venue.destinations-all-classes');
    assert.ok(testCase);
    const requestedTypes: string[] = [];
    const client = {
      assets: {
        search: async (_query: string, options: { type: string }) => {
          requestedTypes.push(options.type);
          return [{ id: options.type }];
        },
      },
      trading: {
        orderDestinations: async (instrumentId: string) => [{
          id: 'TEST',
          open: instrumentId === 'crypto' || instrumentId === 'privateFund' || instrumentId === 'mutualFund',
        }],
      },
    } as unknown as TradeRepublicClient;

    await testCase.run({ client, note: async () => undefined });
    assert.deepEqual(requestedTypes.sort(), [
      'bond', 'crypto', 'derivative', 'etf', 'fund', 'mutualFund', 'privateFund', 'stock', 'synthetic',
    ]);
  });

  it('queries enough one-minute history to cross a closed weekend', async () => {
    const testCase = liveCases.find((candidate) => candidate.id === 'candles.standard-aapl');
    assert.ok(testCase);
    const requests: Array<{ timeframe: string; range: string }> = [];
    const client = {
      market: {
        candles: async (request: { timeframe: string; range: string }) => {
          requests.push(request);
          return [{
            time: '2026-07-31T15:30:00.000Z',
            open: 1,
            high: 1,
            low: 1,
            close: 1,
            volume: 1,
          }];
        },
      },
    } as unknown as TradeRepublicClient;

    await testCase.run({ client, note: async () => undefined });

    assert.equal(requests.find((request) => request.timeframe === '1m')?.range, '5d');
  });
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
