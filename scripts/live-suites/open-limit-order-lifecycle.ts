import type { LiveSuiteDefinition } from './types.js';
import { liveSuiteName } from './manifest.js';

export const openLimitOrderLifecycleSuite: LiveSuiteDefinition = {
  id: 'open-limit-order-lifecycle',
  name: liveSuiteName('open-limit-order-lifecycle'),
  npmArgs: ['run', 'test:ci:record', '--', 'orders.open-limit-lifecycle', 'Submit, replace, and cancel a limit order', '--', 'npm', 'run', 'test:integration:open-limit-order'],
  resultSource: { kind: 'recorded-command', id: 'orders.open-limit-lifecycle', name: 'Submit, replace, and cancel a limit order' },
  timeWindow: 'open-market',
  requiresOrderConfirmation: true,
  badgeAlias: 'lifecycle',
};
