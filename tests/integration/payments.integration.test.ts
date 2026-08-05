import assert from 'node:assert/strict';
import { describe, it } from './runner.js';
import { withLiveClient } from './support.js';

describe('payments integration', () => {
  it('reads payment methods and IBAN information', { timeout: 60_000 }, () => withLiveClient('payments', async (client) => {
    assert.ok(await client.payments.paymentMethods() !== undefined);
    assert.ok((await client.payments.iban()).iban, 'expected an IBAN without logging it');
  }));
});
