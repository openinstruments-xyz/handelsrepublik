import { liveSuiteName } from './manifest.js';
import type { LiveSuiteDefinition } from './types.js';

export const weekendLimitOrderRejectionSuite: LiveSuiteDefinition = {
  id: 'weekend-limit-order-rejection',
  name: liveSuiteName('weekend-limit-order-rejection'),
  npmArgs: [
    'run',
    'test:ci:record',
    '--',
    'orders.weekend-limit-rejection',
    'Rejected weekend EUR 1 limit buy',
    '--',
    'npm',
    'run',
    'test:integration:weekend-limit-order-rejection',
  ],
  resultSource: {
    kind: 'recorded-command',
    id: 'orders.weekend-limit-rejection',
    name: 'Rejected weekend EUR 1 limit buy',
  },
  timeWindow: 'weekend',
  requiresOrderConfirmation: true,
  badgeAlias: 'weekend-rejection',
};
