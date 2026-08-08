# Maintainer documentation

This document covers repository development and verification. Consumer setup
and SDK usage are in the [README](../README.md).

## Local development

```bash
npm install
npm run typecheck
npm test
npm run build
```

Keep `dist` committed: GitHub consumers install the compiled package without
building TypeScript.

The repository includes an interactive REPL and terminal UI:

```bash
npm run demo:repl
npm run demo:tui
```

Demo authentication state belongs under `demo/` and must not be committed. The
`demo:scratchpad` script is maintainer-specific and may submit a real order.

## Pull-request boundary

Every opened, reopened, or updated pull request runs the `Pull request`
workflow. For an external fork, GitHub first waits for the repository owner to
press **Approve and run workflows**. That approval starts only the secret-free
pull-request checks; it does not expose the live session.

The workflow's `Unit Tests` and `Quality` jobs run in parallel, install locked
dependencies, test, typecheck, build, and confirm that the committed `dist`
output is current. They receive no repository or environment secrets, use a
read-only `GITHUB_TOKEN`, and do not persist checkout credentials.

The pull-request workflow also reports an explicit `Live Integration` deferral
check. It only records that the privileged check is reserved for the merge
queue; it does not check out code, read secrets, or run live tests. GitHub
required status checks are global and do not distinguish `pull_request` from
`merge_group`, so this deliberate success marker prevents the required check
from remaining absent on pull requests. It is not a substitute for the live
suite.

Treat pull-request code as untrusted, including lifecycle scripts, tests, and
build scripts. Never add secrets, deployments, write permissions, privileged
external services, or `pull_request_target` to the `Unit Tests` or `Quality`
jobs.

After review, a maintainer adds the pull request to GitHub's native merge queue.
GitHub creates a temporary merge-group commit and runs `Unit Tests`, `Quality`,
and `Live Integration` against that exact commit. Only the merge-group workflow
can read `TR_SESSION_JSON`. GitHub merges the pull request only when all three
required checks succeed; a failed check removes it from the queue without
merging it.

Queueing a pull request deliberately trusts the complete merge-group code with
the brokerage session. Review lifecycle scripts, dependencies, tests, and
runtime code before adding it to the queue. Never execute fork code in a
privileged `workflow_run` or `pull_request_target` workflow.

### Repository settings

These controls are not versioned by the workflow file and must be configured in
GitHub:

1. Under **Settings → Actions → General → Approval for running fork pull request
   workflows from contributors**, require approval for all external
   contributors. `VIEWVIEWVIEW` performs that approval only after reviewing the
   exact commit.
2. Under **Settings → Environments → Live Integration Tests**, store
   `TR_SESSION_JSON` and `GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION` as environment
   secrets, but configure no required reviewer or wait timer. The merge-queue
   live job references only `TR_SESSION_JSON`; the separate refresh automation
   alone references the management token.
3. Protect `main` with GitHub's native branch protection. Require pull requests,
   require the merge queue with the repository's squash merge method, limit both
   build concurrency and the maximum pull requests per merge to one, keep
   **Only merge non-failing pull requests** enabled, and require these exact
   checks after they have appeared:
   - `Unit Tests`
   - `Quality`
   - `Live Integration`
4. Do not configure a custom readiness status or a second environment approval.
   Remove superseded contexts such as `Merge queue / merge queue`, `unit tests`,
   and `typecheck, build, and verify committed distribution`.

The SDK is a modular monolith: `ClientRuntime` owns shared transport,
schema-validation, and securities-account resolution; declarative REST and
mapper calls live in `src/operation-specs.ts`; domain adapters live in
`src/domains/`; and `MapperConnection` owns multiplexing and reconnection.

## Live integration tests

The native merge-group workflow runs the non-ordering integration suite against
the `Live Integration Tests` environment after `Unit Tests` and `Quality` succeed.
Before the suite starts, the job refreshes its private session file locally. It
does not persist that merge-group-derived file. The manual order suite stays
excluded because it can place a real order.

The separate `Refresh live session` automation remains in place. It runs every
two hours and updates the `TR_SESSION_JSON` secret in the same environment. It
uses `GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION`, a narrowly scoped token allowed
to update that environment secret. The environment has no deployment reviewer,
so scheduled refresh jobs remain unattended. Neither secret is available to
`Unit Tests` or `Quality`, and the management token is not available to the PR
live workflow.

To replace a missing or expired CI session, authenticate the GitHub CLI, then
run the interactive enrollment from the repository root:

```powershell
npm run ci:reauth
```

The command always opens a fresh browser to collect the complete web context
(including WAF/XSRF proof, relevant headers, and cookies), prints rotating QR
codes for approval in the Trade Republic app, and writes the new session with
exactly that context directly to the `Live Integration Tests` environment's
`TR_SESSION_JSON` secret. It ignores a locally inherited `TR_SESSION_FILE`, so
an old partial session cannot replace the new enrollment. It does not print the
session or leave a new session file on disk. Only the scheduled and live-test
workflows pass explicit `--refresh` mode together with `TR_SESSION_FILE` for
unattended refreshes.

Live tests use a saved session and raw-response validation. Unknown response
fields or incompatible types fail the invoking test before normalization.
An empty endpoint list is valid where the endpoint permits it; it does not prove
an unseen item schema.

Run the namespace integration tests sequentially. This explicitly requested
live path includes reversible watchlist and price-alarm mutations. Both use a
disposable test resource and remove it in `finally`; a cleanup failure fails
the test and must be reconciled before another run:

```powershell
$env:TR_SESSION_FILE = './demo/.demo-session.json'
npm run test:integration
```

The protected CI live workflow runs the same suite.

The order test is deliberately separate. It submits one share at a EUR 1 limit
only at an explicitly open venue whose current bid is at least EUR 10, verifies
the order opens, and cancels it in `finally`. It is still a real order with no
absolute no-fill guarantee, so it requires an explicit opt-in:

```powershell
$env:TR_INTEGRATION_ALLOW_ORDERS = 'true'
npm run test:integration:manual
```
