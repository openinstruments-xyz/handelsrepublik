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
press **Approve and run workflows**. That approval is the explicit decision to
trust the exact pull-request commit with the live session if the secret-free
checks pass.

The workflow's `Quality` and `Unit Tests` jobs run in parallel, install locked
dependencies, typecheck, test, build, and confirm that the committed `dist`
output is current. They receive no repository or environment secrets, use a
read-only `GITHUB_TOKEN`, and do not persist checkout credentials.

Treat pull-request code as untrusted, including lifecycle scripts, tests, and
build scripts. Never add secrets, deployments, write permissions, privileged
external services, or `pull_request_target` to the `Quality` or `Unit Tests`
jobs.

After both jobs succeed, the trusted `Approved live integration` workflow from
`main` runs through `workflow_run`. It checks out exactly the repository and SHA
recorded by the approved run, verifies the checkout, refreshes the saved session
locally, and runs the live suite. It posts `Live Integration` directly to that
SHA. The job can read `TR_SESSION_JSON`, but it never receives or references the
session-management token and never writes PR-produced session data back to
GitHub. A new external pull-request commit creates a new unapproved run, so the
owner must review and approve that commit separately.

Approving an external workflow deliberately trusts the complete pull-request
code with the brokerage session. Review lifecycle scripts, dependencies, tests,
and runtime code before pressing the button. The privileged workflow definition
itself is always loaded from `main`; pull-request changes to workflow files do
not alter the running privileged workflow.

### Repository settings

These controls are not versioned by the workflow file and must be configured in
GitHub:

1. Under **Settings → Actions → General → Approval for running fork pull request
   workflows from contributors**, require approval for all external
   contributors. `VIEWVIEWVIEW` performs that approval only after reviewing the
   exact commit.
2. Under **Settings → Environments → Live Integration Tests**, store
   `TR_SESSION_JSON` and `GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION` as environment
   secrets, but configure no required reviewer or wait timer. The PR live
   workflow references only `TR_SESSION_JSON`; the separate refresh automation
   alone references the management token.
3. Protect `main` under **Settings → Rules → Rulesets** (or branch protection),
   require the branch to be up to date, and require these exact checks after
   they have appeared on a pull request:
   - `Quality`
   - `Unit Tests`
   - `Live Integration`
4. Remove the superseded `Merge queue / merge queue`, `unit tests`, and
   `typecheck, build, and verify committed distribution` required contexts.

The SDK is a modular monolith: `ClientRuntime` owns shared transport,
schema-validation, and securities-account resolution; declarative REST and
mapper calls live in `src/operation-specs.ts`; domain adapters live in
`src/domains/`; and `MapperConnection` owns multiplexing and reconnection.

## Live integration tests

The trusted follow-up workflow runs the non-ordering integration suite against
the `Live Integration Tests` environment after the approved secret-free run
succeeds. Before the suite starts, the job refreshes its private session file
locally. It does not persist that PR-derived file. The manual order suite stays
excluded because it can place a real order.

The separate `Refresh live session` automation remains in place. It runs every
two hours and updates the `TR_SESSION_JSON` secret in the same environment. It
uses `GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION`, a narrowly scoped token allowed
to update that environment secret. The environment has no deployment reviewer,
so scheduled refresh jobs remain unattended. Neither secret is available to
`Quality` or `Unit Tests`, and the management token is not available to the PR
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
