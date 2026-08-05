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
const publicWorkflows = workflows.filter((workflow) => ['quality.yml', 'unit-tests.yml'].includes(workflow.file));

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

describe('GitHub Actions trust boundaries', () => {
  it('keeps unit tests and package checks as the only public workflows', () => {
    assert.deepEqual(
      publicWorkflows.map((workflow) => workflow.file).sort(),
      ['quality.yml', 'unit-tests.yml'],
    );
  });

  it('runs both checks directly for main, pull requests, and merge candidates', () => {
    for (const workflow of publicWorkflows) {
      assert.match(workflow.source, /^name: (?:Package checks|Unit tests)$/m);
      assert.equal(hasTopLevelTrigger(workflow.source, 'push'), true);
      assert.equal(hasTopLevelTrigger(workflow.source, 'pull_request'), true);
      assert.equal(hasTopLevelTrigger(workflow.source, 'merge_group'), true);
      assert.equal(hasTopLevelTrigger(workflow.source, 'workflow_call'), false);
      assert.equal(hasTopLevelTrigger(workflow.source, 'workflow_dispatch'), true);
      assert.equal(hasTopLevelTrigger(workflow.source, 'pull_request_target'), false);
    }
  });

  it('keeps both checks secret-free and read-only', () => {
    for (const workflow of publicWorkflows) {
      assert.match(workflow.source, /^permissions:\r?\n  contents: read\r?$/m);
      assert.doesNotMatch(workflow.source, /\$\{\{\s*secrets\./);
      assert.doesNotMatch(workflow.source, /^\s+environment:/m);
      assert.doesNotMatch(workflow.source, /\$\{\{\s*github\.token\s*\}\}/);
      assert.match(workflow.source, /^\s+persist-credentials: false\r?$/m);
      assert.doesNotMatch(workflow.source, /pull_request_target/);
      assert.doesNotMatch(workflow.source, /test:ci:|CI_TEST_RESULTS_FILE|continue-on-error/);
    }
  });

  it('runs ordinary package commands', () => {
    const unitTests = workflows.find((workflow) => workflow.file === 'unit-tests.yml');
    const quality = workflows.find((workflow) => workflow.file === 'quality.yml');
    assert.match(unitTests?.source ?? '', /^\s+run: npm test\r?$/m);
    assert.match(quality?.source ?? '', /^\s+run: npm run typecheck\r?$/m);
    assert.match(quality?.source ?? '', /^\s+run: npm run build\r?$/m);
    assert.match(quality?.source ?? '', /^\s+run: git diff --exit-code -- dist\r?$/m);
  });

  it('requires maintainer approval before pull requests enter the merge queue', () => {
    const gate = workflows.find((workflow) => workflow.file === 'merge-gate.yml');
    assert.ok(gate);
    assert.equal(hasTopLevelTrigger(gate.source, 'push'), true);
    assert.equal(hasTopLevelTrigger(gate.source, 'pull_request'), false);
    assert.equal(hasTopLevelTrigger(gate.source, 'pull_request_target'), true);
    assert.equal(hasTopLevelTrigger(gate.source, 'merge_group'), true);
    assert.equal(hasTopLevelTrigger(gate.source, 'workflow_dispatch'), true);
    assert.match(gate.source, /^\s+name: maintainer approval\r?$/m);
    assert.match(gate.source, /^\s+name: Merge Gate\r?$/m);
    assert.match(gate.source, /^\s+deployment: false\r?$/m);
    assert.match(gate.source, /^\s+name: Merge gate \/ merge gate\r?$/m);
    assert.match(gate.source, /github\.event_name == 'merge_group'/);
    assert.match(gate.source, /uses: \.\/\.github\/workflows\/live-integration\.yml/);
    assert.doesNotMatch(gate.source, /\$\{\{\s*secrets\./);
    assert.doesNotMatch(gate.source, /actions\/checkout|npm (?:ci|run|test)/);
    assert.match(gate.source, /^\s+checks: write\r?$/m);
    assert.match(gate.source, /github\.event\.pull_request\.head\.sha/);
    assert.match(gate.source, /check-runs/);
  });

  it('limits live integration tests to merge candidates and maintainer dispatches', () => {
    const live = workflows.find((workflow) => workflow.file === 'live-integration.yml');
    assert.ok(live);
    assert.equal(hasTopLevelTrigger(live.source, 'workflow_call'), true);
    assert.equal(hasTopLevelTrigger(live.source, 'workflow_dispatch'), true);
    assert.equal(hasTopLevelTrigger(live.source, 'pull_request'), false);
    assert.equal(hasTopLevelTrigger(live.source, 'pull_request_review'), false);
    assert.equal(hasTopLevelTrigger(live.source, 'merge_group'), false);
    assert.doesNotMatch(live.source, /pull_request_target/);
    assert.match(live.source, /^\s+environment: Live Integration Tests\r?$/m);
    assert.match(live.source, /^\s+run: npm run test:integration\r?$/m);
    assert.match(live.source, /^\s+run: npm run ci:reauth -- --refresh\r?$/m);
    assert.match(live.source, /secrets\.GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION/);
    assert.match(live.source, /^\s+gh secret set TR_SESSION_JSON \\\r?$/m);
    assert.match(live.source, /^\s+--repo "\$GITHUB_REPOSITORY" \\\r?$/m);
    assert.match(live.source, /^\s+--env "Live Integration Tests" \\\r?$/m);
    assert.match(live.source, /^\s+< "\$RUNNER_TEMP\/tr-session\.json"\r?$/m);
    const refreshIndex = live.source.indexOf('run: npm run ci:reauth -- --refresh');
    const persistIndex = live.source.indexOf('gh secret set TR_SESSION_JSON');
    const testIndex = live.source.indexOf('run: npm run test:integration');
    assert.ok(refreshIndex < persistIndex && persistIndex < testIndex);
    assert.doesNotMatch(live.source, /echo .*TR_SESSION_JSON/);
    assert.doesNotMatch(live.source, /test:integration:manual/);
    assert.match(live.source, /^\s+persist-credentials: false\r?$/m);
  });

  it('refreshes the protected live session without exposing it in output', () => {
    const refresh = workflows.find((workflow) => workflow.file === 'refresh-live-session.yml');
    assert.ok(refresh);
    assert.equal(hasTopLevelTrigger(refresh.source, 'schedule'), true);
    assert.equal(hasTopLevelTrigger(refresh.source, 'workflow_dispatch'), true);
    assert.match(refresh.source, /^\s+environment: Live Integration Tests\r?$/m);
    assert.match(refresh.source, /^\s+run: npm run ci:reauth -- --refresh\r?$/m);
    assert.match(refresh.source, /gh secret set TR_SESSION_JSON\s+\\?\s*--body/);
    assert.match(refresh.source, /--env "Live Integration Tests"/);
    assert.match(refresh.source, /gh secret set GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION/);
    assert.match(refresh.source, /secrets\.GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION/);
    assert.match(refresh.source, /^\s+persist-credentials: false\r?$/m);
    assert.doesNotMatch(refresh.source, /echo .*TR_SESSION_JSON/);
  });
});
