import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateRawResponse, type OrderDestination } from '../../src/index.js';
import { withLiveDiagnostics } from '../live-diagnostics.js';
import {
  createLiveOrderClient,
  createOrderUpdateCollector,
  isOpenBerlinWindow,
  orderCandidates,
  supports,
} from './order-live-runtime.js';

describe('open-venue limit-order lifecycle', () => {
  it('streams, submits, replaces, and cancels a deeply non-marketable order', { timeout: 240_000 }, async (t) => withLiveDiagnostics('open-venue limit-order lifecycle', async () => {
    if (!isOpenBerlinWindow()) return t.skip('runs only on weekdays from 07:00 until before 22:40 Europe/Berlin');
    const client = await createLiveOrderClient();
    let activeOrderId: string | undefined;
    let collector: ReturnType<typeof createOrderUpdateCollector> | undefined;
    try {
      const candidate = await selectCandidate(client);
      if (!candidate) return t.skip('no candidate has an explicitly open limit venue and a bid of at least EUR 10');
      const accountNumber = await resolveAccountNumber(client);
      collector = createOrderUpdateCollector(client.orders.orderUpdates(accountNumber));

      const order = {
        instrumentId: candidate.instrumentId,
        exchangeId: candidate.destination.id,
        side: 'buy' as const,
        mode: 'limit' as const,
        size: 1,
        validity: 'day' as const,
        timeoutMs: 60_000,
      };
      const submission = await client.orders.submit({ ...order, limit: 1 });
      if (submission.raw !== undefined) validateRawResponse('orders.submit', submission.raw);
      assert.equal(submission.status, 'succeeded');
      assert.ok(submission.orderId, 'submission must return an order id');
      activeOrderId = submission.orderId;
      await collector.waitFor(
        (event) => event.id === submission.orderId && hasAnyTimestamp(event, 'receivedAt', 'submittedAt', 'openedAt'),
        `created/open update for ${submission.orderId}`,
      );

      const replacement = await client.orders.replace(submission.orderId, { ...order, limit: 0.5 }, {
        cancellationTimeoutMs: 30_000,
        submissionTimeoutMs: 60_000,
      });
      assert.equal(replacement.status, 'succeeded');
      await collector.waitFor(
        (event) => event.id === submission.orderId && typeof event.cancelledAt === 'string',
        `cancelled update for replaced order ${submission.orderId}`,
      );
      assert.ok(replacement.submission.orderId, 'replacement must return an order id');
      activeOrderId = replacement.submission.orderId;
      await collector.waitFor(
        (event) => event.id === activeOrderId && hasAnyTimestamp(event, 'receivedAt', 'submittedAt', 'openedAt'),
        `created/open update for replacement ${activeOrderId}`,
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

async function selectCandidate(client: Awaited<ReturnType<typeof createLiveOrderClient>>): Promise<{
  instrumentId: string;
  destination: OrderDestination;
} | undefined> {
  for (const candidate of orderCandidates) {
    const destinations = await client.trading.orderDestinations(candidate.instrumentId);
    for (const destination of destinations) {
      if (destination.open !== true || !supports(destination, 'limit')) continue;
      const quote = await client.market.quote(candidate.instrumentId, destination.id);
      if (quote.bid !== undefined && quote.bid >= 10) return { instrumentId: candidate.instrumentId, destination };
    }
  }
  return undefined;
}

async function resolveAccountNumber(client: Awaited<ReturnType<typeof createLiveOrderClient>>): Promise<string> {
  await client.portfolio.current();
  const value = client.securitiesAccountNumber ?? client.getSession()?.securitiesAccountNumber;
  assert.ok(value, 'expected a securities account number for order updates');
  return value;
}

function hasAnyTimestamp(value: Record<string, unknown>, ...keys: string[]): boolean {
  return keys.some((key) => typeof value[key] === 'string');
}
