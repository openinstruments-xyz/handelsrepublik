import type { LiveSuiteDefinition } from './types.js';
import { liveSuiteName } from './manifest.js';

export const closedMarketDataSuite: LiveSuiteDefinition = {
  id: 'closed-market-data',
  name: liveSuiteName('closed-market-data'),
  npmArgs: ['run', 'test:integration:closed-venue'],
  resultSource: { kind: 'live-cases', suite: 'closed-venue' },
  timeWindow: 'closed-market',
  requiresOrderConfirmation: false,
  badgeAlias: 'destinations',
};
