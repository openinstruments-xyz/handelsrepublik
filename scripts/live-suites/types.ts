import type { LiveSuite } from '../../tests/integration/live-runtime.js';

export type LiveSuiteId =
  | 'read-only'
  | 'mutations'
  | 'open-market-data'
  | 'closed-market-data'
  | 'closed-limit-order-rejection'
  | 'closed-market-order-rejection'
  | 'open-limit-order-lifecycle'
  | 'weekend-limit-order-lifecycle';

export type LiveTimeWindow =
  | 'always'
  | 'open-market'
  | 'closed-market'
  | 'weekday-closed-market'
  | 'weekend';

export type LiveResultSource =
  | { kind: 'live-cases'; suite: LiveSuite }
  | { kind: 'recorded-command'; id: string; name: string };

export interface LiveSuiteDefinition {
  id: LiveSuiteId;
  name: string;
  npmArgs: readonly string[];
  resultSource: LiveResultSource;
  timeWindow: LiveTimeWindow;
  requiresOrderConfirmation: boolean;
  badgeAlias: string;
}
