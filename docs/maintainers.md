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

Every pull request runs the secret-free package-check and unit-test workflows.
They install locked dependencies, typecheck, test, build, and confirm that the
committed `dist` output is current. They receive no repository or environment
secrets, use a read-only `GITHUB_TOKEN`, and do not persist checkout credentials.

Treat pull-request code as untrusted, including lifecycle scripts, tests, and
build scripts. Never add secrets, deployments, write permissions, privileged
external services, or `pull_request_target` to these workflows.

Once the required pull-request checks pass, GitHub's merge queue builds the
exact merge candidate. That candidate deploys to the protected `Live
Integration Tests` environment and waits for its required reviewer before any
session secret is released. The deployment must succeed before GitHub merges
the candidate. Ordinary pull-request workflows never enter that environment.

The SDK is a modular monolith: `ClientRuntime` owns shared transport,
schema-validation, and securities-account resolution; declarative REST and
mapper calls live in `src/operation-specs.ts`; domain adapters live in
`src/domains/`; and `MapperConnection` owns multiplexing and reconnection.

## Live integration tests

The `Live integration tests` workflow runs for merge candidates, or from an
explicit maintainer dispatch. It runs the non-ordering integration suite
against the protected `Live Integration Tests` environment. Before the suite
starts, the workflow refreshes the saved session and writes the refreshed
browser and WAF context back to the environment's `TR_SESSION_JSON` secret.
The manual order suite stays excluded because it can place a real order.

`Refresh live session` runs every two hours and updates the `TR_SESSION_JSON`
secret in the `Live Integration Tests` environment. It uses the environment's
`GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION`, a narrowly scoped token allowed to
update that environment secret. Neither secret is available to ordinary
pull-request checks.

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
