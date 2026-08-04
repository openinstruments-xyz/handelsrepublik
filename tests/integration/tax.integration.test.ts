import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { callOptionalAccountResource, withLiveClient } from './support.js';

describe('tax integration', () => {
  it('reads tax resources', { timeout: 90_000 }, () => withLiveClient('tax', async (client, note) => {
    assert.ok(await client.tax.taxInformation() !== undefined);
    assert.ok(await client.tax.exemptionOrder() !== undefined);
    assert.ok(await client.tax.taxResidencies() !== undefined);
    assert.ok(await client.tax.taxResidencyCountries() !== undefined);
    await callOptionalAccountResource('tax wrapper account utilization', () => client.tax.accountUtilization(), note);
  }));
});
