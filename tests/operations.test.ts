import { describe, expect, it } from './test-compat.js';
import { TradeRepublicClient } from '../src/index.js';

describe('declarative operations', () => {
  it('preserves configured endpoint overrides', async () => {
    const urls: string[] = [];
    const client = TradeRepublicClient.create({
      rawSchemaValidation: false,
      endpoints: {
        'auth.account': '/custom/account',
        'boards.detail': '/custom/boards/{boardId}',
      },
      fetch: async (input) => {
        urls.push(String(input));
        return new Response(JSON.stringify({ id: 'board/1', name: 'Primary' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    await client.account.current();
    await client.boards.get('board/1');

    expect(urls).toEqual([
      'https://api.traderepublic.com/custom/account',
      'https://api.traderepublic.com/custom/boards/board%2F1',
    ]);
  });
});
