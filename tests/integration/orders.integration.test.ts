import assert from 'node:assert/strict';
import { describe, it } from './runner.js';
import { APPLE, assertArray, assertRecord, withLiveClient } from './support.js';

describe('orders integration', () => {
  it('reads histories and previews a non-marketable limit order', { timeout: 120_000 }, () => withLiveClient('orders', async (client, note) => {
    for (const [name, value] of Object.entries({
      all: await client.orders.all(),
      open: await client.orders.open(),
      closed: await client.orders.closed(),
      executed: await client.orders.executed(),
      mutualFunds: await client.orders.mutualFunds(),
      privateMarkets: await client.orders.privateMarkets(),
    })) {
      assertArray(value, `orders.${name}`);
      if (value.length === 0) note(`${name}: valid empty list`);
    }
    const destination = (await client.trading.orderDestinations(APPLE))[0];
    assert.ok(destination?.id, 'expected an Apple order destination');
    const order = { instrumentId: APPLE, exchangeId: destination.id, side: 'buy' as const, mode: 'limit' as const, size: 1, limit: 1, validity: 'day' as const };
    assertRecord(await client.orders.prepare(order), 'orders.prepare');
    assertRecord(await client.orders.preview(order), 'orders.preview');
  }));
});
