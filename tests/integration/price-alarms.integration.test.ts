import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { APPLE, assertArray, withLiveClient } from './support.js';

describe('price alarms integration', () => {
  it('reads notifications', { timeout: 90_000 }, () => withLiveClient('price-alarms', async (client) => {
    assertArray(await client.priceAlarms.list(), 'priceAlarms.list');
    assertArray(await client.priceAlarms.notifications(), 'priceAlarms.notifications');
  }));

  it('creates and removes a disposable alarm', { timeout: 90_000 }, () => withLiveClient('price-alarm mutation', async (client) => {
    let alarmId: string | undefined;
    try {
      const created = await client.priceAlarms.create({ isin: APPLE, price: 1 });
      alarmId = created.alarmId;
      assert.ok(alarmId, 'expected disposable alarm id');
      assert.ok((await client.priceAlarms.list()).some((alarm) => alarm.id === alarmId));
    } finally {
      if (alarmId) {
        await client.priceAlarms.cancel(alarmId);
        assert.ok(!(await client.priceAlarms.list()).some((alarm) => alarm.id === alarmId), 'price alarm cleanup failed');
      }
    }
  }));
});
