import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type { TradeRepublicClient } from '../src/index.js';
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

  it('exposes every venue and mutation check as a named workflow step', () => {
    const workflowBySuite = {
      'closed-venue': 'validate-order-destinations-during-closed-market-hours.yml',
      'open-venue': 'validate-venue-during-opening-times.yml',
      mutations: 'validate-reversible-account-mutations.yml',
    } as const;
    for (const [suite, workflow] of Object.entries(workflowBySuite)) {
      const source = readFileSync(join(process.cwd(), '.github', 'workflows', workflow), 'utf8');
      for (const testCase of liveCases.filter((candidate) => candidate.suite === suite)) {
        assert.match(source, new RegExp(`npm run test:integration:case -- ${escapeRegex(testCase.id)}(?:\\r?\\n|$)`));
        assert.match(source, new RegExp(
          `continue-on-error: true\\r?\\n\\s+run: npm run test:integration:case -- ${escapeRegex(testCase.id)}(?:\\r?\\n|$)`,
        ));
      }
    }
  });

  it('runs all read checks through the bounded-concurrent Node test suite', () => {
    const workflow = readFileSync(
      join(process.cwd(), '.github', 'workflows', 'general-read-only-validation.yml'),
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
    assert.match(workflow, /run: npm run test:integration:read/);
    assert.match(testSource, /const READ_LIVE_CONCURRENCY = 4/);
    assert.match(testSource, /describe\('read-only live validations', \{ concurrency: READ_LIVE_CONCURRENCY \}/);
    assert.match(testSource, /liveCases\.filter\(\(testCase\) => testCase\.suite === 'read'\)/);
  });

  it('loads and rotates the live session through repository secrets', () => {
    const workflowDirectory = join(process.cwd(), '.github', 'workflows');
    const workflows = readdirSync(workflowDirectory).filter((file) => file.endsWith('.yml'));
    for (const workflow of workflows) {
      const source = readFileSync(join(workflowDirectory, workflow), 'utf8');
      if (!source.includes('TR_SESSION_JSON:')) continue;
      assert.doesNotMatch(
        source,
        /environment: Live Integration Tests/,
        `${workflow} must not depend on unavailable private-repository environments`,
      );
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
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
