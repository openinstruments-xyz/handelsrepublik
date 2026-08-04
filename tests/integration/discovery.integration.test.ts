import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { APPLE, DEFAULT_EXCHANGE, assertArray, assertRecord, withLiveClient } from './support.js';

describe('discovery integration', () => {
  it('reads exchanges, instrument status, screeners, and preferences', { timeout: 90_000 }, () => withLiveClient('discovery', async (client) => {
    assertArray(await client.discovery.exchangeDetails(), 'discovery.exchangeDetails');
    assertRecord(await client.discovery.exchangeSchedule(DEFAULT_EXCHANGE), 'discovery.exchangeSchedule');
    assertRecord(await client.discovery.instrumentStatus(APPLE, DEFAULT_EXCHANGE), 'discovery.instrumentStatus');
    assert.ok(await client.discovery.screeners() !== undefined);
    assert.ok(await client.discovery.screenerOptions() !== undefined);
    assert.ok(await client.discovery.userPreferences() !== undefined);
  }));
});
