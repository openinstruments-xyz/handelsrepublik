import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateRawResponse } from '../../src/index.js';
import { withLiveDiagnostics } from '../live-diagnostics.js';
import {
  createLiveOrderClient,
  createOrderUpdateCollector,
  hasAnyTimestamp,
  isWeekendBerlin,
  resolveAccountNumber,
  selectLimitOrderCandidate,
} from './order-live-runtime.js';

describe('weekend limit-order lifecycle', () => {
  it('submits and cancels a deeply non-marketable limit order', { timeout: 180_000 }, async (t) => withLiveDiagnostics('weekend limit-order lifecycle', async () => {
    if (!isWeekendBerlin()) return t.skip('runs only on Saturday or Sunday in Europe/Berlin');
    const client = await createLiveOrderClient();
    let activeOrderId: string | undefined;
    let collector: ReturnType<typeof createOrderUpdateCollector> | undefined;
    try {
      const candidate = await selectLimitOrderCandidate(client, {
        requireOpen: false,
        minimumBid: 10,
        requiredExpiry: 'gtd',
      });
      if (!candidate) return t.skip('no candidate advertises GTD limit orders with a bid of at least EUR 10');
      const accountNumber = await resolveAccountNumber(client);
      collector = createOrderUpdateCollector(client.orders.orderUpdates(accountNumber));

      const submission = await client.orders.submit({
        instrumentId: candidate.instrumentId,
        exchangeId: candidate.destination.id,
        side: 'buy',
        mode: 'limit',
        size: 1,
        limit: 1,
        validity: { type: 'month' },
        timeoutMs: 60_000,
      });
      if (submission.raw !== undefined) validateRawResponse('orders.submit', submission.raw);
      assert.equal(
        submission.status,
        'succeeded',
        submission.status === 'failed'
          ? `weekend submission failed: ${submission.error.code ?? 'unknown'} ${submission.error.message ?? ''}`.trim()
          : `weekend submission outcome is ${submission.status}`,
      );
      assert.ok(submission.orderId, 'weekend submission must return an order id');
      activeOrderId = submission.orderId;
      await collector.waitFor(
        (event) => event.id === submission.orderId && hasAnyTimestamp(event, 'receivedAt', 'submittedAt', 'openedAt'),
        `created/submitted update for ${submission.orderId}`,
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
        await client.close();
      }
    }
  }));
});
