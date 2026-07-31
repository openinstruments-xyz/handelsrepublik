import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readCiResults, type CiTestResult } from './ci-test-report.js';

export interface CiBadgeResultPayload {
  schemaVersion: 1;
  workflow: string;
  runId: number;
  runAttempt: number;
  runUrl: string;
  event: string;
  sha: string;
  createdAt: string;
  conclusion: 'success' | 'failure';
  results: CiTestResult[];
}

export function buildCiBadgeResultPayload(
  results: CiTestResult[],
  environment: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): CiBadgeResultPayload {
  const workflow = requiredEnvironment(environment, 'CI_BADGE_WORKFLOW');
  const runId = positiveInteger(requiredEnvironment(environment, 'GITHUB_RUN_ID'), 'GITHUB_RUN_ID');
  const runAttempt = positiveInteger(environment.GITHUB_RUN_ATTEMPT ?? '1', 'GITHUB_RUN_ATTEMPT');
  const serverUrl = requiredEnvironment(environment, 'GITHUB_SERVER_URL');
  const repository = requiredEnvironment(environment, 'GITHUB_REPOSITORY');

  return {
    schemaVersion: 1,
    workflow,
    runId,
    runAttempt,
    runUrl: `${serverUrl}/${repository}/actions/runs/${runId}`,
    event: requiredEnvironment(environment, 'GITHUB_EVENT_NAME'),
    sha: requiredEnvironment(environment, 'GITHUB_SHA'),
    createdAt: now.toISOString(),
    conclusion: results.length > 0 && results.every((result) => result.status !== 'failed')
      ? 'success'
      : 'failure',
    results,
  };
}

export async function publishCiBadgeResults(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const endpoint = requiredEnvironment(environment, 'CI_BADGE_RESULTS_URL');
  const token = requiredEnvironment(environment, 'CI_BADGE_INGEST_TOKEN');
  const payload = buildCiBadgeResultPayload(await readCiResults(), environment);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  assert.ok(response.ok, `CI badge Worker returned HTTP ${response.status}.`);
  console.log(`Published ${payload.results.length} structured CI results for run ${payload.runId}.`);
}

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  assert.ok(value, `${name} is required.`);
  return value;
}

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  assert.ok(Number.isSafeInteger(parsed) && parsed > 0, `${name} must be a positive integer.`);
  return parsed;
}

const entryPoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entryPoint === import.meta.url) {
  await publishCiBadgeResults();
}
