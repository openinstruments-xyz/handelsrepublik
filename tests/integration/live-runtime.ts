import assert from 'node:assert/strict';
import { appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  FileSessionStore,
  TradeRepublicClient,
  type Asset,
  type AssetSearchType,
  type Subscription,
} from '../../src/index.js';

export type LiveSuite = 'read' | 'closed-venue' | 'open-venue' | 'mutations';

export interface LiveCaseContext {
  client: TradeRepublicClient;
  note(message: string): Promise<void>;
}

export interface LiveCase {
  id: string;
  suite: LiveSuite;
  timeoutMs: number;
  run(context: LiveCaseContext): Promise<void>;
}

const sessionPath = process.env.TR_SESSION_FILE ?? join(process.cwd(), 'demo', '.demo-session.json');

export async function runLiveCase(testCase: LiveCase): Promise<void> {
  if (!existsSync(sessionPath)) {
    throw new Error(`Missing live session ${sessionPath}. Re-authenticate or set TR_SESSION_FILE.`);
  }
  const client = TradeRepublicClient.create({
    sessionStore: new FileSessionStore(sessionPath),
    rawSchemaValidation: 'throw',
  });
  const session = await client.auth.restoreSession();
  if (!session) throw new Error(`No Trade Republic session could be restored from ${sessionPath}.`);
  await client.auth.refreshSession();
  const notes: string[] = [];
  const note = async (message: string): Promise<void> => {
    notes.push(message);
    console.log(`[live-case] ${testCase.id}: ${message}`);
  };
  try {
    await withTimeout(testCase.run({ client, note }), testCase.timeoutMs, testCase.id);
    await writeStepSummary(testCase, 'passed', notes);
  } catch (error) {
    await writeStepSummary(testCase, 'failed', notes);
    throw error;
  } finally {
    client.close();
  }
}

export function defineLiveCase(
  id: string,
  suite: LiveSuite,
  run: LiveCase['run'],
  timeoutMs = 45_000,
): LiveCase {
  return { id, suite, timeoutMs, run };
}

export function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
}

export function assertArray(value: unknown, label: string): asserts value is unknown[] {
  assert.ok(Array.isArray(value), `${label} must be an array`);
}

export async function nextStreamValue<T>(
  subscription: Subscription<T>,
  label: string,
  timeoutMs = 20_000,
): Promise<T> {
  const iterator = subscription[Symbol.asyncIterator]();
  try {
    const result = await withTimeout(iterator.next(), timeoutMs, label);
    assert.equal(result.done, false, `${label} ended before producing an event`);
    return result.value;
  } finally {
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function writeStepSummary(testCase: LiveCase, status: 'passed' | 'failed', notes: string[]): Promise<void> {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  const lines = [
    `### ${testCase.id}: ${status}`,
    '',
    ...(notes.length ? notes.map((note) => `- ${note}`) : ['- Exact raw and normalized response validation completed.']),
    '',
  ];
  await appendFile(path, `${lines.join('\n')}\n`, 'utf8');
}
