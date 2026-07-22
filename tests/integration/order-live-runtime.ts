import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  FileSessionStore,
  TradeRepublicClient,
  validateRawResponse,
  type OrderDestination,
  type Subscription,
} from '../../src/index.js';

const sessionPath = process.env.TR_SESSION_FILE ?? join(process.cwd(), 'demo', '.demo-session.json');

export const orderCandidates = [
  { name: 'NVIDIA', instrumentId: 'US67066G1040' },
  { name: 'Apple', instrumentId: 'US0378331005' },
  { name: 'Microsoft', instrumentId: 'US5949181045' },
] as const;

export async function createLiveOrderClient(): Promise<TradeRepublicClient> {
  if (!existsSync(sessionPath)) throw new Error(`Missing live session: ${sessionPath}`);
  const client = TradeRepublicClient.create({
    sessionStore: new FileSessionStore(sessionPath),
    rawSchemaValidation: 'throw',
  });
  const session = await client.auth.restoreSession();
  if (!session) throw new Error(`No session could be loaded from ${sessionPath}`);
  await client.auth.refreshSession();
  return client;
}

export function assertExchangeClosed(
  submission: Awaited<ReturnType<TradeRepublicClient['orders']['submit']>>,
  instrumentId: string,
  exchangeId: string,
): void {
  if (submission.raw !== undefined) validateRawResponse('orders.submit', submission.raw);
  assert.equal(submission.status, 'failed', `expected ${exchangeId} to reject the order`);
  assert.equal(submission.error.code, 'exchangeClosed');
  assert.equal(submission.error.details?.exchangeId, exchangeId);
  assert.equal(submission.error.details?.isin, instrumentId);
}

export function supports(destination: OrderDestination, mode: 'limit' | 'market'): boolean {
  return destination.orderModes?.some((value) => value.toLowerCase() === mode) === true;
}

export function isClosedBerlinWindow(now = new Date()): boolean {
  const { minutes } = berlinClock(now);
  return minutes >= 23 * 60 || minutes < 5 * 60;
}

export function isOpenBerlinWindow(now = new Date()): boolean {
  const { weekday, minutes } = berlinClock(now);
  return weekday >= 1 && weekday <= 5 && minutes >= 9 * 60 + 30 && minutes < 17 * 60;
}

export function createOrderUpdateCollector(subscription: Subscription<unknown>) {
  const values: Record<string, unknown>[] = [];
  const waiters = new Set<() => void>();
  let failure: unknown;
  const iterator = subscription[Symbol.asyncIterator]();
  const loop = (async () => {
    try {
      while (true) {
        const result = await iterator.next();
        if (result.done) return;
        assertRecord(result.value, 'order update');
        values.push(result.value);
        for (const wake of waiters) wake();
        waiters.clear();
      }
    } catch (error) {
      failure = error;
      for (const wake of waiters) wake();
      waiters.clear();
    }
  })();

  return {
    async waitFor(
      predicate: (value: Record<string, unknown>) => boolean,
      label: string,
      timeoutMs = 45_000,
    ): Promise<Record<string, unknown>> {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const match = values.find(predicate);
        if (match) return match;
        if (failure) throw failure;
        await new Promise<void>((resolve) => {
          const remaining = Math.max(1, deadline - Date.now());
          const timer = setTimeout(() => {
            waiters.delete(wake);
            resolve();
          }, remaining);
          timer.unref?.();
          const wake = (): void => {
            clearTimeout(timer);
            resolve();
          };
          waiters.add(wake);
        });
      }
      throw new Error(`Timed out waiting for ${label}`);
    },
    async close(): Promise<void> {
      subscription.close();
      await loop;
    },
  };
}

function berlinClock(now: Date): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const text = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? '';
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(text('weekday')) + 1;
  return { weekday, minutes: Number(text('hour')) * 60 + Number(text('minute')) };
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
}
