import { describe, expect, it } from '../test-compat.js';
import { TradeRepublicClient } from '../../src/index.js';
import { FakeSocket } from '../fake-socket.js';
import { parseSubPayload } from './test-helpers.js';

describe('derivatives namespace', () => {
  it('queries derivatives through neonSearch, derivatives, and instrument resources', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'neonSearch') {
            socket.emit('message', `${id} neonSearch ${JSON.stringify({ results: [{ isin: 'DE1', productType: 'knockout', underlyingId: 'US1' }] })}`);
          }
          if (payload.type === 'derivatives') {
            socket.emit('message', `${id} derivatives ${JSON.stringify({ results: [{ isin: 'DE2', productCategory: 'knockouts', underlyingId: payload.underlying }] })}`);
          }
          if (payload.type === 'instrument') {
            socket.emit('message', `${id} instrument ${JSON.stringify({ isin: payload.id, productType: 'warrant', underlying: { id: 'US1' } })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.derivatives.search('tesla', { underlyingId: 'US1', direction: 'long', limit: 7 })).resolves.toEqual([
      expect.objectContaining({ id: 'DE1', productType: 'knockout', underlyingId: 'US1' }),
    ]);
    await expect(client.derivatives.listForUnderlying('US1', { direction: 'short', productType: 'knockouts', limit: 11 })).resolves.toEqual([
      expect.objectContaining({ id: 'DE2', underlyingId: 'US1' }),
    ]);
    await expect(client.derivatives.get('DE3')).resolves.toEqual(expect.objectContaining({ id: 'DE3', productType: 'warrant', underlyingId: 'US1' }));

    expect(parseSubPayload(sockets[0]?.sent[1])).toMatchObject({
      type: 'neonSearch',
      data: {
        q: 'tesla',
        page: 1,
        pageSize: 7,
        filter: [
          { key: 'type', value: 'derivative' },
          { key: 'jurisdiction', value: 'DE' },
          { key: 'underlying', value: 'US1' },
          { key: 'optionType', value: 'long' },
        ],
      },
    });
    expect(parseSubPayload(sockets[1]?.sent[1])).toEqual({
      type: 'derivatives',
      jurisdiction: 'DE',
      lang: 'en',
      underlying: 'US1',
      productCategory: 'knockOutProduct',
      optionType: 'short',
      sortBy: 'leverage',
      sortDirection: 'asc',
      pageSize: null,
    });
    expect(parseSubPayload(sockets[2]?.sent[1])).toEqual({ type: 'instrument', id: 'DE3' });
  });
});
