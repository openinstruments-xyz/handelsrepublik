# ADR 0001: Optional subclassable order journal controls durability

- Status: Journal design under reconsideration; connection-loss behavior implemented
- Date: 2026-07-15
- Updated: 2026-07-16

## Context

Handelsrepublik is intended to be dependable enough for third parties to use
for real trading. An order submission can cross a point where the remote side
may have accepted it even though the client never receives a conclusive
response. Treating that situation as an ordinary timeout, or automatically
submitting the order again, can create duplicate financial mutations.

Not every consumer wants to operate persistent recovery infrastructure. The SDK
must therefore remain fully usable both with and without durable order intent
storage.

## Reconsideration

The design below moved too quickly from broker-operation safety into a concrete
file and database storage product. The SDK must first define truthful submission
outcomes, retry rules, and reconciliation independently of any persistence
mechanism. Whether the core package should own a file-backed journal, accept a
narrow consumer persistence port, or only emit lifecycle events remains open.

The following section records the design explored during the interview. It is
not an accepted implementation contract.

## Candidate direction

- The core SDK owns broker protocol behavior, explicit submission outcomes,
  at-most-once retry policy, and observable connection lifecycle events.
- Submission returns `succeeded`, `rejected`, or `indeterminate` independently
  of whether persistence is configured.
- `indeterminate` is not a broker-side order state. It is a last-resort client
  result used only when submission may have been sent but the SDK cannot obtain
  or reconstruct the broker's definitive answer.
- Optional persistence is expressed as a narrow domain port such as an
  `OrderStore`, with operations for recording intent, recording outcomes, and
  finding unresolved intents. It does not prescribe files, event sourcing, or
  a database schema.
- The consumer decides whether that port writes mutable rows, an append-only
  event table, a file, or another backend. The consumer also owns application
  audit screens and backend-specific queries.
- The core package initially ships no production file-backed persistence. A
  concrete helper can be added later if real usage justifies its locking,
  durability, migration, privacy, and corruption-recovery contract.
- In TypeScript, an interface is the simplest form when there is no shared
  implementation. If runtime inheritance is required, use an abstract base
  class; a concrete file implementation should be a separate class in this
  package rather than hidden behavior in the extension base.
- Broker progress states and SDK call outcomes are separate concepts. A working
  outcome model is `succeeded`, `rejected`, `actionRequired`, or
  `outcomeUnknown`; raw progress such as `received` and `waiting` stays in the
  update stream rather than becoming the final call result.
- After a mutation was sent, an unexpected WebSocket disconnect immediately
  settles that SDK call as typed `outcomeUnknown`. The SDK does not automatically
  query order history or reconcile that mutation.
- A mutation subscription is non-replayable. The connection continues its normal
  reconnect process for future requests and replayable read subscriptions, but
  it never sends the same `simpleCreateOrder` again.
- `TradeRepublicClientOptions` exposes observational
  `onWebSocketDisconnect(event)` and `onWebSocketReconnect(event)` callbacks,
  using `WebSocketDisconnectEvent` and `WebSocketReconnectEvent` payload types.
  Disconnect fires once when an unexpected outage begins; reconnect fires once
  after the mapper `connected` handshake succeeds. Expected closes do not emit
  this pair.
- Callback failures are isolated from transport behavior, and callbacks do not
  delay or control reconnection. Event data includes timing, close information,
  and reconnect-attempt context suitable for a connection-status UI.
- After reconnect, the consumer decides whether to call `orders.all()`,
  `orders.open()`, `orders.closed()`, `orderUpdates()`, trades, or application
  persistence to locate an unresolved order. This refetch is not automatic SDK
  behavior.
- A successful submission means the broker accepted or created the order. It
  does not mean the order executed. Open, partially filled, filled, cancelled,
  expired, and rejected are later order-lifecycle states; trade history proves
  fills but cannot by itself prove acceptance of an unfilled order.
- `outcomeUnknown` carries `clientProcessId` and the observed connection-loss
  context. Do not throw a generic timeout that callers may treat as safe to
  retry. Exceptions remain appropriate for validation and transport failures
  that occur before submission is possibly sent.

## Explored design

- Consumers may pass an `OrderJournal` instance through the `orderJournal`
  client option. Its presence alone enables
  journal-backed durability behavior; there is no separate durability mode
  flag.
- `OrderJournal` covers order submission, cancellation, and reconciliation. It
  is not a general SDK-wide audit facility for unrelated account or payment
  mutations.
- `OrderJournal` is an exported, subclassable class with default
  method implementations. It is not a TypeScript interface and is not split
  into a separate package. Consumers customize persistence by extending the
  class and overriding its journal methods.
- Used directly, the base journal class is file-backed and requires an explicit
  file path. It must not choose or silently create an implicit storage location.
  Passing no journal object remains the explicit unjournaled mode.
- The journal is an append-only event log. Each order lifecycle transition is
  appended as a new event; existing events are never updated in place. Recovery
  derives current state by reading and folding the recorded events.
- The built-in file backend stores the event log as JSON Lines. A subclass may
  instead store the same event model in a database table or another durable
  backend.
- Storage customization happens through protected `appendEvent(event)` and
  `queryEvents(query)` hooks. The base class owns lifecycle validation, event
  creation, state folding, and reconciliation semantics; subclasses do not
  replace those safety-critical operations.
- The class exposes backend-neutral event and derived-state queries so an
  application can surface journal history in a UI without depending on whether
  the underlying storage is a file or database.
- In journal-backed mode, the SDK must durably record the order intent before
  sending the order over the network. If that initial journal write fails, the
  SDK returns a journal error and does not send the order.
- Without an order journal, all trading capabilities remain available, but the
  SDK does not promise crash recovery across process restarts.
- Every submission attempt has a `clientProcessId` that can identify the local
  intent during result handling and reconciliation.
- If submission may have reached the remote side but the result cannot be
  proven, the SDK returns an `indeterminate` outcome.
- The SDK does not automatically resubmit an indeterminate order. It provides a
  reconciliation path instead.
- The public README must document the exported `OrderJournal` class and include a
  complete database-backed subclass example so consumers can implement their
  own persistence backend. The guide must also show the built-in JSON Lines
  file backend and cover write-ahead behavior, event queries, record
  transitions, journal failures, restart recovery, and concurrency expectations.

## Consequences

- Journal-backed and unjournaled use share the same trading API surface.
- Callers must explicitly handle `indeterminate` as a real business state, not
  as a generic transport error.
- The journal object becomes part of the safety boundary when supplied.
- A journal failure before network submission has a safe, definite outcome:
  the remote order was not submitted.
- The default journal can recover records across process restarts because its
  source of truth is the caller-selected file, not process memory.
- The complete transition history remains available for auditing and debugging,
  at the cost of an ever-growing log unless compaction is added later.
- The package needs explicit recovery and reconciliation semantics before this
  contract can be considered implemented.

## Current implementation alignment

The connection-loss slice is implemented:

- `TradeRepublicClientOptions` exposes `onWebSocketDisconnect` and
  `onWebSocketReconnect` callbacks with exported event payload types.
- unexpected mapper outages invoke the callbacks once per disconnect/reconnect
  cycle, while expected closes remain silent.
- replayable read subscriptions reconnect automatically.
- order submission and cancellation subscriptions are non-replayable; connection
  loss after sending returns `outcomeUnknown` with connection context.
- order submission timeout also returns `outcomeUnknown` rather than a generic
  retryable-looking timeout exception.
- caller-owned refetch behavior and the callback API are documented in the
  README and covered by focused unit tests.

The optional journal design remains unimplemented:

- `TradeRepublicClientOptions` has no journal option.
- `TradeRepublicClient` constructs `OrdersApi` with only `ClientRuntime`, so no
  journal reaches the order workflow.
- `OrdersApi.submit()` opens the remote subscription without a write-ahead
  journal operation.
- the package exports no journal class or reconciliation API.
- existing order tests cover successful submission and validation, but not
  journal persistence, ambiguous submission, or restart recovery.
- `confirmationNeeded` currently appears in normalization code and a mocked unit
  test, but no checked-in live capture establishes its payload or required
  follow-up action. The demo REPL's `confirmOrder(code)` is an independent local
  pre-submission safety gate.
- The normalized `Order` type currently omits `clientProcessId`. Exact recovery
  therefore requires proving that raw order/update resources expose it, retaining
  an observed remote order ID, or adding another broker-supported correlation
  key. A similarity match on instrument, side, size, and time is not sufficient
  when identical orders can coexist.

The README implementation guide must not present the journal as available until
the exported class and client option exist in the package.

## Open decisions

- What exact query methods and filters does the public journal API expose?
- How does a custom-storage subclass construct the base class without requiring
  a file path?
- Which event types form the stable order lifecycle?
- What durability boundary must a successful append guarantee for the default
  file implementation?
- What should the SDK return when the remote outcome is conclusive but persisting
  that outcome to the journal fails?
- Does Trade Republic guarantee that repeating `simpleCreateOrder` with the same
  `clientProcessId` is idempotent, and can the terminal result be queried later
  by that identifier?
- What event payload fields form the public connection lifecycle API?
- What real `confirmationNeeded` payload does Trade Republic send, and does it
  request an acknowledgement, additional product-knowledge flow, or merely
  report internal progress?
- Which remote evidence is sufficient to settle an indeterminate record as
  succeeded or failed?
- How are unfinished records discovered and reconciled after process restart?
- Which concurrency and compare-and-set guarantees must custom journal classes
  provide?
