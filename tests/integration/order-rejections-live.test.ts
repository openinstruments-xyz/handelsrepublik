import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FileSessionStore, TradeRepublicClient, validateRawResponse } from '../../src/index.js';
import { withLiveDiagnostics } from '../live-diagnostics.js';

const enabled = process.env.TR_INTEGRATION === '1'
  && process.env.TR_INTEGRATION_CLOSED_ORDER_REJECTIONS === '1';
const sessionPath = process.env.TR_SESSION_FILE ?? 'demo/.demo-session.json';
const instruments = [
  { name: 'SAP stock', instrumentId: 'DE0007164600', exchangeId: 'LSX' },
  { name: 'iShares Core MSCI World ETF', instrumentId: 'IE00B4L5Y983', exchangeId: 'LSX' },
] as const;

describe('TradeRepublicClient closed-exchange order integration', {
  skip: enabled ? false : 'set the closed-exchange integration opt-ins to run rejection tests',
}, () => {
  it('rejects buy and sell submissions while LSX is closed', { timeout: 180_000 }, async (t) => withLiveDiagnostics('closed-exchange order rejections', async () => {
    const client = await createLiveClient();
    try {
      for (const instrument of instruments) {
        await t.test(instrument.name, async (instrumentTest) => {
          const destinations = await client.trading.orderDestinations(instrument.instrumentId);
          const destination = destinations.find((item) => item.id === instrument.exchangeId);
          assert.ok(destination, `expected ${instrument.exchangeId} destination for ${instrument.name}`);
          assert.equal(destination.open, false, `${instrument.exchangeId} must be explicitly closed for rejection tests`);
          for (const side of ['buy', 'sell'] as const) {
            await instrumentTest.test(side, () => assertRejectedOrder(client, instrument, side));
          }
        });
      }

      const cancellation = await client.orders.cancel(randomUUID(), { timeoutMs: 15_000 });
      if (cancellation.raw !== undefined) validateRawResponse('orders.cancel', cancellation.raw);
      assert.equal(cancellation.status, 'failed');
      assert.equal(firstStringByKey(cancellation.error, 'code'), 'orderNotFound');
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

async function assertRejectedOrder(
  client: TradeRepublicClient,
  instrument: { name: string; instrumentId: string; exchangeId: string },
  side: 'buy' | 'sell',
): Promise<void> {
  const submission = await client.orders.submit({
    instrumentId: instrument.instrumentId,
    exchangeId: instrument.exchangeId,
    side,
    mode: 'market',
    size: 1,
    validity: 'day',
    timeoutMs: 30_000,
  });
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
