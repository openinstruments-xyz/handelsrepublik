import type { LiveSuiteDefinition } from './types.js';
import { liveSuiteName } from './manifest.js';

export const closedLimitOrderRejectionSuite: LiveSuiteDefinition = {
  id: 'closed-limit-order-rejection',
  name: liveSuiteName('closed-limit-order-rejection'),
  npmArgs: [
    'run',
    'test:ci:record',
    '--',
    'orders.closed-limit',
    'Rejected EUR 1 limit buy',
    '--',
    'npm',
    'run',
    'test:integration:closed-limit-order',
  ],
  resultSource: {
    kind: 'recorded-command',
    id: 'orders.closed-limit',
    name: 'Rejected EUR 1 limit buy',
  },
  timeWindow: 'weekday-closed-market',
  requiresOrderConfirmation: true,
  badgeAlias: 'limit-rejection',
};
