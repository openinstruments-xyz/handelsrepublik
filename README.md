# handelsrepublik

[![quality](https://github.com/VIEWVIEWVIEW/handelsrepublik/actions/workflows/quality.yml/badge.svg?branch=main)](https://github.com/VIEWVIEWVIEW/handelsrepublik/actions/workflows/quality.yml)
[![unit tests](https://github.com/VIEWVIEWVIEW/handelsrepublik/actions/workflows/unit-tests.yml/badge.svg?branch=main)](https://github.com/VIEWVIEWVIEW/handelsrepublik/actions/workflows/unit-tests.yml)
[![live non-order](https://github.com/VIEWVIEWVIEW/handelsrepublik/actions/workflows/live-integration.yml/badge.svg?branch=main&event=schedule)](https://github.com/VIEWVIEWVIEW/handelsrepublik/actions/workflows/live-integration.yml)
[![live closed limit](https://github.com/VIEWVIEWVIEW/handelsrepublik/actions/workflows/live-order-closed-limit.yml/badge.svg?branch=main&event=schedule)](https://github.com/VIEWVIEWVIEW/handelsrepublik/actions/workflows/live-order-closed-limit.yml)
[![live closed market](https://github.com/VIEWVIEWVIEW/handelsrepublik/actions/workflows/live-order-closed-market.yml/badge.svg?branch=main&event=schedule)](https://github.com/VIEWVIEWVIEW/handelsrepublik/actions/workflows/live-order-closed-market.yml)
[![live open limit cancel](https://github.com/VIEWVIEWVIEW/handelsrepublik/actions/workflows/live-order-open-limit.yml/badge.svg?branch=main&event=schedule)](https://github.com/VIEWVIEWVIEW/handelsrepublik/actions/workflows/live-order-open-limit.yml)
[![manual live buy](https://github.com/VIEWVIEWVIEW/handelsrepublik/actions/workflows/live-order-integration.yml/badge.svg?branch=main&event=workflow_dispatch)](https://github.com/VIEWVIEWVIEW/handelsrepublik/actions/workflows/live-order-integration.yml)

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
to store account and order data. Do not use live mutations in unattended tests.

Treat sessions, cookies, WAF tokens, QR challenges, account payloads, documents,
tax data, order data, and raw mapper responses as secrets.

Trade Republic market data may be subject to contractual restrictions. Check
the applicable market data terms before reusing or redistributing retrieved
data: [Sonderbedingungen fuer Marktdaten und vorvertragliche Informationen
(PDF)](https://assets.traderepublic.com/assets/files/CA_DE-de.pdf).

## Installation

Development happens on the main branch. Please only use tagged releases (e.g. `#v0.1.0`). Using the latest tagged release is recommended.

Install the package directly from GitHub:

```bash
npm install github:VIEWVIEWVIEW/handelsrepublik#v0.1.0
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
for one share. Pass `true` only after separately confirming the displayed order
preview; doing so submits a real order.

```ts
const APPLE_ISIN = 'US0378331005';
const searchResults = await tr.assets.search('AAPL', {
  type: 'stock',
  limit: 10,
});

// Avoid accidentally buying a similarly named search result.
const apple = searchResults.find(
  ({ id, isin }) => id === APPLE_ISIN || isin === APPLE_ISIN,
);

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
  return { info, preview };
}

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

console.log({ info, preview, result })

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

`collectTradeRepublicWebContext()` remains available for advanced compatibility
use, but it captures a broader browser context that can contain account cookies
and headers. Do not share its result between accounts. Prefer the narrow
`collectWafToken()` or `collectTradeRepublicWafToken()` interfaces.

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
| `tr.trading` | Order prices, available size, destinations and home venues, trades, and daily PnL. |
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

- WAF-token/browser collection: `collectTradeRepublicWafToken()` and the broader
  `collectTradeRepublicWebContext()`.
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

Unit tests use mocked HTTP and websocket transports. Live integration tests
reuse a saved demo session and run non-order Trade Republic operations:

```powershell
$env:TR_SESSION_FILE = './demo/.demo-session.json'
npm run test:integration:non-order
```

`npm run test:integration` remains an alias for the non-order suite.

Disposable price-alarm and watchlist mutation checks run by default and always
include cleanup.

Closed-exchange order rejection integration is a separate suite. It requires an
explicit instrument and exchange:

```powershell
$env:TR_SESSION_FILE = './demo/.demo-session.json'
$env:TR_INTEGRATION_ORDER_ISIN = 'DE0007164600'
$env:TR_INTEGRATION_ORDER_EXCHANGE = 'LSX'
$env:TR_INTEGRATION_OPEN_BUY_LIMIT_EUR = '1'
npm run test:integration:order-rejections
```

It submits a EUR 1 amount-based limit buy only when the selected exchange
explicitly reports as closed. The buy limit uses the current bid so the request
is non-marketable if the venue state changes. The suite then asserts the
`exchangeClosed` outcome and verifies the nonexistent order cancellation
result. While the venue is closed,
it also submits a EUR 1 market buy and requires the same rejection. While the
venue is open, it instead submits one share at the configured deeply
non-marketable buy limit, requires that limit to be no more than 10% of the live
bid, and cancels the accepted order immediately with a `finally` cleanup retry.
The market-order probe has an additional clock guard: at or after 05:00
Europe/Berlin it always skips before authentication or submission, even if the
venue API unexpectedly reports closed.

Three dedicated **live venue-state order integration** workflows run on
weekdays so every time-dependent probe has its own workflow history and status
badge. The closed-limit probe runs at 00:30, the closed-market probe at 01:00,
and the open-limit cancellation probe at 10:45 Europe/Berlin. Scheduled runs
default to Apple (`US0378331005`), LSX, a EUR 1 closed-venue amount-based limit
buy, and a EUR 1 open-venue buy limit. Manual runs require the relevant inputs
and explicit confirmation that real order requests will be sent. The
closed-market workflow gates the session/authentication job on the current
Europe/Berlin time, so that job is marked skipped at or after 05:00. The test
also retains its own clock guard before authentication or submission as a
second safety layer.

Successful live buying uses a different suite and workflow. The
**live buy integration** workflow has only a `workflow_dispatch` trigger. It
requires an ISIN, exchange, EUR amount, and explicit confirmation that a real
market buy will execute. The test refuses to run unless the selected
exchange explicitly reports `open: true`, caps the buy at EUR 0.50 (plus the
expected EUR 1 fee), and waits for the buy to execute. It does not automatically
sell the purchased quantity, which remains in the account. Configure required
reviewers on the `live-order-tests` GitHub environment before using it.
Savings-plan, money-movement, document-acceptance, and account-security
mutations are never exercised.

GitHub Actions runs `npm test`, `npm run typecheck`, and `npm run build` on every
push, pull request, and manual quality/unit run. A separate account integration
workflow has no push or pull-request trigger. It runs
`npm run test:integration:non-order` only on `main`, only for the repository
owner, and only after its unit-test gate passes. It runs at 10:15 and 16:15
Europe/Berlin on weekdays to refresh the account session, and the repository
owner can also start it manually. Those times keep the scheduled AAPL/XETR L2
test inside Xetra's 09:00-17:30 German market hours even when GitHub starts the
workflow up to an hour late.

The no-order GitHub workflow includes cleanup-backed price-alarm and watchlist
mutations. The three venue-state probes and successful order execution run in
the dedicated workflows described above.
The live suite fails on all endpoint errors;
optional local mutation probes skip unsupported rename and clone operations for
Trade Republic's built-in default watchlist.

When the GitHub repository session secret expires, renew it from a maintainer machine:

```powershell
npm run ci:reauth
```

The command verifies the local GitHub CLI login, opens a browser briefly to
collect the matching Trade Republic web context and WAF token, renders a QR code in the
terminal, and waits for approval in the Trade Republic app. Short-lived QR
challenges are replaced automatically until approval or the overall timeout. It
then updates the repository-level `TR_SESSION_JSON` secret, dispatches
`live-integration.yml` on `main`, and watches the new workflow run. The new
session is held in memory and is not written to the repository. Keeping the
live job free of a GitHub `environment` prevents test runs from appearing as
deployments.

The live workflow also expects the repository-level
`GH_CLI_TOKEN_USED_TO_UPDATE_TR_SESSION` secret. It must contain a token allowed
to update Actions secrets for this repository so the refreshed session can be
rotated after each run.

Use `npm run ci:reauth -- --no-watch` to return after dispatching, or
`npm run ci:reauth -- --help` to see repository, workflow, branch,
timeout, and diagnostic overrides.
