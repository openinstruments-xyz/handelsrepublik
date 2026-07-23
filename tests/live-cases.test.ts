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

  it('exposes every live check as a named workflow step', () => {
    const workflowBySuite = {
      read: 'general-read-only-validation.yml',
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

  it('publishes a result table from every workflow', () => {
    const workflowDirectory = join(process.cwd(), '.github', 'workflows');
    const workflows = readdirSync(workflowDirectory).filter((file) => file.endsWith('.yml'));
    assert.equal(workflows.length, 10);
    for (const workflow of workflows) {
      const source = readFileSync(join(workflowDirectory, workflow), 'utf8');
      assert.match(source, /CI_TEST_RESULTS_FILE=\$RUNNER_TEMP\//, `${workflow} must configure the shared result file`);
      assert.doesNotMatch(source, /CI_TEST_RESULTS_FILE:\s*\$\{\{\s*runner\.temp\s*\}\}/);
      assert.match(source, /test:ci:summary/, `${workflow} must publish a result table`);
    }
  });

  it('shows latest, scheduled, and manual workflow status in one README table', () => {
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
    assert.match(readme, /\| Workflow \| Latest \| Scheduled \| Manual \|/);
    for (const workflow of readdirSync(join(process.cwd(), '.github', 'workflows')).filter((file) => file.endsWith('.yml'))) {
      assert.match(readme, new RegExp(`actions/workflows/${escapeRegex(workflow)}/badge\\.svg\\?branch=main`));
    }
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
