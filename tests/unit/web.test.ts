import { expect } from '../test-compat.js';
import { mockFetchSequence, jsonResponse } from './test-helpers.js';
import assert from 'node:assert/strict';
import { describe, it } from '../test-compat.js';
import { TradeRepublicClient } from '../../src/index.js';

describe('web namespace', () => {
  it('exposes the web namespace', () => {
    const client = TradeRepublicClient.create();
    assert.ok(client.web);
    client.close();
  });

  it('calls account and read-only order convenience endpoints', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = TradeRepublicClient.create({
      rawSchemaValidation: 'off',
      fetch: mockFetchSequence(calls, [
        jsonResponse({ session: 'active' }),
        jsonResponse({ orders: [{ id: 'fund-order', status: 'EXECUTED' }] }),
        jsonResponse({ orders: [{ id: 'private-order', status: 'OPEN' }] }),
        jsonResponse({ raw: 'detailed' }, 201, { 'x-test': 'present' }),
      ]),
    });

    await expect(client.account.session()).resolves.toEqual({ session: 'active' });
    await expect(client.orders.mutualFunds({ page: 2, filters: { status: 'EXECUTED' } })).resolves.toEqual([
      expect.objectContaining({ id: 'fund-order', status: 'EXECUTED' }),
    ]);
    await expect(client.orders.privateMarkets({ pageNumber: 3, filters: { status: 'OPEN' } })).resolves.toEqual([
      expect.objectContaining({ id: 'private-order', status: 'OPEN' }),
    ]);
    const detailed = await client.web.requestDetailed<{ raw: string }>('POST', '/demo-check', {
      body: { ok: true },
      query: { source: 'tui' },
    });
    expect(detailed).toMatchObject({
      body: { raw: 'detailed' },
      status: 201,
    });
    expect(detailed.headers.get('x-test')).toBe('present');

    const urls = calls.map((call) => new URL(call.url));
    expect(urls.map((url) => url.pathname)).toEqual([
      '/api/v1/auth/web/session',
      '/api-gateway/mutual-funds/api/v1/orders',
      '/api/v1/private-markets/orders/all',
      '/demo-check',
    ]);
    expect(urls[1]?.searchParams.get('page')).toBe('2');
    expect(urls[1]?.searchParams.get('status')).toBe('EXECUTED');
    expect(urls[2]?.searchParams.get('pageNumber')).toBe('3');
    expect(urls[2]?.searchParams.get('status')).toBe('OPEN');
    expect(urls[3]?.searchParams.get('source')).toBe('tui');
    expect(calls[3]?.init.body).toBe(JSON.stringify({ ok: true }));
  });
});
