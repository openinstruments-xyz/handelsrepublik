# Maintainer documentation

This document covers repository development, verification, and the GitHub
Actions trust model. Consumer setup and SDK usage are in the
[README](../README.md).

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

Every pull request runs the secret-free `PR-safe` quality and unit workflows.
They install locked dependencies, typecheck, test, build, and confirm that the
committed `dist` output is current. They receive no repository or environment
secrets, use a read-only `GITHUB_TOKEN`, and do not persist checkout
credentials.

Treat pull-request code as untrusted, including lifecycle scripts, tests, and
build scripts. Never add secrets, deployments, write permissions, privileged
external services, or `pull_request_target` to these workflows. Live
integration workflows run only from trusted default-branch, schedule, or manual
triggers.

The SDK is a modular monolith: `ClientRuntime` owns shared transport,
schema-validation, and securities-account resolution; declarative REST and
mapper calls live in `src/operation-specs.ts`; domain adapters live in
`src/domains/`; and `MapperConnection` owns multiplexing and reconnection.

## Live integration tests

Live tests use a saved session and raw-response validation. Unknown response
fields or incompatible types fail a visible Actions step before normalization.
An empty endpoint list is valid where the endpoint permits it; it does not prove
an unseen item schema.

Run a read-only suite or a stable case locally:

```powershell
$env:TR_SESSION_FILE = './demo/.demo-session.json'
npm run test:integration
npm run test:integration:case -- candles.standard-aapl
```

Additional suites are available for venue reads and reversible account changes:

```powershell
npm run test:integration:read
npm run test:integration:closed-venue
npm run test:integration:open-venue
npm run test:integration:mutations
```

The protected order probes retain their clock and live-venue gates:

```powershell
npm run test:integration:closed-limit-order
npm run test:integration:closed-market-order
npm run test:integration:open-limit-order
npm run test:integration:weekend-limit-order
```

Closed-market probes must be rejected. The open and weekend limit lifecycles use
deliberately non-marketable prices but still send real orders and have no
absolute no-fill guarantee. The manual market-buy workflow intentionally
executes and can cost up to EUR 5 plus the expected EUR 1 fee.

The reusable `live-validation.yml` workflow plans the selected suites without
loading secrets, then uses one trusted executor job to materialize and refresh
the Trade Republic session once. It runs the selected suite modules
independently, persists the refreshed session once, and exposes a separate
report job for every suite. This keeps distinct pull-request and merge-queue
check entries without causing one refresh per suite.

| Suite report | Trigger and gate | Purpose |
| --- | --- | --- |
| Account and market-data reads | `main`, scheduled, or manual | Read-only validation of account, assets, orders, portfolio, market data, documents, tax, and payments. |
| Closed- and open-venue checks | `main`, scheduled, or manual; Berlin time and venue-state gates | Validate destination state, quotations, L2, ticker, tape, and order books without an order. |
| Reversible mutations | `main`, scheduled, or manual | Create and remove a disposable price alert and default-watchlist item. |
| Closed-market order rejection | Limit: weekday overnight; market: trusted merge queue or manual owner confirmation | Require the broker to reject a EUR 1 Apple order when LSX is closed; cancel if it is unexpectedly accepted. |
| Open-limit order lifecycle | `main`, scheduled, or manual; open venue required | Submit, observe, replace, cancel, and clean up a deliberately non-marketable order. |
| Weekend limit-order lifecycle | Saturday or Sunday in Europe/Berlin | Submit, observe, cancel, and clean up a deliberately non-marketable order on a destination advertising limit-order support. |
| Manual buy and sell | Manual, owner confirmation | Execute an explicitly requested purchase or sale; never infer a position quantity or automatically sell. |

The `Merge gate` workflow runs secret-free unit and package checks on pull
requests and presents every live suite as an individual "awaiting merge queue"
check. On `merge_group`, it calls the trusted live executor with inherited
secrets and requires every eligible suite report to pass. Berlin time gates are
evaluated per suite, so an ineligible suite reports as time-gated without
preventing eligible suites from running.

All trusted executions share the `live-integration-tests-main` concurrency
group. GitHub therefore queues session-consuming runs instead of refreshing the
same Trade Republic account concurrently.

## CI session renewal

Live jobs use the repository-level `TR_SESSION_JSON` secret. Successful trusted
live runs refresh and rotate it. When that session cannot refresh, a maintainer
can renew it with:

```powershell
npm run ci:reauth
```

The command verifies GitHub CLI login, collects the matching browser/WAF
context, renders a QR code, waits for approval in the Trade Republic app, then
updates the repository secret in `openinstruments-xyz/handelsrepublik` and
dispatches `live-validation.yml` on `main`. The new session remains in memory;
it is not written to the checkout.

The rotation workflow also requires
`GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION`, scoped to update Actions repository
secrets for this repository.

## Scheduled failure triage

The disabled **report trusted scheduled failures to Codex** workflow is designed
to create one redacted, deduplicated `codex-triage` issue per failed allowlisted
non-market live workflow. A triage must classify the failure before changing
code. Only a plausibly reproducible repository defect may produce a minimal
`codex/` branch and pull request; service, session, rate-limit, infrastructure,
or market-data failures are documented on the issue and stop there.

Any trusted Codex pull request must first pass the secret-free checks. Its live
validation rechecks the repository, author, `codex/` branch, and exact tested
head SHA before loading the live session. It runs only the title-selected
non-market profile. Session-refresh and market-order workflows are excluded.
Never weaken this boundary, provide live-account secrets to untrusted PR code,
or modify the market-order workflows as part of automated triage.
