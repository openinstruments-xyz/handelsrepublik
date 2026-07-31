# Brokerage orders, venues, prices, and candles

This document describes brokerage behavior observed in the Trade Republic web
client and represented by the SDK. Dashboard boards, widgets, and layout state
are intentionally out of scope.

The observations below come from the captured web flow from July 16, 2026.
Identifiers, account numbers, process IDs, and order IDs are omitted.

## Venue discovery and capabilities

`tr.trading.orderDestinations(instrumentId, query)` reads the order-router
destination list. Each normalized `OrderDestination` includes the brokerage
fields exposed by the broker:

- Venue ID and name.
- Listing and currency IDs.
- Supported order modes and expiry families.
- Current open state, exchange time zone, and trading-hour offsets.
- Maintenance and outage state.
- Venue priority and tick-size tables when supplied.

`tr.trading.homeOrderDestination(instrumentId)` reads the mapper
`homeInstrumentExchange` resource for the broker-selected home venue.

Observed capability examples:

| Instrument or venue class | Order modes | Expiries |
| --- | --- | --- |
| Crypto venue | `market` | `gfd` |
| Common stock or derivative venue | `market`, `limit`, `stopMarket` | `gfd`, `gtd` |
| Some stock and issuer venues | Also advertise `trailingStopMarket` | `gfd`, `gtd` |

The flow did not submit a trailing-stop order, so the SDK does not yet construct
one. Capability metadata is evidence that the venue advertises the mode, not
enough evidence for its complete mutation payload.

Capabilities are venue-specific. An instrument can have a full-featured venue
and a second destination that supports only market orders with day validity.
Inspect the selected destination before building an order.

The destination's `open` value describes current execution availability, not
whether the broker accepts every order type. Trade Republic accepts limit
orders on Saturday and Sunday and allows them to be cancelled before execution,
so weekend limit-order submission must not be blocked only because `open` is
`false`. Continue to require an explicitly open destination for market orders
or any workflow that needs immediate execution.

## Venue-specific order prices

Use `tr.trading.priceForOrder()` for the quote used by the order flow:

```ts
const quote = await tr.trading.priceForOrder({
  instrumentId: 'DE000FC95YR4',
  exchangeId: 'SGL',
  side: 'buy',
});
```

The mapper request is `priceForOrderV2` with a lowercase `buy` or `sell` side.
The normalized result contains `price`, `bid`, `ask`, `unit`, `time`, the
instrument and venue IDs, and `raw`.

The underlying broker resource streams refreshed prices while the web order
form remains open. The high-level method returns the first quote and closes its
one-shot mapper request.

## Fee preview

`tr.orders.preview()` builds the same order parameters as submission and sends
`orderFeesV2`. The captured web client refreshed this request whenever size,
limit, or stop input changed.

The fee request contains:

- `instrumentId`, `exchangeId`, `mode`, `size`, and side as `type`.
- `limit` for a limit order or `stop` for a stop-market order once entered.
- A `currency` field.
- The securities account number outside `parameters`.

The broker fee request intentionally omits submission-only fields such as
`expiry`, `settlementCurrency`, `tradingCurrency`, and accepted terms.

## Order construction

The captured `simpleCreateOrder` parameters use these shapes:

```ts
// Market
{
  mode: 'market',
  size: 3,
  type: 'buy',
  expiry: { type: 'gfd' }
}

// Limit
{
  mode: 'limit',
  size: 2,
  type: 'buy',
  limit: 1.51,
  expiry: { type: 'gfd' }
}

// Stop market
{
  mode: 'stopMarket',
  size: 3,
  type: 'sell',
  stop: 0.8,
  expiry: { type: 'gtd', value: '2026-08-15' }
}
```

All three also carried `sellFractions: false`, settlement and trading
currencies, a securities account number, a client process ID, and the warning
acknowledgements shown during the order flow. Captured market orders additionally
sent `lastClientPrice`; captured limit and stop-market orders did not.

The SDK validates that:

- Exactly one of `size` and `amount` is supplied.
- Limit orders have `limit`.
- Stop-market orders have `stop`.
- Market orders do not contain limit or stop prices.
- Side and prices are normalized before opening the mutation subscription.

## Validity

The single `validity` option maps SDK choices to protocol expiry values:

| SDK validity | Protocol expiry |
| --- | --- |
| `day` | `{ type: 'gfd' }` |
| `endOfMonth` | `{ type: 'eom' }` |
| `month` | `{ type: 'gtd', value: reference date + 30 days }` |
| `year` | `{ type: 'gtd', value: reference date + 365 days }` |
| `{ type: 'date', value }` | `{ type: 'gtd', value: UTC calendar date }` |
| `goodTillCancelled` | `{ type: 'gtc' }` |

The submitted month order in the capture used July 16 as its reference date and
sent August 15, confirming the 30-day dated-expiry mapping. The separate Year
choice and venue-advertised `gtd` family support the corresponding 365-day
mapping; that exact year payload was not submitted in this capture.

For deterministic scheduling or tests, pass a reference date:

```ts
validity: { type: 'month', referenceDate: '2026-07-16' }
```

Inspect venue capabilities first: the broker may reject a validity whose
protocol expiry family the destination does not advertise.

## Submission and cancellation outcomes

The observed successful submission response was:

```ts
{ status: 'succeeded', orderId: '...' }
```

The flow also captured a definitive failed market order with broker error code
`cashMissing` and an insufficient-funds message. The SDK returns that as
`status: 'failed'`; it is not an ambiguous transport result.

Cancellation uses only:

```ts
{ type: 'cancelOrder', orderId: '...' }
```

and the observed successful response was `{ status: 'succeeded' }`.

Submissions and cancellations are non-replayable. A sent mutation that loses
its definitive response returns `outcomeUnknown`; the SDK does not resend it.

## Non-atomic order replacement

The capture contains no `changeOrder` request. The supported replacement
workflow therefore composes the two observed mutations in order:

```ts
await client.orders.replace(existingOrderId, preparedReplacement);
// cancelOrder succeeds first, then simpleCreateOrder is sent
```

Replacement parameters are prepared and validated before cancellation. A
failed or ambiguous cancellation stops the workflow without sending a new
order. Once cancellation succeeds, creating the replacement can still fail,
remain ambiguous, or be definitely not sent. This operation is not an atomic
broker-side amendment and must not be presented as one.

## Suitability or quiz acknowledgement

The captured derivative orders included:

```ts
warningsShown: ['appropriatenessTestingAppropriateUser']
```

This links the completed suitability interaction to an acknowledged warning in
the order request. The capture still does not establish a safe public API for
starting or answering the questionnaire, nor a generic continuation operation
for every `confirmationNeeded` response. The SDK therefore keeps
`warningsShown` explicit and does not fabricate quiz answers or warning IDs.

## Candles

The web client queried `aggregateHistoryLightV2` with:

- `isin` and `exchangeId`.
- `unit`, usually `EUR`.
- A duration `range`, including observed values `1d`, `5d`, `1m`, `3m`, `6m`,
  and `1y`.
- A numeric millisecond `resolution`.

Observed resolutions were:

| SDK timeframe | Broker resolution |
| --- | --- |
| `10m` | `600000` |
| `1d` | `86400000` |

The SDK now converts all named timeframes to numeric milliseconds. It also
accepts a positive integer millisecond resolution directly.

```ts
const series = await tr.market.candleSeries({
  assetId: 'DE000FC95YR4',
  exchangeId: 'SGL',
  timeframe: '10m',
  range: '5d',
});

console.log(series.resolutionMs, series.candles);
```

`candleSeries()` preserves the broker's returned `resolution`,
`expectedClosingTime`, `lastAggregateEndTime`, `unit`, normalized candles, and
raw payload. `candles()` returns only the normalized candle array.

### Available candle resolutions

The candle response itself only echoes the requested numeric resolution. The
instrument response does, however, include `typeId`, and Trade Republic's web
chart maps that type to a fixed `supported_resolutions` list.

`availableCandleResolutions()` therefore fetches the requested instrument once
and applies the same type-based rule:

```ts
const resolutions = await tr.market.availableCandleResolutions({
  assetId: 'DE000FC95YR4',
});
```

The observed web-client policy is:

- derivatives and crypto: `10m`, `1h`, `4h`, `1d`, `1w`
- bonds: `1d`, `1w`
- other instruments: `1m`, `3m`, `5m`, `10m`, `15m`, `20m`, `30m`, `45m`,
  `1h`, `2h`, `4h`, `1d`, `1w`, `1M`

This is why the short-gold derivative in the capture only offered 10 minutes,
1 hour, 4 hours, 1 day, and 1 week. The list is instrument-specific through
`typeId`, but it is a client-side broker rule rather than a list returned by the
candle server.
