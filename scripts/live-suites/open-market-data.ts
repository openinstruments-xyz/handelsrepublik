import type { LiveSuiteDefinition } from './types.js';
import { liveSuiteName } from './manifest.js';

export const openMarketDataSuite: LiveSuiteDefinition = {
  id: 'open-market-data',
  name: liveSuiteName('open-market-data'),
  npmArgs: ['run', 'test:integration:open-venue'],
  resultSource: { kind: 'live-cases', suite: 'open-venue' },
  timeWindow: 'open-market',
  requiresOrderConfirmation: false,
  badgeAlias: 'account-market-mutations',
};
