import type { EndpointResolver } from './endpoints.js';
import type { HttpClient } from './http.js';
import { OperationClient } from './operations.js';
import type { RawApi } from './raw.js';
import { ResourceClient } from './resource.js';
import type { RawSchemaValidator } from './types.js';

export interface AccountIdentityAdapter {
  get(): string | undefined;
  set(value: string): void;
  fallback?(): Promise<string | undefined>;
}

/** Shared internal dependency and account-identity boundary for all domain APIs. */
export class ClientRuntime {
  readonly resources: ResourceClient;
  readonly operations: OperationClient;

  constructor(
    readonly http: HttpClient,
    readonly endpoints: EndpointResolver,
    readonly raw: RawApi,
    readonly validateRaw: RawSchemaValidator,
    private readonly accountIdentity: AccountIdentityAdapter,
  ) {
    this.resources = new ResourceClient(http, endpoints, raw, validateRaw);
    this.operations = new OperationClient(http, raw, validateRaw, endpoints);
  }

  get securitiesAccountNumber(): string | undefined {
    return this.accountIdentity.get();
  }

  rememberSecuritiesAccountNumber(value: string): void {
    this.accountIdentity.set(value);
  }

  async resolveSecuritiesAccountNumber(timeoutMs?: number): Promise<string> {
    const cached = this.accountIdentity.get();
    try {
      const accountPairs = await this.raw.query(
        { type: 'accountPairs' },
        timeoutMs === undefined ? {} : { timeoutMs },
      );
      const accountNumber = firstStringByKey(accountPairs, 'securitiesAccountNumber');
      if (accountNumber) {
        this.accountIdentity.set(accountNumber);
        return accountNumber;
      }
    } catch {
      if (cached) return cached;
      const accountNumber = await this.accountIdentity.fallback?.();
      if (accountNumber) {
        this.accountIdentity.set(accountNumber);
        return accountNumber;
      }
      throw unavailableAccountNumber();
    }
    if (cached) return cached;
    const accountNumber = await this.accountIdentity.fallback?.();
    if (accountNumber) {
      this.accountIdentity.set(accountNumber);
      return accountNumber;
    }
    throw unavailableAccountNumber();
  }
}

export function firstStringByKey(value: unknown, key: string): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = firstStringByKey(item, key);
      if (match) return match;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record[key] === 'string' && record[key].length > 0) return record[key];
  for (const item of Object.values(record)) {
    const match = firstStringByKey(item, key);
    if (match) return match;
  }
  return undefined;
}

function unavailableAccountNumber(): Error {
  return new Error('Trade Republic securities account number was not available from accountPairs or account profile.');
}
