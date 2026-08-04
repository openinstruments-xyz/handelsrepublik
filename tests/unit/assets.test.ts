import { describe, expect, it } from '../test-compat.js';
import { TradeRepublicClient } from '../../src/index.js';
import { FakeSocket } from '../fake-socket.js';
import { parseSubPayload } from './test-helpers.js';

describe('assets namespace', () => {
  it('queries assets through neonSearch and instrument resources', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'neonSearch') {
            socket.emit('message', `${id} neonSearch ${JSON.stringify({ results: [{ isin: 'US1', name: 'Apple Inc.', type: 'stock' }] })}`);
          }
          if (payload.type === 'instrument') {
            socket.emit('message', `${id} instrument ${JSON.stringify({ isin: payload.id, name: 'Apple Inc.', issuer: { name: 'Issuer' } })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.assets.search('apple', { limit: 5 })).resolves.toEqual([
      expect.objectContaining({ id: 'US1', name: 'Apple Inc.', type: 'stock' }),
    ]);
    await expect(client.assets.listAll({ cursor: '2', limit: 10 })).resolves.toEqual([
      expect.objectContaining({ id: 'US1' }),
    ]);
    await expect(client.assets.get('US1')).resolves.toEqual(expect.objectContaining({ id: 'US1', issuer: 'Issuer' }));

    expect(parseSubPayload(sockets[0]?.sent[1])).toMatchObject({
      type: 'neonSearch',
      data: {
        q: 'apple',
        page: 1,
        pageSize: 5,
        filter: [{ key: 'type', value: 'stock' }, { key: 'jurisdiction', value: 'DE' }],
      },
    });
    expect(parseSubPayload(sockets[1]?.sent[1])).toMatchObject({
      type: 'neonSearch',
      data: { q: '', page: 2, pageSize: 10 },
    });
    expect(parseSubPayload(sockets[2]?.sent[1])).toEqual({ type: 'instrument', id: 'US1' });
  });

  it('maps ETF and mutual-fund searches to Trade Republic neonSearch types', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'neonSearch') {
            socket.emit('message', `${id} neonSearch ${JSON.stringify({ results: [] })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await client.assets.search('bitcoin', { type: 'etf' });
    await client.assets.search('income', { type: 'mutualFund' });

    expect(parseSubPayload(sockets[0]?.sent[1])).toMatchObject({
      type: 'neonSearch',
      data: { filter: [{ key: 'type', value: 'fund' }, { key: 'jurisdiction', value: 'DE' }] },
    });
    expect(parseSubPayload(sockets[1]?.sent[1])).toMatchObject({
      type: 'neonSearch',
      data: { filter: [{ key: 'type', value: 'mutualFund' }, { key: 'jurisdiction', value: 'DE' }] },
    });
  });
});
