import { spawn } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  readCiResults,
  resultsPath,
  type CiTestResult,
} from './ci-test-report.js';
import { liveCases } from '../tests/integration/live-cases.js';
import type { LiveSuite } from '../tests/integration/live-runtime.js';

export interface ConsolidatedLiveBlock {
  id: string;
  script: string;
  suite: LiveSuite;
  openMarketOnly?: boolean;
}

export const consolidatedLiveBlocks: readonly ConsolidatedLiveBlock[] = [
  { id: 'reads', script: 'test:integration:read', suite: 'read' },
  { id: 'mutations', script: 'test:integration:mutations', suite: 'mutations' },
  {
    id: 'open-market',
    script: 'test:integration:open-venue',
    suite: 'open-venue',
    openMarketOnly: true,
  },
];

export function isOpenMarketWindow(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes): string | undefined =>
    parts.find((part) => part.type === type)?.value;
  const weekday = value('weekday');
  const hour = Number(value('hour'));
  const minute = Number(value('minute'));
  const weekdayNumber = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday ?? '') + 1;
  const minutes = hour * 60 + minute;
  return weekdayNumber >= 1 && weekdayNumber <= 5 && minutes >= 420 && minutes < 1360;
}

async function runBlock(
  block: ConsolidatedLiveBlock,
  resultFile: string,
): Promise<{ block: ConsolidatedLiveBlock; exitCode: number; results: CiTestResult[] }> {
  await rm(resultFile, { force: true });
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(executable, ['run', block.script], {
    env: {
      ...process.env,
      CI_TEST_RESULTS_FILE: resultFile,
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  const exitCode = await new Promise<number>((resolveExit) => {
    child.once('error', (error) => {
      console.error(`[ci-live-validation] ${block.id} could not start:`, error);
      resolveExit(1);
    });
    child.once('close', (code, signal) => {
      if (signal) {
        console.error(`[ci-live-validation] ${block.id} terminated by ${signal}.`);
        resolveExit(1);
      } else {
        resolveExit(code ?? 1);
      }
    });
  });
  return { block, exitCode, results: await readCiResults(resultFile) };
}

function skippedResults(block: ConsolidatedLiveBlock): CiTestResult[] {
  return liveCases
    .filter((testCase) => testCase.suite === block.suite)
    .map((testCase) => ({
      id: testCase.id,
      name: testCase.id,
      status: 'skipped',
      durationMs: 0,
      note: 'Outside weekdays 07:00–22:40 Europe/Berlin.',
    }));
}

function ensureFailureResult(
  block: ConsolidatedLiveBlock,
  exitCode: number,
  results: CiTestResult[],
): CiTestResult[] {
  if (exitCode === 0 || results.some((result) => result.status === 'failed')) return results;
  return [
    ...results,
    {
      id: `block.${block.id}`,
      name: `${block.id} live block`,
      status: 'failed',
      durationMs: 0,
      note: 'The live block exited before recording a failing case. See its process log.',
    },
  ];
}

export async function runConsolidatedLiveValidation(now = new Date()): Promise<number> {
  const primaryResultFile = resultsPath();
  const openMarket = isOpenMarketWindow(now);
  const runnableBlocks = consolidatedLiveBlocks.filter((block) => !block.openMarketOnly || openMarket);
  const skippedBlocks = consolidatedLiveBlocks.filter((block) => block.openMarketOnly && !openMarket);
  const blockFiles = new Map(
    runnableBlocks.map((block) => [block.id, `${primaryResultFile}.${block.id}.ndjson`]),
  );

  console.log(
    `[ci-live-validation] Running ${runnableBlocks.map((block) => block.id).join(', ')} concurrently.`,
  );
  if (skippedBlocks.length > 0) {
    console.log('[ci-live-validation] Open-market coverage is outside its Berlin time gate.');
  }

  const completed = await Promise.all(
    runnableBlocks.map((block) => runBlock(block, blockFiles.get(block.id)!)),
  );
  const results = [
    ...completed.flatMap(({ block, exitCode, results }) =>
      ensureFailureResult(block, exitCode, results)),
    ...skippedBlocks.flatMap(skippedResults),
  ];
  await writeFile(
    primaryResultFile,
    results.map((result) => JSON.stringify(result)).join('\n') + (results.length > 0 ? '\n' : ''),
    'utf8',
  );
  await Promise.all([...blockFiles.values()].map((file) => rm(file, { force: true })));
  return completed.every(({ exitCode }) => exitCode === 0) ? 0 : 1;
}

const entryPoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entryPoint === import.meta.url) {
  process.exitCode = await runConsolidatedLiveValidation();
}
