import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FileSessionStore,
  TradeRepublicClient,
  validateRawResponse,
} from '../../src/index.js';
import type { Order } from '../../src/index.js';
import { withLiveDiagnostics } from '../live-diagnostics.js';
import { submitLiveMarketSell } from './live-sell.js';

const sessionPath = process.env.TR_SESSION_FILE ?? 'demo/.demo-session.json';
const instrumentId = requiredEnvironment('TR_INTEGRATION_ORDER_ISIN');
const sellSize = Number(process.env.TR_INTEGRATION_SELL_SIZE ?? '1');

describe('TradeRepublicClient market sell on live account integration', () => {
  it('sells the configured whole-unit quantity at an automatically selected open venue', { timeout: 300_000 }, async (t) => withLiveDiagnostics('market sell on live account', async () => {
    assert.ok(Number.isSafeInteger(sellSize) && sellSize > 0, 'TR_INTEGRATION_SELL_SIZE must be a positive whole number');
    const client = await createLiveClient();
    try {
      const attempt = await submitLiveMarketSell(client, instrumentId, sellSize);
      if (attempt.status === 'skipped') {
        t.skip(attempt.reason);
        return;
      }
      t.diagnostic(`selected ${attempt.destination.name ?? attempt.destination.id} (${attempt.destination.id})`);
      const sell = attempt.submission;
      if (sell.raw !== undefined) validateRawResponse('orders.submit', sell.raw);
      assert.equal(sell.status, 'succeeded', `sell submission did not succeed: ${JSON.stringify(sell)}`);
      assert.ok(sell.orderId, 'sell submission must return an order id');
      const executedSell = await waitForExecutedOrder(client, sell.orderId);
      const soldQuantity = executedSell.executedQuantity ?? executedSell.quantity ?? 0;
      assert.equal(soldQuantity, sellSize, 'executed sell must match the requested whole-unit quantity');
    } finally {
      await client.close();
    }
  }));
});

async function createLiveClient(): Promise<TradeRepublicClient> {
  if (!existsSync(sessionPath)) throw new Error(`Missing live session: ${sessionPath}`);
  const client = TradeRepublicClient.create({ sessionStore: new FileSessionStore(sessionPath) });
  const session = await client.auth.restoreSession();
  if (!session) throw new Error(`No session could be loaded from ${sessionPath}`);
  await client.auth.refreshSession();
  return client;
}

async function waitForExecutedOrder(client: TradeRepublicClient, orderId: string): Promise<Order> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const order = (await client.orders.all({ instrumentId, limit: 100 })).find((candidate) => candidate.id === orderId);
    const status = order?.status?.toUpperCase().replaceAll('_', '').replaceAll('-', '');
    if (order && (status === 'EXECUTED' || status === 'FILLED')) return order;
    if (order && ['CANCELLED', 'CANCELED', 'EXPIRED', 'REJECTED'].includes(status ?? '')) {
      throw new Error(`order ${orderId} ended with status ${order.status}`);
    }
    await delay(2_000);
  }
  throw new Error(`timed out waiting for order ${orderId} to execute`);
}

function requiredEnvironment(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
