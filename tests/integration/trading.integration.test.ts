import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { APPLE, DEFAULT_EXCHANGE, assetClasses, assertArray, assertRecord, firstAsset, resolveSecuritiesAccountNumber, withLiveClient } from './support.js';

describe('trading integration', () => {
  it('reads destinations, pricing, sizes, execution snapshots, and PnL', { timeout: 240_000 }, () => withLiveClient('trading', async (client, note) => {
    for (const type of assetClasses) {
      const asset = await firstAsset(client, type);
      if (asset?.id) assertArray(await client.trading.orderDestinations(asset.id), `orderDestinations(${type})`);
      else note(`${type}: no fixture discovered`);
    }
    const destinations = await client.trading.orderDestinations(APPLE);
    assertArray(destinations, 'trading.orderDestinations');
    assertRecord(await client.trading.homeOrderDestination(APPLE), 'trading.homeOrderDestination');
    const open = destinations.find((destination) => destination.open === true);
    if (open) assertRecord(await client.trading.priceForOrder({ isin: APPLE, exchangeId: open.id, side: 'buy' }), 'trading.priceForOrder');
    else note('no open Apple destination; live price not observed');
    assert.ok(await client.trading.availableSize(APPLE) !== undefined);
    const executed = await client.orders.executed({ limit: 100 });
    const tradeId = findDeepString(executed.map((order) => order.raw), 'tradeId');
    if (tradeId) {
      assertRecord(await client.trading.orderBookSnapshot(tradeId), 'trading.orderBookSnapshot');
      assertRecord(await client.trading.tapeSnapshot(tradeId), 'trading.tapeSnapshot');
    } else note('no executed trade id discovered');
    const portfolio = await client.portfolio.current();
    const secAccNo = await resolveSecuritiesAccountNumber(client);
    const pnlItems = portfolio.positions.flatMap((position) => {
      const instrumentId = position.isin ?? position.id;
      return instrumentId && position.quantity && position.quantity > 0
        ? [{ secAccNo, instrumentId, day: new Date().toISOString().slice(0, 10), quantity: position.quantity }]
        : [];
    });
    if (pnlItems.length) assert.ok(await client.trading.dailyPnl(pnlItems) !== undefined);
    else note('no positive held positions; daily PnL not observed');
    const until = Date.now();
    assert.ok(await client.trading.tradeAggregateHistory(APPLE, DEFAULT_EXCHANGE, 60_000, until - 86_400_000, until) !== undefined);
  }));
});

function findDeepString(value: unknown, key: string): string | undefined {
  if (Array.isArray(value)) return value.map((item) => findDeepString(item, key)).find(Boolean);
  if (value === null || typeof value !== 'object') return undefined;
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (entryKey === key && typeof entryValue === 'string' && entryValue) return entryValue;
    const found = findDeepString(entryValue, key);
    if (found) return found;
  }
  return undefined;
}
