import assert from 'node:assert/strict';
import { describe, it } from '../test-compat.js';
import { TradeRepublicClient } from '../../src/index.js';

describe('account namespace', () => {
  it('exposes the account namespace', () => {
    const client = TradeRepublicClient.create();
    assert.ok(client.account);
    client.close();
  });
});
