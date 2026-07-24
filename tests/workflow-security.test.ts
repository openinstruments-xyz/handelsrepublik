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
  it('never uses pull_request_target', () => {
    for (const workflow of workflows) {
      assert.equal(
        hasTopLevelTrigger(workflow.source, 'pull_request_target'),
        false,
        `${workflow.file} must not run pull-request code in a privileged base-repository context`,
      );
    }
  });

  it('keeps every pull-request workflow secret-free and read-only', () => {
    const pullRequestWorkflows = workflows.filter((workflow) =>
      hasTopLevelTrigger(workflow.source, 'pull_request'));

    assert.deepEqual(
      pullRequestWorkflows.map((workflow) => workflow.file).sort(),
      ['quality.yml', 'unit-tests.yml'],
    );

    for (const workflow of pullRequestWorkflows) {
      assert.match(workflow.source, /^name: PR-safe /m);
      assert.match(workflow.source, /^permissions:\r?\n  contents: read\r?$/m);
      assert.doesNotMatch(workflow.source, /\$\{\{\s*secrets\./);
      assert.match(
        workflow.source,
        /^\s+environment:\r?\n\s+name: Unit Tests\r?\n\s+deployment: false\r?$/m,
      );
      assert.doesNotMatch(workflow.source, /\$\{\{\s*github\.token\s*\}\}/);
      assert.match(workflow.source, /^\s+persist-credentials: false\r?$/m);
      assert.match(
        workflow.source,
        /^  push:\r?\n    branches:\r?\n      - main\r?$/m,
      );
      assert.doesNotMatch(
        workflow.source,
        /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/,
      );
    }
  });

  it('keeps market-order workflows manual and in the shared live environment', () => {
    const marketOrderWorkflows = [
      'execute-market-buy-on-live-account.yml',
      'validate-closed-venue-market-order-rejection.yml',
    ].map((file) => {
      const workflow = workflows.find((candidate) => candidate.file === file);
      assert.ok(workflow, `${file} must exist`);
      return workflow;
    });

    for (const workflow of marketOrderWorkflows) {
      assert.equal(hasTopLevelTrigger(workflow.source, 'workflow_dispatch'), true);
      for (const trigger of ['push', 'schedule', 'pull_request', 'pull_request_target']) {
        assert.equal(
          hasTopLevelTrigger(workflow.source, trigger),
          false,
          `${workflow.file} must only be started explicitly`,
        );
      }
      assert.match(workflow.source, /^permissions:\r?\n  contents: read\r?$/m);
      assert.match(workflow.source, /^\s+environment: Live Integration Tests\r?$/m);
      assert.doesNotMatch(workflow.source, /live-order-tests/);
      assert.match(workflow.source, /github\.actor == 'VIEWVIEWVIEW'/);
      assert.match(workflow.source, /inputs\.confirm_/);
    }
  });

  it('invokes the connected Codex account only for trusted scheduled failures', () => {
    const workflow = workflows.find((candidate) =>
      candidate.file === 'report-scheduled-failure-to-codex.yml');
    assert.ok(workflow);

    assert.equal(hasTopLevelTrigger(workflow.source, 'workflow_run'), true);
    for (const trigger of ['issues', 'issue_comment', 'pull_request', 'pull_request_target']) {
      assert.equal(hasTopLevelTrigger(workflow.source, trigger), false);
    }

    assert.match(workflow.source, /github\.event\.workflow_run\.conclusion == 'failure'/);
    assert.match(workflow.source, /github\.event\.workflow_run\.event == 'schedule'/);
    assert.match(
      workflow.source,
      /github\.event\.workflow_run\.head_branch == github\.event\.repository\.default_branch/,
    );
    assert.match(workflow.source, /^permissions:\r?\n  actions: read\r?\n  contents: read\r?\n  issues: write\r?$/m);
    assert.doesNotMatch(workflow.source, /actions\/checkout/);
    assert.doesNotMatch(workflow.source, /OPENAI_API_KEY|openai\/codex-action/);
    assert.doesNotMatch(workflow.source, /TR_SESSION_JSON/);
    assert.doesNotMatch(workflow.source, /EUR 1 market buy|test:integration:(?:orders|closed-market-order)/);
    assert.doesNotMatch(workflow.source, /refresh Trade Republic session/);
    assert.match(workflow.source, /@codex Triage this trusted scheduled test failure/);
    assert.match(workflow.source, /GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION/);
    assert.match(workflow.source, /flaky test, external service or market-data problem/);
    assert.match(workflow.source, /do not create a branch or pull request/);
  });

  it('loads live read secrets only after exact-SHA checks in the protected live environment', () => {
    const workflow = workflows.find((candidate) =>
      candidate.file === 'validate-approved-pr.yml');
    assert.ok(workflow);

    assert.equal(hasTopLevelTrigger(workflow.source, 'workflow_run'), true);
    for (const trigger of [
      'issues',
      'issue_comment',
      'pull_request',
      'pull_request_review',
      'pull_request_target',
    ]) {
      assert.equal(hasTopLevelTrigger(workflow.source, trigger), false);
    }

    assert.match(workflow.source, /workflows:\r?\n      - PR-safe unit tests/);
    assert.match(workflow.source, /github\.event\.workflow_run\.event == 'pull_request'/);
    assert.match(workflow.source, /github\.event\.workflow_run\.conclusion == 'success'/);
    assert.match(workflow.source, /select\(\.head\.sha == \$sha\)/);
    assert.match(workflow.source, /PR-safe typecheck, build, distribution/);
    assert.match(workflow.source, /\[ "\$quality_conclusion" != "success" \]/);
    assert.match(workflow.source, /environments\/Live%20Integration%20Tests/);
    assert.match(workflow.source, /\.can_admins_bypass == false/);
    assert.match(workflow.source, /select\(\.type == "required_reviewers"\)/);
    assert.match(workflow.source, /select\(\.reviewer\.login == "VIEWVIEWVIEW"\)/);
    assert.ok(
      workflow.source.indexOf('environments/Live%20Integration%20Tests')
        < workflow.source.indexOf('TR_SESSION_JSON: ${{ secrets.TR_SESSION_JSON }}'),
      'the environment protection check must precede access to the live session secret',
    );
    assert.doesNotMatch(workflow.source, /trusted_internal|approve-external|external-pr-live-approval/);
    assert.doesNotMatch(workflow.source, /\bauthor=/);
    assert.match(workflow.source, /The pull request changed after authorization/);
    assert.match(workflow.source, /environment: Live Integration Tests/);
    assert.match(workflow.source, /TR_INTEGRATION_SKIP_SESSION_REFRESH: 'true'/);
    assert.match(workflow.source, /npm test\r?\n          npm run typecheck\r?\n          npm run build/);
    assert.match(workflow.source, /TR_SESSION_JSON: \$\{\{ secrets\.TR_SESSION_JSON \}\}/);
    assert.match(workflow.source, /run: npm run test:integration:read/);
    assert.doesNotMatch(workflow.source, /GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION/);
    assert.doesNotMatch(
      workflow.source,
      /test:integration:(?:mutations|orders|closed-market-order|closed-limit-order|open-limit-order)/,
    );
    assert.doesNotMatch(workflow.source, /EUR 1 market buy/);
  });
});
