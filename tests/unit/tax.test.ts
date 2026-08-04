import assert from 'node:assert/strict';
import { describe, it } from '../test-compat.js';
import { TradeRepublicClient } from '../../src/index.js';

describe('tax namespace', () => {
  it('exposes the tax namespace', () => {
    const client = TradeRepublicClient.create();
    assert.ok(client.tax);
    client.close();
  });
});
