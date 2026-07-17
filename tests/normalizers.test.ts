import assert from 'node:assert/strict';
import { describe, it } from './test-compat.js';
import { normalizePortfolioPosition } from '../src/normalizers.js';

describe('portfolio normalizers', () => {
  it('normalizes a derivative netSize as its quantity', () => {
    const position = normalizePortfolioPosition({
      isin: 'DE000HM8CS45',
      netSize: 6,
      status: 'ACTIVE',
      instrumentType: 'derivative',
    });

    assert.equal(position.quantity, 6);
  });
});
