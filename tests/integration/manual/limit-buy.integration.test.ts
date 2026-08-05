import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateRawResponse } from '../../../src/index.js';
import {
  createOrderUpdateCollector,
  hasAnyTimestamp,
  isOpenBerlinWindow,
  NVIDIA,
  resolveSecuritiesAccountNumber,
  selectNvidiaLimitOrderCandidate,
  withLiveClient,
} from '../support.js';

const ORDER = {
  side: 'buy' as const,
  mode: 'limit' as const,
  size: 1,
  limit: 1,
  validity: 'day' as const,
};

async function waitFor<T>(read: () => Promise<T>, matches: (value: T) => boolean, label: string, timeoutMs = 45_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const value = await read();
    if (matches(value)) return value;
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

describe('manual limit-buy integration', () => {
  it('opens and cancels a deeply non-marketable limit buy', { timeout: 300_000 }, async (t) => {
    assert.equal(process.env.TR_INTEGRATION_ALLOW_ORDERS, 'true', 'Set TR_INTEGRATION_ALLOW_ORDERS=true to run the manual order test.');
    if (!isOpenBerlinWindow()) return t.skip('runs only on weekdays from 07:00 until before 22:40 Europe/Berlin');
    await withLiveClient('manual limit buy', async (client) => {
      let activeOrderId: string | undefined;
      let collector: ReturnType<typeof createOrderUpdateCollector> | undefined;
      try {
        const candidate = await selectNvidiaLimitOrderCandidate(client);
        if (!candidate) return t.skip('Nvidia has no explicitly open limit venue with a bid of at least EUR 10');
        const openBefore = await client.orders.open();
        collector = createOrderUpdateCollector(client.orders.orderUpdates(await resolveSecuritiesAccountNumber(client)));
        const submission = await client.orders.submit({
          instrumentId: candidate.instrumentId,
          exchangeId: candidate.destination.id,
          ...ORDER,
          timeoutMs: 60_000,
        });
        if (submission.raw !== undefined) validateRawResponse('orders.submit', submission.raw);
        assert.equal(submission.status, 'succeeded');
        assert.ok(submission.orderId, 'submission must return an order id');
        const orderId = submission.orderId;
        activeOrderId = orderId;
        assert.equal(openBefore.some((order) => order.id === orderId), false, 'new order id must not predate submission');
        await collector.waitFor(
          (event) => event.id === orderId && hasAnyTimestamp(event, 'receivedAt', 'submittedAt', 'openedAt'),
          `created/open update for ${orderId}`,
        );
        const openAfterCreate = await waitFor(
          () => client.orders.open(),
          (orders) => orders.some((order) => order.id === orderId),
          `order ${orderId} to appear in the open-order list`,
        );
        const created = openAfterCreate.find((order) => order.id === orderId);
        assert.ok(created, 'created order must be open');
        assert.equal(created.instrumentId ?? created.isin, NVIDIA);
        assert.equal(created.side?.toLowerCase(), ORDER.side);
        assert.equal(created.type?.toLowerCase(), ORDER.mode);
        assert.equal(created.quantity, ORDER.size);
        assert.match(created.status ?? '', /^(open|opened|received)$/i);
        assert.ok(created.createdAt ?? created.submittedAt ?? created.updatedAt, 'created order must include a lifecycle timestamp');
        const cancellation = await client.orders.cancel(orderId, { timeoutMs: 30_000 });
        if (cancellation.raw !== undefined) validateRawResponse('orders.cancel', cancellation.raw);
        assert.equal(cancellation.status, 'succeeded');
        activeOrderId = undefined;
        await collector.waitFor(
          (event) => event.id === orderId && typeof event.cancelledAt === 'string',
          `cancelled update for ${orderId}`,
        );
        await waitFor(
          () => client.orders.open(),
          (orders) => orders.every((order) => order.id !== orderId),
          `order ${orderId} to leave the open-order list`,
        );
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
