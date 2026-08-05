import assert from 'node:assert/strict';
import { describe, it } from './runner.js';
import type { AssetSearchType } from '../../src/index.js';
import { APPLE, assertArray, firstAsset, withLiveClient } from './support.js';

describe('instruments integration', () => {
  it('reads news and discovered instrument resources', { timeout: 180_000 }, () => withLiveClient('instruments', async (client, note) => {
    assertArray(await client.instruments.news(APPLE), 'instruments.news');
    const calls: Array<[AssetSearchType, (id: string) => Promise<unknown>]> = [
      ['etf', (id) => client.instruments.etfDetails(id)],
      ['etf', (id) => client.instruments.etfComposition(id)],
      ['mutualFund', (id) => client.instruments.fundDetails(id)],
      ['mutualFund', (id) => client.instruments.fundComposition(id)],
      ['crypto', (id) => client.instruments.cryptoDetails(id)],
      ['bond', (id) => client.instruments.yieldToMaturity(id)],
    ];
    for (const [type, call] of calls) {
      const asset = await firstAsset(client, type);
      if (asset?.id) assert.ok(await call(asset.id) !== undefined);
      else note(`${type}: no fixture discovered`);
    }
  }));
});
