import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isClosedBerlinWindow, isOpenBerlinWindow } from './integration/order-live-runtime.js';

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
});
