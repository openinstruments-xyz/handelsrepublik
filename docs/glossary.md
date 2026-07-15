# Trading reliability glossary

These are working domain definitions, not an implemented API contract. The
journal architecture is under reconsideration; terms whose exact behavior
remains open are identified explicitly.

## Ambiguous submission

An order submission for which the SDK cannot prove whether the remote service
accepted or rejected the mutation. A lost response after a network send is the
canonical example.

## Client process ID

The `clientProcessId` associated with one local submission intent. It gives the
SDK, journal, caller, and reconciliation flow a shared identifier without
assuming that a remote order ID is already available.

## Indeterminate

A last-resort client outcome meaning that the order may have been submitted but
the SDK could not obtain or reconstruct the broker's definitive answer. It is
not a broker-side order state and must not trigger automatic resubmission.

## Intermediate broker status

A non-terminal progress update such as `received`, `waiting`, or
`confirmationNeeded`. These are expected while the SDK continues waiting for a
terminal `succeeded` or `failed` response; they are distinct from an
`indeterminate` client outcome.

## Action required

A non-success outcome where the broker has requested an explicit caller or user
action before the order workflow can continue. A real mapper payload and the
required continuation operation must be observed before the SDK maps
`confirmationNeeded` to this outcome. The demo REPL's local confirmation code is
not broker evidence.

## Outcome unknown

The public result returned when an order mutation may have been sent and its
WebSocket disconnects before a definitive broker answer arrives. It carries
`clientProcessId` and connection-loss context, and must not be treated as
permission to resubmit. The SDK consumer may investigate it after reconnect.

## Order acceptance

The broker's definitive acknowledgement that an order was created or accepted,
usually accompanied by a remote order ID. Acceptance is the successful outcome
of submission but does not imply that any quantity has executed.

## Order execution

A later lifecycle event in which some or all of an accepted order is filled.
Execution may be partial or complete and is evidenced by order updates or trade
records. An accepted limit order can remain open without any execution.

## Caller-directed refetch

The optional application behavior after reconnection. The consumer may inspect
order updates, order lists, order history, trades, or its own persistence to
locate an unresolved order. The SDK does not run this process automatically.

## WebSocket disconnect callback

The `onWebSocketDisconnect(event)` observational client callback, using a
`WebSocketDisconnectEvent` payload. It fires once when an unexpected mapper
outage begins and allows the application to display disconnected or
reconnecting state. It does not block or control transport reconnection.

## WebSocket reconnect callback

The `onWebSocketReconnect(event)` observational client callback, using a
`WebSocketReconnectEvent` payload. It fires once after a previously disconnected
mapper connection completes its `connected` handshake. The application may use
it to clear connection warnings or start its own refetch logic.

## Order intent

The caller's request to perform one trading mutation, identified locally before
the final remote outcome is known.

## Order journal

An optional consumer-provided object for persisting order intent, cancellation,
outcomes, and reconciliation state. The SDK exports it as the subclassable
`OrderJournal` class with default method implementations, not as a TypeScript
interface or separate package. It is scoped to order mutations rather than
unrelated SDK operations. Consumers customize storage by extending the class
and overriding its journal methods. The base implementation is file-backed and
requires an explicit path; the SDK does not select an implicit journal location.
Passing an instance through the `orderJournal` client option enables
journal-backed durability semantics, while omitting it selects unjournaled
mode. The initial order intent must be persisted successfully before network
submission; otherwise the SDK does not send the order. The overridable methods
and outcome-write guarantees remain open decisions.

## Journal event

An immutable fact appended to the order journal for one lifecycle transition.
Events are not updated or deleted in place. The current state of an order intent
is derived by folding its events in order.

## Journal event log

The append-only sequence of journal events. The default `OrderJournal` stores
this log as JSON Lines in the caller-selected file. A subclass can store the
same events in a database or another durable backend. Its durability and
concurrency guarantees remain open decisions.

## Journal storage hooks

The protected `appendEvent(event)` and `queryEvents(query)` methods that a
consumer overrides to connect `OrderJournal` to custom storage. The base class
continues to own lifecycle validation, event creation, state folding, and
reconciliation behavior.

## Write-ahead intent

An order intent durably recorded before the corresponding network submission.
In journal-backed mode, failure to record this intent prevents submission and
produces a journal error with a definite not-sent outcome.

## Journal-backed mode

The behavior selected by supplying an order journal. The intended benefit is
recovery and reconciliation across ambiguous responses and process restarts.

## Reconciliation

The process of collecting evidence after an ambiguous submission and attempting
to settle it as succeeded, failed, or still indeterminate. The exact evidence
rules and public API remain open decisions.

## Resubmission

A new attempt to send an order intent. The SDK does not automatically resubmit
an indeterminate order because the original may already have succeeded.

## Unjournaled mode

The behavior selected by omitting the order journal. All trading capabilities
remain available, but cross-restart recovery is not promised.
