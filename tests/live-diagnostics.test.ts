import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TradeRepublicHttpError,
  TradeRepublicSchemaError,
} from '../src/index.js';
import { withLiveDiagnostics } from './live-diagnostics.js';

describe('live integration diagnostics', () => {
  it('logs HTTP response details while redacting auth data', async () => {
    const error = new TradeRepublicHttpError('request failed', 500, {
      errorCode: 'BROKER_UNAVAILABLE',
      accessToken: 'must-not-appear',
      nested: { cookie: 'also-secret' },
    });
    const messages: string[] = [];

    await assert.rejects(
      withLiveDiagnostics('payments.iban', () => Promise.reject(error), (message) => messages.push(message)),
      (thrown) => thrown === error,
    );

    const output = messages.join('\n');
    assert.match(output, /payments\.iban/);
    assert.match(output, /BROKER_UNAVAILABLE/);
    assert.match(output, /"status": 500/);
    assert.doesNotMatch(output, /must-not-appear|also-secret/);
    assert.match(output, /\[REDACTED\]/);
  });

  it('logs schema names, issues, and raw response summaries', async () => {
    const error = new TradeRepublicSchemaError(
      'schema failed',
      'orders.mutualFunds',
      [{ code: 'unrecognized_keys', keys: ['total'] }],
      { kind: 'object', keys: ['items', 'total'] },
    );
    const messages: string[] = [];

    await assert.rejects(
      withLiveDiagnostics('mutual funds', () => Promise.reject(error), (message) => messages.push(message)),
      (thrown) => thrown === error,
    );

    const output = messages.join('\n');
    assert.match(output, /orders\.mutualFunds/);
    assert.match(output, /unrecognized_keys/);
    assert.match(output, /items/);
    assert.match(output, /total/);
  });

  it('always rethrows 4xx and 5xx responses', async () => {
    const messages: string[] = [];

    for (const status of [400, 401, 403, 404, 500, 503]) {
      const error = new TradeRepublicHttpError(`request failed with ${status}`, status, { errorCode: `HTTP_${status}` });
      await assert.rejects(
        withLiveDiagnostics(`status.${status}`, () => Promise.reject(error), (message) => messages.push(message)),
        (thrown) => thrown === error,
      );
    }

    assert.equal(messages.length, 6);
    assert.equal(messages.every((message) => message.includes('failed')), true);
  });
});
