import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MARKET_DATA_STREAM_TOPICS,
  VENUE_DISPLAY_NAMES,
  venueDisplayName,
} from '../src/index.js';

describe('venue metadata', () => {
  it('maps known venue IDs to browser display names', () => {
    assert.equal(VENUE_DISPLAY_NAMES.TIB, 'Best Price');
    assert.equal(VENUE_DISPLAY_NAMES.LSX, 'Lang & Schwarz Exchange');
    assert.equal(VENUE_DISPLAY_NAMES.XETR, 'Xetra');
    assert.equal(venueDisplayName('tib'), 'Best Price');
    assert.equal(venueDisplayName(' XETR '), 'Xetra');
  });

  it('preserves unknown venue IDs', () => {
    assert.equal(venueDisplayName('CUSTOM'), 'CUSTOM');
  });

  it('identifies the bid/ask and order-book subscription topics', () => {
    assert.deepEqual(MARKET_DATA_STREAM_TOPICS, {
      bidAsk: 'tickerV3',
      orderBook: 'L2',
    });
  });
});
