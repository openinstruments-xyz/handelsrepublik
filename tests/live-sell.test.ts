import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CreateOrderOptions, OrderSubmission } from '../src/index.js';
import { submitLiveMarketSell, type LiveSellClient } from './integration/live-sell.js';

describe('live market sell integration helper', () => {
  it('quotes the selected venue and forwards the bid as the market-order client price', async () => {
    let submittedOptions: CreateOrderOptions | undefined;
    const client: LiveSellClient = {
      trading: {
        async orderDestinations() {
          return [{ id: 'OPEN', name: 'Open venue', open: true, orderModes: ['MARKET'], raw: {} }];
        },
        async priceForOrder(options) {
          assert.deepEqual(options, { instrumentId: 'TEST123', exchangeId: 'OPEN', side: 'sell' });
          return { instrumentId: 'TEST123', exchangeId: 'OPEN', side: 'sell', bid: 0.49, price: 0.5, raw: {} };
        },
      },
      orders: {
        async submit(options) {
          submittedOptions = options;
          return { status: 'succeeded', orderId: 'order-1', clientProcessId: 'process-1', updates: [], raw: {} } satisfies OrderSubmission;
        },
      },
    };

    const result = await submitLiveMarketSell(client, 'TEST123', 1);

    assert.equal(result.status, 'submitted');
    assert.equal(submittedOptions?.side, 'sell');
    assert.equal(submittedOptions?.lastClientPrice, 0.49);
    assert.equal(submittedOptions?.size, 1);
  });

  it('does not submit when the selected venue has no positive current price', async () => {
    let submissions = 0;
    const client: LiveSellClient = {
      trading: {
        async orderDestinations() {
          return [{ id: 'OPEN', open: true, orderModes: ['market'], raw: {} }];
        },
        async priceForOrder() {
          return { instrumentId: 'TEST123', exchangeId: 'OPEN', side: 'sell', raw: {} };
        },
      },
      orders: {
        async submit() {
          submissions += 1;
          throw new Error('must not submit without a usable quote');
        },
      },
    };

    const result = await submitLiveMarketSell(client, 'TEST123', 1);

    assert.deepEqual(result, {
      status: 'skipped',
      reason: 'no positive current bid or market price is available for TEST123 at OPEN; refusing to execute orders',
    });
    assert.equal(submissions, 0);
  });
});
