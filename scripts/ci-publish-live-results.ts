import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildCiBadgeResultPayload,
  type CiBadgeResultPayload,
} from './ci-publish-results.js';
import { readCiResults, type CiTestResult } from './ci-test-report.js';
import { resultIdsForSuite, type LiveSuiteReport } from './ci-live-validation.js';
import { liveSuiteDefinitions } from './live-suites/index.js';

export interface LiveBadgePublication {
  alias: string;
  payload: CiBadgeResultPayload;
}

interface StoredLiveValidationReport {
  suites: LiveSuiteReport[];
}

export function buildLiveBadgePublications(
  results: CiTestResult[],
  report: StoredLiveValidationReport,
  environment: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): LiveBadgePublication[] {
  const selected = new Map(report.suites.map((suite) => [suite.id, suite]));
  const aliases = [...new Set(liveSuiteDefinitions.map((suite) => suite.badgeAlias))];
  const publications: LiveBadgePublication[] = [];

  for (const alias of aliases) {
    const definitions = liveSuiteDefinitions.filter((suite) => suite.badgeAlias === alias);
    const suiteReports = definitions.map((suite) => selected.get(suite.id));
    if (suiteReports.some((suite) => !suite)) continue;
    if (suiteReports.every((suite) => suite?.status === 'skipped')) continue;

    const resultIds = new Set(definitions.flatMap(resultIdsForSuite));
    const suiteIds = new Set(definitions.map((suite) => `suite.${suite.id}`));
    const relevantResults = results.filter((result) => resultIds.has(result.id) || suiteIds.has(result.id));
    if (relevantResults.length === 0) continue;

    publications.push({
      alias,
      payload: buildCiBadgeResultPayload(
        relevantResults,
        { ...environment, CI_BADGE_WORKFLOW: alias },
        now,
      ),
    });
  }
  return publications;
}

export async function publishLiveBadgeResults(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const reportPath = requiredEnvironment(environment, 'CI_LIVE_SUITE_REPORT_FILE');
  const baseUrl = requiredEnvironment(environment, 'CI_BADGE_RESULTS_BASE_URL').replace(/\/$/, '');
  const token = requiredEnvironment(environment, 'CI_BADGE_INGEST_TOKEN');
  const report = JSON.parse(await readFile(reportPath, 'utf8')) as StoredLiveValidationReport;
  assert.ok(Array.isArray(report.suites), 'The live-suite report must contain suites.');
  const publications = buildLiveBadgePublications(await readCiResults(), report, environment);

  for (const publication of publications) {
    const response = await fetch(`${baseUrl}/results/${publication.alias}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(publication.payload),
    });
    assert.ok(response.ok, `CI badge Worker returned HTTP ${response.status} for ${publication.alias}.`);
    console.log(
      `Published ${publication.payload.results.length} structured CI results for ${publication.alias}.`,
    );
  }
}

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  assert.ok(value, `${name} is required.`);
  return value;
}

const entryPoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entryPoint === import.meta.url) {
  await publishLiveBadgeResults();
}
