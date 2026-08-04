import assert from 'node:assert/strict';
import { describe, it } from '../test-compat.js';
import { TradeRepublicClient } from '../../src/index.js';

describe('payments namespace', () => {
  it('exposes the payments namespace', () => {
    const client = TradeRepublicClient.create();
    assert.ok(client.payments);
    client.close();
  });
});
