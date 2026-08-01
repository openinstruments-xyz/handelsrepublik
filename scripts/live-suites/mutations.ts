import type { LiveSuiteDefinition } from './types.js';
import { liveSuiteName } from './manifest.js';

export const mutationsSuite: LiveSuiteDefinition = {
  id: 'mutations',
  name: liveSuiteName('mutations'),
  npmArgs: ['run', 'test:integration:mutations'],
  resultSource: { kind: 'live-cases', suite: 'mutations' },
  timeWindow: 'always',
  requiresOrderConfirmation: false,
  badgeAlias: 'account-market-mutations',
};
