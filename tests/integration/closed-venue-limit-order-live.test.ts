import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withLiveDiagnostics } from '../live-diagnostics.js';
import {
  assertExchangeClosed,
  createLiveOrderClient,
  isWeekdayClosedBerlinWindow,
  supports,
} from './order-live-runtime.js';

const instrumentId = process.env.TR_INTEGRATION_ORDER_ISIN?.trim() || 'US0378331005';
const exchangeId = process.env.TR_INTEGRATION_ORDER_EXCHANGE?.trim() || 'LSX';

describe('closed-venue limit-order rejection', () => {
  it('rejects a one-share EUR 1 limit buy with exchangeClosed', { timeout: 120_000 }, async (t) => withLiveDiagnostics('closed-venue limit-order rejection', async () => {
    if (!isWeekdayClosedBerlinWindow()) return t.skip('runs only on weekdays from 23:00 until before 06:40 Europe/Berlin');
    const client = await createLiveOrderClient();
    let unexpectedOrderId: string | undefined;
    try {
      const destination = (await client.trading.orderDestinations(instrumentId)).find((item) => item.id === exchangeId);
      assert.ok(destination, `expected ${exchangeId} destination for ${instrumentId}`);
      if (destination.open !== false) return t.skip(`${exchangeId} is not explicitly closed`);
      assert.ok(supports(destination, 'limit'), `${exchangeId} must support limit orders`);
      const submission = await client.orders.submit({
        instrumentId,
        exchangeId,
        side: 'buy',
        mode: 'limit',
        size: 1,
        limit: 1,
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
