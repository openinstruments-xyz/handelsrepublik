import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { APPLE, DEFAULT_WATCHLIST, assertArray, withLiveClient } from './support.js';

describe('watchlist integration', () => {
  it('reads the default watchlist', { timeout: 90_000 }, () => withLiveClient('watchlist', async (client) => {
    const watchlists = await client.discovery.watchlists();
    assertArray(watchlists, 'discovery.watchlists');
    const watchlist = watchlists.find((item) => item.id === DEFAULT_WATCHLIST) ?? watchlists[0];
    assert.ok(watchlist?.id, 'expected the default watchlist');
    const cloudWatchlist = await client.discovery.cloudWatchlist();
    assert.ok(cloudWatchlist !== undefined, 'expected a cloud watchlist');
  }));

  it('adds and removes a disposable watchlist item', { timeout: 90_000 }, () => withLiveClient('watchlist mutation', async (client) => {
    const watchlists = await client.discovery.watchlists();
    assertArray(watchlists, 'discovery.watchlists');
    const watchlist = watchlists.find((item) => item.id === DEFAULT_WATCHLIST) ?? watchlists[0];
    assert.ok(watchlist?.id, 'expected the default watchlist');
    const before = JSON.stringify(await client.discovery.rawWatchlistItems(watchlist.id));
    const instrument = [APPLE, 'US5949181045', 'US67066G1040'].find((candidate) => !before.includes(candidate));
    assert.ok(instrument, 'expected a disposable watchlist instrument');
    try {
      await client.discovery.addWatchlistItem(watchlist.id, instrument);
      assert.match(JSON.stringify(await client.discovery.rawWatchlistItems(watchlist.id)), new RegExp(instrument));
    } finally {
      const current = JSON.stringify(await client.discovery.rawWatchlistItems(watchlist.id));
      if (current.includes(instrument)) {
        await client.discovery.removeWatchlistItem(watchlist.id, instrument);
        assert.doesNotMatch(JSON.stringify(await client.discovery.rawWatchlistItems(watchlist.id)), new RegExp(instrument), 'watchlist cleanup failed');
      }
    }
  }));
});
