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

const enabled = process.env.TR_INTEGRATION === '1'
  && process.env.TR_INTEGRATION_EXECUTE_ORDERS === 'EXECUTE_LIVE_BUY_AND_SELL';
const sessionPath = process.env.TR_SESSION_FILE ?? 'demo/.demo-session.json';
const instrumentId = requiredEnvironment('TR_INTEGRATION_ORDER_ISIN');
const exchangeId = requiredEnvironment('TR_INTEGRATION_ORDER_EXCHANGE');
const buyAmount = Number(process.env.TR_INTEGRATION_ORDER_AMOUNT_EUR ?? '0.5');
const maximumBuyAmount = 0.5;

describe('TradeRepublicClient live order integration', {
  skip: enabled ? false : 'set the live order execution opt-ins to run buy/sell integration tests',
}, () => {
  it('buys and sells the executed quantity while the exchange is open', { timeout: 300_000 }, async (t) => withLiveDiagnostics('live buy and sell', async () => {
    assert.ok(Number.isFinite(buyAmount) && buyAmount > 0, 'TR_INTEGRATION_ORDER_AMOUNT_EUR must be positive');
    assert.ok(buyAmount <= maximumBuyAmount, `live order tests are capped at ${maximumBuyAmount} EUR`);
    const client = await createLiveClient();
    let boughtQuantity = 0;
    let soldQuantity = 0;
    let sellAccepted = false;
    try {
      const destinations = await client.trading.orderDestinations(instrumentId);
      const destination = destinations.find((item) => item.id === exchangeId);
      assert.ok(destination, `expected ${exchangeId} destination for ${instrumentId}`);
      if (destination.open !== true) {
        t.skip(`${exchangeId} is not explicitly open; refusing to execute orders`);
        return;
      }

      const buy = await client.orders.submit({
        instrumentId,
        exchangeId,
        side: 'buy',
        mode: 'market',
        amount: buyAmount,
        validity: 'day',
        timeoutMs: 60_000,
      });
      if (buy.raw !== undefined) validateRawResponse('orders.submit', buy.raw);
      assert.equal(buy.status, 'succeeded', `buy submission did not succeed: ${JSON.stringify(buy)}`);
      assert.ok(buy.orderId, 'buy submission must return an order id');
      const executedBuy = await waitForExecutedOrder(client, buy.orderId);
      boughtQuantity = executedBuy.executedQuantity ?? executedBuy.quantity ?? 0;
      assert.ok(boughtQuantity > 0, 'executed buy must report a positive quantity');

      const sell = await submitSell(client, boughtQuantity);
      if (sell.raw !== undefined) validateRawResponse('orders.submit', sell.raw);
      assert.equal(sell.status, 'succeeded', `sell submission did not succeed: ${JSON.stringify(sell)}`);
      assert.ok(sell.orderId, 'sell submission must return an order id');
      sellAccepted = true;
      const executedSell = await waitForExecutedOrder(client, sell.orderId);
      soldQuantity = executedSell.executedQuantity ?? executedSell.quantity ?? 0;
      assert.ok(Math.abs(soldQuantity - boughtQuantity) < 1e-8, `expected to sell ${boughtQuantity}, sold ${soldQuantity}`);
    } finally {
      if (boughtQuantity > soldQuantity && !sellAccepted) {
        await t.test('emergency cleanup sell', async () => {
          const cleanup = await submitSell(client, boughtQuantity - soldQuantity);
          assert.equal(cleanup.status, 'succeeded', `manual cleanup required for ${boughtQuantity - soldQuantity} units of ${instrumentId}`);
        });
      }
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

function submitSell(client: TradeRepublicClient, size: number) {
  return client.orders.submit({
    instrumentId,
    exchangeId,
    side: 'sell',
    mode: 'market',
    size,
    sellFractions: true,
    validity: 'day',
    timeoutMs: 60_000,
  });
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
