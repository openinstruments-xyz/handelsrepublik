import { TradeRepublicProtocolError } from './errors.js';
import { decodeMapperProtobufEnvelope, type MapperProtobufCodec } from './mapper-protobuf.js';
import type {
  WebSocketDisconnectEvent,
  WebSocketFactory,
  WebSocketLike,
  WebSocketReconnectEvent,
} from './types.js';

export type MapperDeliveryState = 'notSent' | 'sent';

export type MapperRequestFailureReason =
  | 'clientClosed'
  | 'connectFailure'
  | 'disconnect'
  | 'handshakeTimeout'
  | 'sendFailure'
  | 'sessionRefresh'
  | 'timeout';

export class MapperRequestError extends TradeRepublicProtocolError {
  readonly outcomeUnknown: boolean;

  constructor(
    message: string,
    public readonly reason: MapperRequestFailureReason,
    public readonly deliveryState: MapperDeliveryState,
    public readonly connectionLoss?: WebSocketDisconnectEvent | undefined,
    cause?: unknown,
  ) {
    super(message, cause);
    this.name = 'MapperRequestError';
    this.outcomeUnknown = deliveryState === 'sent';
  }
}

/** @deprecated Use MapperRequestError and inspect reason/deliveryState. */
export class MapperConnectionLostError extends MapperRequestError {
  constructor(public readonly event: WebSocketDisconnectEvent) {
    super(
      'WebSocket disconnected after a non-replayable mutation was sent. The broker outcome is unknown.',
      'disconnect',
      'sent',
      event,
    );
    this.name = 'MapperConnectionLostError';
  }
}

export interface MapperSubscription extends AsyncIterable<unknown> {
  readonly deliveryState: MapperDeliveryState;
  close(): void;
}

export interface MapperSubscriptionOptions {
  replayOnReconnect?: boolean | undefined;
}

interface SubscriptionState {
  id: number;
  message: string | MapperProtobufCodec;
  messages: unknown[];
  waiters: Array<{
    resolve: (value: IteratorResult<unknown>) => void;
    reject: (error: unknown) => void;
  }>;
  closed: boolean;
  replayOnReconnect: boolean;
  sent: boolean;
  error?: unknown;
}

interface OutageState {
  disconnectedAtMs: number;
  disconnectEvent: WebSocketDisconnectEvent;
  reconnectAttempts: number;
}

export interface MapperConnectionOptions {
  url: string;
  websocketFactory: WebSocketFactory;
  headers: () => Record<string, string>;
  reconnectDelayMs?: number | undefined;
  handshakeTimeoutMs?: number | undefined;
  onDisconnect?: ((event: WebSocketDisconnectEvent) => void | Promise<void>) | undefined;
  onReconnect?: ((event: WebSocketReconnectEvent) => void | Promise<void>) | undefined;
  onIdle?: (() => void) | undefined;
}

/** Owns one mapper socket and multiplexes all active resource subscriptions. */
export class MapperConnection {
  private socket: WebSocketLike | undefined;
  private connected = false;
  private nextSubscriptionId = 1;
  private readonly subscriptions = new Map<number, SubscriptionState>();
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private handshakeTimer: ReturnType<typeof setTimeout> | undefined;
  private outage: OutageState | undefined;

  constructor(private readonly options: MapperConnectionOptions) {}

  subscribe(message: string | MapperProtobufCodec, options: MapperSubscriptionOptions = {}): MapperSubscription {
    const state: SubscriptionState = {
      id: this.nextSubscriptionId++,
      message,
      messages: [],
      waiters: [],
      closed: false,
      replayOnReconnect: options.replayOnReconnect ?? true,
      sent: false,
    };
    this.subscriptions.set(state.id, state);
    this.ensureSocket();
    if (this.connected) this.sendSubscription(state);

    return {
      get deliveryState() {
        return state.sent ? 'sent' : 'notSent';
      },
      close: () => this.closeSubscription(state),
      [Symbol.asyncIterator]: () => ({
        next: () => this.next(state),
        return: async () => {
          this.closeSubscription(state);
          return { done: true, value: undefined };
        },
      }),
    };
  }

  /** Reconnects reads with fresh headers and terminates already-sent mutations. */
  refreshHeaders(): void {
    this.failSentNonReplayableSubscriptions('sessionRefresh');
    const socket = this.socket;
    if (!socket) return;
    this.socket = undefined;
    this.connected = false;
    this.clearHandshakeTimer();
    try {
      socket.close(1000, 'session refreshed');
    } catch {}
    if (this.subscriptions.size > 0 || this.outage) this.ensureSocket();
    else this.closeIdleSocket();
  }

  close(): void {
    this.clearReconnectTimer();
    this.clearHandshakeTimer();
    for (const state of [...this.subscriptions.values()]) {
      this.fail(state, requestError('clientClosed', state.sent ? 'sent' : 'notSent'));
    }
    this.subscriptions.clear();
    const socket = this.socket;
    this.socket = undefined;
    this.connected = false;
    this.outage = undefined;
    if (socket) {
      try {
        socket.close(1000, 'client closed');
      } catch {}
    }
    this.options.onIdle?.();
  }

  private ensureSocket(): void {
    if (this.socket || this.reconnectTimer || (this.subscriptions.size === 0 && !this.outage)) return;

    let socket: WebSocketLike;
    try {
      socket = this.options.websocketFactory(this.options.url, this.options.headers());
    } catch (error) {
      logWire('error', error);
      if (this.outage) this.scheduleReconnect();
      else this.failInitialSubscriptions('connectFailure', error);
      return;
    }

    this.socket = socket;
    this.startHandshakeTimer(socket);
    try {
      addListener(socket, 'open', () => {
        if (this.socket !== socket) return;
        const message = `connect 34 ${JSON.stringify(connectPayload())}`;
        logWire('send', message);
        try {
          socket.send(message);
        } catch (error) {
          this.handleSocketEnd(socket, 'sendFailure', [], error, true);
        }
      });
      addListener(socket, 'message', (event: unknown, isBinary?: unknown) => {
        if (this.socket !== socket) return;
        this.handleMessage(socket, event, isBinary === true);
      });
      addListener(socket, 'error', (error: unknown) => {
        if (this.socket !== socket) return;
        logWire('error', error);
        this.handleSocketEnd(socket, this.connected ? 'disconnect' : 'connectFailure', [], error, true);
      });
      addListener(socket, 'close', (...args: unknown[]) => {
        if (this.socket !== socket) return;
        this.handleSocketEnd(socket, this.connected ? 'disconnect' : 'connectFailure', args);
      });
    } catch (error) {
      this.handleSocketEnd(socket, 'connectFailure', [], error, true);
    }
  }

  private handleMessage(socket: WebSocketLike, event: unknown, isBinary = false): void {
    const binary = socketBinary(event, isBinary);
    if (binary) {
      let frame;
      try {
        frame = decodeMapperProtobufEnvelope(binary);
      } catch (error) {
        logWire('error', error);
        return;
      }
      const state = this.subscriptions.get(frame.subscriptionId);
      if (!state) return;
      if (frame.status) {
        this.fail(state, new TradeRepublicProtocolError(`Trade Republic protobuf resource failed (${frame.status.code}): ${frame.status.message}`));
        return;
      }
      if (!(frame.payload instanceof Uint8Array)) {
        this.finish(state);
        this.subscriptions.delete(state.id);
        return;
      }
      if (typeof state.message === 'string') {
        this.fail(state, new TradeRepublicProtocolError('Received a protobuf response for a JSON mapper subscription.'));
        return;
      }
      try {
        this.push(state, state.message.decode(frame.payload));
      } catch (error) {
        this.fail(state, new TradeRepublicProtocolError('Could not decode Trade Republic protobuf resource payload.', { cause: error }));
      }
      return;
    }
    const message = socketText(event);
    logWire('message', message);
    if (message === 'connected') {
      this.clearHandshakeTimer();
      this.connected = true;
      for (const state of [...this.subscriptions.values()]) {
        if (this.socket !== socket || !this.connected) break;
        if (!state.sent || state.replayOnReconnect) this.sendSubscription(state);
      }
      if (this.socket !== socket || !this.connected) return;
      const outage = this.outage;
      if (outage) {
        this.outage = undefined;
        const reconnectedAtMs = Date.now();
        invokeCallback(this.options.onReconnect, {
          disconnectedAt: outage.disconnectEvent.disconnectedAt,
          reconnectedAt: new Date(reconnectedAtMs).toISOString(),
          downtimeMs: Math.max(0, reconnectedAtMs - outage.disconnectedAtMs),
          reconnectAttempts: outage.reconnectAttempts,
        });
        if (this.subscriptions.size === 0) this.closeIdleSocket();
      }
      return;
    }
    if (message.startsWith('echo') || message.startsWith('connected')) return;
    const frame = parseSubscriptionFrame(message);
    if (!frame) return;
    const state = this.subscriptions.get(frame.id);
    if (state) this.push(state, frame.payload);
  }

  private sendSubscription(state: SubscriptionState): void {
    const socket = this.socket;
    if (!socket || state.closed) return;
    const message = typeof state.message === 'string'
      ? `sub ${state.id} ${state.message}`
      : Buffer.from(state.message.encode(state.id));
    logWire('send', message);
    try {
      socket.send(message);
      state.sent = true;
    } catch (error) {
      this.handleSocketEnd(socket, 'sendFailure', [], error, true);
    }
  }

  private handleSocketEnd(
    socket: WebSocketLike,
    reason: 'connectFailure' | 'disconnect' | 'handshakeTimeout' | 'sendFailure',
    closeArgs: unknown[] = [],
    cause?: unknown,
    closeSocket = false,
  ): void {
    if (this.socket !== socket) return;
    const wasConnected = this.connected;
    this.socket = undefined;
    this.connected = false;
    this.clearHandshakeTimer();
    if (closeSocket) {
      try {
        socket.close(1000, reason);
      } catch {}
    }

    if (wasConnected && !this.outage) {
      const disconnectedAtMs = Date.now();
      const details = closeEventDetails(closeArgs, cause);
      const disconnectEvent: WebSocketDisconnectEvent = {
        disconnectedAt: new Date(disconnectedAtMs).toISOString(),
        reconnectDelayMs: Math.max(0, this.options.reconnectDelayMs ?? 250),
        ...(details.code !== undefined ? { code: details.code } : {}),
        ...(details.reason ? { reason: details.reason } : {}),
      };
      this.outage = { disconnectedAtMs, disconnectEvent, reconnectAttempts: 0 };
      invokeCallback(this.options.onDisconnect, disconnectEvent);
    }

    if (this.outage) {
      if (reason === 'disconnect' || reason === 'sendFailure') {
        this.failSentNonReplayableSubscriptions(reason, cause);
      }
      if (this.subscriptions.size > 0 || this.outage) this.scheduleReconnect();
      return;
    }

    this.failInitialSubscriptions(reason === 'disconnect' ? 'connectFailure' : reason, cause);
  }

  private closeSubscription(state: SubscriptionState): void {
    if (state.closed) return;
    if (this.connected && this.socket && state.sent) {
      try {
        const message = `unsub ${state.id}`;
        logWire('send', message);
        this.socket.send(message);
      } catch {}
    }
    this.subscriptions.delete(state.id);
    this.finish(state);
    if (this.subscriptions.size === 0 && !this.outage) this.closeIdleSocket();
  }

  private closeIdleSocket(): void {
    this.clearReconnectTimer();
    this.clearHandshakeTimer();
    const socket = this.socket;
    this.socket = undefined;
    this.connected = false;
    if (socket) {
      try {
        socket.close(1000, 'idle');
      } catch {}
    }
    this.nextSubscriptionId = 1;
    this.options.onIdle?.();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delayMs = Math.max(0, this.options.reconnectDelayMs ?? 250);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.outage) this.outage.reconnectAttempts += 1;
      this.ensureSocket();
    }, delayMs);
    this.reconnectTimer.unref?.();
  }

  private startHandshakeTimer(socket: WebSocketLike): void {
    this.clearHandshakeTimer();
    const timeoutMs = Math.max(1, this.options.handshakeTimeoutMs ?? 10_000);
    this.handshakeTimer = setTimeout(() => {
      this.handshakeTimer = undefined;
      this.handleSocketEnd(socket, 'handshakeTimeout', [], undefined, true);
    }, timeoutMs);
    this.handshakeTimer.unref?.();
  }

  private clearHandshakeTimer(): void {
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    this.handshakeTimer = undefined;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private next(state: SubscriptionState): Promise<IteratorResult<unknown>> {
    const value = state.messages.shift();
    if (value !== undefined) return Promise.resolve({ done: false, value });
    if (state.error !== undefined) return Promise.reject(state.error);
    if (state.closed) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve, reject) => state.waiters.push({ resolve, reject }));
  }

  private push(state: SubscriptionState, value: unknown): void {
    const waiter = state.waiters.shift();
    if (waiter) waiter.resolve({ done: false, value });
    else state.messages.push(value);
  }

  private finish(state: SubscriptionState): void {
    state.closed = true;
    while (state.waiters.length) state.waiters.shift()?.resolve({ done: true, value: undefined });
  }

  private fail(state: SubscriptionState, error: unknown): void {
    state.closed = true;
    state.error = error;
    this.subscriptions.delete(state.id);
    while (state.waiters.length) state.waiters.shift()?.reject(error);
  }

  private failInitialSubscriptions(reason: 'connectFailure' | 'handshakeTimeout' | 'sendFailure', cause?: unknown): void {
    for (const state of [...this.subscriptions.values()]) {
      this.fail(state, requestError(reason, 'notSent', undefined, cause));
    }
    if (this.subscriptions.size === 0) this.closeIdleSocket();
  }

  private failSentNonReplayableSubscriptions(
    reason: 'disconnect' | 'sendFailure' | 'sessionRefresh',
    cause?: unknown,
  ): void {
    for (const state of [...this.subscriptions.values()]) {
      if (!state.sent || state.replayOnReconnect) continue;
      const event = this.outage?.disconnectEvent;
      const error = reason === 'disconnect' && event
        ? new MapperConnectionLostError(event)
        : requestError(reason, 'sent', event, cause);
      this.fail(state, error);
    }
  }
}

export function mapperTimeoutError(resource: string, deliveryState: MapperDeliveryState): MapperRequestError {
  const suffix = deliveryState === 'sent'
    ? 'The broker may have received the request.'
    : 'The request was not sent to the broker.';
  return requestError('timeout', deliveryState, undefined, undefined, `Timed out waiting for resource: ${resource}. ${suffix}`);
}

function requestError(
  reason: MapperRequestFailureReason,
  deliveryState: MapperDeliveryState,
  connectionLoss?: WebSocketDisconnectEvent,
  cause?: unknown,
  explicitMessage?: string,
): MapperRequestError {
  const subject = deliveryState === 'sent' ? 'The broker outcome is unknown.' : 'The request was not sent to the broker.';
  return new MapperRequestError(explicitMessage ?? `Mapper request ended because of ${reason}. ${subject}`, reason, deliveryState, connectionLoss, cause);
}

function invokeCallback<T>(callback: ((event: T) => void | Promise<void>) | undefined, event: T): void {
  if (!callback) return;
  queueMicrotask(() => {
    try {
      Promise.resolve(callback(event)).catch((error) => logWire('error', error));
    } catch (error) {
      logWire('error', error);
    }
  });
}

function closeEventDetails(args: unknown[], cause?: unknown): { code?: number; reason?: string } {
  const first = args[0];
  const code = typeof first === 'number'
    ? first
    : first && typeof first === 'object' && 'code' in first && typeof first.code === 'number'
      ? first.code
      : undefined;
  const rawReason = typeof first === 'number'
    ? args[1]
    : first && typeof first === 'object' && 'reason' in first
      ? first.reason
      : undefined;
  const reason = Buffer.isBuffer(rawReason)
    ? rawReason.toString('utf8')
    : typeof rawReason === 'string'
      ? rawReason
      : cause instanceof Error
        ? cause.message
        : undefined;
  return {
    ...(code !== undefined ? { code } : {}),
    ...(reason ? { reason } : {}),
  };
}

function addListener(socket: WebSocketLike, event: string, listener: (...args: any[]) => void): void {
  if (socket.addEventListener) socket.addEventListener(event, listener);
  else if (socket.on) socket.on(event, listener);
  else throw new TradeRepublicProtocolError('Unsupported WebSocket implementation.');
}

function socketText(event: unknown): string {
  const data = typeof event === 'object' && event !== null && 'data' in event ? event.data : event;
  return Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
}

function socketBinary(event: unknown, isBinary: boolean): Uint8Array | undefined {
  const isMessageEvent = typeof event === 'object' && event !== null && 'data' in event;
  const data = isMessageEvent ? event.data : event;
  if (!isBinary && !(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) return undefined;
  if (Buffer.isBuffer(data)) return isBinary || isMessageEvent ? data : undefined;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return undefined;
}

function parseSubscriptionFrame(text: string): { id: number; payload: unknown } | undefined {
  const firstSpace = text.indexOf(' ');
  if (firstSpace <= 0) return undefined;
  const secondSpace = text.indexOf(' ', firstSpace + 1);
  if (secondSpace <= firstSpace) return undefined;
  const id = Number(text.slice(0, firstSpace));
  if (!Number.isFinite(id)) return undefined;
  const rawPayload = text.slice(secondSpace + 1);
  try {
    return { id, payload: JSON.parse(rawPayload) };
  } catch {
    return { id, payload: rawPayload };
  }
}

function connectPayload(): Record<string, unknown> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Etc/UTC';
  return {
    locale: 'en',
    platformId: 'webtrading',
    platformVersion: 'web',
    clientId: 'app.traderepublic.com',
    clientVersion: 'web',
    timezone,
    secondsFromGMT: -new Date().getTimezoneOffset() * 60,
  };
}

function logWire(direction: 'send' | 'message' | 'error', value: unknown): void {
  if (process.env.TR_SDK_LOG_WIRE !== '1') return;
  console.log(`[handelsrepublik] websocket:${direction}`, value);
}
