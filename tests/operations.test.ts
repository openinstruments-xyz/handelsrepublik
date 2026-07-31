import { describe, expect, it } from './test-compat.js';
import { TradeRepublicClient } from '../src/index.js';

describe('declarative operations', () => {
  it('preserves configured endpoint overrides', async () => {
    const urls: string[] = [];
    const client = TradeRepublicClient.create({
      rawSchemaValidation: 'off',
      endpoints: {
        'auth.account': '/custom/account',
        'market.entitlements': '/custom/entitlements/{topic}',
      },
      fetch: async (input) => {
        urls.push(String(input));
        return new Response(JSON.stringify({ payload: 'ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    await client.account.current();
    await client.market.entitlements('board/1', { exchangeIds: ['LSX'] });

    expect(urls).toEqual([
      'https://api.traderepublic.com/custom/account',
      'https://api.traderepublic.com/custom/entitlements/board%2F1?exchangeId=LSX',
    ]);
  });
});
