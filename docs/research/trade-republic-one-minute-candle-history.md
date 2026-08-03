# Trade Republic candle history and request windows

Research date: 2026-08-03

## Conclusion

Trade Republic does not publish fixed retention periods for one-minute or
larger candle data. The current first-party web client contains no client-side
retention cap such as five days or one year. It supports several resolutions
and is designed to request older windows while the user pans backwards. The
oldest data the backend will actually return is undocumented and may depend on
the instrument and venue.

The web client's automatic empty-response backfill stops at 2000-01-01. That is
a client navigation boundary, not evidence that candles at any resolution are
retained back to 2000.

## Web-client evidence

The current Trade Republic chart bundle was fetched directly from
[`app.traderepublic.com`](https://app.traderepublic.com/assets/WidgetChartFeature-B5Pfy6dk.js)
without authentication. On 2026-08-03 it was 93,758 bytes with SHA-256
`bd51ed9aa6e00466b71365d8e07ca02b18f5bf7e1d6a68b1cd271af1ec71457e`,
matching the repository's [archived first-party manifest](../../trade-republic-web-bundle-archive/snapshot/manifest.json).

The bundle establishes the following behavior:

- Ordinary stocks advertise `1` as a supported TradingView resolution, meaning
  one minute.
- A single request whose resolution is ten minutes or less is restricted to at
  most `1,200,000,000` milliseconds: 13 days, 21 hours, and 20 minutes. This is
  a payload/request-window limit, not a retention limit.
- When a one-minute request is empty, the chart asks for another interval five
  calendar days farther back. It stops after five consecutive empty responses;
  a non-empty response resets that counter.
- Backward requests stop at `Date.UTC(2000, 0, 1)`. The client therefore expects
  historical pagination but makes no promise about how much data exists.
- The range shortcuts are separate from the selectable candle resolution. The
  `1D` and `1W` shortcuts default to ten-minute candles, while month/year/all
  shortcuts default to daily candles. Consequently, the visible `All` shortcut
  does not demonstrate all-time one-minute retention.

## Larger timeframe behavior

The same first-party bundle applies one request-window formula to the chart
datafeed:

- Resolutions of ten minutes or less receive a fixed maximum window of
  `1,200,000,000` milliseconds.
- Larger resolutions receive a maximum window of `20,000 × resolution`.

The resulting client behavior is:

| Resolution | Maximum window for one chart request | Empty-response step backwards | Advertised for |
| --- | ---: | ---: | --- |
| `1m` | 13 days, 21 hours, 20 minutes | 5 calendar days | ordinary stocks |
| `10m` | 13 days, 21 hours, 20 minutes | 5 calendar days | ordinary stocks, derivatives, crypto |
| `1h` | 833 days, 8 hours | 30 calendar days | ordinary stocks, derivatives, crypto |
| `1d` | 20,000 days | 30 calendar days | ordinary stocks, derivatives, crypto, bonds |
| `1w` | 140,000 days | 30 calendar days | ordinary stocks, derivatives, crypto, bonds |

For daily and weekly candles, the mathematical per-request windows extend far
beyond the client's automatic 2000-01-01 backfill floor. The floor therefore
becomes the practical client-side boundary when navigating backwards
automatically. It remains unrelated to server retention.

For every listed resolution, five consecutive empty responses cause the chart
to report `noData`; receiving data resets the empty-response counter. The
five-day or thirty-day value is the distance to the next attempted window, not
the amount of retained history.

The bundle uses different first-party resources by asset class. Ordinary stock
charts use `tradeAggregateHistory` with numeric `from`, `until`, and
`resolution` values. Derivative and crypto charts use
`aggregateHistoryLightV2`; the desired duration is converted to range buckets
such as `1d`, `5d`, `1m`, `3m`, `6m`, `1y`, `3y`, `5y`, or all time, depending
on asset class. Bonds use their own history resource and support only daily and
weekly chart resolutions; a desired bond span above one year maps to the `5y`
range bucket. The table therefore describes the TradingView datafeed window
before resource-specific range conversion, not a hard backend API limit. These
routing and windowing rules show what the client is prepared to request, but
none declares how old the returned backend data is guaranteed to be.

## Venue-specific evidence: TIB (`Best Price`)

The first-party
[`exchange-labels`](https://app.traderepublic.com/assets/exchange-labels-B9LvOxDp.js)
bundle treats `TIB` as a special venue ID and renders it as `Best Price` (or the
localized `protrading_order_flow_best_price_link` label). The corresponding
[`exchange-selector.constants`](https://app.traderepublic.com/assets/exchange-selector.constants-BBRbQWjj.js)
bundle lists `TIB` first among selectable venues and assigns it EUR as its
display currency. Both files are recorded in the
[archived first-party manifest](../../trade-republic-web-bundle-archive/snapshot/manifest.json).

Trade Republic's official [Best Price](https://support.traderepublic.com/en-de/3372dc64-59cb-4521-a424-1ee812f264a4)
documentation describes it as execution against Trade Republic using aggregated
quotes from relevant reference exchanges. It is available for stocks and ETFs,
is selected by default, operates Monday through Friday from 07:30 to 23:00 CET,
and charges a EUR 1 settlement fee per trade. That execution fee is separate
from the market-data-subscription question in this note: `TIB` is
subscription-free even though trading there is not fee-free. The source does
not describe historical-candle fees, entitlements, composition, or retention.

At the request-contract level, the chart client supports stock history for a
symbol paired with `TIB`. Its ordinary-stock path passes the selected ISIN and
venue directly to `tradeAggregateHistory`; it does not exclude `TIB`. This
means the same code can request Apple (`US0378331005`) candles for `TIB`.
Neither the public bundle nor the repository contains a captured Apple/TIB
candle response, so actual returned history and its oldest available bar remain
unverified. The Best Price documentation's description of aggregated live
quotes is not sufficient evidence that historical TIB candles have the same
composition.

The request-window calculation does not branch on venue. It depends on candle
resolution, so `TIB`, `LSX`, and other ordinary-stock venues receive the same
window caps and empty-response pagination described above. Venue-specific
exchange schedules can still change the chart session and expected gaps. The
only explicit TIB/LSX candle-normalization branch in the current chart bundle
sets returned volume to zero; it does not change price candles, request spans,
or retention.

The selector also lists direct venues including Xetra, Tradegate, LSX,
Frankfurt, Euronext, Nasdaq, and NYSE. The bundle tracks venue accessibility and
market-data entitlements separately; being present in that selector is not
evidence that a venue is subscription-free. No first-party source inspected
here promises venue-independent candle retention.

### Ordinary-stock candle entitlement matrix

For an ordinary stock chart, the current
[`WidgetChartFeature`](https://app.traderepublic.com/assets/WidgetChartFeature-B5Pfy6dk.js)
asks the
[`use-venue-sync`](https://app.traderepublic.com/assets/use-venue-sync-BYmsbtH3.js)
logic for the `TradeAggregateHistory` topic. The selector then intersects the
static list below with the destinations returned for the current instrument. A
venue being in this table means the client knows how to show it; it does not
mean every stock or account receives it.

| Venue ID | First-party display name | Universally accessible without an additional market-data subscription? |
| --- | --- | --- |
| `TIB` | Best Price | Yes. The access function returns `accessible` for TIB without consulting an entitlement. |
| `XETR` | Xetra | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `TDG` | Tradegate Exchange | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `LSX` | Lang & Schwarz Exchange | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `XFRA` | Borse Frankfurt | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `XMIL` | Borsa Italiana | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `XNAS` | Nasdaq | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `XNYS` | New York Stock Exchange | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `XSWX` | SIX Swiss Exchange | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `XWAR` | Warsaw Stock Exchange | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `XPAR` | Euronext Paris | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `XAMS` | Euronext Amsterdam | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `XLIS` | Euronext Lisbon | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `XBRU` | Euronext Brussels | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `XLON` | London Stock Exchange | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `XMAD` | Bolsa de Madrid | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `XOSL` | Euronext Oslo Børs | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `XWBO` | Wiener Börse | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `XTSE` | Toronto Stock Exchange | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `XTSX` | TSX Venture Exchange | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `XCSE` | Nasdaq Copenhagen | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `XHEL` | Nasdaq Helsinki | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `XSTO` | Nasdaq Stockholm | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `XSES` | Singapore (SGX) | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `XJPX` | Tokyo Stock Exchange | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |
| `XASX` | Australian Securities Exchange | No universal result; account-, instrument-, agreement-, entitlement-, and plan-dependent. |

The access function assigns non-TIB venues as follows:

- A subscribed entitlement is `accessible`.
- An available paid plan without a subscription is `needs-subscription`.
- A free or absent entitlement is `accessible` only after the account-level
  market-data agreement has been accepted; otherwise it is `needs-agreement`.
- An unavailable entitlement tier is `needs-subscription`.

The client fetches these states at runtime from the current account and combines
them with the current instrument's destination list. It can also hide
`needs-subscription` venues when the market-data-subscriptions feature is off.
Consequently, TIB is the only ordinary-stock venue that this bundle proves is
universally subscription-free. Any larger list requires account-specific
entitlement data and cannot be derived safely from the static selector.

Trade Republic's official support documentation separately states that no new
stock quotes are supplied outside trading hours or on weekends and that the app
then displays the last closing prices. This explains why an overnight chart can
show Friday's last data, but it does not define candle retention: [Why don't my
quotes update?](https://support.traderepublic.com/pl-pl/756-Warum-aktualisieren-sich-meine-Kurse-nicht)

## Backend observation status

An authenticated, read-only probe was prepared for twelve-day AAPL/LSX
one-minute windows across 2018 through 2026. The local mapper connection failed
before any request was sent to Trade Republic, so those attempts provide no
backend-retention evidence and no duration is inferred from them. No session,
cookie, token, or raw market payload was printed or recorded.

An authenticated check in the Codex in-app browser also could not establish the
backend depth. Trade Republic created two correctly sized `Financial Chart`
blob iframes for Apple, but their documents stayed empty. The first-party client
logged `TradingView chart not ready within 15000ms; retrying` repeatedly. This
indicates a chart-runtime incompatibility in that browser surface rather than an
instrument-level `no data` response. No browser credentials or session storage
were inspected.

The same authenticated page was then checked in Chrome. There, the embedded
TradingView chart rendered and remained interactive. For Apple on LSX, the
one-minute resolution was selected and the visible chart contained one-minute
bars through Friday, 2026-07-31, followed by the expected weekend gap.

Further date-by-date navigation established a practical boundary for this
instrument on 2026-08-03. Jumps to 2026-07-25, 2026-07-01, and 2026-06-15
loaded the requested periods. The oldest observed bars began on Monday,
2026-06-15 at about 07:30 local chart time. Jumps to the preceding trading day,
2026-06-12, and to 2026-06-08 and 2026-06-01 did not move the chart beyond the
June 15 view. Six additional attempts spanning 2025-12-31, 2025-06-16,
2025-01-02, 2024-12-31, 2024-06-17, and 2024-01-02 likewise returned no older
view while the resolution remained one minute.

For Apple on LSX, this is direct UI evidence of roughly 50 calendar days of
currently accessible one-minute history. It is not evidence of a documented or
universal fixed retention guarantee: the boundary may move with time and may
differ by instrument or venue.

The same authenticated Chrome chart was then probed at every larger resolution
advertised for the stock. The practical observations on 2026-08-03 were:

| Resolution | Oldest data observed in the chart | Earlier probe that did not load the requested period | Approximate observed depth |
| --- | --- | --- | ---: |
| `10m` | around 2026-06-10/11 | a 2025-08-01 jump stayed in the recent 2026 data | about 7.5 weeks |
| `1h` | 2025-10-31 loaded | 2025-08-01 did not load | between 9 and 12 months |
| `1d` | 2025-10-31 loaded | 2025-10-15 did not load | about 9 months |
| `1w` | the week of 2025-11-03 loaded | 2020-01-02 did not load | about 9 months observed |

These are UI observations for Apple on LSX at one point in time. In
particular, the failed date jumps do not prove universal hard cutoffs, and the
large mathematical request windows in the previous section do not imply that
the backend retains data for their full duration.

The same authenticated Chrome chart was also switched to Apple on TIB (`Best
Price`) on 2026-08-03. This produced a materially different retention profile:

| Resolution | TIB observation | Minimum depth established |
| --- | --- | ---: |
| `1m` | jumps to Friday, 2026-07-31 and 2026-06-15 stayed on the current 2026-08-03 session | current trading day only |
| `10m` | 2026-07-31 loaded, with several recent trading days visible | at least several days |
| `1h` | 2025-10-31 loaded | at least about nine months |
| `1d` | 2024-01-02 loaded, with bars visible back to about June 2023 | at least about three years and two months |
| `1w` | the week of 2020-01-06 loaded, with bars visible back to about September 2017 | at least about eight years and eleven months |

These results are lower bounds, except that the unsuccessful one-minute jumps
show a practical boundary at the time of observation. They do not establish
universal backend guarantees. They do show that candle retention is
venue-specific even though the frontend's request windows are not. TIB is
therefore a poor fixture for a weekend one-minute-candle assertion: it did not
expose the preceding Friday's one-minute bars, whereas LSX exposed roughly 50
calendar days.

### Account-specific subscription-free venue comparison

A follow-up in the same authenticated account around midnight on
2026-08-03/04 distinguished venues that opened the chart directly from venues
that opened an additional paid-subscription flow. For Apple, six venues opened
the chart without asking for another market-data subscription: `TIB`, `LSX`,
`XETR`, `XNAS`, `TDG`, and `XFRA`.

Each was then tested against the same historical date at every stock-chart
resolution. A check mark means the requested historical period visibly loaded;
a cross means the chart stayed in or returned to recent 2026 data.

| Venue | `1m`: 2026-07-31 | `10m`: 2026-06-15 | `1h`: 2025-10-31 | `1d`: 2024-01-02 | `1w`: 2020-01-02 |
| --- | :---: | :---: | :---: | :---: | :---: |
| `TIB` Best Price | no | no | yes | yes | yes |
| `LSX` Lang & Schwarz Exchange | yes | yes | yes | no | no |
| `XETR` Xetra | yes | yes | yes | yes | yes |
| `XNAS` Nasdaq | yes | yes | yes | no | no |
| `TDG` Tradegate Exchange | yes | no | no | no | no |
| `XFRA` Borse Frankfurt | no | no | no | no | no |

These are comparable lower-bound probes, not exact retention cutoffs. In
particular, a `no` result only establishes that the stated date was not
reachable. Separate closer probes showed that TIB `10m` reached 2026-07-31 and
that Tradegate `1m` reached 2026-07-31. Frankfurt exposed only a very small
current data island in all five resolutions during this observation.

`XMIL` Borsa Italiana was visible in the Apple selector but did not qualify:
selecting it opened a market-data-subscription screen offering Bid & Ask for
EUR 1 per month and Orderbook for EUR 5 per month. `XLON` London Stock Exchange
was disabled as `Coming soon`. This exhausts the eight venues shown for Apple
in this account at the time of the comparison. Nasdaq's chart opened without
another subscription; its separately offered paid product was Orderbook data,
not the Bid & Ask access needed for this chart comparison.

For CI, a strict one-minute-candle check should therefore search backwards over
a bounded number of windows until it finds the latest completed trading
session. Merely changing the resolution would weaken the test; assuming a
documented fixed retention period would be unsupported.
