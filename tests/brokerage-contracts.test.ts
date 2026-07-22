import assert from 'node:assert/strict';
import { describe, expect, it } from './test-compat.js';
import { TradeRepublicClient } from '../src/index.js';
import { FakeSocket } from './fake-socket.js';

describe('captured brokerage behavior', () => {
  it('maps friendly month and year validity choices to broker expiry payloads', async () => {
    const client = TradeRepublicClient.create();
    const base = {
      instrumentId: 'DE000FC95YR4',
      exchangeId: 'SGL',
      side: 'sell' as const,
      mode: 'stopMarket' as const,
      size: 3,
      stop: 0.8,
      secAccNo: '0000000000',
    };

    const month = await client.orders.prepare({
      ...base,
      validity: { type: 'month', referenceDate: '2026-07-16' },
    });
    const year = await client.orders.prepare({
      ...base,
      validity: { type: 'year', referenceDate: '2026-07-16' },
    });
    const goodTillCancelled = await client.orders.prepare({ ...base, validity: 'goodTillCancelled' });

    expect(month.parameters.expiry).toEqual({ type: 'gtd', value: '2026-08-15' });
    expect(year.parameters.expiry).toEqual({ type: 'gtd', value: '2027-07-16' });
    expect(goodTillCancelled.parameters.expiry).toEqual({ type: 'gtc' });
    await assert.rejects(
      client.orders.prepare({ ...base, validity: 'month', expiry: { type: 'gfd' } }),
      /either validity or expiry/i,
    );
  });

  it('normalizes custom expiry dates and timestamps to broker gtd dates', async () => {
    const client = TradeRepublicClient.create();
    const base = {
      instrumentId: 'DE0007164600',
      exchangeId: 'LSX',
      side: 'buy' as const,
      mode: 'limit' as const,
      size: 1,
      limit: 100,
      secAccNo: '0000000000',
    };

    const date = await client.orders.prepare({ ...base, expiry: { type: 'gtd', value: '2026-10-20' } });
    const isoTimestamp = await client.orders.prepare({
      ...base,
      expiry: { type: 'gtd', value: '2026-10-20T21:59:59.000Z' },
    });
    const dateObject = await client.orders.prepare({
      ...base,
      expiry: { type: 'gtd', value: new Date('2026-10-20T21:59:59.000Z') },
    });
    const unixMilliseconds = await client.orders.prepare({
      ...base,
      expiry: { type: 'gtd', value: Date.parse('2026-10-20T21:59:59.000Z') },
    });

    for (const order of [date, isoTimestamp, dateObject, unixMilliseconds]) {
      expect(order.parameters.expiry).toEqual({ type: 'gtd', value: '2026-10-20' });
    }
    await assert.rejects(
      client.orders.prepare({ ...base, expiry: { type: 'gtd', value: '2026-02-30' } }),
      /gtd expiry requires/i,
    );
  });

  it('uses numeric candle resolutions and normalizes aggregateHistoryLightV2 responses', async () => {
    const payloads: Array<Record<string, unknown>> = [];
    const sockets: FakeSocket[] = [];
    const actualClient = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          payloads.push(payload);
          socket.emit('message', `${id} A ${JSON.stringify({
            expectedClosingTime: 1_784_232_000_000,
            resolution: payload.resolution,
            lastAggregateEndTime: 1_784_160_000_000,
            aggregates: [{
              time: 1_784_160_000_000,
              open: '3.55',
              high: '4.12',
              low: '1.58',
              close: '3.51',
            }],
            unit: 'EUR',
          })}`);
        });
        sockets.push(socket);
        return socket;
      },
    });

    const series = await actualClient.market.candleSeries({
      assetId: 'DE000FC95YR4',
      exchangeId: 'SGL',
      timeframe: '10m',
      instrumentType: 'derivative',
      range: '5d',
    });

    expect(payloads[0]).toEqual({
      type: 'aggregateHistoryLightV2',
      isin: 'DE000FC95YR4',
      exchangeId: 'SGL',
      resolution: 600_000,
      range: '5d',
      unit: 'EUR',
    });
    expect(series).toMatchObject({
      resolutionMs: 600_000,
      expectedClosingTime: '2026-07-16T20:00:00.000Z',
      lastAggregateEndTime: '2026-07-16T00:00:00.000Z',
      unit: 'EUR',
      candles: [{
        time: '2026-07-16T00:00:00.000Z',
        open: 3.55,
        high: 4.12,
        low: 1.58,
        close: 3.51,
      }],
    });

    actualClient.close();
  });

  it('derives the broker chart resolutions from each instrument type', async () => {
    const payloads: Array<Record<string, unknown>> = [];
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          payloads.push(payload);
          const instrumentTypes: Record<string, string> = {
            DERIVATIVE: 'derivative',
            CRYPTO: 'crypto',
            BOND: 'bond',
            STOCK: 'stock',
          };
          socket.emit('message', `${id} A ${JSON.stringify({
            isin: payload.id,
            typeId: instrumentTypes[String(payload.id)],
          })}`);
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.market.availableCandleResolutions({ assetId: 'DERIVATIVE' }))
      .resolves.toEqual(['10m', '1h', '4h', '1d', '1w']);
    await expect(client.market.availableCandleResolutions({ assetId: 'CRYPTO' }))
      .resolves.toEqual(['10m', '1h', '4h', '1d', '1w']);
    await expect(client.market.availableCandleResolutions({ assetId: 'BOND' }))
      .resolves.toEqual(['1d', '1w']);
    await expect(client.market.availableCandleResolutions({ assetId: 'STOCK' }))
      .resolves.toEqual([
        '1m', '3m', '5m', '10m', '15m', '20m', '30m',
        '45m', '1h', '2h', '4h', '1d', '1w', '1M',
      ]);
    expect(payloads).toEqual([
      { type: 'instrument', id: 'DERIVATIVE' },
      { type: 'instrument', id: 'CRYPTO' },
      { type: 'instrument', id: 'BOND' },
      { type: 'instrument', id: 'STOCK' },
    ]);
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
