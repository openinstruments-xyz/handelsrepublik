import type { HttpClient } from './http.js';
import type { EndpointResolver } from './endpoints.js';
import type { EndpointKey, HttpMethod, RawSchemaValidator } from './types.js';

interface OperationBase<TParams, TResult> {
  name: string;
  schemaName?: string | undefined;
  normalize: (raw: unknown, params: TParams) => TResult;
}

export interface RestOperation<TParams, TResult> extends OperationBase<TParams, TResult> {
  transport: 'rest';
  method?: HttpMethod | undefined;
  path?: string | ((params: TParams) => string) | undefined;
  endpoint?: EndpointKey | undefined;
  pathParams?: ((params: TParams) => Record<string, string | number>) | undefined;
  query?: ((params: TParams) => Record<string, string | number | boolean | undefined>) | undefined;
  body?: ((params: TParams) => unknown) | undefined;
}

export class OperationClient {
  constructor(
    private readonly http: HttpClient,
    private readonly validateRaw: RawSchemaValidator,
    private readonly endpoints?: EndpointResolver | undefined,
  ) {}

  async execute<TParams, TResult>(operation: RestOperation<TParams, TResult>, params: TParams): Promise<TResult> {
    return operation.normalize(await this.executeRaw(operation, params), params);
  }

  async executeRaw<TParams, TResult>(operation: RestOperation<TParams, TResult>, params: TParams): Promise<unknown> {
    const raw = await this.http.request(
      operation.method ?? 'GET',
      this.resolvePath(operation, params),
      operation.body?.(params),
      operation.query?.(params),
    );
    return operation.schemaName ? this.validateRaw(operation.schemaName, raw) : raw;
  }

  private resolvePath<TParams, TResult>(operation: RestOperation<TParams, TResult>, params: TParams): string {
    if (operation.endpoint) {
      if (!this.endpoints) throw new Error(`Operation ${operation.name} needs an endpoint resolver.`);
      return this.endpoints.resolve(operation.endpoint, operation.pathParams?.(params));
    }
    if (!operation.path) throw new Error(`REST operation ${operation.name} needs a path or endpoint.`);
    return typeof operation.path === 'function' ? operation.path(params) : operation.path;
  }
}

export const identity = <T>(value: unknown): T => value as T;
