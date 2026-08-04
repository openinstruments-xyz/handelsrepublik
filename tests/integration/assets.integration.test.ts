import { describe, it } from 'node:test';
import { assetClasses, assertArray, assertRecord, firstAsset, withLiveClient } from './support.js';

describe('assets integration', () => {
  it('searches, resolves, and paginates every asset class', { timeout: 240_000 }, () => withLiveClient('assets', async (client, note) => {
    for (const type of assetClasses) {
      const results = await client.assets.search(type === 'stock' ? 'apple' : type, { type, limit: 5 });
      assertArray(results, `assets.search(${type})`);
      const asset = results[0] ?? await firstAsset(client, type);
      if (asset?.id) assertRecord(await client.assets.get(asset.id), `assets.get(${type})`);
      else note(`${type}: no fixture discovered`);
    }
    assertArray(await client.assets.listAll({ type: 'stock', limit: 20 }), 'assets.listAll');
  }));
});
