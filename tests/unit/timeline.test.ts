import assert from 'node:assert/strict';
import { describe, it } from '../test-compat.js';
import { TradeRepublicClient } from '../../src/index.js';

describe('timeline namespace', () => {
  it('exposes the timeline namespace', () => {
    const client = TradeRepublicClient.create();
    assert.ok(client.timeline);
    client.close();
  });
});
