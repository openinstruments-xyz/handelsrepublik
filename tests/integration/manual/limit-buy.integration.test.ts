import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateRawResponse } from '../../../src/index.js';
import {
  createOrderUpdateCollector,
  hasAnyTimestamp,
  isOpenBerlinWindow,
  resolveSecuritiesAccountNumber,
  selectLimitOrderCandidate,
  withLiveClient,
} from '../support.js';

describe('manual limit-buy integration', () => {
  it('opens and cancels a deeply non-marketable limit buy', { timeout: 180_000 }, async (t) => {
    assert.equal(process.env.TR_INTEGRATION_ALLOW_ORDERS, 'true', 'Set TR_INTEGRATION_ALLOW_ORDERS=true to run the manual order test.');
    if (!isOpenBerlinWindow()) return t.skip('runs only on weekdays from 07:00 until before 22:40 Europe/Berlin');
    await withLiveClient('manual limit buy', async (client) => {
      let activeOrderId: string | undefined;
      let collector: ReturnType<typeof createOrderUpdateCollector> | undefined;
      try {
        const candidate = await selectLimitOrderCandidate(client);
        if (!candidate) return t.skip('no explicitly open limit venue has a bid of at least EUR 10');
        collector = createOrderUpdateCollector(client.orders.orderUpdates(await resolveSecuritiesAccountNumber(client)));
        const submission = await client.orders.submit({
          instrumentId: candidate.instrumentId,
          exchangeId: candidate.destination.id,
          side: 'buy',
          mode: 'limit',
          size: 1,
          limit: 1,
          validity: 'day',
          timeoutMs: 60_000,
        });
        if (submission.raw !== undefined) validateRawResponse('orders.submit', submission.raw);
        assert.equal(submission.status, 'succeeded');
        assert.ok(submission.orderId, 'submission must return an order id');
        activeOrderId = submission.orderId;
        await collector.waitFor(
          (event) => event.id === activeOrderId && hasAnyTimestamp(event, 'receivedAt', 'submittedAt', 'openedAt'),
          `created/open update for ${activeOrderId}`,
        );
        const cancellation = await client.orders.cancel(activeOrderId, { timeoutMs: 30_000 });
        if (cancellation.raw !== undefined) validateRawResponse('orders.cancel', cancellation.raw);
        assert.equal(cancellation.status, 'succeeded');
        await collector.waitFor(
          (event) => event.id === activeOrderId && typeof event.cancelledAt === 'string',
          `cancelled update for ${activeOrderId}`,
        );
        activeOrderId = undefined;
      } finally {
        try {
          if (activeOrderId) await client.orders.cancel(activeOrderId, { timeoutMs: 30_000 });
        } finally {
          if (collector) await collector.close();
        }
      }
    });
  });
});
