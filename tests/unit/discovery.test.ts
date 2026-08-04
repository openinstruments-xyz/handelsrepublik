import { describe, expect, it } from '../test-compat.js';
import { TradeRepublicClient } from '../../src/index.js';
import { mockFetchSequence, jsonResponse } from './test-helpers.js';

describe('discovery namespace', () => {
  it('loads the first cloud watchlist and its ranked items', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = TradeRepublicClient.create({
      fetch: mockFetchSequence(calls, [
        jsonResponse({ data: [{ id: 'wl-1', name: 'My Watchlist' }, { id: 'wl-2', name: 'Ignored' }] }),
        jsonResponse({ items: [
          { instrumentId: 'US2', itemRank: 2, instrument: { name: 'Second', exchanges: [{ id: 'XETRA' }] } },
          { isin: 'US1', itemRank: 1, 'core.shortName': 'First', exchangeIds: ['LSX'] },
        ] }),
      ]),
    });

    await expect(client.discovery.cloudWatchlist()).resolves.toEqual(expect.objectContaining({
      id: 'wl-1',
      name: 'My Watchlist',
      items: [
        expect.objectContaining({ id: 'US1', name: 'First', rank: 1, exchangeIds: ['LSX'] }),
        expect.objectContaining({ id: 'US2', name: 'Second', rank: 2, exchangeIds: ['XETRA'] }),
      ],
    }));
    expect(new URL(calls[1]?.url ?? 'https://invalid.local/').pathname).toBe('/api-gateway/watchlists/api/v2/watchlists/wl-1/items');
    expect(new URL(calls[1]?.url ?? 'https://invalid.local/').searchParams.get('pageSize')).toBe('200');
  });

  it('exposes supported default-watchlist item mutations', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = TradeRepublicClient.create({
      fetch: mockFetchSequence(calls, [
        jsonResponse({ id: 'watchlist-1', instrumentId: 'US1' }),
        new Response(null, { status: 204 }),
      ]),
    });

    await expect(client.discovery.addWatchlistItem('watchlist-1', 'US1')).resolves.toEqual({ id: 'watchlist-1', instrumentId: 'US1' });
    await expect(client.discovery.removeWatchlistItem('watchlist-1', 'US1')).resolves.toEqual(undefined);

    expect(calls.map((call) => [call.init.method, new URL(call.url).pathname, call.init.body])).toEqual([
      ['POST', '/api-gateway/watchlists/api/v2/watchlists/watchlist-1/items', JSON.stringify({ instrument_id: 'US1', item_rank: -1 })],
      ['DELETE', '/api-gateway/watchlists/api/v2/watchlists/watchlist-1/items/US1', undefined],
    ]);
  });
});
