import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FileSessionStore, TradeRepublicClient, validateRawResponse } from '../../src/index.js';
import { withLiveDiagnostics } from '../live-diagnostics.js';

const sessionPath = process.env.TR_SESSION_FILE ?? 'demo/.demo-session.json';
const instrumentId = requiredEnvironment('TR_INTEGRATION_ORDER_ISIN');
const exchangeId = requiredEnvironment('TR_INTEGRATION_ORDER_EXCHANGE');
const openBuyLimit = Number(process.env.TR_INTEGRATION_OPEN_BUY_LIMIT_EUR ?? '');
const runClosedMarketOrderTest = isBeforeBerlinTime(5, 0);
const selectedProbe = process.env.TR_INTEGRATION_VENUE_STATE_PROBE?.trim();

if (selectedProbe && !['closed-limit', 'closed-market', 'open-limit'].includes(selectedProbe)) {
  throw new Error(`Unknown TR_INTEGRATION_VENUE_STATE_PROBE: ${selectedProbe}`);
}

describe('TradeRepublicClient venue-state order integration', () => {
  it('rejects a EUR 1 limit buy while the selected exchange is closed', { timeout: 180_000 }, async (t) => withLiveDiagnostics('closed-exchange limit buy rejection', async () => {
    if (skipUnlessSelected(t, 'closed-limit')) return;
    assertRequiredInstrument();
    const client = await createLiveClient();
    try {
      const instrument = { name: instrumentId, instrumentId, exchangeId };
      const destinations = await client.trading.orderDestinations(instrumentId);
      const destination = destinations.find((item) => item.id === exchangeId);
      assert.ok(destination, `expected ${exchangeId} destination for ${instrumentId}`);
      if (destination.open !== false) {
        t.skip(`${exchangeId} is not explicitly closed`);
        return;
      }
      assert.ok(destination.orderModes?.some((mode) => mode.toLowerCase() === 'limit'), `${exchangeId} must support limit orders`);
      const quote = await client.market.quote(instrumentId, exchangeId);
      assert.ok(quote.bid && quote.bid > 0, `expected a positive ${exchangeId} bid for a non-marketable buy limit`);
      await assertRejectedLimitBuy(client, instrument, quote.bid);

      const cancellation = await client.orders.cancel(randomUUID(), { timeoutMs: 15_000 });
      if (cancellation.raw !== undefined) validateRawResponse('orders.cancel', cancellation.raw);
      assert.equal(cancellation.status, 'failed');
      assert.equal(firstStringByKey(cancellation.error, 'code'), 'orderNotFound');
    } finally {
      await client.close();
    }
  }));

  it('rejects a EUR 1 market buy while the selected exchange is closed', { timeout: 90_000 }, async (t) => withLiveDiagnostics('closed-exchange EUR 1 market rejection', async () => {
    if (skipUnlessSelected(t, 'closed-market')) return;
    if (!runClosedMarketOrderTest) {
      t.skip('market-order rejection probe runs only before 05:00 Europe/Berlin');
      return;
    }
    assertRequiredInstrument();
    const client = await createLiveClient();
    try {
      const destination = (await client.trading.orderDestinations(instrumentId)).find((item) => item.id === exchangeId);
      assert.ok(destination, `expected ${exchangeId} destination for ${instrumentId}`);
      if (destination.open !== false) {
        t.skip(`${exchangeId} is not explicitly closed`);
        return;
      }
      const quote = await client.market.quote(instrumentId, exchangeId);
      const lastClientPrice = quote.ask ?? quote.last ?? quote.bid;
      assert.ok(lastClientPrice && lastClientPrice > 0, `expected a positive ${exchangeId} reference price`);
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
      assertExchangeClosed(submission, { name: instrumentId, instrumentId, exchangeId }, 'buy');
    } finally {
      await client.close();
    }
  }));

  it('accepts and cancels a deeply non-marketable one-share limit buy while the selected exchange is open', { timeout: 120_000 }, async (t) => withLiveDiagnostics('open-exchange limit buy and cancel', async () => {
    if (skipUnlessSelected(t, 'open-limit')) return;
    assertRequiredInstrument();
    assert.ok(Number.isFinite(openBuyLimit) && openBuyLimit > 0, 'TR_INTEGRATION_OPEN_BUY_LIMIT_EUR must be positive');
    const client = await createLiveClient();
    let orderId: string | undefined;
    try {
      const destination = (await client.trading.orderDestinations(instrumentId)).find((item) => item.id === exchangeId);
      assert.ok(destination, `expected ${exchangeId} destination for ${instrumentId}`);
      if (destination.open !== true) {
        t.skip(`${exchangeId} is not explicitly open`);
        return;
      }
      assert.ok(destination.orderModes?.some((mode) => mode.toLowerCase() === 'limit'), `${exchangeId} must support limit orders`);
      const quote = await client.market.quote(instrumentId, exchangeId);
      assert.ok(quote.bid && quote.bid > 0, `expected a positive ${exchangeId} bid`);
      assert.ok(openBuyLimit <= quote.bid * 0.1, `refusing limit ${openBuyLimit}: it must be at most 10% of the live bid ${quote.bid}`);

      const submission = await client.orders.submit({
        instrumentId,
        exchangeId,
        side: 'buy',
        mode: 'limit',
        size: 1,
        limit: openBuyLimit,
        validity: 'day',
        timeoutMs: 60_000,
      });
      if (submission.raw !== undefined) validateRawResponse('orders.submit', submission.raw);
      assert.equal(submission.status, 'succeeded', `limit buy submission did not succeed: ${JSON.stringify(submission)}`);
      assert.ok(submission.orderId, 'limit buy submission must return an order id');
      orderId = submission.orderId;

      const cancellation = await client.orders.cancel(orderId, { timeoutMs: 30_000 });
      if (cancellation.raw !== undefined) validateRawResponse('orders.cancel', cancellation.raw);
      assert.equal(cancellation.status, 'succeeded', `limit buy cancellation did not succeed: ${JSON.stringify(cancellation)}`);
      orderId = undefined;
    } finally {
      try {
        if (orderId) await client.orders.cancel(orderId, { timeoutMs: 30_000 });
      } finally {
        await client.close();
      }
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

async function assertRejectedLimitBuy(
  client: TradeRepublicClient,
  instrument: { name: string; instrumentId: string; exchangeId: string },
  limit: number,
): Promise<void> {
  const submission = await client.orders.submit({
    instrumentId: instrument.instrumentId,
    exchangeId: instrument.exchangeId,
    side: 'buy',
    mode: 'limit',
    amount: 1,
    limit,
    validity: 'day',
    timeoutMs: 30_000,
  });
  assertExchangeClosed(submission, instrument, 'buy');
}

function assertExchangeClosed(
  submission: Awaited<ReturnType<TradeRepublicClient['orders']['submit']>>,
  instrument: { name: string; instrumentId: string; exchangeId: string },
  side: 'buy' | 'sell',
): void {
  if (submission.raw !== undefined) validateRawResponse('orders.submit', submission.raw);
  assert.equal(submission.status, 'failed', `expected ${side} rejection for ${instrument.name}`);
  assert.equal(firstStringByKey(submission.error, 'code'), 'exchangeClosed');
  assert.equal(firstStringByKey(submission.error, 'exchangeId'), instrument.exchangeId);
  assert.equal(firstStringByKey(submission.error, 'isin'), instrument.instrumentId);
}

function firstStringByKey(value: unknown, ...keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstStringByKey(item, ...keys);
      if (found) return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate) return candidate;
  }
  for (const candidate of Object.values(record)) {
    const found = firstStringByKey(candidate, ...keys);
    if (found) return found;
  }
  return undefined;
}

function requiredEnvironment(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function assertRequiredInstrument(): void {
  assert.ok(instrumentId, 'TR_INTEGRATION_ORDER_ISIN is required');
  assert.ok(exchangeId, 'TR_INTEGRATION_ORDER_EXCHANGE is required');
}

function skipUnlessSelected(
  t: { skip(message?: string): void },
  probe: 'closed-limit' | 'closed-market' | 'open-limit',
): boolean {
  if (!selectedProbe || selectedProbe === probe) return false;
  t.skip(`workflow selected the ${selectedProbe} venue-state probe`);
  return true;
}

function isBeforeBerlinTime(hour: number, minute: number): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((part) => part.type === type)?.value);
  return value('hour') * 60 + value('minute') < hour * 60 + minute;
}
