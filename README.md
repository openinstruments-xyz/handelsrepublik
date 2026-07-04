# handelsrepublik

Unofficial TypeScript SDK for the Trade Republic web API.

This package is not affiliated with Trade Republic. It is based on observed web
app traffic and can break when Trade Republic changes private endpoints,
cookies, headers, mapper resource names, or response payloads.

Use it for local automation, debugging, and research. Treat sessions, cookies,
QR challenges, account payloads, documents, tax data, order data, and raw mapper
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
- Strict Zod validation of covered raw Trade Republic responses before SDK
  normalization.
- Demo Node REPL for interactive local exploration.
- Raw escape hatches for unmapped private API resources.

## Install

```bash
npm install github:VIEWVIEWVIEW/handelsrepublik
```

This package is ESM-only.

## Authentication

The SDK stores a `Session` object with any tokens and cookies returned by the web
login flow. Depending on the current Trade Republic web behavior, a session can
contain:

- `cookies`: web cookies such as `tr_session`, `tr_claims`, and `XSRF-TOKEN`
- `sessionToken`: mapper/websocket connection token
- `accessToken` or `refreshToken` when the backend returns them
- `securitiesAccountNumber`, captured after login from `accountPairs`
- optional metadata

HTTP requests send saved cookies and relevant headers. Mapper websocket
resources send `sessionToken` in the subscription payload when available.

### QR Login

```ts
import { FileSessionStore, TradeRepublicClient } from 'handelsrepublik';

const tr = TradeRepublicClient.create({
  sessionStore: new FileSessionStore('.tr-session.json'),
});

const challenge = await tr.auth.createInstantLogin({
  phoneNumber: '+491234567890',
  deviceName: 'local sdk',
});

console.log(challenge.qrCodeDataUrl ?? challenge.deepLink ?? challenge.qrCode);

const session = await tr.auth.pollInstantLogin(challenge);
console.log(session.securitiesAccountNumber);

```

After login, the client keeps `client.securitiesAccountNumber` populated when it
can resolve it.

### Restore and Refresh

```ts
await tr.auth.restoreSession();

const refreshed = await tr.auth.refreshSession();
await tr.auth.saveSession(refreshed);
```

The current refresh implementation calls the Trade Republic web session endpoint
and saves the updated session/cookies. Cookie expiry is not the same as full
account-session expiry. For example, `tr_claims` can expire while `tr_session`
still works.

## How The API Works

Trade Republic's web app does not use one single API style. The SDK wraps the
two transport styles that show up in the web app.

### REST HTTP Endpoints

Some features are normal HTTP request/response calls with URL paths:

```http
GET /api/v2/auth/account
GET /api/v1/documents/all
GET /api-gateway/watchlists/api/v2/watchlists
```

In the SDK these are exposed as regular Promise-returning methods:

```ts
const account = await tr.account.current();
const documents = await tr.documents.documents();
const watchlists = await tr.discovery.watchlists();
```

For debugging, the same transport is available through `raw.request` or
`web.request`:

```ts
const account = await tr.raw.request({
  method: 'GET',
  path: '/api/v2/auth/account',
});
```

### Websocket Resources

Many web-app features are not called by URL. Instead, the web app opens a
websocket and sends a small JSON payload with a `type` field:

```json
{ "type": "availableCash" }
{ "type": "ticker", "id": "US0378331005.LSX" }
{ "type": "aggregateHistoryLightV2", "isin": "US0378331005", "exchangeId": "LSX", "range": "1d" }
```

The backend then routes that named resource internally and sends the result back
on the websocket. For one-shot data the SDK subscribes, waits for the first
payload, validates it, and closes the subscription. For live data it keeps the
subscription open.

In the SDK:

```ts
// One-shot websocket resource query.
const cash = await tr.raw.query({ type: 'availableCash' });

// Current-price snapshot. This is read-only.
const ticker = await tr.raw.query({
  type: 'ticker',
  id: 'US0378331005.LSX',
});

// Historical chart data.
const history = await tr.raw.query({
  type: 'aggregateHistoryLightV2',
  isin: 'US0378331005',
  exchangeId: 'LSX',
  unit: 'EUR',
  range: '1d',
});

// Live websocket resource subscription.
const stream = tr.raw.subscribe('ticker', {
  id: 'US0378331005.LSX',
});
```

Most users should prefer the typed SDK namespaces (`portfolio.cash()`,
`market.candles()`, `orders.all()`, and so on). `raw.query` and `raw.subscribe`
are mainly for debugging or mapping resources that are not first-class SDK
methods yet.

### What "Mapper" Means

The word "mapper" is Trade Republic internal wording visible in websocket error
payloads, for example:

```json
{
  "errorCode": "JSON_PARSE_ERROR",
  "meta": {
    "source": "MAPPER"
  }
}
```

It is not a public API standard. In this package, "mapper resource" means a
Trade Republic websocket resource identified by a `type` string, internally
reported by Trade Republic as `MAPPER`. User-facing code should usually think in
terms of "websocket resources":

- `REST endpoint`: URL path plus HTTP method.
- `websocket resource`: JSON payload with `type`, sent over the websocket.
- `mapper`: Trade Republic's internal routing/validation layer for many of
  those websocket resources.

Some resources are snapshots even though they use websocket transport:
`availableCash`, `portfolioStatus`, `aggregateHistoryLightV2`. Others are real
streams: `ticker`, `tickerV2`, `tickerV3`, `L2`, `orderUpdates`.

Mapper validation can be stricter than normal JSON APIs. A payload can have the
right resource name but still fail if a field name, enum value, venue, or shape
does not match what the web app currently sends. Keep `raw` payloads in logs
while mapping new resources.

## Strict Raw Schema Validation

Covered first-class SDK methods validate the raw Trade Republic payload with
Zod before normalization. This is intentional: if Trade Republic adds an
unknown field to a strict variant or changes a payload shape, the SDK throws
`TradeRepublicSchemaError` with the schema name, Zod issues, and a compact raw
summary. That makes API drift visible while debugging instead of silently
normalizing the wrong shape.

The schema registry lives in `src/schemas/registry.ts` and records transport,
risk class, request metadata, request schema, response schema, known variants,
and live-test metadata. Generate the public catalog with:

```bash
npm run schemas:doc
```

See [SCHEMAS.md](./SCHEMAS.md) for the generated list. `blockedMutation` entries
are deliberately documented so tests can assert that high-risk flows are not
executed against a live account.

## Demo REPL

Start:

```bash
npm run dev
```

The REPL builds the SDK, restores `demo/.demo-session.json` when present, prints
`help()`, and exposes `client` plus convenience functions.

Common commands:

```js
await loginQr("+491234567890")
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
TR_PHONE_NUMBER=...
```

Run `authContext()` inside the REPL to inspect loaded context.

## Client Overview

```ts
const tr = TradeRepublicClient.create({
  sessionStore: new FileSessionStore('.tr-session.json'),
});

await tr.auth.restoreSession();
```

Namespaces:

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
- `tr.raw`: raw REST and mapper websocket transport.
- `tr.web`: debugging escape hatch for arbitrary REST/mapper calls.

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
  side: 'BUY',
});

const quote = await tr.trading.priceForOrder({
  isin: 'US0378331005',
  exchangeId: 'LSX',
  side: 'BUY',
  unit: 'EUR',
});

const available = await tr.trading.availableSize('US0378331005');
const trades = await tr.trading.trades({ page: 1 });
const pnl = await tr.trading.dailyPnl([{ instrumentId: 'US0378331005' }]);
```

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

Use high-level namespaces first. For newly discovered endpoints, use `raw` or
`web` while mapping the API.

Mapper one-shot:

```ts
const availableCash = await tr.raw.query({ type: 'availableCash' });
```

Mapper stream:

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

Do not treat one cookie expiry as definitive proof that the full session is
dead. The safest local pattern is to call `refreshSession()` periodically and
fall back to a new QR login when the server rejects the session.

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

Start the demo REPL:

```bash
npm run dev
```

`npm run dev` builds the SDK and starts the Node REPL demo.
