import assert from 'node:assert/strict';
import { describe, it } from '../test-compat.js';
import { TradeRepublicClient } from '../../src/index.js';

describe('instruments namespace', () => {
  it('exposes the instruments namespace', () => {
    const client = TradeRepublicClient.create();
    assert.ok(client.instruments);
    client.close();
  });
});
