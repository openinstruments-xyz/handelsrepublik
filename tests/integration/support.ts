import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  FileSessionStore,
  TradeRepublicClient,
  type Asset,
  type AssetSearchType,
  type OrderDestination,
  type Subscription,
} from '../../src/index.js';
import { withLiveDiagnostics } from '../live-diagnostics.js';

export const APPLE = 'US0378331005';
export const NVIDIA = 'US67066G1040';
export const DEFAULT_EXCHANGE = process.env.TR_INTEGRATION_EXCHANGE ?? 'LSX';
export const TIB = 'TIB';
export const BITCOIN = 'XF000BTC0017';
export const BITCOIN_EXCHANGE = 'BHS';
export const DEFAULT_WATCHLIST = '00000000-0000-0000-0000-000000000000';

const sessionPath = process.env.TR_SESSION_FILE ?? join(process.cwd(), 'demo', '.demo-session.json');

export async function withLiveClient(
  label: string,
  run: (client: TradeRepublicClient, note: (message: string) => void) => Promise<void>,
): Promise<void> {
  await withLiveDiagnostics(label, async () => {
    if (!existsSync(sessionPath)) throw new Error(`Missing live session ${sessionPath}. Re-authenticate or set TR_SESSION_FILE.`);
    const client = TradeRepublicClient.create({
      sessionStore: new FileSessionStore(sessionPath),
      rawSchemaValidation: 'throw',
    });
    try {
      const session = await client.auth.restoreSession();
      if (!session) throw new Error(`No Trade Republic session could be restored from ${sessionPath}.`);
      await run(client, (message) => console.log(`[live-integration] ${label}: ${message}`));
    } finally {
      client.close();
    }
  });
}

export function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
}

export function assertArray(value: unknown, label: string): asserts value is unknown[] {
  assert.ok(Array.isArray(value), `${label} must be an array`);
}

export async function nextStreamValue<T>(subscription: Subscription<T>, label: string, timeoutMs = 20_000): Promise<T> {
  const iterator = subscription[Symbol.asyncIterator]();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      iterator.next(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs);
        timer.unref?.();
      }),
    ]);
    assert.equal(result.done, false, `${label} ended before producing an event`);
    return result.value;
  } finally {
    if (timer) clearTimeout(timer);
    subscription.close();
  }
}

export const assetQueries: Readonly<Record<AssetSearchType, string>> = {
  stock: 'apple',
  etf: 'msci world',
  fund: 'fund',
  mutualFund: 'fund',
  privateFund: 'private',
  derivative: 'apple',
  crypto: 'bitcoin',
  bond: 'germany',
  synthetic: 'index',
};

export const assetClasses = Object.keys(assetQueries) as AssetSearchType[];

export async function firstAsset(client: TradeRepublicClient, type: AssetSearchType): Promise<Asset | undefined> {
  return (await client.assets.search(assetQueries[type], { type, limit: 10 }))[0];
}

export async function firstDestination(
  client: TradeRepublicClient,
  instrumentId: string,
): Promise<{ instrumentId: string; exchangeId: string } | undefined> {
  const destination = (await client.trading.orderDestinations(instrumentId))[0];
  return destination?.id ? { instrumentId, exchangeId: destination.id } : undefined;
}

export async function resolveSecuritiesAccountNumber(client: TradeRepublicClient): Promise<string> {
  await client.portfolio.current({ timeoutMs: 20_000 });
  const value = client.securitiesAccountNumber ?? client.getSession()?.securitiesAccountNumber;
  assert.ok(value, 'expected a securities account number');
  return value;
}

export async function callOptionalAccountResource(
  label: string,
  call: () => Promise<unknown>,
  note: (message: string) => void,
): Promise<void> {
  try {
    assert.ok(await call() !== undefined);
  } catch (error) {
    if (error instanceof Error && error.name === 'TradeRepublicProtocolError' && error.message.includes('"errorCode":"NOT_FOUND"')) {
      note(`${label}: valid NOT_FOUND for this account; response schema not observed`);
      return;
    }
    throw error;
  }
}

export function isOpenBerlinWindow(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const text = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? '';
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(text('weekday')) + 1;
  const minutes = Number(text('hour')) * 60 + Number(text('minute'));
  return weekday >= 1 && weekday <= 5 && minutes >= 7 * 60 && minutes < 22 * 60 + 40;
}

export async function selectNvidiaLimitOrderCandidate(
  client: TradeRepublicClient,
): Promise<{ instrumentId: string; destination: OrderDestination } | undefined> {
  for (const destination of await client.trading.orderDestinations(NVIDIA)) {
    if (destination.open !== true || destination.orderModes?.some((mode) => mode.toLowerCase() === 'limit') !== true) continue;
    const quote = await client.market.quote(NVIDIA, destination.id);
    if (quote.bid !== undefined && quote.bid >= 10) return { instrumentId: NVIDIA, destination };
  }
  return undefined;
}

export function hasAnyTimestamp(value: Record<string, unknown>, ...keys: string[]): boolean {
  return keys.some((key) => typeof value[key] === 'string');
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
    async waitFor(predicate: (value: Record<string, unknown>) => boolean, label: string, timeoutMs = 45_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const match = values.find(predicate);
        if (match) return match;
        if (failure) throw failure;
        await new Promise<void>((resolve) => {
          const remaining = Math.max(1, deadline - Date.now());
          let wake: () => void;
          const timer = setTimeout(() => {
            waiters.delete(wake);
            resolve();
          }, remaining);
          timer.unref?.();
          wake = () => {
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
