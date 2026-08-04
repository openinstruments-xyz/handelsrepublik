import { describe, it } from 'node:test';
import { APPLE, assertArray, assertRecord, withLiveClient } from './support.js';

describe('derivatives integration', () => {
  it('searches, lists, and resolves derivative details', { timeout: 120_000 }, () => withLiveClient('derivatives', async (client, note) => {
    const search = await client.derivatives.search('apple', { underlyingId: APPLE, limit: 10 });
    const list = await client.derivatives.listForUnderlying(APPLE, { limit: 10 });
    assertArray(search, 'derivatives.search');
    assertArray(list, 'derivatives.listForUnderlying');
    const derivative = list[0] ?? search[0];
    if (derivative?.id) assertRecord(await client.derivatives.get(derivative.id), 'derivatives.get');
    else note('no derivative fixture discovered');
  }));
});
