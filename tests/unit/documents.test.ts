import assert from 'node:assert/strict';
import { describe, it } from '../test-compat.js';
import { TradeRepublicClient } from '../../src/index.js';

describe('documents namespace', () => {
  it('exposes the documents namespace', () => {
    const client = TradeRepublicClient.create();
    assert.ok(client.documents);
    client.close();
  });
});
