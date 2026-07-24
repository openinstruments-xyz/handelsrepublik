import { spawn } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type CiTestStatus = 'passed' | 'failed' | 'skipped';

export interface CiTestResult {
  id: string;
  name: string;
  status: CiTestStatus;
  durationMs: number;
  note: string;
}

const defaultResultsPath = join(tmpdir(), 'handelsrepublik-ci-test-results.ndjson');
let appendQueue: Promise<void> = Promise.resolve();

export function resultsPath(environment: NodeJS.ProcessEnv = process.env): string {
  return environment.CI_TEST_RESULTS_FILE || defaultResultsPath;
}

export function parseNodeTestSummary(output: string): string | undefined {
  const normalized = stripAnsi(output);
  const values = new Map<string, string>();
  for (const key of ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped']) {
    const match = normalized.match(new RegExp(`(?:^|\\n)\\s*(?:ℹ|#)?\\s*${key}\\s+(\\d+)\\s*(?:\\n|$)`, 'i'));
    if (match?.[1]) values.set(key, match[1]);
  }
  if (!values.has('tests')) return undefined;
  return [
    `${values.get('tests')} tests`,
    values.has('pass') ? `${values.get('pass')} passed` : undefined,
    values.has('fail') ? `${values.get('fail')} failed` : undefined,
    values.has('skipped') ? `${values.get('skipped')} skipped` : undefined,
  ].filter((value): value is string => Boolean(value)).join(' · ');
}

export function renderCiSummary(title: string, results: readonly CiTestResult[]): string {
  const counts = {
    passed: results.filter((result) => result.status === 'passed').length,
    failed: results.filter((result) => result.status === 'failed').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
  };
  const lines = [
    `## ${escapeMarkdown(title)}`,
    '',
    `**${counts.passed} passed · ${counts.failed} failed · ${counts.skipped} skipped**`,
    '',
    '| Test | Result | Duration | Notes |',
    '|---|:---:|---:|---|',
  ];
  if (results.length === 0) {
    lines.push('| No test results recorded | ❌ Failed | — | The test setup stopped before a result was recorded. |');
  } else {
    for (const result of results) {
      lines.push([
        `| ${escapeTableCell(result.name)}`,
        statusLabel(result.status),
        formatDuration(result.durationMs),
        `${escapeTableCell(result.note)} |`,
      ].join(' | '));
    }
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export async function readCiResults(path = resultsPath()): Promise<CiTestResult[]> {
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return source
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => validateResult(JSON.parse(line) as unknown));
}

export async function appendCiResult(result: CiTestResult, path = resultsPath()): Promise<void> {
  const append = appendQueue.then(async () => {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(result)}\n`, 'utf8');
  });
  appendQueue = append.catch(() => undefined);
  await append;
}

export async function writeCiSummary(
  title: string,
  results: readonly CiTestResult[],
  summaryPath = process.env.GITHUB_STEP_SUMMARY,
): Promise<void> {
  const markdown = renderCiSummary(title, results);
  if (summaryPath) {
    await writeFile(summaryPath, markdown, 'utf8');
  } else {
    process.stdout.write(markdown);
  }
}

async function runRecordedCommand(args: string[]): Promise<number> {
  const separator = args.indexOf('--');
  const id = args[0]?.trim();
  const name = args[1]?.trim();
  const commandIndex = separator >= 0 ? separator + 1 : 2;
  const command = args[commandIndex]?.trim();
  const commandArgs = args.slice(commandIndex + 1);
  if (!id || !name || !command) {
    console.error('Usage: ci-test-report.ts run <id> <name> -- <command> [...args]');
    return 2;
  }

  const startedAt = performance.now();
  let output = '';
  const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
  const child = spawn(executable, commandArgs, {
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(text);
  });
  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    output += text;
    process.stderr.write(text);
  });

  const exitCode = await new Promise<number>((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (signal) {
        console.error(`[ci-test-report] ${name} terminated by ${signal}`);
        resolveExit(1);
      } else {
        resolveExit(code ?? 1);
      }
    });
  }).catch((error: unknown) => {
    console.error(`[ci-test-report] Could not run ${command}:`, error);
    return 1;
  });

  const note = buildSafeNote(id, output, exitCode);
  await appendCiResult({
    id,
    name,
    status: exitCode === 0 ? 'passed' : 'failed',
    durationMs: Math.round(performance.now() - startedAt),
    note,
  });
  return exitCode;
}

function buildSafeNote(id: string, output: string, exitCode: number): string {
  const notes = stripAnsi(output)
    .split(/\r?\n/)
    .map((line) => line.match(new RegExp(`^\\[live-case\\]\\s+${escapeRegex(id)}:\\s+(.+)$`))?.[1]?.trim())
    .filter((note): note is string => Boolean(note));
  if (notes.length > 0) return notes.join('; ');
  const testSummary = parseNodeTestSummary(output);
  if (testSummary) return testSummary;
  return exitCode === 0
    ? 'Completed without reported diagnostics.'
    : 'See the corresponding workflow step log for diagnostics.';
}

function validateResult(value: unknown): CiTestResult {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid CI test result record.');
  const result = value as Partial<CiTestResult>;
  if (
    typeof result.id !== 'string'
    || typeof result.name !== 'string'
    || !['passed', 'failed', 'skipped'].includes(result.status ?? '')
    || typeof result.durationMs !== 'number'
    || typeof result.note !== 'string'
  ) {
    throw new TypeError('Invalid CI test result fields.');
  }
  return result as CiTestResult;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${Math.max(0, Math.round(durationMs))} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(1)} s`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1_000);
  return `${minutes}m ${seconds}s`;
}

function statusLabel(status: CiTestStatus): string {
  if (status === 'passed') return '✅ Passed';
  if (status === 'skipped') return '⏭️ Skipped';
  return '❌ Failed';
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function escapeTableCell(value: string): string {
  return escapeMarkdown(value).replace(/\|/g, '\\|');
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main(): Promise<number> {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'run') return runRecordedCommand(args);
  if (command === 'summary') {
    const title = args.join(' ').trim() || 'Test results';
    const results = await readCiResults();
    await writeCiSummary(title, results);
    return results.length > 0 && results.every((result) => result.status !== 'failed') ? 0 : 1;
  }
  console.error('Usage: ci-test-report.ts <run|summary> [...args]');
  return 2;
}

const entryPoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entryPoint === import.meta.url) {
  process.exitCode = await main();
}
