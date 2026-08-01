import { liveSuiteName } from './manifest.js';
import type { LiveSuiteDefinition } from './types.js';

export const weekendLimitOrderLifecycleSuite: LiveSuiteDefinition = {
  id: 'weekend-limit-order-lifecycle',
  name: liveSuiteName('weekend-limit-order-lifecycle'),
  npmArgs: [
    'run',
    'test:ci:record',
    '--',
    'orders.weekend-limit-lifecycle',
    'Submit and cancel a weekend limit order',
    '--',
    'npm',
    'run',
    'test:integration:weekend-limit-order',
  ],
  resultSource: {
    kind: 'recorded-command',
    id: 'orders.weekend-limit-lifecycle',
    name: 'Submit and cancel a weekend limit order',
  },
  timeWindow: 'weekend',
  requiresOrderConfirmation: true,
  badgeAlias: 'weekend-lifecycle',
};
