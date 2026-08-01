import { closedLimitOrderRejectionSuite } from './closed-limit-order-rejection.js';
import { closedMarketDataSuite } from './closed-market-data.js';
import { closedMarketOrderRejectionSuite } from './closed-market-order-rejection.js';
import { mutationsSuite } from './mutations.js';
import { openLimitOrderLifecycleSuite } from './open-limit-order-lifecycle.js';
import { openMarketDataSuite } from './open-market-data.js';
import { readOnlySuite } from './read-only.js';
import { liveSuiteManifest } from './manifest.js';
import { weekendLimitOrderLifecycleSuite } from './weekend-limit-order-lifecycle.js';
import type { LiveSuiteDefinition, LiveSuiteId } from './types.js';

export const liveSuiteDefinitions: readonly LiveSuiteDefinition[] = [
  readOnlySuite,
  mutationsSuite,
  openMarketDataSuite,
  closedMarketDataSuite,
  closedLimitOrderRejectionSuite,
  closedMarketOrderRejectionSuite,
  openLimitOrderLifecycleSuite,
  weekendLimitOrderLifecycleSuite,
];

export const automaticLiveSuiteIds: readonly LiveSuiteId[] = liveSuiteManifest
  .filter((suite) => suite.automatic)
  .map((suite) => suite.id);

export type { LiveSuiteDefinition, LiveSuiteId, LiveTimeWindow } from './types.js';
