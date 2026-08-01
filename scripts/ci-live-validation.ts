import { spawn } from 'node:child_process';
import { appendFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  readCiResults,
  resultsPath,
  type CiTestResult,
  type CiTestStatus,
} from './ci-test-report.js';
import {
  liveSuiteDefinitions,
  automaticLiveSuiteIds,
  type LiveSuiteDefinition,
  type LiveSuiteId,
} from './live-suites/index.js';
import { liveCases } from '../tests/integration/live-cases.js';

export type LiveSuiteSelection = 'all' | 'automatic' | LiveSuiteId;

export interface LiveSuiteReport {
  id: LiveSuiteId;
  name: string;
  status: CiTestStatus;
  note: string;
}

export interface LiveValidationReport {
  selection: LiveSuiteSelection;
  suites: LiveSuiteReport[];
  results: CiTestResult[];
}

export interface LiveSuiteExecution {
  exitCode: number;
  results: CiTestResult[];
}

export type LiveSuiteAdapter = (
  suite: LiveSuiteDefinition,
  resultFile: string,
) => Promise<LiveSuiteExecution>;

export interface RunLiveValidationOptions {
  selection?: string;
  now?: Date;
  allowOrderRequests?: boolean;
  resultFile?: string;
  reportFile?: string;
  githubOutputFile?: string;
}

export function isOpenMarketWindow(now = new Date()): boolean {
  const { weekday, minutes } = berlinClock(now);
  return weekday >= 1 && weekday <= 5 && minutes >= 420 && minutes < 1360;
}

export function isClosedMarketWindow(now = new Date()): boolean {
  const { minutes } = berlinClock(now);
  return minutes >= 1380 || minutes < 400;
}

export function isWeekdayClosedMarketWindow(now = new Date()): boolean {
  const { weekday } = berlinClock(now);
  return weekday <= 5 && isClosedMarketWindow(now);
}

export function isWeekendWindow(now = new Date()): boolean {
  return berlinClock(now).weekday >= 6;
}

export function selectLiveSuites(selection = 'all'): LiveSuiteDefinition[] {
  if (selection === 'all') return [...liveSuiteDefinitions];
  if (selection === 'automatic') {
    return liveSuiteDefinitions.filter((suite) => automaticLiveSuiteIds.includes(suite.id));
  }
  const suite = liveSuiteDefinitions.find((candidate) => candidate.id === selection);
  if (!suite) {
    throw new Error(
      `Unknown live suite ${selection}. Available: all, ${liveSuiteDefinitions.map((item) => item.id).join(', ')}`,
    );
  }
  return [suite];
}

export function resultIdsForSuite(suite: LiveSuiteDefinition): string[] {
  const source = suite.resultSource;
  if (source.kind === 'recorded-command') return [source.id];
  return liveCases
    .filter((testCase) => testCase.suite === source.suite)
    .map((testCase) => testCase.id);
}

export async function runLiveValidation(
  options: RunLiveValidationOptions = {},
  adapter: LiveSuiteAdapter = executeLiveSuite,
): Promise<LiveValidationReport> {
  const selection = (options.selection ?? 'all') as LiveSuiteSelection;
  const selected = selectLiveSuites(selection);
  const now = options.now ?? new Date();
  const resultFile = options.resultFile ?? resultsPath();
  const suiteReports: LiveSuiteReport[] = [];
  const allResults: CiTestResult[] = [];

  await rm(resultFile, { force: true });
  for (const suite of selected) {
    const gate = suiteGate(suite, now, options.allowOrderRequests ?? false);
    if (!gate.eligible) {
      const skipped = skippedResults(suite, gate.note);
      allResults.push(...skipped);
      suiteReports.push({ id: suite.id, name: suite.name, status: 'skipped', note: gate.note });
      console.log(`[ci-live-validation] Skipping ${suite.id}: ${gate.note}`);
      continue;
    }

    const suiteResultFile = `${resultFile}.${suite.id}.ndjson`;
    console.log(`[ci-live-validation] Running ${suite.id}.`);
    let execution: LiveSuiteExecution;
    try {
      execution = await adapter(suite, suiteResultFile);
    } catch (error) {
      console.error(`[ci-live-validation] ${suite.id} could not complete:`, error);
      execution = { exitCode: 1, results: [] };
    }
    const results = ensureFailureResult(suite, execution.exitCode, execution.results);
    allResults.push(...results);
    const status = results.some((result) => result.status === 'failed') ? 'failed' : 'passed';
    suiteReports.push({
      id: suite.id,
      name: suite.name,
      status,
      note: status === 'passed' ? 'All selected checks passed.' : 'One or more selected checks failed.',
    });
    await rm(suiteResultFile, { force: true });
  }

  await writeFile(
    resultFile,
    allResults.map((result) => JSON.stringify(result)).join('\n') + (allResults.length > 0 ? '\n' : ''),
    'utf8',
  );
  const report: LiveValidationReport = { selection, suites: suiteReports, results: allResults };
  if (options.reportFile) {
    await writeFile(options.reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  if (options.githubOutputFile) {
    await appendFile(
      options.githubOutputFile,
      [
        `suites=${JSON.stringify(suiteReports.map(({ id, name }) => ({ id, name })))}`,
        ...suiteReports.map(({ id, status }) => `status_${id.replaceAll('-', '_')}=${status}`),
      ].join('\n') + '\n',
      'utf8',
    );
  }
  return report;
}

async function executeLiveSuite(
  suite: LiveSuiteDefinition,
  resultFile: string,
): Promise<LiveSuiteExecution> {
  await rm(resultFile, { force: true });
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(executable, suite.npmArgs, {
    env: { ...process.env, CI_TEST_RESULTS_FILE: resultFile },
    stdio: 'inherit',
    windowsHide: true,
  });
  const exitCode = await new Promise<number>((resolveExit) => {
    child.once('error', (error) => {
      console.error(`[ci-live-validation] ${suite.id} could not start:`, error);
      resolveExit(1);
    });
    child.once('close', (code, signal) => {
      if (signal) {
        console.error(`[ci-live-validation] ${suite.id} terminated by ${signal}.`);
        resolveExit(1);
      } else {
        resolveExit(code ?? 1);
      }
    });
  });
  return { exitCode, results: await readCiResults(resultFile) };
}

function suiteGate(
  suite: LiveSuiteDefinition,
  now: Date,
  allowOrderRequests: boolean,
): { eligible: boolean; note: string } {
  if (suite.requiresOrderConfirmation && !allowOrderRequests) {
    return { eligible: false, note: 'Manual order-request confirmation was not provided.' };
  }
  if (suite.timeWindow === 'open-market' && !isOpenMarketWindow(now)) {
    return { eligible: false, note: 'Outside weekdays 07:00–22:40 Europe/Berlin.' };
  }
  if (suite.timeWindow === 'closed-market' && !isClosedMarketWindow(now)) {
    return { eligible: false, note: 'Outside 23:00–06:40 Europe/Berlin.' };
  }
  if (suite.timeWindow === 'weekday-closed-market' && !isWeekdayClosedMarketWindow(now)) {
    return { eligible: false, note: 'Outside weekdays 23:00–06:40 Europe/Berlin.' };
  }
  if (suite.timeWindow === 'weekend' && !isWeekendWindow(now)) {
    return { eligible: false, note: 'Outside Saturday and Sunday in Europe/Berlin.' };
  }
  return { eligible: true, note: 'Eligible for this run.' };
}

function skippedResults(suite: LiveSuiteDefinition, note: string): CiTestResult[] {
  const names = suite.resultSource.kind === 'recorded-command'
    ? new Map([[suite.resultSource.id, suite.resultSource.name]])
    : new Map<string, string>();
  return resultIdsForSuite(suite).map((id) => ({
    id,
    name: names.get(id) ?? id,
    status: 'skipped',
    durationMs: 0,
    note,
  }));
}

function ensureFailureResult(
  suite: LiveSuiteDefinition,
  exitCode: number,
  results: CiTestResult[],
): CiTestResult[] {
  if (results.some((result) => result.status === 'failed')) return results;
  if (exitCode === 0 && results.length > 0) return results;
  return [
    ...results,
    {
      id: `suite.${suite.id}`,
      name: suite.name,
      status: 'failed',
      durationMs: 0,
      note: 'The suite exited before recording a failing case. See the executor log.',
    },
  ];
}

function berlinClock(now: Date): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes): string | undefined =>
    parts.find((part) => part.type === type)?.value;
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(value('weekday') ?? '') + 1;
  return { weekday, minutes: Number(value('hour')) * 60 + Number(value('minute')) };
}

const entryPoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entryPoint === import.meta.url) {
  const report = await runLiveValidation({
    selection: process.env.CI_LIVE_SUITE ?? process.argv[2] ?? 'all',
    allowOrderRequests: process.env.CI_LIVE_ALLOW_ORDER_REQUESTS === 'true',
    ...(process.env.CI_LIVE_SUITE_REPORT_FILE
      ? { reportFile: process.env.CI_LIVE_SUITE_REPORT_FILE }
      : {}),
    ...(process.env.GITHUB_OUTPUT ? { githubOutputFile: process.env.GITHUB_OUTPUT } : {}),
  });
  process.exitCode = report.suites.some((suite) => suite.status === 'failed') ? 1 : 0;
}
