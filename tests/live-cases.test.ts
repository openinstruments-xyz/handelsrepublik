import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
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
      }
    }
  });
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
