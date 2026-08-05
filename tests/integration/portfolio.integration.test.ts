import assert from 'node:assert/strict';
import { describe, it } from './runner.js';
import { assertArray, assertRecord, callOptionalAccountResource, resolveSecuritiesAccountNumber, withLiveClient } from './support.js';

describe('portfolio integration', () => {
  it('reads portfolio values, positions, plans, and account-specific valuations', { timeout: 150_000 }, () => withLiveClient('portfolio', async (client, note) => {
    const portfolio = await client.portfolio.current();
    assertRecord(portfolio, 'portfolio.current');
    assertRecord(await client.portfolio.cash(), 'portfolio.cash');
    assertRecord(await client.portfolio.markToMarketValue(), 'portfolio.markToMarketValue');
    assertRecord(await client.portfolio.positionsForAccount(await resolveSecuritiesAccountNumber(client)), 'portfolio.positionsForAccount');
    assertArray(await client.portfolio.savingsPlans(), 'portfolio.savingsPlans');
    assert.ok(await client.portfolio.privateMarketsPositions() !== undefined);
    assertRecord(await client.portfolio.portfolioChart(), 'portfolio.portfolioChart');
    for (const [category, call] of [
      [/bond|fixed.?income/i, (id: string) => client.portfolio.bondValuation(id)],
      [/fixed.?saving/i, (id: string) => client.portfolio.fixedSavingsValuation(id)],
    ] as const) {
      const position = portfolio.positions.find((item) => category.test(item.categoryType ?? ''));
      const instrumentId = position?.isin ?? position?.id;
      if (instrumentId) await callOptionalAccountResource(`${category.source} valuation`, () => call(instrumentId), note);
      else note(`no held ${category.source} position`);
    }
  }));
});
