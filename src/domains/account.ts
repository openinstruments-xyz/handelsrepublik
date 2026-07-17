import { accountOperations, boardOperations } from '../operation-specs.js';
import type { OperationClient } from '../operations.js';
import type { AccountRelationship, Board } from '../types.js';

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

export class BoardsApi {
  constructor(private readonly operations: OperationClient) {}

  list(): Promise<Board[]> {
    return this.operations.execute(boardOperations.list, {});
  }

  get(boardId: string): Promise<Board> {
    return this.operations.execute(boardOperations.detail, { boardId });
  }
}
