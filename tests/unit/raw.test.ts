import assert from 'node:assert/strict';
import { describe, expect, it } from '../test-compat.js';
import { TradeRepublicClient } from '../../src/index.js';
import { mockFetch } from './test-helpers.js';

describe('raw namespace', () => {
  it('rejects drifted raw payloads by default', async () => {
    const client = TradeRepublicClient.create({
      fetch: mockFetch([], { unexpected: true }),
    });

    await assert.rejects(
      () => client.account.current(),
      /Trade Republic schema validation failed for auth\.account/,
    );
  });

  it('can disable raw schema validation for drifted payloads', async () => {
    const payload = { unexpected: true };
    const client = TradeRepublicClient.create({
      rawSchemaValidation: 'off',
      fetch: mockFetch([], payload),
    });

    await expect(client.account.current()).resolves.toEqual(payload);
  });

  it('can validate drifted payloads without throwing', async () => {
    const payload = { unexpected: true };
    const failures: unknown[] = [];
    const client = TradeRepublicClient.create({
      rawSchemaValidation: 'passthrough',
      onRawSchemaValidationFailure: (failure) => failures.push(failure),
      fetch: mockFetch([], payload),
    });

    await expect(client.account.current()).resolves.toEqual(payload);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      schemaName: 'auth.account',
      value: payload,
      error: expect.any(Error),
    });
  });
});
