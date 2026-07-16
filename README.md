# handelsrepublik

[![quality](https://github.com/VIEWVIEWVIEW/handelsrepublik/actions/workflows/quality.yml/badge.svg?branch=main)](https://github.com/VIEWVIEWVIEW/handelsrepublik/actions/workflows/quality.yml)
[![unit tests](https://github.com/VIEWVIEWVIEW/handelsrepublik/actions/workflows/unit-tests.yml/badge.svg?branch=main)](https://github.com/VIEWVIEWVIEW/handelsrepublik/actions/workflows/unit-tests.yml)
[![live-integration](https://github.com/VIEWVIEWVIEW/handelsrepublik/actions/workflows/live-integration.yml/badge.svg?branch=main)](https://github.com/VIEWVIEWVIEW/handelsrepublik/actions/workflows/live-integration.yml)

## Overview

`handelsrepublik` is an unofficial, ESM-only TypeScript SDK for the private Trade
Republic web API. It gives applications one client for authentication, account
and portfolio data, market data, documents, and explicitly invoked brokerage
operations across Trade Republic's REST and mapper-websocket transports.

The SDK is designed to keep broker outcomes separate from transport outcomes.
Read subscriptions can reconnect automatically, while order submissions and
other mutations are never replayed automatically. If a mutation may have crossed
the network boundary without a definitive broker response, the SDK reports
`outcomeUnknown`. The application must reconcile that result instead of treating
the request as safely retryable.

The package provides:

- QR-code web login, session persistence, and refresh helpers.
- Typed domain namespaces for account, portfolio, orders, trading, market data,
  timeline, instruments, discovery, documents, tax, and payments.
- Shared mapper-websocket subscriptions with observable disconnect and reconnect
  events.
- Configurable validation of covered raw responses before normalization.
- Order previews plus explicit order submission and cancellation methods.
- Raw REST and mapper escape hatches for private resources without a typed SDK
  method.

### Support and risk

This project is not affiliated with or supported by Trade Republic. It is based
on observed web-application traffic and can break when Trade Republic changes
private endpoints, authentication requirements, headers, mapper resources, or
response payloads.

Some SDK methods can place or cancel real orders. Applications are responsible
for user confirmation, reconciliation, regulatory obligations, and deciding how
to store account and order data. Do not use live mutations in unattended tests.

Treat sessions, cookies, WAF tokens, QR challenges, account payloads, documents,
tax data, order data, and raw mapper responses as secrets.

Trade Republic market data may be subject to contractual restrictions. Check
the applicable market data terms before reusing or redistributing retrieved
data: [Sonderbedingungen fuer Marktdaten und vorvertragliche Informationen
(PDF)](https://assets.traderepublic.com/assets/files/CA_DE-de.pdf).

## Installation

Install the package directly from GitHub:

```bash
npm install github:VIEWVIEWVIEW/handelsrepublik
```

The package is ESM-only and includes its compiled `dist` output. Consumers do
not need to build TypeScript during installation.

Trade Republic may require an AWS WAF browser challenge before login. The SDK
can collect the matching WAF token, XSRF token, cookies, and browser headers from
Playwright, which is an optional consumer dependency:

```bash
npm install playwright
npx playwright install chromium
```

You can omit Playwright if your application supplies a valid
`TradeRepublicWebContext` through another mechanism.

## Quick Start

This example captures the browser context, restores and refreshes an existing
session when available, otherwise performs QR login, and finally makes a
read-only request:

```ts
import { chromium } from 'playwright';
import {
  collectTradeRepublicWebContext,
  FileSessionStore,
  TradeRepublicClient,
} from 'handelsrepublik';

const webContext = await (async () => {
  const browser = await chromium.launch({ headless: false });
  try {
    return await collectTradeRepublicWebContext(browser);
  } finally {
    await browser.close();
  }
})();

const tr = TradeRepublicClient.create({
  webContext,
  sessionStore: new FileSessionStore('.tr-session.json'),

  // Choose schema behavior during setup. Passthrough is useful while working
  // with a private API because it reports drift without immediately stopping.
  rawSchemaValidation: 'passthrough',
  onRawSchemaValidationFailure({ schemaName, error }) {
    console.warn(`Trade Republic schema drift in ${schemaName}`, error);
  },
});

try {
  const restored = await tr.auth.restoreSession();

  if (restored) {
    // Refreshes the web session and saves the updated session automatically.
    await tr.auth.refreshSession();
  } else {
    const challenge = await tr.auth.createInstantLogin({
      deviceName: 'local sdk',
    });

    console.log(
      challenge.qrCodeDataUrl ?? challenge.deepLink ?? challenge.qrCode,
    );

    // Approve the challenge in the Trade Republic app. Successful login is
    // persisted automatically through the configured SessionStore.
    await tr.auth.pollInstantLogin(challenge);
  }

  console.log(await tr.portfolio.cash());
} finally {
  tr.close();
}
```

Choose `rawSchemaValidation` deliberately:

| Value | Behavior |
| --- | --- |
| `true` or `'throw'` | Validate covered raw responses and throw on drift. This is the default. |
| `'passthrough'` | Validate, invoke `onRawSchemaValidationFailure`, and continue with the original payload. |
| `false` | Skip covered raw-response validation entirely. |

`'passthrough'` helps applications remain observable while Trade Republic's
private API changes. It does not make an incompatible response safe; downstream
normalization can still fail if the payload changes substantially.

## Sessions and multiple accounts

`FileSessionStore` is intended for local use. Its file contains authentication
material and the structured Trade Republic device profile, including the
`stableDeviceId`, languages, processor count, and device memory. The client
derives `x-tr-device-info` from `session.deviceInfo`. The file is not encrypted.
Do not commit or share it.

For a server or multi-user application, implement `SessionStore` using the
application's existing persistence layer. One stored JSON value per user is
enough:

```ts
import {
  TradeRepublicClient,
  type Session,
  type SessionStore,
} from 'handelsrepublik';

type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

declare const redis: RedisLike;

class RedisSessionStore implements SessionStore {
  constructor(
    private readonly redis: RedisLike,
    private readonly key: string,
  ) {}

  async load(): Promise<Session | undefined> {
    const value = await this.redis.get(this.key);
    return value ? JSON.parse(value) as Session : undefined;
  }

  async save(session: Session): Promise<void> {
    await this.redis.set(this.key, JSON.stringify(session));
  }

  async clear(): Promise<void> {
    await this.redis.del(this.key);
  }
}

const tr = TradeRepublicClient.create({
  sessionStore: new RedisSessionStore(
    redis,
    'handelsrepublik:sessions:alice',
  ),
  rawSchemaValidation: 'passthrough',
});
```

Use one `TradeRepublicClient`, one session store, and one WAF/browser context per
Trade Republic account. Do not share a client between users. Login and refresh
save finalized sessions automatically; `auth.saveSession()` is available when
the application explicitly needs to persist the client's current session.

Cookie expiry does not necessarily mean the complete account session expired.
For example, `tr_claims` can expire while `tr_session` remains usable. Restore
the stored session, call `auth.refreshSession()`, and fall back to a new login
only when Trade Republic rejects the session.

## Connection lifecycle

Mapper reads share one websocket by default. Replayable read subscriptions
reconnect after an unexpected outage. Applications can observe loss and recovery
to update their UI or start an application-owned refetch:

```ts
import { TradeRepublicClient } from 'handelsrepublik';

const tr = TradeRepublicClient.create({
  websocketReconnectDelayMs: 250,
  websocketHandshakeTimeoutMs: 10_000,

  onWebSocketDisconnect(event) {
    console.warn(`Disconnected at ${event.disconnectedAt}; reconnecting...`);
  },

  onWebSocketReconnect(event) {
    console.log(`Reconnected after ${event.downtimeMs} ms`);
    // Optionally refetch application state here.
  },
});
```

These callbacks are observational:

- They do not delay, approve, or control reconnection.
- Callback failures are isolated from the transport.
- Disconnect fires once when an unexpected outage begins; reconnect fires once
  after a later mapper handshake succeeds.
- Expected closes, including `tr.close()`, do not emit an outage pair.
- A failed reconnect is retried while the outage remains active.

Initial connection failures and stalled handshakes reject pending requests. The
legacy connection-per-subscription behavior remains available for protocol
troubleshooting with `websocketMode: 'isolated'`.

Reconnecting the transport does not reconcile or replay a mutation that may
already have reached the broker.

## Trading safely

Order submission and cancellation are real financial mutations. Obtain a fresh
quote and fee preview, show the exact order to the user, and require a separate
user confirmation before calling `submit()`.

```ts
const instrumentId = 'US0378331005';

const destinations = await tr.trading.orderDestinations(instrumentId, {
  productContext: 'stock',
});
const exchangeId = destinations[0]?.id;
if (!exchangeId) throw new Error('No order destination is available.');
if (!destinations[0]?.orderModes?.includes('market')) {
  throw new Error('The selected venue does not support market orders.');
}

const quote = await tr.trading.priceForOrder({
  instrumentId,
  exchangeId,
  side: 'buy',
});
const lastClientPrice = quote.ask ?? quote.price;
if (lastClientPrice === undefined) {
  throw new Error('No current price is available.');
}

const preview = await tr.orders.preview({
  instrumentId,
  exchangeId,
  side: 'buy',
  mode: 'market',
  amount: 25,
  lastClientPrice,
});

console.log({
  fees: preview.fees,
  totalFees: preview.totalFees,
  estimatedTotal: preview.estimatedTotal,
  order: preview.order,
});

// This sends a real order. Call it only after explicit user confirmation.
const result = await tr.orders.submit(preview.order);

switch (result.status) {
  case 'succeeded':
    console.log('Broker accepted the order', result.orderId);
    break;
  case 'failed':
    console.error('Broker rejected the order', result.error);
    break;
  case 'outcomeUnknown':
    console.error('Do not resubmit automatically', {
      clientProcessId: result.clientProcessId,
      reason: result.outcomeReason,
      connectionLoss: result.connectionLoss,
    });
    break;
}
```

Use `size` instead of `amount` for a quantity order. Limit orders require
`mode: 'limit'` and `limit`; stop-market orders require `mode: 'stopMarket'` and
`stop`. Amount orders derive the venue's size step where possible. Pass
`sizeStep` explicitly when the instrument payload does not expose enough
metadata.

Order validity can be expressed through broker-facing presets:

```ts
await tr.orders.prepare({
  instrumentId,
  exchangeId,
  side: 'sell',
  mode: 'stopMarket',
  size: 3,
  stop: 0.8,
  validity: 'month',
});
```

`day` maps to `gfd`, `month` and `year` map to dated `gtd` expiries 30
and 365 days from the reference date, and `goodTillCancelled` maps to `gtc`.
Protocol-shaped `expiry` remains available when the exact broker expiry is
already known. Do not provide both fields, and inspect the destination's
`orderModes` and `orderExpiries` first.

See
[`docs/brokerage-orders-and-candles.md`](docs/brokerage-orders-and-candles.md)
for captured limit, stop-market, fee-preview, cancellation, venue, suitability,
and candle contracts.

### Submission outcomes

| Status | Meaning | Application action |
| --- | --- | --- |
| `succeeded` | The broker accepted or created the order. This does not mean it was filled. | Track the order and later execution lifecycle. |
| `failed` | The broker returned a definitive failure. | Show the rejection and require a new user decision before another submission. |
| `outcomeUnknown` | The mutation was sent, but disconnect, timeout, session refresh, client close, or another transport termination prevented a definitive result. | Never retry blindly. Reconcile broker state first. |

Sent mutations are non-replayable. If the connection drops, the SDK reconnects
for future work and replayable reads but does not send the mutation again.

Only a thrown `MapperRequestError` with `deliveryState: 'notSent'` proves that
the mapper transport did not accept the mutation bytes. Do not infer a safe
retry from an arbitrary exception. High-level sent transport failures are
normally returned as `outcomeUnknown` together with the order's
`clientProcessId`, observed updates, reason, and connection-loss context.

Cancellation follows the same delivery-aware contract:

```ts
const cancellation = await tr.orders.cancel('broker-order-id');
if (cancellation.status === 'outcomeUnknown') {
  // Refetch the order before attempting another cancellation.
  console.error(cancellation.outcomeReason);
}
```

### Reconciliation after an unknown outcome

After reconnect, the application can inspect current and historical broker data:

```ts
const [allOrders, openOrders, closedOrders, trades] = await Promise.all([
  tr.orders.all({ limit: 100 }),
  tr.orders.open(),
  tr.orders.closed(),
  tr.trading.trades({ page: 1 }),
]);
```

The SDK intentionally does not choose a matching or reconciliation policy for
the application. The normalized `Order` currently does not guarantee a
`clientProcessId`, and identical orders can coexist. Instrument, side, size, and
time similarity alone are therefore not definitive proof that an unknown
submission succeeded.

### `confirmationNeeded`

`confirmationNeeded` is an observed Trade Republic mapper status, but its exact
live payload and continuation contract have not been captured and verified in
this repository. Trade Republic documents that first-time trading in certain
complex ETFs, derivatives, and bonds can require a product-knowledge assessment,
and that insufficient knowledge or experience can produce a warning that must
be acknowledged before continuing: [How can I place an
order?](https://support.traderepublic.com/en-sk/775-How-can-I-place-an-order).

The observed web client sends warning identifiers in `warningsShown`, so a
product-suitability warning is the strongest known candidate for this status.
That relationship remains an inference, not a verified protocol contract.

The current SDK records `confirmationNeeded` in the submission's `updates` and
continues waiting for `succeeded` or `failed`. If no definitive update arrives,
the call can eventually return `outcomeUnknown`. The SDK does not currently
expose a suitability questionnaire, a typed `actionRequired` result, or a public
order-confirmation method. Do not fabricate warning identifiers or assume that
a legacy `confirmOrder` resource is the correct continuation.

## Durability and order journals

The package does not currently export an `OrderJournal` class, accept an
`orderJournal` client option, provide a built-in file journal, or perform restart
recovery. Trading remains fully available without a journal, but the SDK cannot
recover application intent after the process exits.

Applications that require durability can implement a write-ahead journal around
the current API:

1. Call `orders.prepare()` to obtain a stable `clientProcessId` and normalized
   `PreparedOrder`.
2. Commit an `intentRecorded` event to durable storage before calling
   `orders.submit(preparedOrder)`.
3. If the intent write fails, do not submit the order.
4. Append the returned `succeeded`, `failed`, or `outcomeUnknown` result without
   modifying the original intent event.
5. If result persistence fails, preserve the result for operational recovery;
   do not turn a known broker result into an automatic resubmission.
6. On restart, find intents without a terminal event and reconcile them against
   broker orders, updates, and trades.

A database-backed event table should contain at least:

| Column | Purpose |
| --- | --- |
| `event_id` | Globally unique event identifier used for idempotent appends. |
| `client_process_id` | Correlates every local event for one submission intent. |
| `event_type` | For example `intentRecorded`, `succeeded`, `failed`, `outcomeUnknown`, or `reconciled`. |
| `occurred_at` | Application timestamp used for ordering and operations. |
| `payload` | The prepared order, SDK result, error summary, or reconciliation evidence as JSON. |

Use an append-only table, commit the intent transaction before network
submission, enforce unique event IDs, and define ordering and concurrency
semantics for multiple workers. A file-only implementation needs equivalent
durability, locking, atomic append, corruption handling, and privacy guarantees.

This is an application-owned pattern, not a currently implemented SDK contract.
The README will document a subclassable SDK journal and complete file/database
examples only after that class, its client option, and recovery semantics exist
in the public package. The current design discussion is recorded in
[`docs/adr/0001-optional-order-journal-durability.md`](docs/adr/0001-optional-order-journal-durability.md).

## API namespaces

Prefer the domain namespaces and use `raw` or `web` only when a private resource
does not yet have a first-class SDK method.

| Namespace | Representative operations |
| --- | --- |
| `tr.auth` | Create and poll login challenges; restore, refresh, save, and clear sessions. |
| `tr.account` | Current account, web session, settings, personal details, relationships, and cards. |
| `tr.boards` | List and load trading boards. |
| `tr.assets` | Search, list, and load stocks, ETFs, funds, crypto, bonds, and other instruments. |
| `tr.derivatives` | Search derivatives, list products for an underlying, and load details. |
| `tr.portfolio` | Portfolio, cash, mark-to-market value, savings plans, private-market positions, and chart data. |
| `tr.orders` | List, filter, preview, prepare, submit, cancel, and stream order updates. |
| `tr.trading` | Order prices, available size, destinations, trades, and daily PnL. |
| `tr.market` | Quotes, candles, live feeds, subscriptions, and L2 order books. |
| `tr.timeline` | Timeline entries, actions, and details. |
| `tr.priceAlarms` | List, create, and cancel price alarms. |
| `tr.instruments` | News and ETF, fund, crypto, composition, and yield details. |
| `tr.discovery` | Exchanges, schedules, instrument status, watchlists, screeners, and preferences. |
| `tr.documents` | Account documents. |
| `tr.tax` | Tax information, exemption orders, and tax residencies. |
| `tr.payments` | Payment methods, IBAN, and interest details. |
| `tr.raw` | Low-level REST and mapper access using the SDK transport. |
| `tr.web` | Debugging-oriented REST and mapper convenience methods. |

Methods that need a securities account number resolve it from the active session
or account profile unless the method accepts and receives an explicit value.

Normalized results keep their original private-API payload in `raw`:

```ts
const position = (await tr.portfolio.current()).positions[0];
console.log(position?.id, position?.value, position?.raw);
```

Some account-specific or unstable methods intentionally return `unknown`. Use
the corresponding `rawX` method when you need the untouched response.

## Market data and streams

```ts
const candles = await tr.market.candles({
  assetId: 'US0378331005',
  exchangeId: 'LSX',
  timeframe: '10m',
  range: '5d',
});

const series = await tr.market.candleSeries({
  assetId: 'US0378331005',
  exchangeId: 'LSX',
  timeframe: '1d',
  range: '6m',
});

// Fetches this instrument's metadata and mirrors Trade Republic's chart
// capability rule for its type (stock, derivative, crypto, bond, ...).
const availableResolutions = await tr.market.availableCandleResolutions({
  assetId: 'US0378331005',
});

console.log(series.resolutionMs, availableResolutions, candles);

const feed = tr.market.liveFeed('US0378331005', {
  exchangeId: 'LSX',
});

try {
  for await (const event of feed) {
    console.log(event.type, event.raw);
  }
} finally {
  feed.close();
}
```

Order updates are also a stream:

```ts
const secAccNo = tr.securitiesAccountNumber;
if (!secAccNo) throw new Error('No securities account number is available.');

const updates = tr.orders.orderUpdates(secAccNo);
try {
  for await (const update of updates) {
    console.log(update);
  }
} finally {
  updates.close();
}
```

## Raw APIs and schema drift

Raw mapper query:

```ts
const availableCash = await tr.raw.query({ type: 'availableCash' });
```

Raw mapper stream:

```ts
const ticker = tr.raw.subscribe('tickerV3', {
  isin: 'US0378331005',
  exchangeId: 'LSX',
  unit: 'EUR',
});

try {
  for await (const event of ticker) {
    console.log(event);
  }
} finally {
  ticker.close();
}
```

Raw REST and debugging APIs:

```ts
const account = await tr.raw.request({
  path: '/api/v2/auth/account',
});

const detailed = await tr.web.requestDetailed(
  'GET',
  '/api/v2/auth/account',
);
```

Known SDK mutations are centrally classified as non-replayable. When exploring
a new mutation through `raw` or `web`, classify it explicitly:

```ts
const result = await tr.raw.query(
  {
    type: 'newBrokerMutation',
    parameters: { /* observed parameters */ },
  },
  { operation: 'mutation' },
);
```

This prevents replay after a disconnect. It does not make an unknown private
mutation safe. Validate its broker semantics, response states, and recovery path
before exposing it to application users.

Covered raw responses are validated against the schemas in
`src/schemas/registry.ts`; the generated catalog is in [`SCHEMAS.md`](SCHEMAS.md).
Private payloads can still contain undocumented fields or change without notice.

## Advanced client configuration

The client generates one device profile per new client and persists it with the
session. The fingerprint is random, while CPU count, memory, operating system,
OS release, and timezone come from the Node runtime. Browser defaults use the
current Firefox profile. Override any device value directly when needed:

```js
import { TradeRepublicClient } from 'handelsrepublik';

const tr = TradeRepublicClient.create({
  deviceInfo: {
    stableDeviceId: 'your-fingerprint',
    browser: 'Firefox',
    browserVersion: '152.0.6',
    preferredLanguages: ['de-DE', 'de', 'en-US', 'en'],
    numberOfCores: 8,
    deviceMemory: 16,
  },
});
```

Older SDK surfaces also support endpoint overrides:

```ts
import { TradeRepublicClient } from 'handelsrepublik';

const tr = TradeRepublicClient.create({
  endpoints: {
    'orders.all': '/web-trading-gateway/api/customer/v1/orders',
  },
});
```

## Demo applications

The repository includes an interactive Node REPL and a terminal UI:

```bash
npm install
npm run demo:repl
npm run demo:tui
```

The demos store local authentication state under `demo/`. Do not commit the
session or configuration files they create.

## Security and privacy

- Keep session stores, WAF data, cookies, QR payloads, downloaded documents,
  account responses, and captures outside version control.
- Redact secrets before logging errors or raw payloads.
- Use separate encrypted storage and access control for each account.
- Call `tr.close()` when disposing a long-lived client.
- Never place, cancel, or repeat an order from an unattended test.
- Treat `outcomeUnknown` as a business state requiring investigation.
- Do not use this SDK as a broker compliance or suitability layer.

## Development and verification

```bash
npm install
npm run typecheck
npm test
npm run build
```

Keep `dist` committed because GitHub consumers install the compiled package
without running the TypeScript build.

The SDK is a modular monolith. `ClientRuntime` owns shared transport,
schema-validation, and securities-account resolution dependencies. Declarative
REST and mapper calls live in `src/operation-specs.ts` and run through
`OperationClient`; domain adapters live under `src/domains/`. Authentication,
order preparation, submission, and cancellation remain explicit workflows.
`MapperConnection` owns multiplexing and reconnect behavior.

Unit tests use mocked HTTP and websocket transports. Live integration tests are
opt-in, reuse a saved demo session, and must remain free of order submissions,
order cancellations, money movement, document acceptance, and account-security
mutations:

```powershell
$env:TR_INTEGRATION = '1'
$env:TR_SESSION_FILE = './demo/.demo-session.json'
npm run test:integration
```

The live suite may use disposable low-risk price-alarm and watchlist mutations
with cleanup. High-risk trading paths remain mocked-only.

GitHub Actions runs `npm test`, `npm run typecheck`, and `npm run build` on every
push and when the workflows are started manually. A separate account integration
workflow has no push or pull-request trigger. It runs `npm run test:integration`
only on `main`, only for the repository owner, and only after its unit-test gate
passes. It runs at 08:15 and 20:15 Europe/Berlin each day to refresh the account
session, and the repository owner can also start it manually. Those times keep
the scheduled AAPL/LSX L2 test inside 07:00-23:00 German time even when GitHub
starts the workflow up to an hour late.

The live suite fails on endpoint errors, but skips the unsupported rename and
clone operations for Trade Republic's built-in default watchlist. It never
submits, changes, cancels, or intentionally fails an order. Its only writes are
disposable low-risk price-alarm and watchlist probes with cleanup.

When the GitHub Environment session expires, renew it from a maintainer machine:

```powershell
npm run ci:reauth
```

The command verifies the local GitHub CLI login, opens a browser briefly to
collect the matching Trade Republic web/WAF context, renders a QR code in the
terminal, and waits for approval in the Trade Republic app. Short-lived QR
challenges are replaced automatically until approval or the overall timeout. It
then updates the `TR_SESSION_JSON` secret in the protected
`trade-republic-tests` Environment, dispatches `live-integration.yml` on `main`, and watches
the new workflow run. The new session is held in memory and is not written to
the repository.

Use `npm run ci:reauth -- --no-watch` to return after dispatching, or
`npm run ci:reauth -- --help` to see repository, Environment, workflow, branch,
timeout, and diagnostic overrides.
