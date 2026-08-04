import { describe, expect, it } from '../test-compat.js';
import { TradeRepublicClient } from '../../src/index.js';
import { FakeSocket } from '../fake-socket.js';
import { TEST_DEVICE_INFO, mockFetch, parseSubPayload, accountPairsPayload } from './test-helpers.js';

describe('portfolio namespace', () => {
  it('normalizes portfolio and cash payloads', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') {
            socket.emit('message', `${id} A ${JSON.stringify(accountPairsPayload())}`);
          }
          if (payload.type === 'availableCash') {
            socket.emit('message', `${id} availableCash ${JSON.stringify([{ accountNumber: '0000000002', currencyId: 'EUR', amount: 12.5 }])}`);
          }
          if (payload.type === 'compactPortfolioByTypeV2') {
            expect(payload.secAccNo).toBe('0000000001');
            socket.emit('message', `${id} portfolio ${JSON.stringify({ positions: [{ instrumentId: 'US1', instrumentName: 'Example', shares: '2', marketValue: { amount: '42', currency: 'EUR' } }] })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.portfolio.current()).resolves.toEqual({
      positions: [
        expect.objectContaining({ id: 'US1', name: 'Example', quantity: 2, value: 42, currency: 'EUR' }),
      ],
      raw: expect.any(Object),
    });
    expect(sockets[0]?.sent[0]).toMatch(/^connect 34 /);
    expect(sockets[0]?.sent[1]).toBe('sub 1 {"type":"accountPairs"}');
    expect(sockets[1]?.sent[1]).toBe('sub 1 {"type":"compactPortfolioByTypeV2","secAccNo":"0000000001"}');
    await expect(client.portfolio.cash()).resolves.toEqual(expect.objectContaining({ amount: 12.5, currency: 'EUR' }));
    expect(sockets[2]?.sent[1]).toBe('sub 1 {"type":"availableCash"}');
  });

  it('flattens current category-based portfolio payloads', async () => {
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') socket.emit('message', `${id} A ${JSON.stringify(accountPairsPayload())}`);
          if (payload.type === 'compactPortfolioByTypeV2') {
            socket.emit('message', `${id} portfolio ${JSON.stringify({
              categories: [
                { categoryType: 'stocks', positions: [{ instrumentId: 'US1', shares: '2' }] },
                { categoryType: 'crypto', positions: [{ instrumentId: 'BTC', quantity: '0.1' }] },
              ],
            })}`);
          }
        });
        return socket;
      },
    });

    await expect(client.portfolio.current()).resolves.toEqual({
      positions: [
        expect.objectContaining({ id: 'US1', quantity: 2, categoryType: 'stocks' }),
        expect.objectContaining({ id: 'BTC', quantity: 0.1, categoryType: 'crypto' }),
      ],
      raw: expect.any(Object),
    });
  });

  it('refreshes a stale cached securities account number before portfolio queries', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      session: {
        deviceInfo: TEST_DEVICE_INFO,
        securitiesAccountNumber: '0000000002',
      },
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') {
            socket.emit('message', `${id} A ${JSON.stringify(accountPairsPayload())}`);
          }
          if (payload.type === 'compactPortfolioByTypeV2') {
            expect(payload.secAccNo).toBe('0000000001');
            socket.emit('message', `${id} portfolio ${JSON.stringify([])}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.portfolio.current()).resolves.toEqual({
      positions: [],
      raw: [],
    });
    expect(client.securitiesAccountNumber).toBe('0000000001');
  });

  it('exposes portfolio extras and auto-resolves securities account numbers', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      fetch: mockFetch(calls, { data: [{ time: '2026-07-03T00:00:00.000Z', value: 100 }] }),
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') {
            socket.emit('message', `${id} A ${JSON.stringify(accountPairsPayload())}`);
          }
          if (payload.type === 'savingsPlans') {
            expect(payload.secAccNo).toBe('0000000001');
            socket.emit('message', `${id} savingsPlans ${JSON.stringify({ items: [{ savingsPlanId: 'sp1', isin: 'US1', amount: { value: '25', currency: 'EUR' } }] })}`);
          }
          if (payload.type === 'privateMarketsPositions') {
            expect(payload.secAccNo).toBe('0000000001');
            socket.emit('message', `${id} privateMarketsPositions ${JSON.stringify({ positions: [{ id: 'pm1' }] })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.portfolio.savingsPlans()).resolves.toEqual([
      expect.objectContaining({ id: 'sp1', isin: 'US1', amount: 25, currency: 'EUR' }),
    ]);
    await expect(client.portfolio.privateMarketsPositions()).resolves.toEqual({ positions: [{ id: 'pm1' }] });
    await expect(client.portfolio.portfolioChart(undefined, '1m', { currency: 'EUR' })).resolves.toEqual({
      points: [{ time: '2026-07-03T00:00:00.000Z', value: 100 }],
      raw: { data: [{ time: '2026-07-03T00:00:00.000Z', value: 100 }] },
    });

    const chartUrl = new URL(calls[0]?.url ?? 'https://invalid.local/');
    expect(chartUrl.pathname).toBe('/api-gateway/portfolio-chart/v2/chart');
    expect(chartUrl.searchParams.get('secAccNo')).toBe('0000000001');
    expect(chartUrl.searchParams.get('range')).toBe('1m');
    expect(chartUrl.searchParams.get('currency')).toBe('EUR');
    expect(parseSubPayload(sockets[1]?.sent[1])).toEqual({ type: 'savingsPlans', secAccNo: '0000000001' });
    expect(parseSubPayload(sockets[3]?.sent[1])).toEqual({ type: 'privateMarketsPositions', secAccNo: '0000000001' });
  });

  it('normalizes portfolio convenience queries and resolves explicit positions', async () => {
    const payloads: Array<Record<string, unknown>> = [];
    const client = TradeRepublicClient.create({
      rawSchemaValidation: 'off',
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          payloads.push(payload);
          if (payload.type === 'portfolioStatus') {
            socket.emit('message', `${id} portfolioStatus ${JSON.stringify({ amount: 125.5, currencyId: 'EUR' })}`);
          }
          if (payload.type === 'compactPortfolioByTypeV2') {
            socket.emit('message', `${id} compactPortfolioByTypeV2 ${JSON.stringify({ positions: [{ instrumentId: 'US1', shares: 2 }] })}`);
          }
        });
        return socket;
      },
    });

    await expect(client.portfolio.markToMarketValue()).resolves.toMatchObject({ amount: 125.5, currency: 'EUR' });
    await expect(client.portfolio.positionsForAccount('0000000042', { timeoutMs: 100 })).resolves.toEqual({
      positions: [expect.objectContaining({ id: 'US1', quantity: 2 })],
      raw: { positions: [{ instrumentId: 'US1', shares: 2 }] },
    });
    expect(payloads).toEqual([
      { type: 'portfolioStatus' },
      { type: 'compactPortfolioByTypeV2', secAccNo: '0000000042' },
    ]);
  });
});
