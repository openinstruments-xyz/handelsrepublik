import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isClosedBerlinWindow, isOpenBerlinWindow } from './integration/order-live-runtime.js';

describe('live order safety windows', () => {
  it('accepts only the configured closed-market Berlin window', () => {
    assert.equal(isClosedBerlinWindow(new Date('2026-07-21T21:00:00Z')), true);
    assert.equal(isClosedBerlinWindow(new Date('2026-07-22T02:59:00Z')), true);
    assert.equal(isClosedBerlinWindow(new Date('2026-07-22T03:00:00Z')), false);
    assert.equal(isClosedBerlinWindow(new Date('2026-07-22T20:59:00Z')), false);
  });

  it('accepts only weekdays from 09:30 until before 17:00 Berlin', () => {
    assert.equal(isOpenBerlinWindow(new Date('2026-07-22T07:29:00Z')), false);
    assert.equal(isOpenBerlinWindow(new Date('2026-07-22T07:30:00Z')), true);
    assert.equal(isOpenBerlinWindow(new Date('2026-07-22T14:59:00Z')), true);
    assert.equal(isOpenBerlinWindow(new Date('2026-07-22T15:00:00Z')), false);
    assert.equal(isOpenBerlinWindow(new Date('2026-07-25T10:00:00Z')), false);
  });
});
