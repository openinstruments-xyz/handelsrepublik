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

The SDK is a modular monolith: `ClientRuntime` owns shared transport,
schema-validation, and securities-account resolution; declarative REST and
mapper calls live in `src/operation-specs.ts`; domain adapters live in
`src/domains/`; and `MapperConnection` owns multiplexing and reconnection.

## Live integration tests

Live tests use a saved session and raw-response validation. Unknown response
fields or incompatible types fail the invoking test before normalization.
An empty endpoint list is valid where the endpoint permits it; it does not prove
an unseen item schema.

Run the namespace integration tests sequentially. This includes reversible
price-alarm and watchlist mutations, both of which clean up in `finally`:

```powershell
$env:TR_SESSION_FILE = './demo/.demo-session.json'
npm run test:integration
```

The order test is deliberately separate. It submits one share at a EUR 1 limit
only at an explicitly open venue whose current bid is at least EUR 10, verifies
the order opens, and cancels it in `finally`. It is still a real order with no
absolute no-fill guarantee, so it requires an explicit opt-in:

```powershell
$env:TR_INTEGRATION_ALLOW_ORDERS = 'true'
npm run test:integration:manual
```
