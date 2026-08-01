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
  it('queues every shared live workflow without cancelling an active session user', () => {
    const sharedLiveWorkflows = workflows.filter((workflow) =>
      workflow.source.includes('group: live-integration-tests-main'));

    assert.ok(sharedLiveWorkflows.length > 0);
    for (const workflow of sharedLiveWorkflows) {
      assert.match(
        workflow.source,
        /group: live-integration-tests-main\r?\n\s+queue: max\r?\n\s+cancel-in-progress: false/,
        `${workflow.file} must preserve both running and pending shared-session work`,
      );
    }
  });

  it('never uses pull_request_target', () => {
    for (const workflow of workflows) {
      assert.equal(
        hasTopLevelTrigger(workflow.source, 'pull_request_target'),
        false,
        `${workflow.file} must not run pull-request code in a privileged base-repository context`,
      );
    }
  });

  it('does not bind workflow execution to a mutable repository name', () => {
    for (const workflow of workflows) {
      assert.doesNotMatch(
        workflow.source,
        /github\.repository\s*==/,
        `${workflow.file} must rely on event, branch, actor, and confirmation guards instead`,
      );
    }
  });

  it('keeps untrusted pull-request checks secret-free and read-only', () => {
    const pullRequestWorkflows = workflows.filter((workflow) =>
      hasTopLevelTrigger(workflow.source, 'pull_request'));

    assert.deepEqual(
      pullRequestWorkflows.map((workflow) => workflow.file),
      ['merge-gate.yml'],
    );

    const mergeGate = pullRequestWorkflows[0];
    assert.ok(mergeGate);
    assert.match(mergeGate.source, /^permissions:\r?\n  contents: read\r?$/m);
    assert.equal(hasTopLevelTrigger(mergeGate.source, 'merge_group'), true);
    assert.doesNotMatch(mergeGate.source, /pull_request_target/);

    const untrustedChecks = ['quality.yml', 'unit-tests.yml'].map((file) => {
      const workflow = workflows.find((candidate) => candidate.file === file);
      assert.ok(workflow, `${file} must exist`);
      return workflow;
    });

    for (const workflow of untrustedChecks) {
      assert.match(workflow.source, /^name: (?:Package checks|Unit tests)$/m);
      assert.equal(hasTopLevelTrigger(workflow.source, 'workflow_call'), true);
      assert.match(workflow.source, /^permissions:\r?\n  contents: read\r?$/m);
      assert.doesNotMatch(workflow.source, /\$\{\{\s*secrets\./);
      assert.doesNotMatch(workflow.source, /^\s+environment:/m);
      assert.doesNotMatch(workflow.source, /\$\{\{\s*github\.token\s*\}\}/);
      assert.match(workflow.source, /^\s+persist-credentials: false\r?$/m);
      assert.doesNotMatch(
        workflow.source,
        /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/,
      );
    }

    assert.match(
      mergeGate.source,
      /live-preview:\r?\n\s+name: live suites awaiting merge queue[\s\S]*?uses: \.\/\.github\/workflows\/live-validation\.yml\r?\n\r?\n  live:/,
    );
    assert.match(mergeGate.source, /github\.event_name == 'pull_request'/);
    assert.match(mergeGate.source, /github\.event_name == 'merge_group'/);
    assert.match(
      mergeGate.source,
      /needs: \[unit, quality\]\r?\n\s+uses: \.\/\.github\/workflows\/live-validation\.yml\r?\n\s+secrets: inherit/,
    );
    const previewBlock = mergeGate.source.match(/  live-preview:[\s\S]*?\r?\n\r?\n  live:/)?.[0];
    assert.ok(previewBlock);
    assert.doesNotMatch(previewBlock, /secrets:/);
  });

  it('keeps live session access restricted to main and merge candidates', () => {
    const liveWorkflows = workflows.filter((workflow) => workflow.file === 'live-validation.yml');

    assert.deepEqual(
      liveWorkflows.map((workflow) => workflow.file).sort(),
      ['live-validation.yml'],
    );

    const mergeGate = workflows.find((workflow) => workflow.file === 'merge-gate.yml');
    assert.ok(mergeGate);
    assert.match(mergeGate.source, /^    name: Merge gate \/ merge gate\r?$/m);

    const liveWorkflow = liveWorkflows[0];
    assert.ok(liveWorkflow);
    assert.equal(hasTopLevelTrigger(liveWorkflow.source, 'pull_request'), false);
    assert.equal(hasTopLevelTrigger(liveWorkflow.source, 'workflow_call'), true);
    assert.match(liveWorkflow.source, /^\s+environment: Live Integration Tests\r?$/m);
    assert.match(liveWorkflow.source, /^\s+persist-credentials: false\r?$/m);
    assert.match(liveWorkflow.source, /github\.event_name == 'merge_group'/);
    assert.equal(liveWorkflow.source.match(/ci-session\.ts refresh/g)?.length, 1);
    assert.equal(liveWorkflow.source.match(/gh secret set TR_SESSION_JSON/g)?.length, 1);
    assert.match(liveWorkflow.source, /select suites without accessing the live session/);
    assert.match(liveWorkflow.source, /RUN_EVENT: \$\{\{ github\.event_name \}\}/);
    assert.match(liveWorkflow.source, /The live suite runs after this pull request enters the trusted merge queue/);
    assert.match(liveWorkflow.source, /name: Live \/ \$\{\{ matrix\.suite\.name \}\}/);
    assert.match(liveWorkflow.source, /weekend-limit-order-rejection/);
    assert.equal(
      workflows.some((workflow) => workflow.file === 'validate-weekend-limit-order-lifecycle.yml'),
      false,
    );

    assert.doesNotMatch(
      mergeGate.source,
      /execute-market-buy-on-live-account\.yml/,
    );
    assert.doesNotMatch(
      mergeGate.source,
      /execute-market-sell-on-live-account\.yml/,
    );
  });

  it('keeps real market orders manual while scheduling closed-market rejection coverage', () => {
    const manualBuy = workflows.find((workflow) =>
      workflow.file === 'execute-market-buy-on-live-account.yml');
    assert.ok(manualBuy);

    assert.equal(hasTopLevelTrigger(manualBuy.source, 'workflow_dispatch'), true);
    for (const trigger of [
      'push',
      'schedule',
      'pull_request',
      'pull_request_target',
      'workflow_call',
      'merge_group',
    ]) {
      assert.equal(
        hasTopLevelTrigger(manualBuy.source, trigger),
        false,
        `${manualBuy.file} must only be started explicitly`,
      );
    }
    assert.match(manualBuy.source, /^permissions:\r?\n  contents: read\r?$/m);
    assert.doesNotMatch(manualBuy.source, /^\s+environment:/m);
    assert.match(manualBuy.source, /^\s+group: live-integration-tests-main\r?$/m);
    assert.match(manualBuy.source, /github\.actor == 'VIEWVIEWVIEW'/);
    assert.match(manualBuy.source, /inputs\.confirm_live_execution/);

    const manualSell = workflows.find((workflow) =>
      workflow.file === 'execute-market-sell-on-live-account.yml');
    assert.ok(manualSell);

    assert.equal(hasTopLevelTrigger(manualSell.source, 'workflow_dispatch'), true);
    for (const trigger of [
      'push',
      'schedule',
      'pull_request',
      'pull_request_target',
      'workflow_call',
      'merge_group',
    ]) {
      assert.equal(
        hasTopLevelTrigger(manualSell.source, trigger),
        false,
        `${manualSell.file} must only be started explicitly`,
      );
    }
    assert.match(manualSell.source, /^permissions:\r?\n  contents: read\r?$/m);
    assert.doesNotMatch(manualSell.source, /^\s+environment:/m);
    assert.match(manualSell.source, /^\s+group: live-integration-tests-main\r?$/m);
    assert.match(manualSell.source, /github\.actor == 'VIEWVIEWVIEW'/);
    assert.match(manualSell.source, /inputs\.confirm_live_execution/);
    assert.match(manualSell.source, /TR_INTEGRATION_SELL_SIZE/);

    const liveValidation = workflows.find((workflow) => workflow.file === 'live-validation.yml');
    assert.ok(liveValidation);

    assert.equal(hasTopLevelTrigger(liveValidation.source, 'workflow_dispatch'), true);
    assert.equal(hasTopLevelTrigger(liveValidation.source, 'workflow_call'), true);
    assert.equal(hasTopLevelTrigger(liveValidation.source, 'schedule'), true);
    assert.equal(hasTopLevelTrigger(liveValidation.source, 'push'), true);
    assert.equal(hasTopLevelTrigger(liveValidation.source, 'pull_request'), false);
    assert.match(
      liveValidation.source,
      /cron: "0 1,11 \* \* \*"\r?\n\s+timezone: Europe\/Berlin/,
    );
    assert.match(liveValidation.source, /^\s+environment: Live Integration Tests\r?$/m);
    assert.match(liveValidation.source, /^\s+group: live-integration-tests-main\r?$/m);
    assert.match(liveValidation.source, /github\.actor == 'VIEWVIEWVIEW'/);
    assert.match(liveValidation.source, /inputs\.confirm_order_request/);
    assert.match(liveValidation.source, /closed-market-order-rejection/);
    assert.match(liveValidation.source, /weekend-limit-order-rejection/);
    assert.match(liveValidation.source, /status_read_only: \$\{\{ steps\.live-suites\.outputs\.status_read_only \}\}/);
    assert.match(liveValidation.source, /SUITE_STATUS: \$\{\{ needs\.execute\.outputs\[matrix\.suite\.output\] \}\}/);
    assert.doesNotMatch(liveValidation.source, /outputs\.statuses/);
  });

  it('keeps the Codex scheduled-failure triage workflow disabled', () => {
    const activeWorkflow = workflows.find((candidate) =>
      candidate.file === 'report-scheduled-failure-to-codex.yml');
    assert.equal(activeWorkflow, undefined);

    const disabledWorkflow = readFileSync(
      join(workflowDirectory, 'report-scheduled-failure-to-codex.yml.disabled'),
      'utf8',
    );
    assert.match(disabledWorkflow, /github\.event\.workflow_run\.conclusion == 'failure'/);
    assert.match(disabledWorkflow, /@codex Triage this trusted scheduled test failure/);
  });

  it('deploys the CI badge worker only from main with scoped Cloudflare credentials', () => {
    const deployBadges = workflows.find((workflow) =>
      workflow.file === 'deploy-ci-badge-worker.yml');
    assert.ok(deployBadges);

    assert.equal(hasTopLevelTrigger(deployBadges.source, 'push'), true);
    assert.equal(hasTopLevelTrigger(deployBadges.source, 'workflow_dispatch'), true);
    assert.equal(hasTopLevelTrigger(deployBadges.source, 'pull_request'), false);
    assert.equal(hasTopLevelTrigger(deployBadges.source, 'pull_request_target'), false);
    assert.match(deployBadges.source, /^permissions:\r?\n  contents: read\r?$/m);
    assert.match(deployBadges.source, /branches:\r?\n\s+- main/);
    assert.match(deployBadges.source, /github\.ref == 'refs\/heads\/main'/);
    assert.match(deployBadges.source, /^\s+persist-credentials: false\r?$/m);
    assert.match(deployBadges.source, /cloudflare\/wrangler-action@v3/);
    assert.match(deployBadges.source, /secrets\.CLOUDFLARE_API_TOKEN/);
    assert.match(deployBadges.source, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
    assert.match(deployBadges.source, /--keep-vars/);
  });

});
