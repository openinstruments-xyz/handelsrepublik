import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TradeRepublicClient } from '../src/index.js';
import {
  isClosedBerlinWindow,
  isOpenBerlinWindow,
  isWeekdayClosedBerlinWindow,
  isWeekendBerlin,
  selectLimitOrderCandidate,
} from './integration/order-live-runtime.js';

describe('live order safety windows', () => {
  it('accepts only the configured 23:00–06:40 closed-market Berlin window', () => {
    assert.equal(isClosedBerlinWindow(new Date('2026-07-21T21:00:00Z')), true);
    assert.equal(isClosedBerlinWindow(new Date('2026-07-22T04:39:00Z')), true);
    assert.equal(isClosedBerlinWindow(new Date('2026-07-22T04:40:00Z')), false);
    assert.equal(isClosedBerlinWindow(new Date('2026-07-22T20:59:00Z')), false);
  });

  it('accepts only weekdays from 07:00 until before 22:40 Berlin', () => {
    assert.equal(isOpenBerlinWindow(new Date('2026-07-22T04:59:00Z')), false);
    assert.equal(isOpenBerlinWindow(new Date('2026-07-22T05:00:00Z')), true);
    assert.equal(isOpenBerlinWindow(new Date('2026-07-22T20:39:00Z')), true);
    assert.equal(isOpenBerlinWindow(new Date('2026-07-22T20:40:00Z')), false);
    assert.equal(isOpenBerlinWindow(new Date('2026-07-25T10:00:00Z')), false);
  });

  it('keeps closed-limit rejection on weekday overnights', () => {
    assert.equal(isWeekdayClosedBerlinWindow(new Date('2026-07-23T23:30:00Z')), true);
    assert.equal(isWeekdayClosedBerlinWindow(new Date('2026-07-25T00:30:00Z')), false);
    assert.equal(isWeekdayClosedBerlinWindow(new Date('2026-07-27T04:30:00Z')), true);
  });

  it('identifies the whole Berlin weekend for rejection checks', () => {
    assert.equal(isWeekendBerlin(new Date('2026-07-24T21:59:00Z')), false);
    assert.equal(isWeekendBerlin(new Date('2026-07-24T22:00:00Z')), true);
    assert.equal(isWeekendBerlin(new Date('2026-07-26T21:59:00Z')), true);
    assert.equal(isWeekendBerlin(new Date('2026-07-26T22:00:00Z')), false);
  });

  it('selects a limit-capable closed destination when openness is not required', async () => {
    const client = {
      trading: {
        async orderDestinations() {
          return [{ id: 'LSX', open: false, orderModes: ['limit'], raw: {} }];
        },
      },
      market: {
        async quote() {
          return { bid: 200 };
        },
      },
    } as unknown as TradeRepublicClient;

    assert.equal(
      await selectLimitOrderCandidate(client, { requireOpen: true, minimumBid: 10 }),
      undefined,
    );
    assert.deepEqual(
      await selectLimitOrderCandidate(client, { requireOpen: false, minimumBid: 10 }),
      {
        instrumentId: 'US67066G1040',
        destination: { id: 'LSX', open: false, orderModes: ['limit'], raw: {} },
      },
    );
  });

});
