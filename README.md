# handelsrepublik

**Workflow status**

| Workflow | Latest | Scheduled | Manual |
|---|:---:|:---:|:---:|
| [Package checks](https://github.com/openinstruments-xyz/handelsrepublik/actions/workflows/quality.yml)<br><details><summary><sub>typecheck, build, distribution</sub></summary><sub>Checks that the TypeScript source has no type errors, builds the installable package, and confirms that the committed <code>dist/</code> files exactly match a fresh build.</sub></details> | [![latest](https://handelsrepublik-ci-badges.99o.workers.dev/quality/latest.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/quality/latest/run) | — | [![manual](https://handelsrepublik-ci-badges.99o.workers.dev/quality/manual.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/quality/manual/run) |
| [Unit tests](https://github.com/openinstruments-xyz/handelsrepublik/actions/workflows/unit-tests.yml)<br><details><summary><sub>client, schemas, transports, normalizers, sessions, venues, WAF</sub></summary><sub>Runs the mocked test suite without using a live brokerage account. It checks login and session behavior, request headers, response validation, data normalization, order safety and recovery, websocket reconnection, market helpers, venue metadata, WAF-token handling, and the live-test infrastructure itself.</sub></details> | [![latest](https://handelsrepublik-ci-badges.99o.workers.dev/unit/latest.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/unit/latest/run) | — | [![manual](https://handelsrepublik-ci-badges.99o.workers.dev/unit/manual.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/unit/manual/run) |
| [Live: account and market-data reads](https://github.com/openinstruments-xyz/handelsrepublik/actions/workflows/general-read-only-validation.yml)<br><details><summary><sub>sessions, account, assets, orders, portfolio, market data, documents, taxes, payments</sub></summary><sub>Uses a live saved session to call the SDK's read-only account and market APIs. It validates current response shapes for account data, every supported asset class, derivatives, order history and previews, portfolio and cash data, candle timeframes, timeline and price-alert reads, exchanges, documents, taxes, payment methods, and IBAN data. It does not submit orders or intentionally change account data.</sub></details> | [![latest](https://handelsrepublik-ci-badges.99o.workers.dev/reads/latest.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/reads/latest/run) | [![scheduled](https://handelsrepublik-ci-badges.99o.workers.dev/reads/scheduled.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/reads/scheduled/run) | [![manual](https://handelsrepublik-ci-badges.99o.workers.dev/reads/manual.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/reads/manual/run) |
| [Live: trading availability when markets are closed](https://github.com/openinstruments-xyz/handelsrepublik/actions/workflows/validate-order-destinations-during-closed-market-hours.yml)<br><details><summary><sub>destinations, exchange schedule, instrument status, quotation</sub></summary><sub>Runs during the Berlin overnight window and checks the live venue state without placing an order. For each supported asset class it reads the available order destinations and expects ordinary exchange-traded assets not to expose an open destination. It also validates the LSX schedule, Apple's closed instrument status, and a closed-market quotation. Continuously available or differently traded classes such as crypto are allowed to remain open.</sub></details> | [![latest](https://handelsrepublik-ci-badges.99o.workers.dev/destinations/latest.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/destinations/latest/run) | [![scheduled](https://handelsrepublik-ci-badges.99o.workers.dev/destinations/scheduled.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/destinations/scheduled/run) | [![manual](https://handelsrepublik-ci-badges.99o.workers.dev/destinations/manual.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/destinations/manual/run) |
| [Live: quotes, L2, streaming {quotes, L2, tape}](https://github.com/openinstruments-xyz/handelsrepublik/actions/workflows/validate-venue-during-opening-times.yml)<br><details><summary><sub>quotes, executable prices, subscriptions, ticker, tape, L2 books</sub></summary><sub>Runs on weekdays during the Berlin market window and first requires an explicitly open Apple destination. It reads the normal quote, buy and sell price-for-order responses, market-data subscriptions and L2 entitlements, then waits for live ticker, last-trade tape, and L2 order-book events. It validates live market data but does not place an order.</sub></details> | [![latest](https://handelsrepublik-ci-badges.99o.workers.dev/venue/latest.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/venue/latest/run) | [![scheduled](https://handelsrepublik-ci-badges.99o.workers.dev/venue/scheduled.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/venue/scheduled/run) | [![manual](https://handelsrepublik-ci-badges.99o.workers.dev/venue/manual.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/venue/manual/run) |
| [Live: mutating alerts and default watchlist](https://github.com/openinstruments-xyz/handelsrepublik/actions/workflows/validate-reversible-account-mutations.yml)<br><details><summary><sub>temporary price alert and watchlist item</sub></summary><sub>Checks the SDK's low-risk account changes using disposable data. It creates a EUR 1 Apple price alert, verifies it appears, and deletes it. It also adds an instrument that is not already present to the default watchlist, verifies the addition, and removes it. Cleanup runs even when an assertion fails.</sub></details> | [![latest](https://handelsrepublik-ci-badges.99o.workers.dev/mutations/latest.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/mutations/latest/run) | [![scheduled](https://handelsrepublik-ci-badges.99o.workers.dev/mutations/scheduled.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/mutations/scheduled/run) | [![manual](https://handelsrepublik-ci-badges.99o.workers.dev/mutations/manual.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/mutations/manual/run) |
| [Live: limit order rejected while market is closed](https://github.com/openinstruments-xyz/handelsrepublik/actions/workflows/validate-closed-venue-limit-order-rejection.yml)<br><details><summary><sub>closed venue must reject a deeply priced limit order</sub></summary><sub>Runs only in the Berlin overnight window and confirms that LSX reports closed. It then tries to submit a one-share Apple limit buy at EUR 1 and waits for the broker response. The test passes only when the broker rejects the request with the expected <code>exchangeClosed</code> error details. If the venue unexpectedly accepts the order, the test immediately attempts to cancel it.</sub></details> | [![latest](https://handelsrepublik-ci-badges.99o.workers.dev/limit-rejection/latest.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/limit-rejection/latest/run) | [![scheduled](https://handelsrepublik-ci-badges.99o.workers.dev/limit-rejection/scheduled.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/limit-rejection/scheduled/run) | [![manual](https://handelsrepublik-ci-badges.99o.workers.dev/limit-rejection/manual.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/limit-rejection/manual/run) |
| [Live: market order rejected while market is closed](https://github.com/openinstruments-xyz/handelsrepublik/actions/workflows/validate-closed-venue-market-order-rejection.yml)<br><details><summary><sub>closed venue must reject a market order</sub></summary><sub>Runs only after an explicit owner dispatch, confirmation, and the Berlin overnight time gate. It confirms that LSX reports closed, then tries to submit an amount-based EUR 1 Apple market buy and waits for the broker response. The test passes only when the broker rejects the request with the expected <code>exchangeClosed</code> error details. If the venue unexpectedly accepts the order, the test immediately attempts to cancel it.</sub></details> | [![latest](https://handelsrepublik-ci-badges.99o.workers.dev/market-rejection/latest.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/market-rejection/latest/run) | — | [![manual](https://handelsrepublik-ci-badges.99o.workers.dev/market-rejection/manual.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/market-rejection/manual/run) |
| [Live: submit, replace, and cancel a limit order](https://github.com/openinstruments-xyz/handelsrepublik/actions/workflows/validate-open-venue-limit-order-lifecycle.yml)<br><details><summary><sub>submit, observe, replace, cancel, and clean up a limit order</sub></summary><sub>Runs on weekdays during the Berlin market window, selects NVIDIA, Apple, or Microsoft on an explicitly open destination, and requires a bid of at least EUR 10. It opens the order-update stream, submits one share at a deliberately non-marketable EUR 1 limit, verifies the created/open update, replaces the order at EUR 0.50, verifies the cancellation and replacement updates, then cancels the replacement and verifies its cancellation. Cleanup is retried in all cases, although any real order carries some execution risk.</sub></details> | [![latest](https://handelsrepublik-ci-badges.99o.workers.dev/lifecycle/latest.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/lifecycle/latest/run) | [![scheduled](https://handelsrepublik-ci-badges.99o.workers.dev/lifecycle/scheduled.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/lifecycle/scheduled/run) | [![manual](https://handelsrepublik-ci-badges.99o.workers.dev/lifecycle/manual.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/lifecycle/manual/run) |
| [Manual: buy up to €5 of an instrument](https://github.com/openinstruments-xyz/handelsrepublik/actions/workflows/execute-market-buy-on-live-account.yml)<br><details><summary><sub>confirmed real purchase of a custom instrument</sub></summary><sub>Runs only when the repository owner manually supplies an ISIN, a gross budget of at most EUR 5, and explicit confirmation. It selects an open market-order venue, reads the current ask, calculates how many whole units fit within the budget, submits the real market buy, and waits for execution. The purchased position is intentionally left in the account; there is no automatic sell, and the broker's expected EUR 1 order fee is additional.</sub></details> | [![latest](https://handelsrepublik-ci-badges.99o.workers.dev/buy/latest.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/buy/latest/run) | — | [![manual](https://handelsrepublik-ci-badges.99o.workers.dev/buy/manual.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/buy/manual/run) |
| [Manual: sell whole units of an instrument](https://github.com/openinstruments-xyz/handelsrepublik/actions/workflows/execute-market-sell-on-live-account.yml)<br><details><summary><sub>confirmed real sale of an exact whole-unit quantity</sub></summary><sub>Runs only when the repository owner manually supplies the same ISIN as a preceding buy, an exact positive whole-unit quantity, and explicit confirmation. It selects an open market-order venue, reads the current bid, submits the sell, and waits for execution. It never discovers or sells an entire existing position automatically.</sub></details> | — | — | [![manual](https://handelsrepublik-ci-badges.99o.workers.dev/sell/manual.svg)](https://handelsrepublik-ci-badges.99o.workers.dev/sell/manual/run) |

## Overview

`handelsrepublik` is an unofficial, ESM TypeScript SDK for the private Trade
Republic web API. It gives applications one client for authentication, account
and portfolio data, market data, documents, and explicitly invoked brokerage
operations across Trade Republic's REST and mapper-websocket transports.


> The SDK does not automatically retry order submissions. If the connection is lost before the broker acknowledges the request, the outcome is indeterminate (`outcomeUnknown`): the order may or may not have been accepted. The calling application is responsible for reconciling the order state and deciding whether it is safe to retry.

Read subscriptions can reconnect automatically. Order submissions and other high-risk mutations are not retried, as described above.


The package provides:

- Login -- based on the web based "instant login" by scanning a QR code with your phone method. Also does session persistence, and provides session refresh helpers.
- Typed domain namespaces for account, portfolio, orders, trading, market data,
  timeline, instruments, discovery, documents, tax, and payments.
- Shared mapper-websocket subscriptions with observable disconnect and reconnect
  events.
- Binary protobuf support for current order-update and price-alarm-notification
  streams, alongside JSON mapper resources.
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
to store account and order data. This repository's unattended order probes are
limited to closed-venue rejection checks and deeply non-marketable, cleanup-
backed limit orders; do not generalize those safeguards to application code.

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

⚠️ Trade Republic requires passing an AWS WAF browser challenge before login.
The SDK can launch Playwright to collect a shareable token bundle containing
the AWS WAF token and its anonymous XSRF companion. Playwright is an optional
consumer dependency:

```bash
npm install playwright
npx playwright install chromium
```

You can omit Playwright if your application supplies a valid
`TradeRepublicWafToken` through another mechanism.

## Quick Start

```ts
import {
  FileSessionStore,
  TradeRepublicClient,
} from 'handelsrepublik';

const wafToken = await TradeRepublicClient.collectWafToken();

const tr = TradeRepublicClient.create({
  wafToken,
  sessionStore: new FileSessionStore('.tr-session.json'),
  rawSchemaValidation: 'throw',
});

let session = await tr.auth.restoreSession();

// Check if we can refresh the existing session
if (session) {
  session = await tr.auth.refreshSession().catch(async (error) => {
    console.warn('Saved session could not be refreshed; starting QR login.', error);
    return undefined;
  });
}

// We couldn't restore session in the step above.
if (!session) {
  session = await tr.auth.loginWithQr({
    onChallengeUpdate(challenge) {
      // Open this URL on your phone. It rotates automatically while login is pending.
      console.log(challenge.qrCode);
    },
  });
}

tr.close();
```

## Extended Start

This example lets the SDK launch a temporary, visible Chromium browser and collect a
shareable WAF token. It then restores and refreshes an existing account
session when available, otherwise performs QR login, and finally makes a
read-only request. The SDK closes Chromium immediately after collecting the WAF
token:

```ts
import {
  FileSessionStore,
  TradeRepublicClient,
} from 'handelsrepublik';

// First, we need to get a token for passing the AWS WAF challenge
// This launches a visible browser, visits the Trade Republic site, collects the WAF token, and then closes it again.
// This process might take a while.
const wafToken = await TradeRepublicClient.collectWafToken({
  // browserLaunchOptions: {
  //  channel: 'chrome',
  //  headless: false, // Set to true to hide the browser in production; visible mode is easier to debug if the WAF challenge fails.
  // },
});

// Second, create the client.
// It takes a session store (you can implement your own, e.g. in Redis. More on that later.).
// We use the simple file-based session store. It creates `.tr-session.json` in the current directory.
const tr = TradeRepublicClient.create({
  wafToken,
  sessionStore: new FileSessionStore('.tr-session.json'),

  // We currently validate all answers from TradeRepublic via zod schemas.
  // 'throw' lets the application crash on schema drift, 'passthrough' accepts invalid responses.
  rawSchemaValidation: 'passthrough',
  onRawSchemaValidationFailure({ schemaName, error }) {
    console.warn(`Trade Republic schema drift in ${schemaName}`, error); // Create an issue, if you ever encounter this ;)

  },
});

// Restore old, saved sessions like this
try {
  //
  let session = await tr.auth.restoreSession();

  if (session) {
    // Refreshes the web session and saves the updated session automatically.
    session = await tr.auth.refreshSession().catch(async (error) => {
      console.warn('Saved session could not be refreshed; starting QR login.', error);
      await tr.auth.clearSession();
      return undefined;
    });
  }

  if (!session) {
    session = await tr.auth.loginWithQr({
      deviceName: 'local sdk',
      onChallengeUpdate(challenge) {
        console.log(
          // Show one of these to your user.
          challenge.qrCodeDataUrl // "data:image/png;base64,xxx...", which you could use like <img src="data:image/png;base64,..." />
            ?? challenge.deepLink // e.g. "traderepublic://login/..."
            ?? challenge.qrCode, // "https://app.traderepublic.com/login?...token=...", you want to throw this string into your QR Code generator
        );
      },
    });
  }

  console.log(await tr.portfolio.cash());
} finally {
  tr.close();
}
```

### Search for and buy a stock

The following example assumes `tr` is authenticated and still open. It searches
for Apple, fetches its normalized instrument details, and previews a market order
for one share. Set `confirmLiveOrder` to `true` only after separately confirming
the displayed order preview; doing so submits a real order.

```ts
const confirmLiveOrder = false;
const APPLE_ISIN = 'US0378331005';
const searchResults = await tr.assets.search('AAPL', {
  type: 'stock',
  limit: 10,
});

// Avoid accidentally buying a similarly named search result.
const apple = searchResults.find(({ isin }) => isin === APPLE_ISIN);

if (!apple) {
  throw new Error('Apple (AAPL) was not found.');
}

// Fetch normalized basic instrument information.
const info = await tr.assets.get(apple.id);
console.log('Instrument:', {
  id: info.id,
  isin: info.isin,
  name: info.name,
  type: info.type,
  issuer: info.issuer,
  exchangeIds: info.exchangeIds,
});

// Find an open venue supporting market orders.
const destinations = await tr.trading.orderDestinations(apple.id, {
  productContext: 'stock',
});

const destination = destinations.find(
  ({ open, orderModes }) =>
    open === true && orderModes?.includes('market'),
);

if (!destination) {
  throw new Error('No open venue supporting market orders is available.');
}

const quote = await tr.trading.priceForOrder({
  instrumentId: apple.id,
  exchangeId: destination.id,
  side: 'buy',
});

const lastClientPrice = quote.ask ?? quote.price;

if (lastClientPrice === undefined) {
  throw new Error('No current ask price is available.');
}

// Preview buying one share, including estimated costs and fees.
const preview = await tr.orders.preview({
  instrumentId: apple.id,
  exchangeId: destination.id,
  side: 'buy',
  mode: 'market',
  size: 1,
  lastClientPrice,
});

console.log('Order preview:', {
  venue: destination.name,
  price: lastClientPrice,
  fees: preview.fees,
  totalFees: preview.totalFees,
  estimatedTotal: preview.estimatedTotal,
});

if (!confirmLiveOrder) {
  console.log('Preview only — no order was submitted.');
} else {
  // This submits a real order.
  const result = await tr.orders.submit(preview.order);

  if (result.status === 'outcomeUnknown') {
    console.error(
      'Order outcome is unknown. Do not submit it again automatically.',
      result,
    );
  } else {
    console.log('Order result:', result);
  }

  console.log({ info, preview, result });
}
```

## WAF token collection

`TradeRepublicClient.collectWafToken()` obtains the browser proof required by
AWS WAF before Trade Republic login. It is asynchronous because collection can
launch a browser, navigate to Trade Republic, and wait for the browser challenge
to complete. `TradeRepublicClient.create()` remains synchronous and accepts the
finished `wafToken`; it never accepts or owns a browser.

The returned value has the following deliberately narrow shape:

```ts
type TradeRepublicWafToken = {
  awsWafToken: string;
  xsrfToken?: string;
  capturedAt?: string;
};
```

It does not contain `tr_session`, login cookies, authorization values, or the
browser's general headers. Consequently, a WAF token can be reused by
multiple separately authenticated account clients operating as the same
logical browser/client environment.

### SDK-managed browser

With no options, the SDK dynamically loads the optional `playwright` package,
launches Playwright Chromium visibly, creates a temporary browser context,
collects the WAF token, and closes both the temporary context and browser on
success or failure:

```ts
const wafToken = await TradeRepublicClient.collectWafToken();
const tr = TradeRepublicClient.create({ wafToken });
```

To use an installed Chrome or another Playwright-supported Chromium channel,
provide launch options. The SDK still owns and closes the launched browser:

```ts
const wafToken = await TradeRepublicClient.collectWafToken({
  browserLaunchOptions: {
    channel: 'chrome',
    headless: false,
  },
});

const tr = TradeRepublicClient.create({ wafToken });
```

Supported `browserLaunchOptions` are:

| Option | Default | Behavior |
| --- | --- | --- |
| `headless` | `false` | Whether the SDK-launched browser runs without a visible window. |
| `channel` | Playwright Chromium | Selects an installed Playwright-supported Chromium channel such as `chrome`. |
| `executablePath` | Playwright default | Uses a specific browser executable. |
| `args` | Playwright default | Adds command-line arguments to the launched browser. |

The selected channel or executable must already exist on the machine. The
default path requires the Playwright Chromium installation shown in the
installation section.

### Caller-owned browser

Pass `browser` to use an already launched Playwright Chromium, Firefox, WebKit,
or another structurally compatible browser. The SDK creates and closes one
temporary browser context, but the caller retains ownership of the browser:

```ts
import { firefox } from 'playwright';
import { TradeRepublicClient } from 'handelsrepublik';

const browser = await firefox.launch({ headless: false });

try {
  const wafToken = await TradeRepublicClient.collectWafToken({ browser });
  const tr = TradeRepublicClient.create({ wafToken });

  // Use tr here. tr.close() does not close browser.
} finally {
  await browser.close();
}
```

`browser` and `browserLaunchOptions` are mutually exclusive. TypeScript rejects
the combination, and JavaScript callers receive a `TypeError`. If `browser` is
provided, collection does not dynamically load Playwright, so any compatible
browser adapter can be supplied.

The equivalent lower-level function is available when a class method is not
desired:

```ts
import { collectTradeRepublicWafToken } from 'handelsrepublik';

const wafToken = await collectTradeRepublicWafToken(browser);
```

Like the class method's caller-owned-browser form, it closes the temporary
browser context but not `browser`. Pass collection options as the second
argument when using this lower-level function.

### Collection options

The following options apply to both SDK-managed and caller-owned browsers:

| Option | Default | Behavior |
| --- | --- | --- |
| `appUrl` | `https://app.traderepublic.com/` | Page used to run the browser challenge. |
| `apiUrl` | `https://api.traderepublic.com/` | API origin whose request data and cookies are inspected. |
| `contextOptions` | `{}` | Options forwarded to `browser.newContext()`. |
| `timeoutMs` | `60_000` | Maximum total time allowed for navigation and WAF collection. |
| `settleMs` | `0` | Optional initial wait before the collector begins short polling. |
| `waitUntil` | `'domcontentloaded'` | Load state passed to the initial page navigation. |

Collection rejects if Playwright is missing for an SDK-managed browser, browser
launch or navigation fails, or the required WAF token and browser cookie context
are not available before the timeout. Any internally launched browser is still
closed.

### Sharing and renewal

Keep one account session and one `SessionStore` per Trade Republic account, but
reuse the WAF token when those clients represent the same logical browser
environment:

```ts
const wafToken = await TradeRepublicClient.collectWafToken();

const alice = TradeRepublicClient.create({
  wafToken,
  sessionStore: new FileSessionStore('.alice-session.json'),
});

const bob = TradeRepublicClient.create({
  wafToken,
  sessionStore: new FileSessionStore('.bob-session.json'),
});
```

The SDK holds `wafToken` separately from account authentication and never
writes it to an account's `SessionStore`. A WAF token is not permanent. When
AWS WAF rejects or expires it, collect a replacement and apply it to every
active client that should continue sharing the browser proof:

```ts
const nextWafToken = await TradeRepublicClient.collectWafToken();

alice.setWafToken(nextWafToken);
bob.setWafToken(nextWafToken);
```

Both `collectWafToken()` and `collectTradeRepublicWafToken()` return only the
shareable WAF token; their result contains no account cookies or captured
browser headers.

## Authentication workflows

Instant login creates a challenge that the user approves in the Trade Republic
app. Trade Republic rotates the signed QR token roughly every ten seconds while
keeping the same challenge ID. Use the high-level login interface to receive
the initial QR data URL, deep link, or raw QR value and every replacement:

```ts
const session = await tr.auth.loginWithQr({
  deviceName: 'local sdk',
  intervalMs: 1_500,
  timeoutMs: 120_000,
  async onChallengeUpdate(challenge) {
    const displayValue = challenge.qrCodeDataUrl
      ?? challenge.deepLink
      ?? challenge.qrCode;
    await renderLatestLoginCode(displayValue);

    console.log({
      challengeExpiresAt: challenge.challengeExpiresAt,
      qrCodeTokenExpiresAt: challenge.qrCodeTokenExpiresAt,
    });
  },
}).catch((error) => {
  console.error(error);
  return null;
});

if (!session) {
  // Show an error or retry action and stop the authenticated flow here.
  return;
}
```

`onChallengeUpdate` is called for the initial displayable challenge and then
once for each distinct QR or login-link update; unchanged 1.5-second poll
responses are deduplicated. Callback calls are awaited and a callback error
aborts login. When the complete challenge expires, `loginWithQr()`
creates a replacement challenge and sends it through the same callback.

`challengeExpiresAt` is the lifetime of the complete challenge, while
`qrCodeTokenExpiresAt` is the shorter lifetime of the currently displayed QR
token. The server performs the rotation: polling the challenge status returns
the same challenge ID with a newly signed QR payload. The client does not
generate or modify tokens locally.

PIN login is also available. It starts the broker login process and polls until
the session is ready:

```ts
const pin = process.env.TR_PIN;
if (!pin) throw new Error('TR_PIN is not set.');

const session = await tr.auth.loginWithPin({
  phoneNumber: '+491234567890',
  pin,
  timeoutMs: 120_000,
});
```

Keep the PIN out of source control and logs. For applications that need to
separate the start and poll steps, use `auth.startLoginWithPin()` followed by
`auth.pollLoginProcess()`. Both login workflows, as well as
`auth.refreshSession()`, save a finalized session automatically when a
`SessionStore` is configured.

## Response schema validation

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
Do not commit or share it. `MemorySessionStore` is available for tests and
short-lived processes, but it does not survive a restart.

For a server or multi-user application, implement `SessionStore` using the
application's existing persistence layer. One stored JSON value per user is
enough:

```ts
import {
  TradeRepublicClient,
  type Session,
  type SessionStore,
  type TradeRepublicWafToken,
} from 'handelsrepublik';

type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

declare const redis: RedisLike;
declare const wafToken: TradeRepublicWafToken;

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
  wafToken,
  sessionStore: new RedisSessionStore(
    redis,
    'handelsrepublik:sessions:alice',
  ),
  rawSchemaValidation: 'passthrough',
});
```

Use one `TradeRepublicClient` and one session store per Trade Republic account.
Do not share a client or account session between users. WAF-context ownership,
safe reuse, and renewal are described in
[WAF token collection](#waf-token-collection). Login and refresh save
finalized account sessions automatically;
`auth.saveSession()` is available when the application explicitly needs to
persist the client's current session.

A complete runnable example with one client and encrypted Redis key per account
is available in [`demo/redis-multi-account.mjs`](demo/redis-multi-account.mjs).
It uses `ioredis` as a demo/CI-only development dependency; the SDK does not
install a Redis client for consumers. At the top of the demo, configure the
`ACCOUNT_IDS`, `REDIS_URL`, and `SESSION_ENCRYPTION_KEY_BASE64`
constants. Generate the encryption-key value once with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
npm run demo:redis
```

Keep the encryption key stable across restarts. Changing it makes previously
stored sessions unreadable. The demo prints short-lived QR login secrets to the
terminal for illustration; a real backend should deliver each update only to
the corresponding authenticated user over SSE or WebSocket.

Sessions restored from a store must contain `deviceInfo`. The client rejects a
directly supplied `session` without that profile, and `auth.restoreSession()`
ignores stored values that do not contain it. This prevents a restored account
session from silently switching device identity. `redactSession()` creates a
log-safe shallow view of the standard token, cookie, and web-context fields;
application-specific secrets nested in `metadata` still require application
redaction.

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

Initial connection failures and stalled handshakes reject pending requests.

Reconnecting the transport does not reconcile or replay a mutation that may
already have reached the broker.

Set `websocketMode: 'isolated'` only when each subscription needs a separate
mapper connection. The default `shared` mode reduces connection count and still
multiplexes independent subscriptions.

## Trading safely

Order submission, cancellation, and replacement are real financial mutations.
Obtain a fresh quote and fee preview, show the exact order to the user, and
require a separate user confirmation before calling `submit()`.

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
  size: 1, // One share/unit, not EUR 1.
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

### Selling a complete derivative position

Portfolio derivative payloads currently keep fields such as the underlying,
direction, and held size in `position.raw`. Narrow the raw value before reading
those fields; for example, this validates, previews, and—after the indicated
confirmation point—submits a day-limit sale of a specific gold short
certificate:

```ts
import { FileSessionStore, TradeRepublicClient } from 'handelsrepublik';

const INSTRUMENT_ID = 'DE000HM8CS45';
const EXCHANGE_ID = 'TUB';
const EXPECTED_SIZE = 6;
const LIMIT_EUR = 0.9;

const tr = TradeRepublicClient.create({
  sessionStore: new FileSessionStore('./demo/.demo-session.json'),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

try {
  const restored = await tr.auth.restoreSession();
  if (!restored) throw new Error('The demo session could not be restored.');
  await tr.auth.refreshSession();

  const [portfolio, asset] = await Promise.all([
    tr.portfolio.current({ timeoutMs: 15_000 }),
    tr.assets.get(INSTRUMENT_ID),
  ]);
  const position = portfolio.positions.find(({ id }) => id === INSTRUMENT_ID);
  if (!position) {
    throw new Error(`${INSTRUMENT_ID} is no longer in the portfolio.`);
  }

  const rawPosition = position.raw;
  const rawAsset = asset.raw;
  if (!isRecord(rawPosition) || !isRecord(rawAsset)) {
    throw new Error('The position or asset payload is malformed.');
  }

  const derivativeInfo = rawAsset.derivativeInfo;
  if (!isRecord(derivativeInfo)) {
    throw new Error('The position is no longer a derivative.');
  }

  const underlying = derivativeInfo.underlying;
  const properties = derivativeInfo.properties;
  if (!isRecord(underlying) || !isRecord(properties)) {
    throw new Error('The derivative details are incomplete.');
  }

  if (
    !/gold/i.test(String(underlying.name ?? ''))
    || properties.optionType !== 'short'
    || derivativeInfo.knocked === true
    || asset.type !== 'derivative'
    || rawAsset.active !== true
    || rawAsset.tradable !== true
    || !asset.exchangeIds?.includes(EXCHANGE_ID)
    || rawPosition.status !== 'ACTIVE'
  ) {
    throw new Error(
      'The position no longer matches the active gold short certificate.',
    );
  }

  const heldSize = Number(position.quantity);
  if (!Number.isFinite(heldSize) || heldSize !== EXPECTED_SIZE) {
    throw new Error(
      `Held size changed from ${EXPECTED_SIZE} to ${String(position.quantity)}; aborting.`,
    );
  }

  const [availableSize, quote, destinations] = await Promise.all([
    tr.trading.availableSize(INSTRUMENT_ID, undefined, {
      timeoutMs: 15_000,
    }),
    tr.trading.priceForOrder(
      { instrumentId: INSTRUMENT_ID, exchangeId: EXCHANGE_ID, side: 'sell' },
      { timeoutMs: 15_000 },
    ),
    tr.trading.orderDestinations(INSTRUMENT_ID, {
      productContext: 'derivative',
    }),
  ]);

  const sellableSize = Number(availableSize.size);
  if (!Number.isFinite(sellableSize) || sellableSize !== heldSize) {
    throw new Error(
      `Sellable size ${String(availableSize.size)} does not match held size ${heldSize}; aborting.`,
    );
  }

  const destination = destinations.find(({ id }) => id === EXCHANGE_ID);
  if (!destination?.open) {
    throw new Error(`${EXCHANGE_ID} is not currently open.`);
  }
  if (!destination.orderModes?.includes('limit')) {
    throw new Error(`${EXCHANGE_ID} does not support limit orders.`);
  }
  if (!destination.orderExpiries?.includes('gfd')) {
    throw new Error(`${EXCHANGE_ID} does not support day validity.`);
  }

  const preview = await tr.orders.preview({
    instrumentId: INSTRUMENT_ID,
    exchangeId: EXCHANGE_ID,
    side: 'sell',
    mode: 'limit',
    size: sellableSize,
    limit: LIMIT_EUR,
    validity: 'day',
  });

  console.log({
    instrument: `${asset.issuer ?? ''} ${asset.name ?? position.name ?? ''}`.trim(),
    instrumentId: INSTRUMENT_ID,
    exchangeId: EXCHANGE_ID,
    size: sellableSize,
    limit: LIMIT_EUR,
    latestBid: quote.bid ?? quote.price,
    quoteTime: quote.time,
    grossAtLimit: sellableSize * LIMIT_EUR,
    fees: preview.totalFees,
    estimatedProceeds: preview.estimatedTotal,
  });

  // This sends a real sell order. Require explicit user confirmation first.
  const result = await tr.orders.submit(preview.order);
  console.log(result);
} finally {
  tr.close();
}
```

The raw-shape checks are intentional. The normalized asset name identifies the
product (`Open End Turbo auf Gold`), but direction and knock-out state live in
`asset.raw.derivativeInfo`, and the active position status remains in
`position.raw`. The SDK normalizes the position's `raw.netSize` as
`position.quantity`. Abort instead of submitting if any identity, size, status,
quote, or venue check no longer matches. Handle `outcomeUnknown` as described
below; never submit the same order automatically after an ambiguous result.

Provide exactly one of `size` and `amount`:

- `size: 3` requests three shares or units.
- `amount: 25` requests a cash-value order of EUR 25. The SDK converts that
  budget into a size, rounded down to the venue's `sizeStep`.

The example above is a quantity order and therefore uses `size`. For an
amount-based market order, replace it with `amount: 25`; keep
`lastClientPrice`, because the SDK needs that price to derive the size. A limit
order uses its `limit` as the conversion price, and a stop-market order uses its
`stop`. The SDK reads the venue's size step where possible; pass `sizeStep`
explicitly when the instrument response does not expose enough metadata.

`mode: 'limit'` requires `limit`; `mode: 'stopMarket'` requires `stop`; and a
market order must contain neither.

Order validity can be expressed through broker-facing presets:

```ts
const stopOrder = {
  instrumentId,
  exchangeId,
  side: 'sell' as const,
  mode: 'stopMarket' as const,
  size: 3,
  stop: 0.8,
};

const day = await tr.orders.prepare({
  ...stopOrder,
  validity: 'day',
}); // expiry: { type: 'gfd' }

const month = await tr.orders.prepare({
  ...stopOrder,
  validity: { type: 'month', referenceDate: '2026-07-16' },
}); // expiry: { type: 'gtd', value: '2026-08-15' }

const year = await tr.orders.prepare({
  ...stopOrder,
  validity: { type: 'year', referenceDate: '2026-07-16' },
}); // expiry: { type: 'gtd', value: '2027-07-16' }

const untilCancelled = await tr.orders.prepare({
  ...stopOrder,
  validity: 'goodTillCancelled',
}); // expiry: { type: 'gtc' }; use only when the venue advertises gtc

const customDate = await tr.orders.prepare({
  ...stopOrder,
  expiry: { type: 'gtd', value: '2026-10-20' },
});

const customTimestamp = await tr.orders.prepare({
  ...stopOrder,
  expiry: { type: 'gtd', value: new Date('2026-10-20T21:59:59Z') },
}); // Date, ISO timestamp, or Unix milliseconds; normalized to 2026-10-20
```

`day` maps to `gfd`, `month` and `year` map to dated `gtd` expiries 30
and 365 days from the reference date, and `goodTillCancelled` maps to `gtc`.
`expiry` remains available when the exact broker expiry is already known. A
`gtd` value accepts `YYYY-MM-DD`, an ISO timestamp, a JavaScript `Date`, or a
Unix timestamp in milliseconds. Timestamps are converted to their UTC calendar
date because the broker payload carries a date rather than a time of day. Do
not provide both `validity` and `expiry`.

`orderModes` and `orderExpiries` describe what one specific destination says it
supports; they are not global capabilities. For example, a captured Lang &
Schwarz Exchange (`LSX`) destination for a stock returned:

```ts
{
  orderModes: ['limit', 'market', 'stopMarket', 'trailingStopMarket'],
  orderExpiries: ['gfd', 'gtd'],
}
```

For that destination, a market, limit, or stop-market order can use `day`
(`gfd`), while `month` and `year` are represented by a dated `gtd`. It did not
advertise `gtc`, so `goodTillCancelled` should not be submitted there. The
venue advertised `trailingStopMarket`, but the SDK does not construct it because
its live mutation payload has not been verified. A captured crypto venue was
more restrictive and advertised only `market` with `gfd`.

Check the exact selected destination before preparing the order:

```ts
const destination = destinations.find((item) => item.id === exchangeId);
if (!destination?.orderModes?.includes('stopMarket')) {
  throw new Error(`${exchangeId} does not support stop-market orders`);
}
if (!destination.orderExpiries?.includes('gtd')) {
  throw new Error(`${exchangeId} does not support month/year dated expiries`);
}
```

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

Order replacement uses only the mutation sequence observed in `flows(14)`:
`cancelOrder`, followed by `simpleCreateOrder` after a definitive successful
cancellation. It does not send the unobserved legacy `changeOrder` resource and
is therefore explicitly non-atomic.

```ts
const replacementPreview = await tr.orders.preview({
  instrumentId,
  exchangeId,
  side: 'buy',
  mode: 'limit',
  size: 2,
  limit: 190,
});

// Require explicit user confirmation before this call.
const replacement = await tr.orders.replace(
  'existing-broker-order-id',
  replacementPreview.order,
);
```

The replacement is prepared before cancellation. If cancellation returns
`cancelFailed` or `cancelOutcomeUnknown`, no replacement order is sent. After a
successful cancellation, the result can be `succeeded`, `failed`,
`outcomeUnknown`, or `replacementNotSent`. A replacement can therefore leave
the original order canceled without creating a new order; callers must present
that distinction clearly and reconcile ambiguous outcomes before retrying.

### Reconciliation after an unknown outcome

After reconnect, the application can inspect current and historical broker data:

```ts
const [allOrders, openOrders, closedOrders, executedOrders] = await Promise.all([
  tr.orders.all({ limit: 100 }),
  tr.orders.open(),
  tr.orders.closed(),
  tr.orders.executed(),
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
expose a suitability questionnaire or a typed `actionRequired` result. Do not
fabricate warning identifiers.

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
| `tr.auth` | QR/instant and PIN login; poll login processes; restore, refresh, save, and clear sessions. |
| `tr.account` | Current account, web session, settings, personal details, relationships, and cards. |
| `tr.assets` | Search, list, and load stocks, ETFs, funds, crypto, bonds, and other instruments. |
| `tr.derivatives` | Search derivatives, list knockout, warrant, and factor products for an underlying, and load details. |
| `tr.portfolio` | Portfolio, cash, mark-to-market value, savings plans, private-market positions, and chart data. |
| `tr.orders` | List and filter regular, executed, mutual-fund, and private-market orders; preview, prepare, submit, cancel, replace, and stream updates. |
| `tr.trading` | Order prices, available size, destinations and home venues, execution snapshots, daily PnL, live tape, and aggregate trade history. |
| `tr.market` | Quotes, candles and paged downloads, live feeds, market-data plans and entitlements, L2 venue discovery, and L2 order books. |
| `tr.timeline` | Timeline entries, actions, and details. |
| `tr.priceAlarms` | List, create, cancel, and read protobuf price-alarm notifications. |
| `tr.instruments` | News and ETF, fund, crypto, composition, and yield details. |
| `tr.discovery` | Exchanges, schedules, instrument status, watchlists and watchlist mutations, screeners, and preferences. |
| `tr.documents` | Account documents. |
| `tr.tax` | Tax information, exemption orders, and tax residencies. |
| `tr.payments` | Payment methods and typed IBAN information from the account relationship. |
| `tr.raw` | Low-level REST and mapper access using the SDK transport. |
| `tr.web` | Debugging-oriented REST and mapper convenience methods. |

Methods that need a securities account number resolve it from the active session
or account profile unless the method accepts and receives an explicit value.

Less common observed reads have first-class namespace entry points as well:

```ts
const consents = await tr.account.appUsageConsents();
const utilization = await tr.tax.accountUtilization();
const bondValue = await tr.portfolio.bondValuation(bondIsin);
const fixedSavingsValue = await tr.portfolio.fixedSavingsValuation(bondIsin);
const aggregates = await tr.trading.tradeAggregateHistory(
  isin,
  exchangeId,
  60_000,
  Date.now() - 86_400_000,
  Date.now(),
);

const executed = await tr.orders.executed();
const tradeId = executed
  .map((order) => order.raw)
  .filter((raw): raw is Record<string, unknown> => raw !== null && typeof raw === 'object')
  .flatMap((raw) => Array.isArray(raw.trades) ? raw.trades : [])
  .find((trade): trade is { tradeId: string } => (
    trade !== null
    && typeof trade === 'object'
    && typeof (trade as Record<string, unknown>).tradeId === 'string'
  ))?.tradeId;
if (tradeId) {
  const orderBookAtExecution = await tr.trading.orderBookSnapshot(tradeId);
  const tapeAtExecution = await tr.trading.tapeSnapshot(tradeId);
  console.log(orderBookAtExecution, tapeAtExecution);
}

const secAccNo = tr.securitiesAccountNumber;
if (secAccNo) {
  const dailyPnl = await tr.trading.dailyPnl([{
    secAccNo,
    instrumentId: isin,
    day: new Date().toISOString().slice(0, 10),
    quantity: 1,
  }]);
  console.log(dailyPnl);
}

const tape = tr.trading.tape(isin, exchangeId);
for await (const update of tape) {
  console.log(update);
  tape.close();
  break;
}
```

The observed watchlist backend currently supports reading the built-in default
watchlist and adding or removing its items. The SDK deliberately does not expose
custom-watchlist create, rename, clone, or delete methods.

Normalized results keep their original private-API payload in `raw`:

```ts
const position = (await tr.portfolio.current()).positions[0];
console.log(position?.id, position?.value, position?.raw);
```

Some account-specific or unstable methods intentionally return `unknown`; those
values already are the untouched broker response. Where a normalized method has
a corresponding `rawX` method, use `rawX` to bypass normalization explicitly.

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

// User-owned market-data plans and per-topic exchange entitlements are REST
// resources. Missing exchanges are not converted into false entitlements.
const subscriptions = await tr.market.subscriptions();
const l2Entitlements = await tr.market.entitlements('L2', {
  exchangeIds: ['LSX', 'XETR', 'XLON'],
});

console.log(subscriptions.map(({ plan }) => plan.product));
console.log(l2Entitlements.entitlements);

// Static presentation metadata is one-way: exchange ID to display name.
// Active L2 access remains account- and venue-specific and is reported by
// subscriptions() and entitlements(). L2 is the order-book stream; tickerV3
// carries bid/ask updates.
import {
  MARKET_DATA_STREAM_TOPICS,
  VENUE_DISPLAY_NAMES,
  venueDisplayName,
} from 'handelsrepublik';

console.log(VENUE_DISPLAY_NAMES.TIB); // Best Price
console.log(venueDisplayName('XETR')); // Xetra
console.log(MARKET_DATA_STREAM_TOPICS); // { bidAsk: 'tickerV3', orderBook: 'L2' }

// L2 uses the mapper's protobuf order-book stream. Xetra's exchange ID is
// XETR. Venues such as LSX that do not publish L2 may return a protocol error
// through the async iterator; close every stream in a finally block.
const orderBook = tr.market.l2OrderBook('US0378331005', 'XETR');
try {
  for await (const book of orderBook) {
    console.log(book.instrumentId, book.currency, book.bids, book.asks);
  }
} finally {
  orderBook.close();
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

`orders.orderUpdates()` and `priceAlarms.notifications()` use the current binary
protobuf mapper protocol. The SDK performs request framing, response-envelope
decoding, and normalization internally; callers receive ordinary SDK values and
do not need protobuf-generated classes. `orderUpdates()` is a long-lived stream;
`priceAlarms.notifications()` reads one decoded response and returns a promise.

For bounded historical downloads, provide both `from` and `to`. The helper
splits the range into requests, de-duplicates candles by timestamp, and sorts the
combined result:

```ts
const history = await tr.market.downloadCandles(
  {
    assetId: 'US0378331005',
    exchangeId: 'LSX',
    timeframe: '10m',
    from: '2026-01-01T00:00:00Z',
    to: '2026-02-01T00:00:00Z',
  },
  { maxCandlesPerRequest: 500 },
);
```

Use `tr.market.candleQuery(options).pages()` instead when each page should be
processed incrementally rather than accumulated in memory.

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
OS release, and timezone come from the Node runtime. Browser defaults use a
Firefox-shaped profile. Override any device value directly when needed:

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

A directly supplied `session` must include the original `deviceInfo`; use
`deviceInfo` only to customize a new client profile. The remaining client
options fall into these groups:

| Concern | Options |
| --- | --- |
| API routing | `apiBaseUrl`, `websocketUrl`, `endpoints` |
| HTTP identity | `locale`, `userAgent`, `defaultHeaders` |
| Browser proof and authentication | `wafToken`, advanced `webContext`, `session`, `sessionStore` |
| Transport injection | `fetch`, `websocketFactory` |
| Mapper lifecycle | `websocketMode`, `websocketReconnectDelayMs`, `websocketHandshakeTimeoutMs`, disconnect/reconnect callbacks |
| Response validation | `rawSchemaValidation`, `onRawSchemaValidationFailure` |

Endpoint, header, and transport overrides are escape hatches for tests or
observed private-API changes. They can bypass SDK assumptions; keep them scoped
and covered by application tests.

## Errors and top-level utilities

The exported error hierarchy lets applications distinguish failure classes:

| Error | Meaning |
| --- | --- |
| `TradeRepublicHttpError` | A REST request failed; includes `status` and `responseBody`. |
| `TradeRepublicProtocolError` | A mapper or private-API payload violated an expected protocol contract. |
| `TradeRepublicSchemaError` | Covered raw-response validation failed; includes the schema name and a raw-value summary. |
| `MapperRequestError` | A mapper request failed; includes `reason`, `deliveryState`, and possible connection-loss context. |

All Trade Republic-specific errors extend `TradeRepublicError`. A
`MapperRequestError` is especially important for mutations: only
`deliveryState: 'notSent'` proves that the mapper did not accept the request
bytes.

The package also exports focused lower-level helpers:

- WAF-token/browser collection: `collectTradeRepublicWafToken()`.
- Session handling: `FileSessionStore`, `MemorySessionStore`, and
  `redactSession()`.
- Candles: `CandleQuery`, resolution constants, `candleResolutionMs()`, and
  `candleResolutionsForInstrumentType()`.
- Schema tooling: `schemaRegistry`, `validateRawResponse()`, and
  `schemaCatalogMarkdown()`.
- Raw mapper safety: `classifyMapperOperation()`.

## Demo applications

The repository includes an interactive Node REPL and a terminal UI:

```bash
npm install
npm run demo:repl
npm run demo:tui
```

The demos store local authentication state under `demo/`. Do not commit the
session or configuration files they create. The separate `demo:scratchpad`
script is maintainer-specific and currently submits a real order; do not run it
as a general SDK demo.

## Security and privacy

- Keep session stores, WAF data, cookies, QR payloads, downloaded documents,
  account responses, and captures outside version control.
- Redact secrets before logging errors or raw payloads.
- Use separate encrypted storage and access control for each account.
- Call `tr.close()` when disposing a long-lived client.
- Keep unattended order tests behind explicit clock, venue-state, price-distance,
  non-replay, and cleanup safeguards.
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

### Pull-request security boundary

Every pull request runs the two `PR-safe` GitHub Actions workflows. They install
the locked dependencies, run
the unit tests and TypeScript typecheck, build the package locally, and verify
that the committed `dist` output is current. These jobs receive no repository
or environment secrets, use only a read-only `GITHUB_TOKEN`, and do not persist
checkout credentials. Neither job selects a GitHub environment, so environment
reviewers cannot hold these safe checks for approval.

The workflows themselves contain no author, contributor, or approval condition
for these checks. If GitHub shows its repository-level **Approve and run
workflows** gate for a pull request, that single approval releases both
`pull_request` workflows. Same-repository pull requests may start immediately
according to the repository policy. Keep write tokens and secrets disabled for
pull-request workflows; package checks and unit tests run with a read-only token
and no repository or environment secrets.

Pull-request code is untrusted, including package lifecycle scripts, tests, and
build scripts. Never add secrets, deployments, write permissions, privileged
external services, or `pull_request_target` to the `PR-safe` workflows.

Live integration workflows do not run pull-request code or receive approval
through the pull-request gate. They run separately from trusted default-branch,
scheduled, or manual triggers.

The SDK is a modular monolith. `ClientRuntime` owns shared transport,
schema-validation, and securities-account resolution dependencies. Declarative
REST and mapper calls live in `src/operation-specs.ts` and run through
`OperationClient`; domain adapters live under `src/domains/`. Authentication,
order preparation, submission, and cancellation remain explicit workflows.
`MapperConnection` owns multiplexing and reconnect behavior.

Unit tests use mocked HTTP and websocket transports. Live tests use a saved
session and enable raw-response validation. Captured concrete response variants
use strict schemas: an unknown response field or incompatible field type fails
its visible Actions step before normalization. An empty list is valid when the
endpoint allows it; the step summary then says that the item schema was not
observed in that run instead of claiming that an unseen item shape was proven.

Run the read-only suite or one stable case locally:

```powershell
$env:TR_SESSION_FILE = './demo/.demo-session.json'
npm run test:integration
npm run test:integration:case -- candles.standard-aapl
```

The live workflow matrix is:

| Workflow | Triggers | Gate | Exact checks |
| --- | --- | --- | --- |
| Live: account and market-data reads | push to `main`, manual, 01:00 and 11:00 daily | none | One sequential session refresh, then up to four concurrent read validations: session restore; account, session, settings, personal details, relationships, cards and app-usage consents; search, details and pagination for every asset class; derivative search/list/details; all/open/closed/executed, mutual-fund and private-market order reads; order preparation, preview and fees without submission; portfolio, cash, mark-to-market, positions, savings plans, private markets and chart; every candle matrix below; market subscriptions; timeline, price-alert, news and instrument-class reads; account-specific valuations, available size, execution order-book/tape snapshots when an executed trade ID exists, daily PnL and aggregate history; exchanges, default watchlist, screeners, preferences, documents, taxes, payment methods and IBAN shape. |
| Live: trading availability when markets are closed | push to `main`, manual, 01:00 daily | 23:00–06:40 Berlin, then live venue state | Order destinations for stock, ETF, fund, mutual fund, private fund, derivative, crypto, bond and synthetic assets; LSX exchange schedule, instrument status and quotation. Crypto is validated as returned and may remain open around the clock. |
| Live: quotes, L2, streaming {quotes, L2, tape} | push to `main`, manual, 11:00 weekdays | weekdays 07:00–22:40 Berlin, then an explicitly open destination | Order destinations and home destination; buy/sell `priceForOrder` quotes; normal quotation; market subscriptions and L2 entitlements; ticker, last-trade/tape and L2 stream payloads. `priceForOrder` is the venue-specific executable reference-price response used when preparing an order; this workflow reads it but creates no order. |
| Live: mutating alerts and default watchlist | push to `main`, manual, 01:00 and 11:00 daily | none | Create/list/delete a disposable EUR 1 Apple price alert; add/verify/remove one candidate instrument in the built-in default watchlist. Cleanup runs in `finally`. Custom watchlist creation, rename, clone and deletion are not supported by the observed backend and are not part of the SDK. |
| Live: limit order rejected while market is closed | push to `main`, manual, 01:30 daily | 23:00–06:40 Berlin in workflow and test; LSX must report `open: false` | Submit one Apple share with a EUR 1 limit and require the exact `exchangeClosed` error details; cancel immediately if the venue unexpectedly accepts it. |
| Live: market order rejected while market is closed | manual only | explicit owner confirmation; 23:00–06:40 Berlin in workflow and test; LSX must report `open: false` | Submit an amount-based EUR 1 Apple market buy and require the exact `exchangeClosed` error details; cancel immediately if the venue unexpectedly accepts it. |
| Live: submit, replace, and cancel a limit order | push to `main`, manual, 11:30 weekdays | weekdays 07:00–22:40 Berlin in workflow and test; destination must report open and bid at least EUR 10 | Select NVIDIA, Apple or Microsoft automatically; open the order-update stream; submit one share at EUR 1; require a created/open update; replace it with EUR 0.50; require old-order cancellation and new-order creation updates; cancel the replacement; require its cancellation update; retry cleanup in `finally`. |
| Manual: buy up to €5 of an instrument | manual only | explicit owner confirmation; automatic open market-order venue | Buy a custom ISIN with a user-entered gross budget of at most EUR 5, wait for execution and leave the position in the account. No automatic sell. |
| Manual: sell whole units of an instrument | manual only | explicit owner confirmation; automatic open market-order venue; user-entered exact whole-unit quantity | Sell the supplied ISIN at the current bid and wait for execution. The workflow never infers a quantity or sells an entire position. |

The AAPL standard candle matrix requires `1m`, `3m`, `5m`, `10m`, `15m`,
`20m`, `30m`, `45m`, `1h`, `2h`, `4h`, `1d`, `1w`, and `1M` responses.
Derivative and crypto fixtures require `10m`, `1h`, `4h`, `1d`, and `1w`;
bonds require `1d` and `1w`; ETF and mutual-fund fixtures receive a separate
daily smoke test. `market.candles()` routes stocks, ETFs and funds through
`tradeAggregateHistory`, derivatives and crypto through
`aggregateHistoryLightV2`, and bonds through the venue's YTM-history endpoint.
AAPL candles must contain timestamp and OHLCV fields. The other variants must
contain timestamp and OHLC fields; volume is type-checked when the endpoint
provides it. The tests only require those values to exist with the documented
types and do not judge whether changing market values are plausible.

Every independent read-only server check is a named Node test in one Actions
step. The suite runs at most four checks concurrently and reports all failures
before exiting, so schema drift remains attributable without hiding additional
failures. Venue and mutation checks remain separate named Actions steps.
All live workflows share the `live-integration-tests-main` concurrency group with a
maximal queue. GitHub therefore keeps each triggered workflow visible as its
own run while executing session-consuming workflows one at a time instead of
canceling additional pending runs.

The local read, venue and reversible-mutation suites can also be run directly:

```powershell
npm run test:integration:read
npm run test:integration:closed-venue
npm run test:integration:open-venue
npm run test:integration:mutations
```

The three protected order probes have separate local commands. They retain the
same clock and live-venue gates as GitHub Actions:

```powershell
npm run test:integration:closed-limit-order
npm run test:integration:closed-market-order
npm run test:integration:open-limit-order
```

The closed probes are expected to be rejected and therefore should not incur a
broker order fee. The open limit lifecycle uses deliberately non-marketable
prices, but it still sends real orders and cannot provide an absolute no-fill
guarantee. The manual market buy intentionally executes and can cost up to EUR
5 plus the expected EUR 1 fee.

Successful live buying uses a different suite and workflow. The
**execute market buy on live account** workflow has only a `workflow_dispatch`
trigger. It
requires an ISIN, gross purchase budget in EUR, and explicit confirmation that
a real market buy will execute. The test automatically selects the first
broker-provided destination that explicitly reports `open: true` and supports
market orders; it skips without submitting an order if none is available. It
fetches that venue's current buy quote and buys as many whole units as fit within
the budget at the ask (or fallback market price). The live workflow explicitly
uses a size step of `1`, so the calculated quantity is rounded down. It caps the
gross purchase budget at EUR 5; the expected EUR 1 fee is additional. It waits
for the buy to execute.
It does not automatically sell the purchased quantity, which remains in the
account. To sell after a successful buy, run the **execute market sell on live
account** workflow manually with the same ISIN and the exact whole-unit
quantity to sell. It independently requires confirmation, selects an open
market-order venue, uses its current bid, and never infers a position quantity
or sells an entire holding.
The manual market-order workflows are started manually and retain an explicit
confirmation input and safety checks.
Savings-plan, money-movement, document-acceptance, and account-security
mutations are never exercised.

The `PR-safe` quality and unit workflows run for every pull request and once
more on pushes to `main`. Restricting
their push trigger to `main` avoids duplicate push and pull-request runs for
ordinary branches. Non-market live workflows run on pushes to `main`;
time-dependent jobs stop at their first time gate when the current Berlin
window does not fit. Both market-order workflows remain manual-only.

The private repository belongs to a GitHub Free organization, so its live jobs
use the repository-level `TR_SESSION_JSON` secret rather than an environment
secret. Successful live runs refresh and rotate that repository secret in
place. The shared concurrency group serializes workflows that use the session.

When the GitHub Actions session can no longer be refreshed, renew it from a
maintainer machine:

```powershell
npm run ci:reauth
```

The command verifies the local GitHub CLI login, opens a browser briefly to
collect the matching Trade Republic web context and WAF token, renders a QR code in the
terminal, and waits for approval in the Trade Republic app. Short-lived QR
challenges are replaced automatically until approval or the overall timeout. It
then updates the repository-level `TR_SESSION_JSON` secret in
`openinstruments-xyz/handelsrepublik` by default, dispatches
`general-read-only-validation.yml` on `main`, and watches the new workflow run. The new
session is held in memory and is not written to the repository.

The live workflow also expects the repository-level
`GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION` secret. It must contain a token allowed
to update Actions repository secrets for this repository so the refreshed
session can be rotated after each run.

### Scheduled failure triage

The **report trusted scheduled failures to Codex** workflow follows failed
scheduled runs of the six allowlisted non-market live workflows on `main`. It
does not check out or execute repository code and receives no Trade Republic or
OpenAI credential. It creates one deduplicated `codex-triage` issue per failing
workflow, attaches a short redacted failed-step excerpt, and posts an `@codex`
triage request through the connected maintainer GitHub account.

The issue is only the transport used to invoke the Codex GitHub connector; it
is not a declaration that the SDK has a defect. Codex must first classify the
failure as a reproducible repository defect, flaky test, external-service or
market-data problem, expired session, rate limit, infrastructure problem, or
unknown. Every non-repository classification must be recorded on the issue and
must stop without a branch or pull request. Only a plausibly reproducible
repository defect may produce a minimal `codex/` fix branch and pull request.
The PR title must end with the single `[live:<profile>]` suffix requested in the
triage comment. The resulting pull request first runs the secret-free `PR-safe`
checks.

GitHub-authored bot mentions are not used to start Codex. The final issue
comment uses the existing
`GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION` repository secret and verifies that it
authenticates as `VIEWVIEWVIEW`, whose GitHub identity is connected to the
ChatGPT Codex account. This uses the ChatGPT subscription through the connector;
there is no `OPENAI_API_KEY` and no `openai/codex-action`.

After the `PR-safe` quality workflow succeeds, the **trusted Codex PR
non-market live validation** workflow re-reads the pull request through the
GitHub API. It continues only when the PR is still open, belongs to this
repository, is authored by `VIEWVIEWVIEW`, uses a `codex/` branch, and its exact
head SHA equals the already-tested quality-run SHA. It then runs all unit,
typecheck, build, and distribution checks again before loading
`TR_SESSION_JSON` and executing only the profile encoded in the title.

This is the explicit trust decision for fully automatic Codex fixes: SDK code
generated by Codex can access the live Trade Republic session during that final
profile. The live-case runtime can only restore sessions; the job receives no
session-administration token and executes no refresh or rotation step, persists
no checkout credential, and removes its ephemeral session file afterward.
Open- and closed-market profiles
fail outside their documented Berlin windows rather than silently passing
through skipped tests.

Session refresh failures and both market-order workflows are deliberately
absent from the allowlist. Market-order tests remain separately and explicitly
triggered. Codex is instructed not to request or run with live-account secrets,
weaken the Actions trust boundary, grant untrusted PR code secrets, deploy, or modify
the market-order workflows.

Use `npm run ci:reauth -- -- --no-watch` to return after dispatching, or
`npm run ci:reauth -- -- --help` to see repository, workflow, branch, timeout, and
diagnostic overrides. During the initial migration, the command detects that
the remote workflow is not ready, seeds the repository secret, and returns
without dispatching the incompatible workflow.
