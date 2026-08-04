import { expect } from '../test-compat.js';
import { FakeSocket } from '../fake-socket.js';
import assert from 'node:assert/strict';
import { describe, it } from '../test-compat.js';
import { TradeRepublicClient } from '../../src/index.js';

describe('trading namespace', () => {
  it('exposes the trading namespace', () => {
    const client = TradeRepublicClient.create();
    assert.ok(client.trading);
    client.close();
  });

  it('normalizes venue capabilities and venue-specific order prices', async () => {
    const calls: string[] = [];
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      fetch: (async (url: URL | RequestInfo) => {
        calls.push(String(url));
        return new Response(JSON.stringify({
          destinations: [{
            id: 'SGL',
            name: 'Société Générale',
            type: 'EXCHANGE',
            orderModes: ['limit', 'market', 'stopMarket'],
            orderExpiries: ['gfd', 'gtd'],
            listingId: 'listing-1',
            currencyId: 'EUR',
            open: true,
            openTimeOffsetMillis: 28_800_000,
            closeTimeOffsetMillis: 79_200_000,
            timeZoneId: 'Europe/Berlin',
            maintenanceWindow: null,
            ongoingOutage: false,
            priority: 60,
            tickSizes: null,
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }) as typeof fetch,
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'homeInstrumentExchange') {
            socket.emit('message', `${id} A ${JSON.stringify({
              exchangeId: 'SGL',
              exchange: {
                id: 'SGL',
                name: 'Société Générale',
                timeZoneId: 'Europe/Berlin',
              },
              currency: { id: 'EUR' },
              open: true,
              orderModes: ['limit', 'market', 'stopMarket'],
              orderExpiries: ['gfd', 'gtd'],
              openTimeOffsetMillis: 28_800_000,
              closeTimeOffsetMillis: 79_200_000,
              maintenanceWindow: null,
            })}`);
            return;
          }
          socket.emit('message', `${id} A ${JSON.stringify({
            time: 1_784_219_325_918,
            price: '1.54',
            bidPrice: '1.53',
            askPrice: '1.54',
            unit: 'EUR',
          })}`);
        });
        sockets.push(socket);
        return socket;
      },
    });

    const destinations = await client.trading.orderDestinations('DE000FC95YR4', {
      productContext: 'derivative',
    });
    const home = await client.trading.homeOrderDestination('DE000FC95YR4');
    const quote = await client.trading.priceForOrder({
      instrumentId: 'DE000FC95YR4',
      exchangeId: 'SGL',
      side: 'buy',
    });

    expect(destinations[0]).toMatchObject({
      id: 'SGL',
      name: 'Société Générale',
      type: 'EXCHANGE',
      orderModes: ['limit', 'market', 'stopMarket'],
      orderExpiries: ['gfd', 'gtd'],
      currencyId: 'EUR',
      open: true,
      timeZoneId: 'Europe/Berlin',
      ongoingOutage: false,
      priority: 60,
    });
    expect(home).toMatchObject({
      id: 'SGL',
      name: 'Société Générale',
      orderModes: ['limit', 'market', 'stopMarket'],
      orderExpiries: ['gfd', 'gtd'],
      currencyId: 'EUR',
      open: true,
      timeZoneId: 'Europe/Berlin',
    });
    expect(quote).toMatchObject({
      instrumentId: 'DE000FC95YR4',
      exchangeId: 'SGL',
      side: 'buy',
      price: 1.54,
      bid: 1.53,
      ask: 1.54,
      unit: 'EUR',
      time: '2026-07-16T16:28:45.918Z',
    });
    const priceSubscription = sockets.flatMap((socket) => socket.sent)
      .find((message) => message.startsWith('sub ') && message.includes('"priceForOrderV2"'));
    expect(JSON.parse(priceSubscription?.split(' ').slice(2).join(' ') ?? '{}')).toEqual({
      type: 'priceForOrderV2',
      unit: 'EUR',
      isin: 'DE000FC95YR4',
      exchangeId: 'SGL',
      side: 'buy',
    });
    assert.match(calls[0] ?? '', /productContext=derivative/);
    client.close();
  });
});
