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
import { submitLiveMarketBuy } from './live-buy.js';

const enabled = process.env.TR_INTEGRATION_EXECUTE_ORDERS === 'EXECUTE_LIVE_BUY';
const sessionPath = process.env.TR_SESSION_FILE ?? 'demo/.demo-session.json';
const instrumentId = requiredEnvironment('TR_INTEGRATION_ORDER_ISIN');
const buyAmount = Number(process.env.TR_INTEGRATION_ORDER_AMOUNT_EUR ?? '0.5');
const maximumBuyAmount = 5;

describe('TradeRepublicClient live buy integration', {
  skip: enabled ? false : 'set the live order execution opt-in to run buy integration tests',
}, () => {
  it('buys the configured amount at an automatically selected open venue', { timeout: 300_000 }, async (t) => withLiveDiagnostics('live buy', async () => {
    assert.ok(Number.isFinite(buyAmount) && buyAmount > 0, 'TR_INTEGRATION_ORDER_AMOUNT_EUR must be positive');
    assert.ok(buyAmount <= maximumBuyAmount, `live order tests are capped at ${maximumBuyAmount} EUR`);
    const client = await createLiveClient();
    try {
      const attempt = await submitLiveMarketBuy(client, instrumentId, buyAmount);
      if (attempt.status === 'skipped') {
        t.skip(attempt.reason);
        return;
      }
      t.diagnostic(`selected ${attempt.destination.name ?? attempt.destination.id} (${attempt.destination.id})`);
      const buy = attempt.submission;
      if (buy.raw !== undefined) validateRawResponse('orders.submit', buy.raw);
      assert.equal(buy.status, 'succeeded', `buy submission did not succeed: ${JSON.stringify(buy)}`);
      assert.ok(buy.orderId, 'buy submission must return an order id');
      const executedBuy = await waitForExecutedOrder(client, buy.orderId);
      const boughtQuantity = executedBuy.executedQuantity ?? executedBuy.quantity ?? 0;
      assert.ok(boughtQuantity > 0, 'executed buy must report a positive quantity');
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
