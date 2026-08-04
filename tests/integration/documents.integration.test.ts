import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withLiveClient } from './support.js';

describe('documents integration', () => {
  it('lists documents', { timeout: 60_000 }, () => withLiveClient('documents', async (client) => {
    assert.ok(await client.documents.documents() !== undefined);
  }));
});
