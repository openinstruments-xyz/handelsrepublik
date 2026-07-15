import { TradeRepublicProtocolError } from './errors.js';
import type {
  WebSocketDisconnectEvent,
  WebSocketFactory,
  WebSocketLike,
  WebSocketReconnectEvent,
} from './types.js';

export interface MapperSubscription extends AsyncIterable<unknown> {
  close(): void;
}

export interface MapperSubscriptionOptions {
  replayOnReconnect?: boolean | undefined;
}

export class MapperConnectionLostError extends TradeRepublicProtocolError {
  constructor(public readonly event: WebSocketDisconnectEvent) {
    super('WebSocket disconnected after a non-replayable mutation was sent. The broker outcome is unknown.');
    this.name = 'MapperConnectionLostError';
  }
}

interface SubscriptionState {
  id: number;
  message: string;
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
  onDisconnect?: ((event: WebSocketDisconnectEvent) => void | Promise<void>) | undefined;
  onReconnect?: ((event: WebSocketReconnectEvent) => void | Promise<void>) | undefined;
}

/** Owns one mapper socket and multiplexes all active resource subscriptions. */
export class MapperConnection {
  private socket: WebSocketLike | undefined;
  private connected = false;
  private nextSubscriptionId = 1;
  private readonly subscriptions = new Map<number, SubscriptionState>();
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private expectedClose = false;
  private outage: OutageState | undefined;

  constructor(private readonly options: MapperConnectionOptions) {}

  subscribe(message: string, options: MapperSubscriptionOptions = {}): MapperSubscription {
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

  /** Reconnects active subscriptions so a refreshed session supplies fresh headers. */
  refreshHeaders(): void {
    if (!this.socket || this.subscriptions.size === 0) return;
    this.expectedClose = true;
    this.connected = false;
    this.socket.close(1000, 'session refreshed');
    this.socket = undefined;
    this.expectedClose = false;
    this.ensureSocket();
  }

  close(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    for (const state of this.subscriptions.values()) this.finish(state);
    this.subscriptions.clear();
    if (this.socket) {
      this.expectedClose = true;
      this.socket.close(1000, 'client closed');
    }
    this.socket = undefined;
    this.connected = false;
    this.expectedClose = false;
    this.outage = undefined;
  }

  private ensureSocket(): void {
    if (this.socket || this.reconnectTimer || (this.subscriptions.size === 0 && !this.outage)) return;
    const socket = this.options.websocketFactory(this.options.url, this.options.headers());
    this.socket = socket;
    addListener(socket, 'open', () => {
      if (this.socket !== socket) return;
      const message = `connect 34 ${JSON.stringify(connectPayload())}`;
      logWire('send', message);
      socket.send(message);
    });
    addListener(socket, 'message', (event: unknown) => {
      if (this.socket !== socket) return;
      this.handleMessage(event);
    });
    addListener(socket, 'error', (error: unknown) => {
      if (this.socket !== socket) return;
      logWire('error', error);
    });
    addListener(socket, 'close', (...args: unknown[]) => {
      if (this.socket !== socket) return;
      const wasConnected = this.connected;
      this.socket = undefined;
      this.connected = false;
      if (this.expectedClose) return;

      if (wasConnected && !this.outage) {
        const disconnectedAtMs = Date.now();
        const details = closeEventDetails(args);
        const disconnectEvent: WebSocketDisconnectEvent = {
          disconnectedAt: new Date(disconnectedAtMs).toISOString(),
          reconnectDelayMs: Math.max(0, this.options.reconnectDelayMs ?? 250),
          ...(details.code !== undefined ? { code: details.code } : {}),
          ...(details.reason ? { reason: details.reason } : {}),
        };
        this.outage = { disconnectedAtMs, disconnectEvent, reconnectAttempts: 0 };
        invokeCallback(this.options.onDisconnect, disconnectEvent);
      }

      if (this.outage) this.failSentNonReplayableSubscriptions(this.outage.disconnectEvent);
      if (this.subscriptions.size > 0 || this.outage) this.scheduleReconnect();
    });
  }

  private handleMessage(event: unknown): void {
    const message = socketText(event);
    logWire('message', message);
    if (message === 'connected') {
      this.connected = true;
      for (const state of this.subscriptions.values()) {
        if (!state.sent || state.replayOnReconnect) this.sendSubscription(state);
      }
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
    if (!this.socket || state.closed) return;
    const message = `sub ${state.id} ${state.message}`;
    logWire('send', message);
    this.socket.send(message);
    state.sent = true;
  }

  private closeSubscription(state: SubscriptionState): void {
    if (state.closed) return;
    if (this.connected && this.socket) {
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
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    if (this.socket) {
      const socket = this.socket;
      this.expectedClose = true;
      this.socket = undefined;
      this.connected = false;
      socket.close(1000, 'idle');
      this.expectedClose = false;
    }
    this.nextSubscriptionId = 1;
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

  private failSentNonReplayableSubscriptions(event: WebSocketDisconnectEvent): void {
    for (const state of [...this.subscriptions.values()]) {
      if (!state.sent || state.replayOnReconnect) continue;
      this.subscriptions.delete(state.id);
      state.closed = true;
      state.error = new MapperConnectionLostError(event);
      while (state.waiters.length) state.waiters.shift()?.reject(state.error);
    }
  }
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

function closeEventDetails(args: unknown[]): { code?: number; reason?: string } {
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
  const reason = Buffer.isBuffer(rawReason) ? rawReason.toString('utf8') : typeof rawReason === 'string' ? rawReason : undefined;
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
