import type { LiveSuiteDefinition } from './types.js';
import { liveSuiteName } from './manifest.js';

export const closedMarketOrderRejectionSuite: LiveSuiteDefinition = {
  id: 'closed-market-order-rejection',
  name: liveSuiteName('closed-market-order-rejection'),
  npmArgs: ['run', 'test:ci:record', '--', 'orders.closed-market', 'Rejected EUR 1 market buy', '--', 'npm', 'run', 'test:integration:closed-market-order'],
  resultSource: { kind: 'recorded-command', id: 'orders.closed-market', name: 'Rejected EUR 1 market buy' },
  timeWindow: 'closed-market',
  requiresOrderConfirmation: true,
  badgeAlias: 'market-rejection',
};
