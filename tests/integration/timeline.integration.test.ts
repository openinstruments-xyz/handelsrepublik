import { describe, it } from 'node:test';
import { assertArray, assertRecord, withLiveClient } from './support.js';

describe('timeline integration', () => {
  it('reads timeline entries, actions, and a detail when available', { timeout: 120_000 }, () => withLiveClient('timeline', async (client, note) => {
    const items = await client.timeline.list();
    const actions = await client.timeline.actions();
    assertArray(items, 'timeline.list');
    assertArray(actions, 'timeline.actions');
    if (items[0]?.id) assertRecord(await client.timeline.detail(items[0].id), 'timeline.detail');
    else note('timeline empty; detail variant not observed');
  }));
});
