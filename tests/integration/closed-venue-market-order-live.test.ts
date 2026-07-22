import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withLiveDiagnostics } from '../live-diagnostics.js';
import {
  assertExchangeClosed,
  createLiveOrderClient,
  isClosedBerlinWindow,
  supports,
} from './order-live-runtime.js';

const instrumentId = process.env.TR_INTEGRATION_ORDER_ISIN?.trim() || 'US0378331005';
const exchangeId = process.env.TR_INTEGRATION_ORDER_EXCHANGE?.trim() || 'LSX';

describe('closed-venue market-order rejection', () => {
  it('rejects a EUR 1 market buy with exchangeClosed', { timeout: 120_000 }, async (t) => withLiveDiagnostics('closed-venue market-order rejection', async () => {
    if (!isClosedBerlinWindow()) return t.skip('runs only from 23:00 until before 05:00 Europe/Berlin');
    const client = await createLiveOrderClient();
    let unexpectedOrderId: string | undefined;
    try {
      const destination = (await client.trading.orderDestinations(instrumentId)).find((item) => item.id === exchangeId);
      assert.ok(destination, `expected ${exchangeId} destination for ${instrumentId}`);
      if (destination.open !== false) return t.skip(`${exchangeId} is not explicitly closed`);
      assert.ok(supports(destination, 'market'), `${exchangeId} must support market orders`);
      const quote = await client.market.quote(instrumentId, exchangeId);
      const lastClientPrice = quote.ask ?? quote.last ?? quote.bid;
      assert.ok(lastClientPrice && lastClientPrice > 0, 'expected a positive reference price');
      const submission = await client.orders.submit({
        instrumentId,
        exchangeId,
        side: 'buy',
        mode: 'market',
        amount: 1,
        lastClientPrice,
        validity: 'day',
        timeoutMs: 30_000,
      });
      if (submission.status === 'succeeded') unexpectedOrderId = submission.orderId;
      assertExchangeClosed(submission, instrumentId, exchangeId);
    } finally {
      try {
        if (unexpectedOrderId) await client.orders.cancel(unexpectedOrderId, { timeoutMs: 30_000 });
      } finally {
        await client.close();
      }
    }
  }));
});
