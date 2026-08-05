import { describe, it } from './runner.js';
import { assertArray, assertRecord, withLiveClient } from './support.js';

describe('account integration', () => {
  it('reads the current account resources', { timeout: 90_000 }, () => withLiveClient('account', async (client) => {
    assertRecord(await client.account.current(), 'account.current');
    assertRecord(await client.account.accountSettings(), 'account.accountSettings');
    assertRecord(await client.account.personalDetails(), 'account.personalDetails');
    assertArray(await client.account.relationships(), 'account.relationships');
    assertRecord(await client.account.cardsHome(), 'account.cardsHome');
    await client.account.appUsageConsents();
  }));
});
