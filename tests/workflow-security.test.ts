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

  it('limits live integration tests to approved same-repository pull requests', () => {
    const live = workflows.find((workflow) => workflow.file === 'live-integration.yml');
    assert.ok(live);
    assert.equal(hasTopLevelTrigger(live.source, 'pull_request_review'), true);
    assert.doesNotMatch(live.source, /pull_request_target/);
    assert.match(live.source, /github\.event\.review\.state == 'approved'/);
    assert.match(live.source, /github\.event\.review\.author_association/);
    assert.match(live.source, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
    assert.match(live.source, /^\s+environment: Live Integration Tests\r?$/m);
    assert.match(live.source, /^\s+run: npm run test:integration\r?$/m);
    assert.doesNotMatch(live.source, /test:integration:manual/);
    assert.match(live.source, /^\s+persist-credentials: false\r?$/m);
  });

  it('refreshes the protected live session without exposing it in output', () => {
    const refresh = workflows.find((workflow) => workflow.file === 'refresh-live-session.yml');
    assert.ok(refresh);
    assert.equal(hasTopLevelTrigger(refresh.source, 'schedule'), true);
    assert.equal(hasTopLevelTrigger(refresh.source, 'workflow_dispatch'), true);
    assert.match(refresh.source, /^\s+environment: Live Integration Tests\r?$/m);
    assert.match(refresh.source, /^\s+run: npm run ci:reauth\r?$/m);
    assert.match(refresh.source, /gh secret set TR_SESSION_JSON --body/);
    assert.match(refresh.source, /secrets\.GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION/);
    assert.match(refresh.source, /^\s+persist-credentials: false\r?$/m);
    assert.doesNotMatch(refresh.source, /echo .*TR_SESSION_JSON/);
  });
});
