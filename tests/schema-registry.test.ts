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

describe('schema registry', () => {
  it('validates committed raw fixtures', () => {
    for (const fixture of [
      ['portfolio.cash', 'portfolio.cash.json'],
      ['auth.account', 'auth.account.json'],
      ['priceAlarms.list', 'priceAlarms.list.json'],
      ['discovery.watchlists', 'discovery.watchlists.json'],
      ['market.candles', 'market.candles.json'],
      ['trading.orderDestinations', 'trading.orderDestinations.json'],
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

  it('documents live-safe and blocked mutation risk classes', () => {
    const lowRisk = schemaRegistry.filter((entry) => entry.risk === 'lowRiskMutation').map((entry) => entry.name);
    const highRisk = schemaRegistry.filter((entry) => entry.risk === 'highRiskMutation').map((entry) => entry.name);
    const blocked = schemaRegistry.filter((entry) => entry.risk === 'blockedMutation').map((entry) => entry.name);

    assert.deepEqual(lowRisk.sort(), [
      'discovery.watchlists.addItem',
      'discovery.watchlists.clone',
      'discovery.watchlists.delete',
      'discovery.watchlists.removeItem',
      'discovery.watchlists.rename',
      'priceAlarms.cancel',
      'priceAlarms.create',
    ].sort());
    assert.deepEqual(highRisk.sort(), ['orders.cancel', 'orders.submit']);
    assert.ok(blocked.includes('blocked.orderMutations'));
    assert.ok(blocked.includes('blocked.bankTransfers'));
    assert.ok(blocked.includes('blocked.documentAcceptance'));
    assert.ok(blocked.includes('blocked.accountSecurity'));
  });

  it('has request and response schemas for every entry', () => {
    for (const entry of schemaRegistry) {
      assert.equal(typeof entry.requestSchema.safeParse, 'function', entry.name);
      assert.equal(typeof entry.responseSchema.safeParse, 'function', entry.name);
    }
  });

  it('generates a catalog that includes transport and risk metadata', () => {
    const catalog = schemaCatalogMarkdown();
    assert.match(catalog, /`portfolio\.cash`/);
    assert.match(catalog, /`blockedMutation`/);
    assert.match(catalog, /`highRiskMutation`/);
    assert.match(catalog, /websocket/);
  });
});

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'schemas', name), 'utf8'));
}
