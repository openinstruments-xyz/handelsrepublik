import EventEmitter from 'eventemitter3';
import WebSocket from 'ws';
import { TradeRepublicProtocolError } from './errors.js';
import type { HttpClient } from './http.js';
import type { RawRequest, Session, WebSocketFactory, WebSocketLike } from './types.js';

export interface RawSubscription extends AsyncIterable<unknown> {
  close(): void;
}

export class RawApi {
  constructor(
    private readonly http: HttpClient,
    private readonly websocketUrl: string,
    private readonly websocketFactory: WebSocketFactory,
    private readonly getSession: () => Session | undefined,
  ) {}

  request<T = unknown>(request: RawRequest): Promise<T> {
    return this.http.request<T>(request.method ?? 'GET', request.path, request.body, request.query);
  }

  subscribe(topic: string, payload: unknown = {}): RawSubscription {
    return this.subscribeResource({ ...asObject(payload), type: topic });
  }

  subscribeLegacy(topic: string, payload: unknown = {}): RawSubscription {
    return this.openSubscription(JSON.stringify({ type: 'subscribe', topic, payload, token: this.getSession()?.sessionToken }));
  }

  subscribeResource(payload: Record<string, unknown>): RawSubscription {
    return this.openSubscription(JSON.stringify({ ...payload, token: this.getSession()?.sessionToken }));
  }

  query<T = unknown>(payload: Record<string, unknown>, options: { timeoutMs?: number } = {}): Promise<T> {
    return this.queryResource(payload, options);
  }

  async queryResource<T = unknown>(payload: Record<string, unknown>, options: { timeoutMs?: number } = {}): Promise<T> {
    const subscription = this.subscribeResource(payload);
    const iterator = subscription[Symbol.asyncIterator]();
    try {
      const result = await Promise.race([
        iterator.next(),
        delay(options.timeoutMs ?? 15_000).then(() => ({ done: true as const, value: undefined, timedOut: true })),
      ]);
      if (result.done || ('timedOut' in result && result.timedOut)) {
        throw new TradeRepublicProtocolError(`Timed out waiting for resource: ${String(payload.type ?? 'unknown')}`);
      }
      assertNoResourceErrors(result.value, payload);
      return result.value as T;
    } finally {
      subscription.close();
    }
  }

  private openSubscription(subscriptionMessage: string): RawSubscription {
    const headers = this.http.headers();
    const socket = this.websocketFactory(this.websocketUrl, headers);
    const emitter = new EventEmitter();
    const messages: unknown[] = [];
    const waiters: Array<(value: IteratorResult<unknown>) => void> = [];
    let closed = false;
    let connected = false;
    let subscriptionId = 0;

    const push = (message: unknown) => {
      const waiter = waiters.shift();
      if (waiter) waiter({ done: false, value: message });
      else messages.push(message);
      emitter.emit('message', message);
    };
    const finish = () => {
      closed = true;
      while (waiters.length) waiters.shift()?.({ done: true, value: undefined });
    };

    addListener(socket, 'open', () => {
      const message = `connect 34 ${JSON.stringify(connectPayload())}`;
      logWire('send', message);
      socket.send(message);
    });
    addListener(socket, 'message', (event: unknown) => {
      const message = parseSocketMessage(event);
      logWire('message', message);
      if (message === 'connected') {
        connected = true;
        subscriptionId += 1;
        const subscribeMessage = `sub ${subscriptionId} ${subscriptionMessage}`;
        logWire('send', subscribeMessage);
        socket.send(subscribeMessage);
        return;
      }
      if (typeof message === 'string' && (message.startsWith('echo') || message.startsWith('connected'))) return;
      if (!connected) return;
      push(message);
    });
    addListener(socket, 'error', (event: unknown) => emitter.emit('error', event));
    addListener(socket, 'close', finish);

    return {
      close() {
        if (subscriptionId > 0) {
          try {
            const unsubscribeMessage = `unsub ${subscriptionId}`;
            logWire('send', unsubscribeMessage);
            socket.send(unsubscribeMessage);
          } catch {}
        }
        finish();
        socket.close();
      },
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<unknown>> {
            const value = messages.shift();
            if (value !== undefined) return Promise.resolve({ done: false, value });
            if (closed) return Promise.resolve({ done: true, value: undefined });
            return new Promise((resolve) => waiters.push(resolve));
          },
        };
      },
    };
  }
}

function assertNoResourceErrors(value: unknown, request: Record<string, unknown>): void {
  if (!value || typeof value !== 'object' || !('errors' in value)) return;
  const errors = (value as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) return;
  throw new TradeRepublicProtocolError(`Trade Republic resource failed: ${String(request.type ?? 'unknown')} ${JSON.stringify(errors)}`);
}

export function defaultWebSocketFactory(url: string, headers: Record<string, string>): WebSocketLike {
  return new WebSocket(url, { headers });
}

function addListener(socket: WebSocketLike, event: string, listener: (...args: any[]) => void): void {
  if (socket.addEventListener) socket.addEventListener(event, listener);
  else if (socket.on) socket.on(event, listener);
  else throw new TradeRepublicProtocolError('Unsupported WebSocket implementation.');
}

function parseSocketMessage(event: unknown): unknown {
  const data = typeof event === 'object' && event !== null && 'data' in event ? event.data : event;
  const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
  const framed = parseSubscriptionFrame(text);
  if (framed) return framed.payload;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function parseSubscriptionFrame(text: string): { id: number; type: string; payload: unknown } | undefined {
  const firstSpace = text.indexOf(' ');
  if (firstSpace <= 0) return undefined;
  const secondSpace = text.indexOf(' ', firstSpace + 1);
  if (secondSpace <= firstSpace) return undefined;
  const id = Number(text.slice(0, firstSpace));
  if (!Number.isFinite(id)) return undefined;
  const type = text.slice(firstSpace + 1, secondSpace);
  const rawPayload = text.slice(secondSpace + 1);
  let payload: unknown = rawPayload;
  try {
    payload = JSON.parse(rawPayload);
  } catch {}
  return { id, type, payload };
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

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logWire(direction: 'send' | 'message', value: unknown): void {
  if (process.env.TR_SDK_LOG_WIRE !== '1') return;
  console.log(`[handelsrepublik] websocket:${direction}`, value);
}
