import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  consolidatedLiveBlocks,
  isOpenMarketWindow,
} from '../scripts/ci-live-validation.js';

describe('consolidated live validation', () => {
  it('runs read, mutation, and open-market suites as independent blocks', () => {
    assert.deepEqual(
      consolidatedLiveBlocks.map((block) => block.id),
      ['reads', 'mutations', 'open-market'],
    );
    assert.deepEqual(
      consolidatedLiveBlocks.map((block) => block.script),
      [
        'test:integration:read',
        'test:integration:mutations',
        'test:integration:open-venue',
      ],
    );
  });

  it('gates only the open-market block to Berlin trading hours', () => {
    assert.equal(isOpenMarketWindow(new Date('2026-07-30T09:00:00Z')), true);
    assert.equal(isOpenMarketWindow(new Date('2026-07-31T20:39:00Z')), true);
    assert.equal(isOpenMarketWindow(new Date('2026-07-31T20:40:00Z')), false);
    assert.equal(isOpenMarketWindow(new Date('2026-08-01T09:00:00Z')), false);
  });
});
