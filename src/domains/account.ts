import { accountOperations } from '../operation-specs.js';
import type { OperationClient } from '../operations.js';
import type { AccountRelationship } from '../types.js';

export class AccountApi {
  constructor(private readonly operations: OperationClient) {}

  current(): Promise<unknown> {
    return this.operations.executeRaw(accountOperations.current, {});
  }

  session(): Promise<unknown> {
    return this.operations.executeRaw(accountOperations.session, {});
  }

  accountSettings(): Promise<unknown> {
    return this.operations.executeRaw(accountOperations.accountSettings, {});
  }

  personalDetails(): Promise<unknown> {
    return this.operations.executeRaw(accountOperations.personalDetails, {});
  }

  appUsageConsents(): Promise<unknown> {
    return this.operations.executeRaw(accountOperations.appUsageConsents, {});
  }

  relationships(): Promise<AccountRelationship[]> {
    return this.operations.execute(accountOperations.relationships, {});
  }

  rawRelationships(): Promise<unknown> {
    return this.operations.executeRaw(accountOperations.relationships, {});
  }

  cardsHome(): Promise<unknown> {
    return this.operations.executeRaw(accountOperations.cardsHome, {});
  }
}
