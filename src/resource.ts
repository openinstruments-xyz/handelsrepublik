import type { EndpointResolver } from './endpoints.js';
import type { HttpClient } from './http.js';
import type { RawApi, RawSubscription } from './raw.js';
import { validateRawResponse } from './schemas/registry.js';
import type { EndpointKey, HttpMethod } from './types.js';

export interface QuerySpec<TParams, TResult> {
  endpoint?: EndpointKey;
  method?: HttpMethod;
  resource?: (params: TParams) => Record<string, unknown>;
  pathParams?: (params: TParams) => Record<string, string | number>;
  query?: (params: TParams) => Record<string, string | number | boolean | undefined>;
  body?: (params: TParams) => unknown;
  schemaName?: string | undefined;
  normalize: (raw: unknown, params: TParams) => TResult;
}

export interface StreamSpec<TParams, TResult> {
  topic: string;
  payload: (params: TParams) => unknown;
  schemaName?: string | undefined;
  normalize: (raw: unknown, params: TParams) => TResult;
}

export interface Subscription<T> extends AsyncIterable<T> {
  close(): void;
  map<U>(mapper: (value: T) => U): Subscription<U>;
}

export class ResourceClient {
  constructor(
    private readonly http: HttpClient,
    private readonly endpoints: EndpointResolver,
    private readonly raw: RawApi,
  ) {}

  async query<TParams, TResult>(spec: QuerySpec<TParams, TResult>, params: TParams): Promise<TResult> {
    const raw = spec.resource
      ? await this.raw.query(spec.resource(params))
      : await this.http.request<unknown>(
        spec.method ?? 'GET',
        this.endpoints.resolve(requiredEndpoint(spec), spec.pathParams?.(params)),
        spec.body?.(params),
        spec.query?.(params),
      );
    const validatedRaw = spec.schemaName ? validateRawResponse(spec.schemaName, raw) : raw;
    return spec.normalize(validatedRaw, params);
  }

  stream<TParams, TResult>(spec: StreamSpec<TParams, TResult>, params: TParams): Subscription<TResult> {
    return toSubscription(this.raw.subscribe(spec.topic, spec.payload(params)))
      .map((raw) => spec.normalize(spec.schemaName ? validateRawResponse(spec.schemaName, raw) : raw, params));
  }
}

function requiredEndpoint<TParams, TResult>(spec: QuerySpec<TParams, TResult>): EndpointKey {
  if (!spec.endpoint) throw new Error('Query spec needs either endpoint or resource.');
  return spec.endpoint;
}

export function toSubscription<T>(source: RawSubscription | AsyncIterable<T>, close?: () => void): Subscription<T> {
  return {
    close() {
      if ('close' in source && typeof source.close === 'function') source.close();
      close?.();
    },
    map<U>(mapper: (value: T) => U): Subscription<U> {
      const parent = this;
      return toSubscription(mapAsync(parent, mapper), () => parent.close());
    },
    [Symbol.asyncIterator]() {
      return source[Symbol.asyncIterator]() as AsyncIterator<T>;
    },
  };
}

async function* mapAsync<T, U>(source: AsyncIterable<T>, mapper: (value: T) => U): AsyncIterable<U> {
  for await (const item of source) yield mapper(item);
}
