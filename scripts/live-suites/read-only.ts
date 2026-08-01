import type { LiveSuiteDefinition } from './types.js';
import { liveSuiteName } from './manifest.js';

export const readOnlySuite: LiveSuiteDefinition = {
  id: 'read-only',
  name: liveSuiteName('read-only'),
  npmArgs: ['run', 'test:integration:read'],
  resultSource: { kind: 'live-cases', suite: 'read' },
  timeWindow: 'always',
  requiresOrderConfirmation: false,
  badgeAlias: 'account-market-mutations',
};
