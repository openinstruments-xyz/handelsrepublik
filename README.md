# handelsrepublik

Unofficial TypeScript SDK for the Trade Republic web API.

This package is not affiliated with Trade Republic. It is based on observed web
app traffic and can break when Trade Republic changes private endpoints,
cookies, headers, mapper resource names, or response payloads.

Treat sessions, cookies, QR challenges, account payloads, documents, tax data, order data, and raw mapper
responses as private secrets.

Trade Republic market data may be subject to contractual restrictions. Check
the applicable market data terms before reusing or redistributing retrieved
data: [Sonderbedingungen fuer Marktdaten und vorvertragliche Informationen
(PDF)](https://assets.traderepublic.com/assets/files/CA_DE-de.pdf).

## Features

- QR-code web login with session persistence.
- Automatic web-session refresh helpers.
- REST and mapper-websocket transport behind one SDK client.
- Typed convenience namespaces for portfolio, orders, market data, timeline,
  instruments, price alarms, discovery, account, documents, tax, and payments.
- Configurable Zod validation of covered raw Trade Republic responses before SDK
  normalization.
- Demo Node REPL for interactive local exploration.
- Raw escape hatches for unmapped private API resources.
- Fee previews plus explicitly invoked brokerage order submission and cancellation.

## Install

```bash
npm install github:VIEWVIEWVIEW/handelsrepublik
```

This package is ESM-only.

To connect to TR you will need a WAF token. This project can capture the WAF token for you via Playwright. Unless you provide that functionality yourself, please install playwright like this:
```bash
npm install playwright
npx playwright install chromium
```

## Quick Start

```ts
import { chromium } from 'playwright';
import {
  collectTradeRepublicWebContext,
  FileSessionStore,
  TradeRepublicClient,
} from 'handelsrepublik';

// Trade Republic can require an AWS WAF browser challenge before QR login.
// A real Playwright browser lets that challenge complete and gives the SDK the
// matching WAF token, XSRF token, and cookies for later HTTP requests.
const browser = await chromium.launch({ headless: false });
const webContext = await collectTradeRepublicWebContext(browser);
await browser.close();

const tr = TradeRepublicClient.create({
  // Reused automatically for QR login, refresh, and normal SDK calls.
  webContext,
  // Contains cookies, WAF context, mapper tokens, and account metadata.
  sessionStore: new FileSessionStore('.tr-session.json'),
  // rawSchemaValidation options:
  // - true or 'throw': validate covered raw payloads and throw on drift.
  // - 'passthrough': validate and report drift, but continue with the payload.
  // - false: skip covered raw response validation entirely.
  rawSchemaValidation: 'passthrough',
  onRawSchemaValidationFailure: ({ schemaName, error }) => {
    console.warn(`Trade Republic schema drift in ${schemaName}`, error);
  },
});

const challenge = await tr.auth.createInstantLogin({
  deviceName: 'local sdk',
});

console.log(challenge.qrCodeDataUrl ?? challenge.deepLink ?? challenge.qrCode);

// Approve the QR/deep link in the Trade Republic app, then polling completes
// the web session and saves the refreshed cookies/tokens.
const session = await tr.auth.pollInstantLogin(challenge);
console.log(session.securitiesAccountNumber);

// Later, restore the saved session, refresh it, and save the updated cookies.
await tr.auth.restoreSession();
const refreshed = await tr.auth.refreshSession();
// Persists the refreshed cookies/tokens back into the configured SessionStore.
await tr.auth.saveSession(refreshed);
```

The client saves cookies, WAF context, mapper tokens, and the securities account
number in the configured `SessionStore`. Treat that file as a secret.

`FileSessionStore` is only the built-in local option. For a server process or a
multi-user app, implement `SessionStore` yourself and persist the JSON session
wherever you keep user state. A Redis-backed store only needs to load, save, and
clear one session value under a per-user key:

```ts
import { TradeRepublicClient, type Session, type SessionStore } from 'handelsrepublik';

type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

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
    // Store this under a per-user key, for example:
    // handelsrepublik:sessions:<user-id>
    await this.redis.set(this.key, JSON.stringify(session));
  }

  async clear(): Promise<void> {
    await this.redis.del(this.key);
  }
}

const tr = TradeRepublicClient.create({
  sessionStore: new RedisSessionStore(redis, 'handelsrepublik:sessions:alice'),
});
```

The SDK sends the currently observed Trade Republic web headers
`x-tr-app-version`, `x-tr-platform`, and `x-tr-device-info` by default. You can
override any of them when Trade Republic changes the web client or when you
need a custom device profile:

```ts
const tr = TradeRepublicClient.create({
  defaultHeaders: {
    'x-tr-app-version': '15.101.0',
    'x-tr-platform': 'web-pro',
    'x-tr-device-info': 'your-base64-device-info',
  },
});
```

`rawSchemaValidation` is configurable and you probably should choose a mode
explicitly. The default is strict and throws on covered payload drift.
`'passthrough'` still validates and reports drift, but lets methods return the
original payload to the SDK so local tools keep working while the private API
changes. Use `false` only when you want to skip raw response validation
entirely.

## Restore and Refresh

```ts
await tr.auth.restoreSession();

const refreshed = await tr.auth.refreshSession();
await tr.auth.saveSession(refreshed);
```

The current refresh implementation calls the Trade Republic web session endpoint
and saves the updated session/cookies. Cookie expiry is not the same as full
account-session expiry. For example, `tr_claims` can expire while `tr_session`
still works.

## Client Overview

Most users should start with the typed namespaces and only use `raw` when a
Trade Republic resource is not mapped yet.

- `tr.auth`: login, restore, refresh, save, clear.
- `tr.account`: account/session and account profile REST calls.
- `tr.portfolio`: portfolio, cash, savings plans, portfolio chart.
- `tr.orders`: web-trading order lists and order update stream.
- `tr.assets`: search and instrument lookup.
- `tr.derivatives`: derivative search and detail lookup.
- `tr.market`: candles, live quotes, L2 order book, market subscriptions.
- `tr.timeline`: timeline activity, actions, and detail.
- `tr.priceAlarms`: price alarm reads and notifications.
- `tr.instruments`: news, ETF/fund/crypto details, composition, yield.
- `tr.trading`: price-for-order, available size, destinations, trades, daily PnL.
- `tr.discovery`: exchanges, instrument status, watchlists, screeners, preferences.
- `tr.documents`: document list.
- `tr.tax`: tax information, exemption order, residencies.
- `tr.payments`: payment methods, IBAN, interest details.
- `tr.raw`: escape hatch for unmapped REST and mapper/websocket resources.
- `tr.web`: debugging escape hatch for arbitrary REST/mapper calls.

Mapper subscriptions are multiplexed over one websocket per client while they
are active. Replayable read subscriptions reconnect after an unexpected close,
and the connection refreshes its headers when the client session changes.
Observe connection loss and recovery without taking control of the transport:

```ts
const tr = TradeRepublicClient.create({
  websocketReconnectDelayMs: 250,
  onWebSocketDisconnect(event) {
    showConnectionBanner(`Disconnected at ${event.disconnectedAt}; reconnecting...`);
  },
  onWebSocketReconnect(event) {
    hideConnectionBanner();
    console.log(`Reconnected after ${event.downtimeMs} ms`);
    // Optional: start application-owned refetching here.
  },
});
```

The callbacks are observational: they do not delay or control reconnection, and
callback failures are isolated from the transport. They fire only for an
unexpected outage and the subsequent successful mapper handshake. Call
`tr.close()` when disposing a long-lived client.

For protocol troubleshooting, the previous connection-per-subscription behavior
remains available with `websocketMode: 'isolated'`.

### Asset Search Types

Trade Republic's internal `neonSearch` terminology differs from the labels
shown in its UI: ETFs use the mapper type `fund`, while mutual funds use
`mutualFund`. The SDK accepts the clearer `etf` alias and translates it to
`fund` before sending the request:

```ts
const etfs = await tr.assets.search('msci', { type: 'etf' });
// Sent to Trade Republic as type: 'fund'.

const mutualFunds = await tr.assets.search('income', { type: 'mutualFund' });
// Sent to Trade Republic as type: 'mutualFund'.
```

When using `tr.raw` directly, use Trade Republic's internal `fund` value for
ETFs instead of the SDK alias.

## Schema Validation

Covered first-class SDK methods validate the raw Trade Republic payload with
Zod before normalization. This is intentional: if Trade Republic adds an
unknown field to a strict variant or changes a payload shape, the SDK throws
`TradeRepublicSchemaError` with the schema name, Zod issues, and a compact raw
summary. That makes API drift visible while debugging instead of silently
normalizing the wrong shape.

If Trade Republic changes a payload before this package is updated, configure
validation per client:

```ts
// Default: validate and throw TradeRepublicSchemaError on mismatch.
const strict = TradeRepublicClient.create({
  rawSchemaValidation: true,
});

// Validate with Zod, report mismatches, but continue with the raw payload.
const passthrough = TradeRepublicClient.create({
  rawSchemaValidation: 'passthrough',
  onRawSchemaValidationFailure: ({ schemaName, error }) => {
    console.warn(`Schema validation failed for ${schemaName}`, error);
  },
});

// Skip raw schema validation entirely.
const disabled = TradeRepublicClient.create({
  rawSchemaValidation: false,
});
```

With `rawSchemaValidation: 'passthrough'`, first-class SDK methods still run
Zod validation but continue with the original payload on mismatch instead of
throwing. With `rawSchemaValidation: false`, they skip the Zod raw response
check entirely. Both modes are useful for local debugging during API drift, but
they can also hide incompatible response changes and make normalized output less
trustworthy.

The schema registry lives in `src/schemas/registry.ts` and records transport,
risk class, request metadata, request schema, response schema, known variants,
and live-test metadata. `SCHEMAS.md` is generated output, not the source of
truth. Regenerate it with:

```bash
npm run schemas:doc
```

That command runs `scripts/generate-schema-catalog.ts`, which imports
`schemaCatalogMarkdown()` from `src/schemas/registry.ts` and writes the result
to `SCHEMAS.md`.

See [SCHEMAS.md](./SCHEMAS.md) for the generated list. `blockedMutation`
entries are deliberately documented so tests can assert that high-risk flows are
not executed against a live account.

## How The API Works

Trade Republic's web app uses both normal REST endpoints and websocket-backed
resources. The SDK hides that split behind typed methods where possible:

```ts
const account = await tr.account.current();
const cash = await tr.portfolio.cash();
const candles = await tr.market.candles({
  assetId: 'US0378331005',
  exchangeId: 'LSX',
  timeframe: '1h',
  from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
});
```

Trade Republic internally calls part of its websocket-backed routing layer
`MAPPER`; that word shows up in some error payloads. In this README, a mapper
resource means a websocket request identified by a `type` value such as
`availableCash`, `ticker`, or `aggregateHistoryLightV2`.

You usually do not need to care whether a high-level SDK method uses REST or
mapper/websocket internally. Use `raw` only as an escape hatch while debugging
or adding support for a resource that does not have a first-class method yet.

## Demo REPL

Start:

```bash
npm i
npm run demo:repl
```

The REPL builds the SDK, restores `demo/.demo-session.json` when present, prints
`help()`, and exposes `client` plus convenience functions.

For the widget-based TUI demo, run `npm run demo:tui`.

Common commands:

```js
await loginQr()
session()
await refresh()
await cash()
await portfolio()
await orders()
await timeline()
await priceAlarms()
await news()
await candles()
const sub = quotes()
sub.close()
```

The REPL accepts optional web context from `demo/.demo-config.json` or
environment variables:

```bash
TR_AWS_WAF_TOKEN=...
TR_XSRF_TOKEN=...
TR_COOKIE=...
TR_APP_VERSION=...
TR_PLATFORM=...
TR_DEVICE_INFO=...
TR_ACCEPT_LANGUAGE=...
TR_SESSION_FILE=...
TR_CONFIG_FILE=...
TR_WEBSOCKET_MODE=shared              # shared (default) or isolated
TR_WEBSOCKET_RECONNECT_MS=250
TR_RAW_SCHEMA_VALIDATION=passthrough  # passthrough (default), strict, or false
```

Both interactive demos use the shared mapper connection by default, reconnect
active streams after session refreshes, report schema drift without immediately
terminating the UI, and close the SDK client on exit.

The demo tooling still accepts copied context through `demo/.demo-config.json`
or the `TR_AWS_WAF_TOKEN`, `TR_XSRF_TOKEN`, and `TR_COOKIE` environment
variables. Run `authContext()` inside the REPL to inspect loaded context.

## Portfolio and Account

```ts
const account = await tr.account.current();
const profile = await tr.account.personalDetails();

const cash = await tr.portfolio.cash();
const portfolio = await tr.portfolio.current({ timeoutMs: 60_000 });
const savingsPlans = await tr.portfolio.savingsPlans();
const privateMarkets = await tr.portfolio.privateMarketsPositions();
const chart = await tr.portfolio.portfolioChart(undefined, '1y', {
  currency: 'EUR',
});
```

Methods that need a securities account number resolve it automatically from
`accountPairs` unless you pass one explicitly.

## Orders and Trading Support

```ts
const all = await tr.orders.all({ limit: 100 });
const open = await tr.orders.open();
const closed = await tr.orders.closed();
const mutualFunds = await tr.orders.mutualFunds();
const privateMarkets = await tr.orders.privateMarkets();

const destinations = await tr.trading.orderDestinations('US0378331005', {
  jurisdiction: 'DE',
  side: 'BUY',
});

const quote = await tr.market.quote('US0378331005', 'LSX');

const available = await tr.trading.availableSize('US0378331005');
const trades = await tr.trading.trades({ page: 1 });
const pnl = await tr.trading.dailyPnl([{ instrumentId: 'US0378331005' }]);
```

Order submission is a high-risk operation. Always obtain a fresh price and fee
preview, show the exact order to the user, and require a separate confirmation
before calling `submit()`:

```ts
const preview = await tr.orders.preview({
  instrumentId: 'US0378331005',
  exchangeId: destinations[0]!.id,
  side: 'buy',
  mode: 'market',
  amount: 25,
  lastClientPrice: 202.15,
});

console.log(preview.totalFees, preview.estimatedTotal, preview.order);

// This sends a real order. Do not call it as part of an unattended test.
const submitted = await tr.orders.submit(preview.order);
console.log(submitted.status, submitted.orderId);

if (submitted.status === 'outcomeUnknown') {
  // The mutation may have reached the broker. Never retry it blindly.
  console.error(submitted.clientProcessId, submitted.connectionLoss);
}

// Cancellation is also a live mutation.
if (submitted.orderId) await tr.orders.cancel(submitted.orderId);
```

Use `size` instead of `amount` for an asset-quantity order. Limit orders require
`mode: 'limit'` and `limit`; stop-market orders require `mode: 'stopMarket'` and
`stop`. Amount orders derive and round the asset size to the selected venue's
step size; pass `sizeStep` only when the instrument response does not expose
enough metadata for automatic detection. `submit()` follows the mapper stream
through `received`, `waiting`, and `confirmationNeeded` until Trade Republic
returns `succeeded` or `failed`.

Order submission and cancellation subscriptions are never replayed after a
disconnect. If the socket drops after the mutation was sent, or submission
times out without a terminal response, the method returns `outcomeUnknown`
with its `clientProcessId`, `outcomeReason`, and any connection-loss context.
The SDK reconnects the transport but does not automatically refetch or reconcile
the order. After `onWebSocketReconnect`, the application may inspect
`orders.all()`, `orders.open()`, `orders.closed()`, order updates, or trades and
update its own UI or persistence.

Order updates are a stream:

```ts
const updates = tr.orders.orderUpdates(tr.securitiesAccountNumber!);

for await (const update of updates) {
  console.log(update);
}

updates.close();
```

## Market Data

```ts
const candles = await tr.market.candles({
  assetId: 'US0378331005',
  exchangeId: 'LSX',
  timeframe: '1h',
  from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
});

const fullRange = await tr.market.candleQuery({
  assetId: 'US0378331005',
  exchangeId: 'LSX',
  timeframe: '1h',
  from: '2026-06-01T00:00:00.000Z',
  to: '2026-07-01T00:00:00.000Z',
}).download({ maxCandlesPerRequest: 500 });
```

Live quotes:

```ts
const live = tr.market.subscribeLiveFeed({
  assetId: 'US0378331005',
  exchangeId: 'LSX',
});

for await (const quote of live) {
  console.log(quote);
}

live.close();
```

L2 order book:

```ts
const venues = await tr.market.availableL2Books('US0378331005');

const book = tr.market.subscribeL2OrderBook({
  assetId: 'US0378331005',
  exchangeId: venues[0].exchangeId,
  depth: 10,
  throttleMs: 250,
});

for await (const snapshot of book) {
  console.log(snapshot.bids, snapshot.asks);
}

book.close();
```

## Timeline and Price Alarms

```ts
const items = await tr.timeline.list();
const nextPage = await tr.timeline.list({ after: 'cursor-or-id' });
const actions = await tr.timeline.actions();
const detail = await tr.timeline.detail(items[0].id);

const alarms = await tr.priceAlarms.list();
const notifications = await tr.priceAlarms.notifications();
```

## Instruments

```ts
const news = await tr.instruments.news('US0378331005');
const etf = await tr.instruments.etfDetails('ETF_ISIN_OR_ID');
const etfComposition = await tr.instruments.etfComposition('ETF_ISIN_OR_ID');
const fund = await tr.instruments.fundDetails('FUND_ISIN_OR_ID');
const fundComposition = await tr.instruments.fundComposition('FUND_ISIN_OR_ID');
const crypto = await tr.instruments.cryptoDetails('CRYPTO_ID');
const ytm = await tr.instruments.yieldToMaturity('BOND_ISIN_OR_ID');
```

## Discovery, Documents, Tax, and Payments

```ts
const exchanges = await tr.discovery.exchangeDetails();
const schedule = await tr.discovery.exchangeSchedule('LSX');
const status = await tr.discovery.instrumentStatus('US0378331005', 'LSX');
const watchlists = await tr.discovery.watchlists();
const screeners = await tr.discovery.screeners();
const screenerOptions = await tr.discovery.screenerOptions();
const preferences = await tr.discovery.userPreferences();

const documents = await tr.documents.documents();

const taxInfo = await tr.tax.taxInformation();
const exemptionOrder = await tr.tax.exemptionOrder();
const residencies = await tr.tax.taxResidencies();
const countries = await tr.tax.taxResidencyCountries();

const methods = await tr.payments.paymentMethods();
const iban = await tr.payments.iban();
const interest = await tr.payments.interestDetails();
```

## Raw Escape Hatches

Use high-level namespaces first. The `raw` and `web` APIs are escape hatches for
debugging, local inspection, and mapping newly discovered Trade Republic
resources. They are not the recommended surface for normal application code.

Unmapped mapper one-shot:

```ts
const availableCash = await tr.raw.query({ type: 'availableCash' });
```

Unmapped mapper stream:

```ts
const ticker = tr.raw.subscribe('tickerV3', {
  isin: 'US0378331005',
  exchangeId: 'LSX',
  unit: 'EUR',
});

for await (const event of ticker) {
  console.log(event);
}

ticker.close();
```

REST:

```ts
const account = await tr.raw.request({
  path: '/api/v2/auth/account',
});

const custom = await tr.web.request('GET', '/api/v2/auth/account');
const mapper = await tr.web.query({ type: 'availableCash' });
```

## Types and Normalization

Stable convenience methods return typed shells and keep the original payload in
`raw`. Private API payloads can change, so do not assume that normalized fields
are exhaustive.

Example:

```ts
const alarm = (await tr.priceAlarms.list())[0];

console.log(alarm.id);
console.log(alarm.raw);
```

When an API surface is still unstable or account-specific, methods may return
`unknown` directly. Prefer raw variants such as `rawList`, `rawDetails`, or
`rawX` when you need the untouched response.

## Session Notes

The Trade Republic web session can involve several independent values:

- `tr_session` can keep the web session alive.
- `tr_claims` can be a short-lived claims snapshot and may expire before the
  whole session stops working.
- `XSRF-TOKEN` is used for HTTP request protection.
- `sessionToken` is used for mapper/websocket subscriptions.
- `webContext` stores WAF/browser headers and cookies used by HTTP requests.

Do not treat one cookie expiry as definitive proof that the full session is
dead. The safest local pattern is to call `refreshSession()` periodically and
fall back to a new QR login when the server rejects the session.

### Multiple Users

The SDK is single-user per `TradeRepublicClient`. To work with multiple
accounts, create one client, one session store, and one WAF context per user.
Do not share one client instance between users.

```ts
const users = [
  {
    id: 'alice',
    client: TradeRepublicClient.create({
      sessionStore: new FileSessionStore('.sessions/alice.json'),
      webContext: aliceWebContext,
    }),
  },
  {
    id: 'bob',
    client: TradeRepublicClient.create({
      sessionStore: new FileSessionStore('.sessions/bob.json'),
      webContext: bobWebContext,
    }),
  },
];

await Promise.allSettled(
  users.map((user) => user.client.auth.refreshSession()),
);
```

This keeps refresh and session persistence independent per user without adding a
global queue, pool, or scheduler abstraction to the SDK.

## Endpoint Overrides

Some older SDK surfaces support endpoint overrides:

```ts
const tr = TradeRepublicClient.create({
  endpoints: {
    'orders.all': '/web-trading-gateway/api/customer/v1/orders',
  },
});
```

Newer web-app features are currently implemented directly from observed REST
paths or mapper resource names.

## Web Bundle Reference

The repository keeps web-bundle inspection tooling in:

```text
references/traderepublic-web/
```

Run from this package:

```bash
npm run reference:download
```

Use that reference when mapping new Trade Republic web-app functionality.

## Security and Privacy

- Do not commit `demo/.demo-session.json`, `.demo-config.json`, cookies, QR
  challenge payloads, raw account data, downloaded documents, or MITM captures.
- Keep session files local to your machine.
- This SDK is not a broker compliance layer. Validate every trading-related
  operation carefully before using it outside local debugging.

## Verification

```bash
npm run typecheck
npm run test
npm run build
```

## Local Development

From this package directory:

```bash
npm install
npm run typecheck
npm run test
npm run build
```

The internal SDK is a modular monolith. `ClientRuntime` owns shared transport,
schema-validation, and securities-account resolution dependencies. Straightforward
REST and mapper calls are declared in `src/operation-specs.ts` and executed by
`OperationClient`; domain-facing adapters live under `src/domains/`. Stateful
flows such as authentication, order preparation, and order confirmation remain
explicit workflows instead of generated operation wrappers. `MapperConnection`
multiplexes concurrently active resource subscriptions.

Unit tests use mocked HTTP and websocket transports. Read-only live integration
tests are opt-in and reuse a real saved login session from the demo REPL:

```bash
npm run dev
# log in once with loginQr(...)

TR_INTEGRATION=1 npm run test:integration
```

By default the integration tests read `demo/.demo-session.json`. Override the
session or market-data target when needed:

```bash
TR_INTEGRATION=1 \
TR_SESSION_FILE=./demo/.demo-session.json \
TR_INTEGRATION_ISIN=US0378331005 \
TR_INTEGRATION_EXCHANGE=LSX \
TR_INTEGRATION_QUERY=apple \
TR_INTEGRATION_TYPE=stock \
npm run test:integration
```

The integration suite calls read/query/subscription flows and low-risk
developer-safe mutations only: session restore and refresh, account/portfolio
reads, search, candles, current price lookup, documents/tax/payment discovery
reads, read-only websocket payloads, and disposable low-risk price-alert and
watchlist mutation probes with cleanup when the current API shape accepts them.
Feature-gated or unavailable low-risk mutation shapes are reported as
diagnostics; auth failures and schema failures still fail. The suite does not
place/change/cancel orders, move money, accept documents, or mutate account
identity, tax, PIN, login, or security settings. Those high-risk mutation paths
stay mocked-only.

### GitHub Actions

`.github/workflows/test.yml` runs unit tests, typechecking, and the package build
on every push and once per day at 02:15 UTC. Pushes to `main` and the daily run
additionally execute the live integration suite against the protected
`trade-republic-tests` GitHub Environment. Live tests are kept off other
branches because the environment contains a real account session; this also
limits which pushed workflow definitions can access it.

Create the Environment once under **Settings -> Environments**, restrict its
deployment branches to `main`, and add these Environment secrets:

- `TR_SESSION_JSON`: the complete contents of `demo/.demo-session.json` after a
  successful local demo login.
- `TR_SECRET_ROTATION_TOKEN`: a fine-grained personal access token scoped only
  to this repository with **Environments: Read and write** permission.

The separate rotation token is required because the workflow's normal
`GITHUB_TOKEN` cannot update Actions Environment secrets. The live job writes
`TR_SESSION_JSON` to an ephemeral runner file, refreshes it through the SDK,
updates the Environment secret with the refreshed JSON, runs the non-order
integration tests, and deletes the runner file. Neither secret value is printed
or uploaded as an artifact.

With an authenticated GitHub CLI, the initial secrets can be seeded from
PowerShell without copying the session into the repository:

```powershell
Get-Content -Raw demo/.demo-session.json |
  gh secret set TR_SESSION_JSON --env trade-republic-tests --repo VIEWVIEWVIEW/handelsrepublik

$env:TR_SECRET_ROTATION_TOKEN |
  gh secret set TR_SECRET_ROTATION_TOKEN --env trade-republic-tests --repo VIEWVIEWVIEW/handelsrepublik
```

The rotation token cannot rotate itself and should be replaced manually before
it expires. If the Trade Republic account session becomes fully invalid, log in
locally again and reseed `TR_SESSION_JSON` with the first command.

Start the demo REPL:

```bash
npm run dev
```

`npm run dev` builds the SDK and starts the Node REPL demo.
