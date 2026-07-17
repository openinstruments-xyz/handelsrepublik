import WebSocket from 'ws';
import {
  MapperConnection,
  mapperTimeoutError,
  type MapperSubscription,
  type MapperSubscriptionOptions,
} from './mapper-connection.js';
import { TradeRepublicProtocolError } from './errors.js';
import {
  mapperProtobufCodec,
  type MapperProtobufCodec,
  type MapperProtobufTopic,
} from './mapper-protobuf.js';
import type { HttpClient } from './http.js';
import type {
  RawRequest,
  Session,
  WebSocketDisconnectEvent,
  WebSocketFactory,
  WebSocketLike,
  WebSocketReconnectEvent,
} from './types.js';

export interface RawSubscription extends MapperSubscription {}

export type RawOperationKind = 'read' | 'mutation';

export interface RawSubscriptionOptions extends MapperSubscriptionOptions {
  /** Marks an unknown/raw resource as a mutation so it is never replayed. */
  operation?: RawOperationKind | undefined;
}

export interface RawQueryOptions extends RawSubscriptionOptions {
  timeoutMs?: number | undefined;
}

export class RawApi {
  private readonly sharedConnection: MapperConnection | undefined;
  private readonly isolatedConnections = new Set<MapperConnection>();

  constructor(
    private readonly http: HttpClient,
    private readonly websocketUrl: string,
    private readonly websocketFactory: WebSocketFactory,
    private readonly getSession: () => Session | undefined,
    websocketMode: 'shared' | 'isolated' = 'shared',
    private readonly reconnectDelayMs = 250,
    private readonly handshakeTimeoutMs = 10_000,
    private readonly onWebSocketDisconnect?: ((event: WebSocketDisconnectEvent) => void | Promise<void>) | undefined,
    private readonly onWebSocketReconnect?: ((event: WebSocketReconnectEvent) => void | Promise<void>) | undefined,
  ) {
    this.sharedConnection = websocketMode === 'shared' ? this.createConnection() : undefined;
  }

  request<T = unknown>(request: RawRequest): Promise<T> {
    return this.http.request<T>(request.method ?? 'GET', request.path, request.body, request.query);
  }

  subscribe(topic: string, payload: unknown = {}, options: RawSubscriptionOptions = {}): RawSubscription {
    return this.subscribeResource({ ...asObject(payload), type: topic }, options);
  }

  subscribeLegacy(topic: string, payload: unknown = {}, options: RawSubscriptionOptions = {}): RawSubscription {
    const operation = options.operation ?? classifyMapperOperation({ type: topic });
    return this.openSubscription(
      JSON.stringify({ type: 'subscribe', topic, payload, token: this.getSession()?.sessionToken }),
      { replayOnReconnect: operation === 'mutation' ? false : options.replayOnReconnect },
    );
  }

  subscribeResource(payload: Record<string, unknown>, options: RawSubscriptionOptions = {}): RawSubscription {
    const operation = options.operation ?? classifyMapperOperation(payload);
    return this.openSubscription(
      JSON.stringify({ ...payload, token: this.getSession()?.sessionToken }),
      { replayOnReconnect: operation === 'mutation' ? false : options.replayOnReconnect },
    );
  }

  subscribeProtobufResource(
    topic: MapperProtobufTopic,
    request: { accountNumber?: string | undefined } = {},
    options: RawSubscriptionOptions = {},
  ): RawSubscription {
    return this.openSubscription(mapperProtobufCodec(topic, request), options);
  }

  query<T = unknown>(payload: Record<string, unknown>, options: RawQueryOptions = {}): Promise<T> {
    return this.queryResource(payload, options);
  }

  async queryResource<T = unknown>(payload: Record<string, unknown>, options: RawQueryOptions = {}): Promise<T> {
    const subscription = this.subscribeResource(payload, options);
    const iterator = subscription[Symbol.asyncIterator]();
    try {
      const result = await Promise.race([
        iterator.next(),
        delay(options.timeoutMs ?? 15_000).then(() => ({ done: true as const, value: undefined, timedOut: true })),
      ]);
      if (result.done || ('timedOut' in result && result.timedOut)) {
        throw mapperTimeoutError(String(payload.type ?? 'unknown'), subscription.deliveryState);
      }
      assertNoResourceErrors(result.value, payload);
      return result.value as T;
    } finally {
      subscription.close();
    }
  }

  async queryProtobufResource<T = unknown>(
    topic: MapperProtobufTopic,
    request: { accountNumber?: string | undefined } = {},
    options: RawQueryOptions = {},
  ): Promise<T> {
    const subscription = this.subscribeProtobufResource(topic, request, options);
    const iterator = subscription[Symbol.asyncIterator]();
    try {
      const result = await Promise.race([
        iterator.next(),
        delay(options.timeoutMs ?? 15_000).then(() => ({ done: true as const, value: undefined, timedOut: true })),
      ]);
      if (result.done || ('timedOut' in result && result.timedOut)) {
        throw mapperTimeoutError(topic, subscription.deliveryState);
      }
      return result.value as T;
    } finally {
      subscription.close();
    }
  }

  /** Reconnect active subscriptions after session or browser-context changes. */
  refreshSession(): void {
    this.sharedConnection?.refreshHeaders();
    for (const connection of this.isolatedConnections) connection.refreshHeaders();
  }

  close(): void {
    this.sharedConnection?.close();
    for (const connection of this.isolatedConnections) connection.close();
    this.isolatedConnections.clear();
  }

  private openSubscription(subscriptionMessage: string | MapperProtobufCodec, options: RawSubscriptionOptions = {}): RawSubscription {
    if (this.sharedConnection) return this.sharedConnection.subscribe(subscriptionMessage, options);
    let connection: MapperConnection;
    connection = this.createConnection(() => this.isolatedConnections.delete(connection));
    this.isolatedConnections.add(connection);
    const subscription = connection.subscribe(subscriptionMessage, options);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      subscription.close();
    };
    return {
      get deliveryState() {
        return subscription.deliveryState;
      },
      close,
      [Symbol.asyncIterator]() {
        const iterator = subscription[Symbol.asyncIterator]();
        return {
          next: () => iterator.next(),
          return: async () => {
            close();
            return { done: true, value: undefined };
          },
        };
      },
    };
  }

  private createConnection(onIdle?: () => void): MapperConnection {
    return new MapperConnection({
      url: this.websocketUrl,
      websocketFactory: this.websocketFactory,
      headers: () => this.http.headers(),
      reconnectDelayMs: this.reconnectDelayMs,
      handshakeTimeoutMs: this.handshakeTimeoutMs,
      onDisconnect: this.onWebSocketDisconnect,
      onReconnect: this.onWebSocketReconnect,
      ...(onIdle ? { onIdle } : {}),
    });
  }
}

const MAPPER_MUTATION_RESOURCES = new Set([
  'cancelOrder',
  'cancelPriceAlarm',
  'createPriceAlarm',
  'simpleCreateOrder',
]);

export function classifyMapperOperation(payload: Record<string, unknown>): RawOperationKind {
  return typeof payload.type === 'string' && MAPPER_MUTATION_RESOURCES.has(payload.type) ? 'mutation' : 'read';
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

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
