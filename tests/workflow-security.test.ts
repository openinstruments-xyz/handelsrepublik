import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const workflowDirectory = join(process.cwd(), '.github', 'workflows');
const workflows = readdirSync(workflowDirectory)
  .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
  .map((file) => ({
    file,
    source: readFileSync(join(workflowDirectory, file), 'utf8'),
  }));
function hasTopLevelTrigger(source: string, trigger: string): boolean {
  const lines = source.split(/\r?\n/);
  const onLine = lines.findIndex((line) => line === 'on:');
  if (onLine < 0) return false;

  for (const line of lines.slice(onLine + 1)) {
    if (line !== '' && !line.startsWith(' ') && !line.startsWith('#')) break;
    if (line.startsWith(`  ${trigger}:`)) return true;
  }
  return false;
}

function getJob(source: string, job: string): string {
  const match = source.match(new RegExp(`^  ${job}:\\r?\\n([\\s\\S]*?)(?=^  [a-z][a-z-]+:|(?![\\s\\S]))`, 'm'));
  return match?.[0] ?? '';
}

describe('GitHub Actions trust boundaries', () => {
  const pullRequest = workflows.find((workflow) => workflow.file === 'pull-request.yml');

  it('uses one pull-request workflow and removes the superseded gate workflows', () => {
    assert.ok(pullRequest);
    assert.equal(hasTopLevelTrigger(pullRequest.source, 'pull_request'), true);
    assert.equal(hasTopLevelTrigger(pullRequest.source, 'workflow_dispatch'), true);
    assert.equal(hasTopLevelTrigger(pullRequest.source, 'push'), false);
    assert.equal(hasTopLevelTrigger(pullRequest.source, 'merge_group'), false);
    assert.equal(hasTopLevelTrigger(pullRequest.source, 'pull_request_target'), false);
    for (const file of [
      'quality.yml',
      'unit-tests.yml',
      'live-integration.yml',
      'merge-queue.yml',
      'merge-queue-readiness.yml',
    ]) {
      assert.equal(workflows.some((workflow) => workflow.file === file), false);
    }
  });

  it('runs quality and unit tests without secrets or an environment', () => {
    assert.ok(pullRequest);
    assert.match(pullRequest.source, /^permissions:\r?\n  contents: read\r?$/m);
    assert.doesNotMatch(pullRequest.source, /pull_request_target/);
    for (const [jobName, expectedName] of [
      ['quality', 'Quality'],
      ['unit-tests', 'Unit Tests'],
    ] as const) {
      const job = getJob(pullRequest.source, jobName);
      assert.match(job, new RegExp(`^    name: ${expectedName}\\r?$`, 'm'));
      assert.doesNotMatch(job, /\$\{\{\s*secrets\./);
      assert.doesNotMatch(job, /^\s+environment:/m);
      assert.match(job, /^\s+persist-credentials: false\r?$/m);
    }
    assert.match(getJob(pullRequest.source, 'quality'), /^\s+- run: npm run typecheck\r?$/m);
    assert.match(getJob(pullRequest.source, 'quality'), /^\s+- run: npm run build\r?$/m);
    assert.match(getJob(pullRequest.source, 'quality'), /^\s+run: git diff --exit-code -- dist\r?$/m);
    assert.match(getJob(pullRequest.source, 'unit-tests'), /^\s+- run: npm test\r?$/m);
  });

  it('gates live access behind both checks and the protected environment', () => {
    assert.ok(pullRequest);
    const live = getJob(pullRequest.source, 'live-integration');
    assert.match(live, /^    name: Live Integration\r?$/m);
    assert.match(live, /^    needs: \[quality, unit-tests\]\r?$/m);
    assert.match(live, /^    environment: Live Integration Tests\r?$/m);
    assert.match(live, /secrets\.TR_SESSION_JSON/);
    assert.match(live, /secrets\.GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION/);
    assert.match(live, /^\s+run: npm run ci:reauth -- --refresh\r?$/m);
    assert.match(live, /^\s+run: npm run test:integration\r?$/m);
    assert.match(live, /^\s+gh secret set TR_SESSION_JSON \\\r?$/m);
    assert.doesNotMatch(live, /echo .*TR_SESSION_JSON/);
    assert.doesNotMatch(live, /test:integration:manual/);
  });

  it('keeps protected environment access limited to live testing and session refresh', () => {
    assert.deepEqual(
      workflows.filter((workflow) => /^\s+environment: Live Integration Tests\r?$/m.test(workflow.source))
        .map((workflow) => workflow.file)
        .sort(),
      ['pull-request.yml', 'refresh-live-session.yml'],
    );
  });

  it('retains the separate protected session refresh automation', () => {
    const refresh = workflows.find((workflow) => workflow.file === 'refresh-live-session.yml');
    assert.ok(refresh);
    assert.equal(hasTopLevelTrigger(refresh.source, 'schedule'), true);
    assert.equal(hasTopLevelTrigger(refresh.source, 'workflow_dispatch'), true);
    assert.match(refresh.source, /^\s+environment: Live Integration Tests\r?$/m);
    assert.match(refresh.source, /^\s+run: npm run ci:reauth -- --refresh\r?$/m);
    assert.match(refresh.source, /secrets\.TR_SESSION_JSON/);
    assert.match(refresh.source, /secrets\.GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION/);
    assert.doesNotMatch(refresh.source, /echo .*TR_SESSION_JSON/);
  });
});
