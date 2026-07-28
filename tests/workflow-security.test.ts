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
      /if: github\.event_name == 'merge_group'\r?\n\s+needs: \[unit, quality\]\r?\n\s+uses: \.\/\.github\/workflows\/general-read-only-validation\.yml\r?\n\s+secrets: inherit/,
    );
  });

  it('runs live pull-request code only from a merge candidate', () => {
    const liveWorkflows = workflows.filter((workflow) =>
      workflow.source.startsWith('name: "Live:'));

    assert.deepEqual(
      liveWorkflows.map((workflow) => workflow.file).sort(),
      [
        'general-read-only-validation.yml',
        'validate-closed-venue-limit-order-rejection.yml',
        'validate-closed-venue-market-order-rejection.yml',
        'validate-open-venue-limit-order-lifecycle.yml',
        'validate-order-destinations-during-closed-market-hours.yml',
        'validate-reversible-account-mutations.yml',
        'validate-venue-during-opening-times.yml',
      ],
    );

    const mergeGate = workflows.find((workflow) => workflow.file === 'merge-gate.yml');
    assert.ok(mergeGate);

    for (const workflow of liveWorkflows) {
      assert.equal(hasTopLevelTrigger(workflow.source, 'pull_request'), false);
      assert.equal(hasTopLevelTrigger(workflow.source, 'workflow_call'), true);
      assert.match(workflow.source, /^\s+environment: Live Integration Tests\r?$/m);
      assert.match(workflow.source, /^\s+persist-credentials: false\r?$/m);
      assert.match(workflow.source, /github\.event_name == 'merge_group'/);
      assert.match(
        mergeGate.source,
        new RegExp(
          `if: github\\.event_name == 'merge_group'\\r?\\n` +
          `\\s+needs: \\[unit, quality\\]\\r?\\n` +
          `\\s+uses: \\.\\/\\.github\\/workflows\\/${workflow.file.replaceAll('.', '\\.')}\\r?\\n` +
          `\\s+secrets: inherit`,
        ),
      );
    }

    assert.doesNotMatch(
      mergeGate.source,
      /execute-market-buy-on-live-account\.yml/,
    );
  });

  it('keeps the real market buy manual while scheduling closed-market rejection coverage', () => {
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

    const closedMarketOrder = workflows.find((workflow) =>
      workflow.file === 'validate-closed-venue-market-order-rejection.yml');
    assert.ok(closedMarketOrder);

    assert.equal(hasTopLevelTrigger(closedMarketOrder.source, 'workflow_dispatch'), true);
    assert.equal(hasTopLevelTrigger(closedMarketOrder.source, 'workflow_call'), true);
    assert.equal(hasTopLevelTrigger(closedMarketOrder.source, 'schedule'), true);
    assert.equal(hasTopLevelTrigger(closedMarketOrder.source, 'push'), false);
    assert.equal(hasTopLevelTrigger(closedMarketOrder.source, 'pull_request'), false);
    assert.match(
      closedMarketOrder.source,
      /cron: "0 2 \* \* \*"\r?\n\s+timezone: Europe\/Berlin/,
    );
    assert.match(closedMarketOrder.source, /^\s+environment: Live Integration Tests\r?$/m);
    assert.match(closedMarketOrder.source, /^\s+group: live-integration-tests-main\r?$/m);
    assert.match(closedMarketOrder.source, /github\.actor == 'VIEWVIEWVIEW'/);
    assert.match(closedMarketOrder.source, /inputs\.confirm_order_request/);
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

});
