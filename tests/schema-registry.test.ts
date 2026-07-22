import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  schemaCatalogMarkdown,
  schemaRegistry,
  TradeRepublicSchemaError,
  validateRawResponse,
} from '../src/index.js';
import {
  accountOperations,
  customerOperations,
  discoveryOperations,
} from '../src/operation-specs.js';

const operationCatalog = [
  ...Object.values(accountOperations),
  ...Object.values(discoveryOperations),
  ...Object.values(customerOperations),
] as const;

describe('schema registry', () => {
  it('validates committed raw fixtures', () => {
    for (const fixture of [
      ['portfolio.cash', 'portfolio.cash.json'],
      ['auth.account', 'auth.account.json'],
      ['priceAlarms.list', 'priceAlarms.list.json'],
      ['discovery.watchlists', 'discovery.watchlists.json'],
      ['market.candles', 'market.candles.json'],
      ['trading.orderDestinations', 'trading.orderDestinations.json'],
      ['orders.submit', 'orders.submit.exchangeClosed.json'],
      ['orders.cancel', 'orders.cancel.orderNotFound.json'],
    ] as const) {
      assert.doesNotThrow(() => validateRawResponse(fixture[0], readFixture(fixture[1])), fixture[0]);
    }
  });

  it('rejects unknown keys for strict schema variants', () => {
    assert.throws(
      () => validateRawResponse('portfolio.cash', [
        { accountNumber: '0000000002', currencyId: 'EUR', amount: 12.5, unknown: true },
      ]),
      TradeRepublicSchemaError,
    );
  });

  it('accepts paginated item wrappers with a total', () => {
    const response = {
      items: [],
      total: 0,
    };

    assert.deepEqual(validateRawResponse('orders.mutualFunds', response), response);
    assert.throws(
      () => validateRawResponse('orders.mutualFunds', { ...response, unknown: true }),
      TradeRepublicSchemaError,
    );
  });

  it('validates the current derivative screener envelope', () => {
    const response = {
      results: [],
      resultCount: 0,
      issuerCount: { SOC_GEN: 0, HSBC: 0 },
      cursors: { before: null, after: null },
    };

    assert.deepEqual(validateRawResponse('derivatives.listForUnderlying', response), response);
    assert.throws(
      () => validateRawResponse('derivatives.listForUnderlying', { ...response, unknown: true }),
      TradeRepublicSchemaError,
    );
  });

  it('validates timeline activity cursors', () => {
    const response = {
      items: [],
      cursors: { before: 'previous', after: 'next' },
    };

    assert.deepEqual(validateRawResponse('timeline.list', response), response);
    assert.throws(
      () => validateRawResponse('timeline.list', { ...response, cursors: { ...response.cursors, unknown: true } }),
      TradeRepublicSchemaError,
    );
  });

  it('validates IBAN information through account relationships', () => {
    const response = {
      relationships: [{
        relationshipType: 'SELF',
        bankingInfo: { iban: 'DE00', bic: 'TRBKDEBBXXX' },
      }],
    };

    assert.deepEqual(validateRawResponse('payments.iban', response), response);
    assert.throws(
      () => validateRawResponse('payments.iban', { iban: 'DE00' }),
      TradeRepublicSchemaError,
    );
    assert.throws(
      () => validateRawResponse('payments.iban', { relationships: [] }),
      TradeRepublicSchemaError,
    );
  });

  it('validates known order mutation states and rejects unknown ones', () => {
    assert.doesNotThrow(() => validateRawResponse('orders.submit', { status: 'received' }));
    assert.doesNotThrow(() => validateRawResponse('orders.submit', { status: 'waiting' }));
    assert.doesNotThrow(() => validateRawResponse('orders.submit', { status: 'confirmationNeeded' }));
    assert.doesNotThrow(() => validateRawResponse('orders.submit', { status: 'succeeded', orderId: 'order-1' }));
    assert.doesNotThrow(() => validateRawResponse('orders.cancel', { status: 'failed', error: 'already closed' }));
    assert.throws(
      () => validateRawResponse('orders.submit', { status: 'queued' }),
      TradeRepublicSchemaError,
    );
    assert.throws(
      () => validateRawResponse('orders.submit', { status: 'failed', unknown: true }),
      TradeRepublicSchemaError,
    );
    assert.throws(
      () => validateRawResponse('orders.submit', {
        status: 'failed',
        message: 'Exchange is closed',
        error: {
          code: 'exchangeClosed',
          message: 'Exchange is closed',
          details: {
            exchangeId: 'LSX',
            isin: 'US0378331005',
            isNostro: false,
            clientProcessId: 'process-1',
            unknown: true,
          },
        },
      }),
      TradeRepublicSchemaError,
    );
    assert.throws(
      () => validateRawResponse('orders.submit', {
        status: 'failed',
        message: 'Exchange is closed',
        error: {
          code: 'exchangeClosed',
          message: 'Exchange is closed',
          details: { exchangeId: 'LSX', isin: 'US0378331005', isNostro: false },
        },
      }),
      TradeRepublicSchemaError,
    );
    assert.throws(
      () => validateRawResponse('orders.submit', {
        status: 'failed',
        error: { code: 'newBrokerError' },
      }),
      TradeRepublicSchemaError,
    );
  });

  it('documents supported mutation risk classes', () => {
    const lowRisk = schemaRegistry.filter((entry) => entry.risk === 'lowRiskMutation').map((entry) => entry.name);
    const highRisk = schemaRegistry.filter((entry) => entry.risk === 'highRiskMutation').map((entry) => entry.name);

    assert.deepEqual(lowRisk.sort(), [
      'discovery.watchlists.addItem',
      'discovery.watchlists.clone',
      'discovery.watchlists.delete',
      'discovery.watchlists.removeItem',
      'discovery.watchlists.rename',
      'priceAlarms.cancel',
      'priceAlarms.create',
    ].sort());
    assert.deepEqual(highRisk.sort(), ['orders.cancel', 'orders.replace', 'orders.submit']);
  });

  it('has request and response schemas for every entry', () => {
    for (const entry of schemaRegistry) {
      assert.equal(typeof entry.requestSchema.safeParse, 'function', entry.name);
      assert.equal(typeof entry.responseSchema.safeParse, 'function', entry.name);
    }
  });

  it('backs every declarative operation with a registered response schema', () => {
    const schemaNames = new Set(schemaRegistry.map((entry) => entry.name));
    for (const operation of operationCatalog) {
      assert.ok(operation.schemaName, `${operation.name} has no response schema`);
      assert.equal(schemaNames.has(operation.schemaName), true, `${operation.name} uses unknown schema ${operation.schemaName}`);
    }
  });

  it('generates a catalog that includes transport and risk metadata', () => {
    const catalog = schemaCatalogMarkdown();
    assert.match(catalog, /`portfolio\.cash`/);
    assert.match(catalog, /`highRiskMutation`/);
    assert.doesNotMatch(catalog, /`blockedMutation`/);
    assert.match(catalog, /websocket/);
  });
});

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'schemas', name), 'utf8'));
}
