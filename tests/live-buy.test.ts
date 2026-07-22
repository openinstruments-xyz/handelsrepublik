import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CreateOrderOptions, OrderSubmission } from '../src/index.js';
import { submitLiveMarketBuy, type LiveBuyClient } from './integration/live-buy.js';

describe('live market buy integration helper', () => {
  it('quotes the selected venue and forwards the ask as the market-order client price', async () => {
    let submittedOptions: CreateOrderOptions | undefined;
    const client: LiveBuyClient = {
      trading: {
        async orderDestinations() {
          return [
            { id: 'CLOSED', open: false, orderModes: ['market'], raw: {} },
            { id: 'OPEN', name: 'Open venue', open: true, orderModes: ['MARKET'], raw: {} },
          ];
        },
        async priceForOrder(options) {
          assert.deepEqual(options, { instrumentId: 'TEST123', exchangeId: 'OPEN', side: 'buy' });
          return { instrumentId: 'TEST123', exchangeId: 'OPEN', side: 'buy', ask: 0.51, price: 0.5, raw: {} };
        },
      },
      orders: {
        async submit(options) {
          submittedOptions = options;
          if (options.lastClientPrice === undefined) {
            throw new TypeError('Amount-based market orders require lastClientPrice.');
          }
          if (options.sizeStep !== 1) {
            throw new Error('Could not determine the order size step. Pass sizeStep explicitly.');
          }
          return {
            status: 'succeeded',
            orderId: 'order-1',
            clientProcessId: 'process-1',
            updates: [],
            raw: {},
          } satisfies OrderSubmission;
        },
      },
    };

    const result = await submitLiveMarketBuy(client, 'TEST123', 5);

    assert.equal(result.status, 'submitted');
    assert.equal(submittedOptions?.lastClientPrice, 0.51);
    assert.equal(submittedOptions?.amount, 5);
    assert.equal(submittedOptions?.sizeStep, 1);
  });

  it('does not submit when the selected venue has no positive current price', async () => {
    let submissions = 0;
    const client: LiveBuyClient = {
      trading: {
        async orderDestinations() {
          return [{ id: 'OPEN', open: true, orderModes: ['market'], raw: {} }];
        },
        async priceForOrder() {
          return { instrumentId: 'TEST123', exchangeId: 'OPEN', side: 'buy', raw: {} };
        },
      },
      orders: {
        async submit() {
          submissions += 1;
          throw new Error('must not submit without a usable quote');
        },
      },
    };

    const result = await submitLiveMarketBuy(client, 'TEST123', 5);

    assert.deepEqual(result, {
      status: 'skipped',
      reason: 'no positive current ask or market price is available for TEST123 at OPEN; refusing to execute orders',
    });
    assert.equal(submissions, 0);
  });
});
