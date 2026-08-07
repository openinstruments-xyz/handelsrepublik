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
workflow. Its `Quality` and `Unit Tests` jobs run in parallel, install locked
dependencies, typecheck, test, build, and confirm that the committed `dist`
output is current. They receive no repository or environment secrets, use a
read-only `GITHUB_TOKEN`, and do not persist checkout credentials.

Treat pull-request code as untrusted, including lifecycle scripts, tests, and
build scripts. Never add secrets, deployments, write permissions, privileged
external services, or `pull_request_target` to the `Quality` or `Unit Tests`
jobs.

`Live Integration` depends on both secret-free jobs. GitHub then pauses that job
at the protected `Live Integration Tests` environment until the repository
owner explicitly approves the deployment. Only the approved job can read the
saved session and session-management token. A new pull-request commit cancels
the old run and requires approval for the new commit.

### Repository settings

These controls are not versioned by the workflow file and must be configured in
GitHub:

1. Under **Settings → Environments → Live Integration Tests**, add
   `VIEWVIEWVIEW` as a required reviewer. Store `TR_SESSION_JSON` and
   `GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION` as environment secrets. Leave the
   deployment-branch policy unrestricted so pull-request merge refs can deploy.
2. Protect `main` under **Settings → Rules → Rulesets** (or branch protection),
   require the branch to be up to date, and require these exact checks after
   they have appeared on a pull request:
   - `Quality`
   - `Unit Tests`
   - `Live Integration`
3. Remove the superseded `Merge queue / merge queue`, `unit tests`, and
   `typecheck, build, and verify committed distribution` required contexts.

Do not enable reviewer bypass for the protected environment. If GitHub's
**Prevent self-review** option is enabled, an owner-authored pull request needs
a second eligible reviewer; leave it disabled when owner approval is the sole
required approval described here.

The SDK is a modular monolith: `ClientRuntime` owns shared transport,
schema-validation, and securities-account resolution; declarative REST and
mapper calls live in `src/operation-specs.ts`; domain adapters live in
`src/domains/`; and `MapperConnection` owns multiplexing and reconnection.

## Live integration tests

The `Live Integration` pull-request job runs the non-ordering integration suite
against the protected `Live Integration Tests` environment after approval. The
workflow can also be started manually and uses the same approval boundary.
Before the suite starts, the job refreshes the saved session and writes the
refreshed browser and WAF context back to the environment's `TR_SESSION_JSON`
secret. The manual order suite stays excluded because it can place a real
order.

The separate `Refresh live session` automation remains in place. It runs every
two hours and updates the `TR_SESSION_JSON` secret in the same environment. It
uses `GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION`, a narrowly scoped token allowed
to update that environment secret. Because it uses the protected environment,
scheduled refresh jobs also wait for an owner approval. Neither secret is
available to `Quality` or `Unit Tests`.

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
