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

describe('GitHub Actions trust boundaries', () => {
  it('keeps only unit tests and package checks', () => {
    assert.deepEqual(
      workflows.map((workflow) => workflow.file).sort(),
      ['quality.yml', 'unit-tests.yml'],
    );
  });

  it('runs both checks directly for main, pull requests, and merge candidates', () => {
    for (const workflow of workflows) {
      assert.match(workflow.source, /^name: (?:Package checks|Unit tests)$/m);
      assert.equal(hasTopLevelTrigger(workflow.source, 'push'), true);
      assert.equal(hasTopLevelTrigger(workflow.source, 'pull_request'), true);
      assert.equal(hasTopLevelTrigger(workflow.source, 'merge_group'), true);
      assert.equal(hasTopLevelTrigger(workflow.source, 'workflow_call'), false);
      assert.equal(hasTopLevelTrigger(workflow.source, 'workflow_dispatch'), false);
      assert.equal(hasTopLevelTrigger(workflow.source, 'pull_request_target'), false);
    }
  });

  it('keeps both checks secret-free and read-only', () => {
    for (const workflow of workflows) {
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
});
