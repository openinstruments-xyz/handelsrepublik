import { z, type ZodType } from 'zod';
import { TradeRepublicSchemaError } from '../errors.js';

export type SchemaRisk = 'read' | 'lowRiskMutation' | 'highRiskMutation';
export type SchemaTransport = 'rest' | 'websocket';

export interface TradeRepublicSchemaEntry {
  name: string;
  title: string;
  transport: SchemaTransport;
  risk: SchemaRisk;
  request: string;
  requestSchema: ZodType<unknown>;
  responseSchema: ZodType<unknown>;
  variants?: string[] | undefined;
  live?: {
    sample?: 'once' | 'stream' | 'cleanup' | undefined;
  } | undefined;
}

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const jsonValue: ZodType<unknown> = z.lazy(() => z.union([scalar, z.array(jsonValue), z.record(z.string(), jsonValue)]));
const jsonRecord = z.record(z.string(), jsonValue);
const emptyObject = z.strictObject({});
const optionalNullableString = z.string().nullable().optional();
const optionalNullableBoolean = z.boolean().nullable().optional();
const wireNumberSchema = z.union([z.number(), z.string()]);
const candleTupleSchema = z.union([z.tuple([
  z.union([z.string(), z.number()]),
  wireNumberSchema,
  wireNumberSchema,
  wireNumberSchema,
  wireNumberSchema,
]), z.tuple([
  z.union([z.string(), z.number()]),
  wireNumberSchema,
  wireNumberSchema,
  wireNumberSchema,
  wireNumberSchema,
  wireNumberSchema,
])]);
const candleObjectShape = {
  time: z.union([z.string(), z.number()]),
  open: wireNumberSchema,
  high: wireNumberSchema,
  low: wireNumberSchema,
  close: wireNumberSchema,
  volume: wireNumberSchema.optional(),
} as const;
const standardCandleSchema = z.strictObject(candleObjectShape);
const bondCandleSchema = z.strictObject({ ...candleObjectShape, adjValue: wireNumberSchema });
const aggregateEnvelopeShape = {
    resolution: z.number(),
    expectedClosingTime: z.union([z.string(), z.number()]).optional(),
    lastAggregateEndTime: z.union([z.string(), z.number()]).optional(),
    unit: z.string().optional(),
    sourceCurrency: z.string().nullable().optional(),
} as const;
const standardCandlesResponseSchema = z.strictObject({
  aggregates: z.array(standardCandleSchema),
  ...aggregateEnvelopeShape,
});
const lightCandlesResponseSchema = z.union([
  z.strictObject({ data: z.array(candleTupleSchema) }),
  z.strictObject({
    aggregates: z.array(standardCandleSchema),
    ...aggregateEnvelopeShape,
  }),
]);
const bondCandlesResponseSchema = z.strictObject({
  aggregates: z.array(bondCandleSchema),
  ...aggregateEnvelopeShape,
});

const orderTradeSchema = z.strictObject({
  id: z.string().optional(),
  secAccNo: z.string().optional(),
  userId: z.string().optional(),
  exchangeId: z.string().optional(),
  instrumentId: z.string().optional(),
  type: z.string().optional(),
  side: z.string().optional(),
  orderUsecase: z.string().optional(),
  expiry: z.string().optional(),
  groupId: z.string().optional(),
  size: z.number().optional(),
  amount: jsonRecord.optional(),
  stop: jsonRecord.optional(),
  limit: jsonRecord.optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
  receivedAt: z.number().optional(),
  submittedAt: z.number().optional(),
  openedAt: z.number().optional(),
  executedAt: z.number().optional(),
  expiredAt: z.number().optional(),
  cancelledAt: z.number().optional(),
  rejectedAt: z.number().optional(),
  trades: z.array(jsonRecord),
});

const l2LevelSchema = z.strictObject({ price: z.number(), size: z.number() });
const l2OrderBookSchema = z.strictObject({
  instrumentId: z.string().optional(),
  currency: z.string().optional(),
  timestamp: z.number().optional(),
  bid: z.array(l2LevelSchema),
  ask: z.array(l2LevelSchema),
});

const orderDestinationSchema = z.strictObject({
  id: z.string().optional(),
  exchangeId: z.string().optional(),
  destinationId: z.string().optional(),
  venue: z.string().optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  orderModes: z.array(z.string()).optional(),
  orderExpiries: z.array(z.string()).optional(),
  listingId: z.string().optional(),
  currencyId: z.string().optional(),
  open: z.boolean().optional(),
  openTimeOffsetMillis: z.number().optional(),
  closeTimeOffsetMillis: z.number().optional(),
  timeZoneId: z.string().optional(),
  maintenanceWindow: jsonValue.optional(),
  ongoingOutage: z.boolean().optional(),
  priority: z.number().nullable().optional(),
  tickSizes: z.array(z.array(z.number())).nullable().optional(),
});

const watchlistItemSchema = z.strictObject({
  id: z.string().optional(),
  instrumentId: z.string().optional(),
  isin: z.string().optional(),
  name: z.string().optional(),
  rank: z.number().optional(),
  itemRank: z.number().optional(),
  instrument: jsonRecord.optional(),
  'core.shortName': z.string().optional(),
  'core.officialName': z.string().optional(),
  'core.icon': z.string().optional(),
  'core.tickerSymbol': z.string().optional(),
  'fundamental.peRatio': z.number().optional(),
  'fundamental.dividendYield': z.number().optional(),
  'fundamental.marketCap': z.number().optional(),
  exchangeIds: z.array(z.string()).optional(),
});
const watchlistSchema = z.strictObject({
  id: z.string(),
  name: z.string().optional(),
  type: z.string().optional(),
  created_at: z.number().optional(),
  updated_at: z.number().optional(),
  items: z.array(watchlistItemSchema).optional(),
});

const availableCashItemSchema = z.strictObject({
  accountNumber: z.string(),
  currencyId: z.string(),
  amount: z.number(),
});

const marketSubscriptionPriceSchema = z.strictObject({ value: z.string(), currency: z.string() });
const marketSubscriptionTierSchema = z.strictObject({ level: z.number(), group: z.string() });
const marketSubscriptionPlanSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  product: z.string(),
  group: z.string(),
  price: marketSubscriptionPriceSchema,
  termPeriod: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  imageId: z.string().optional(),
  version: z.number().optional(),
  tier: marketSubscriptionTierSchema.optional(),
});
const marketSubscriptionSchema = z.strictObject({
  id: z.string(),
  plan: marketSubscriptionPlanSchema,
  createdAt: z.string().optional(),
  terms: z.array(z.strictObject({
    id: z.string(),
    activatedAt: z.string().optional(),
    validUntil: z.string().optional(),
  })),
});
const marketEntitlementsSchema = z.strictObject({
  kind: z.string(),
  name: z.string(),
  entitlements: z.array(z.strictObject({
    query: z.array(z.strictObject({ name: z.string(), value: z.string() })),
    planId: z.string().optional(),
    subscribedUntil: z.string().optional(),
    isSubscribed: z.boolean(),
    isCanceled: z.boolean(),
  })),
});

const executionSnapshotLevelSchema = z.strictObject({
  price: z.number(),
  qty: z.number(),
});
const orderBookSnapshotSchema = z.strictObject({
  priceLevels: z.strictObject({
    bidLevels: z.array(executionSnapshotLevelSchema),
    askLevels: z.array(executionSnapshotLevelSchema),
  }),
});
const tapeSnapshotSchema = z.strictObject({
  trades: z.array(z.strictObject({
    timestamp: z.union([z.string(), z.number()]),
    price: z.strictObject({
      value: z.union([z.string(), z.number()]),
      currency: z.string(),
    }),
    size: z.number(),
  })),
});
const dailyPnlResponseSchema = z.array(z.strictObject({
  currentQty: z.number(),
  day: z.string(),
  instrumentId: z.string(),
  intradayOpenCost: z.number(),
  realizedBase: z.number(),
  secAccNo: z.string(),
  sodOpenQty: z.number(),
  sodQty: z.number(),
  sodSoldQty: z.number(),
}));

const normalizedArrayWrappers = z.union([
  z.array(jsonValue),
  z.strictObject({ data: z.array(jsonValue) }),
  z.strictObject({ items: z.array(jsonValue) }),
  z.strictObject({ items: z.array(jsonValue), total: z.number() }),
  z.strictObject({ results: z.array(jsonValue) }),
  z.strictObject({ results: z.array(jsonValue), resultCount: z.number().optional(), correlationId: z.string().optional() }),
  z.strictObject({ orders: z.array(jsonValue) }),
  z.strictObject({ positions: z.array(jsonValue) }),
  z.strictObject({ assets: z.array(jsonValue) }),
  z.strictObject({ derivatives: z.array(jsonValue) }),
  z.strictObject({ subscriptions: z.array(jsonValue) }),
  z.strictObject({ savingsPlans: z.array(jsonValue) }),
  z.strictObject({ activities: z.array(jsonValue) }),
  z.strictObject({ timeline: z.array(jsonValue) }),
  z.strictObject({ actions: z.array(jsonValue) }),
  z.strictObject({ priceAlarms: z.array(jsonValue) }),
  z.strictObject({ notifications: z.array(jsonValue) }),
  z.strictObject({ watchlists: z.array(jsonValue) }),
  z.strictObject({ screeners: z.array(jsonValue) }),
  z.strictObject({ documents: z.array(jsonValue) }),
  z.strictObject({ trades: z.array(jsonValue) }),
  z.strictObject({ destinations: z.array(jsonValue) }),
  z.strictObject({ categories: z.array(jsonValue) }),
  z.strictObject({ accounts: z.array(jsonValue) }),
  z.strictObject({ obj: z.strictObject({ items: z.array(jsonValue) }) }),
]);

const derivativesForUnderlyingResponseSchema = z.strictObject({
  results: z.array(jsonValue),
  resultCount: z.number().optional(),
  issuerCount: z.record(z.string(), z.number()).optional(),
  cursors: z.strictObject({
    before: z.string().nullable(),
    after: z.string().nullable(),
  }).optional(),
});

const timelineActivityResponseSchema = z.union([
  z.strictObject({
    items: z.array(jsonValue),
    cursors: z.strictObject({
      before: z.string().nullable(),
      after: z.string().nullable(),
    }),
  }),
  z.strictObject({ activities: z.array(jsonValue) }),
]);

const accountRelationshipSchema = z.object({
  customerId: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  relationshipType: z.string().optional(),
  bankingInfo: z.object({
    iban: z.string().optional(),
    bic: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();

const accountRelationshipsSchema = z.object({
  relationships: z.array(accountRelationshipSchema),
}).passthrough();

const ibanRelationshipsSchema = accountRelationshipsSchema.refine(
  (value) => value.relationships.some((relationship) => Boolean(relationship.bankingInfo?.iban)),
  { message: 'Expected at least one account relationship with bankingInfo.iban.' },
);

const orderDestinationsResponseSchema = z.union([
  z.array(orderDestinationSchema),
  z.strictObject({
    destinations: z.array(orderDestinationSchema),
    preferredMarketDataProvider: optionalNullableString,
    preferredOrderDestination: optionalNullableString,
  }),
]);

const accountSchema = z.object({
  account: jsonValue.optional(),
  phoneNumber: z.string().optional(),
  jurisdiction: z.string().optional(),
  name: jsonRecord.optional(),
  email: jsonRecord.optional(),
  postalAddress: jsonRecord.optional(),
  cashAccount: jsonRecord.optional(),
  referenceAccount: jsonRecord.optional(),
  referenceAccountV2: jsonRecord.optional(),
  referenceAccountList: z.array(jsonRecord).optional(),
  securitiesAccountNumber: z.string().optional(),
  experience: jsonRecord.optional(),
  taxExemptionOrder: jsonRecord.optional(),
  personId: z.string().optional(),
  duplicateTradingEmail: optionalNullableBoolean,
  birthdate: optionalNullableString,
  birthplace: jsonValue.optional(),
  mainNationality: optionalNullableString,
  additionalNationalities: z.array(jsonValue).optional(),
  mainTaxResidency: jsonValue.optional(),
  usTaxResidency: optionalNullableBoolean,
  additionalTaxResidencies: z.array(jsonValue).optional(),
  taxInformationSyncTimestamp: z.union([z.string(), z.number(), z.null()]).optional(),
  registrationAccount: jsonValue.optional(),
  referralDetails: jsonValue.optional(),
  supportDocuments: jsonValue.optional(),
  tinFormat: jsonValue.optional(),
}).strict();

const sessionSchema = z.union([
  z.undefined(),
  emptyObject,
  z.object({
    session: jsonValue.optional(),
    connectionToken: z.string().optional(),
    expiresAt: optionalNullableString,
    status: optionalNullableString,
  }).strict(),
]);

const priceAlarmMutationSchema = z.union([
  emptyObject,
  z.strictObject({ id: z.string() }),
  z.strictObject({ status: z.string().optional(), alarmId: z.string() }),
  z.strictObject({ priceAlarmId: z.string() }),
  z.strictObject({ status: z.string().optional(), id: z.string().optional() }),
]);

const watchlistMutationSchema = z.union([
  z.undefined(),
  emptyObject,
  jsonRecord,
]);

const orderMutationStatusSchema = z.enum([
  'received',
  'waiting',
  'confirmationNeeded',
  'succeeded',
  'failed',
]);

const otherOrderMutationErrorCodeSchema = z.enum([
  'cashMissing',
  'currentQuoteMissing',
  'instrumentSuspended',
  'internalError',
  'invalidSecurityDerivative',
  'invalidSecurityNonDerivative',
  'limitDenied',
  'maxQuantityExceeded',
  'noRefPriceAvailable',
  'noRouteToMarket',
  'orderAlreadyDeleted',
  'orderAlreadyExists',
  'orderRejectedAtExchange',
  'portfolioInactive',
  'quoteMissing',
  'savingsplanSharesMissingToday',
  'sharesMissing',
  'shortPositionNotAllowed',
  'timeoutError',
  'unknownInstrument',
]);

const otherOrderMutationErrorDetailsSchema = z.strictObject({
  exchangeId: z.string().optional(),
  isin: z.string().optional(),
  orderId: z.string().optional(),
  userId: z.string().optional(),
  clientProcessId: z.string().optional(),
  isNostro: z.boolean().optional(),
});

const otherOrderMutationErrorSchema = z.strictObject({
  code: otherOrderMutationErrorCodeSchema,
  message: z.string().optional(),
  details: otherOrderMutationErrorDetailsSchema.optional(),
});

const exchangeClosedErrorSchema = z.strictObject({
  code: z.literal('exchangeClosed'),
  message: z.string(),
  details: z.strictObject({
    exchangeId: z.string(),
    isin: z.string(),
    isNostro: z.boolean(),
    clientProcessId: z.string(),
  }),
});

const orderNotFoundErrorSchema = z.strictObject({
  code: z.literal('orderNotFound'),
  message: z.string(),
  details: z.strictObject({
    orderId: z.string(),
    userId: z.string(),
  }),
});

const exchangeClosedResponseSchema = z.strictObject({
  status: z.literal('failed'),
  message: z.string(),
  error: exchangeClosedErrorSchema,
});

const orderNotFoundResponseSchema = z.strictObject({
  status: z.literal('failed'),
  orderId: z.string(),
  message: z.string(),
  error: orderNotFoundErrorSchema,
});

const otherOrderMutationErrorValueSchema = z.union([
  z.string(),
  otherOrderMutationErrorSchema,
]);

const otherOrderMutationResponseSchema = z.strictObject({
  status: orderMutationStatusSchema,
  orderId: z.string().optional(),
  id: z.string().optional(),
  message: z.string().optional(),
  error: z.union([
    otherOrderMutationErrorValueSchema,
    z.array(otherOrderMutationErrorValueSchema),
  ]).optional(),
});

const orderMutationResponseSchema = z.union([
  exchangeClosedResponseSchema,
  orderNotFoundResponseSchema,
  otherOrderMutationResponseSchema,
]);

const orderMutationVariants = [
  'received',
  'waiting',
  'confirmationNeeded',
  'succeeded',
  'failed: exchangeClosed (observed live)',
  'failed: cashMissing',
  'failed: currentQuoteMissing',
  'failed: instrumentSuspended',
  'failed: internalError',
  'failed: invalidSecurityDerivative',
  'failed: invalidSecurityNonDerivative',
  'failed: limitDenied',
  'failed: maxQuantityExceeded',
  'failed: noRefPriceAvailable',
  'failed: noRouteToMarket',
  'failed: orderAlreadyDeleted',
  'failed: orderAlreadyExists',
  'failed: orderNotFound (observed live cancellation)',
  'failed: orderRejectedAtExchange',
  'failed: portfolioInactive',
  'failed: quoteMissing',
  'failed: savingsplanSharesMissingToday',
  'failed: sharesMissing',
  'failed: shortPositionNotAllowed',
  'failed: timeoutError',
  'failed: unknownInstrument',
];

const orderReplacementVariants = [
  'succeeded',
  'failed',
  'outcomeUnknown',
  'replacementNotSent',
  'cancelFailed',
  'cancelOutcomeUnknown',
];

export const schemaRegistry = [
  entry('auth.session', 'Auth web session', 'rest', 'read', 'GET /api/v1/auth/web/session', sessionSchema),
  entry('auth.account', 'Auth account', 'rest', 'read', 'GET /api/v2/auth/account', accountSchema),
  entry('account.personalDetails', 'Personal details', 'rest', 'read', 'GET /api/v1/customer/personal-details', jsonRecord),
  entry('account.appUsageConsents', 'App usage data consents', 'rest', 'read', 'GET /api/v1/customer/app-usage-data-consents', jsonValue),
  entry('account.relationships', 'Account relationships', 'rest', 'read', 'GET /api/v1/customer/relationships/detailed', accountRelationshipsSchema),
  entry('account.cardsHome', 'Cards home', 'rest', 'read', 'GET /api/v1/card/cards/home', jsonRecord),
  entry('assets.search', 'Asset search', 'websocket', 'read', 'neonSearch', normalizedArrayWrappers, { variants: ['stock', 'crypto', 'etf -> fund', 'mutualFund', 'privateFund', 'bond', 'synthetic'] }),
  entry('assets.get', 'Instrument detail', 'websocket', 'read', 'instrument', jsonRecord),
  entry('derivatives.search', 'Derivative search', 'websocket', 'read', 'neonSearch type=derivative', normalizedArrayWrappers),
  entry('derivatives.listForUnderlying', 'Derivatives for underlying', 'websocket', 'read', 'derivatives', derivativesForUnderlyingResponseSchema),
  entry('orders.all', 'Orders list', 'rest', 'read', 'GET /web-trading-gateway/api/customer/v1/orders', normalizedArrayWrappers),
  entry('orders.mutualFunds', 'Mutual fund orders', 'rest', 'read', 'GET /api-gateway/mutual-funds/api/v1/orders', normalizedArrayWrappers),
  entry('orders.privateMarkets', 'Private market orders', 'rest', 'read', 'GET /api/v1/private-markets/orders/all', normalizedArrayWrappers),
  entry('orders.orderUpdates', 'Order update stream', 'websocket', 'read', 'orderUpdates', orderTradeSchema, { live: { sample: 'stream' } }),
  entry('orders.fees', 'Order fee preview', 'websocket', 'read', 'orderFeesV2', jsonValue),
  entry('orders.submit', 'Submit brokerage order', 'websocket', 'highRiskMutation', 'simpleCreateOrder', orderMutationResponseSchema, { variants: orderMutationVariants }),
  entry('orders.cancel', 'Cancel brokerage order', 'websocket', 'highRiskMutation', 'cancelOrder', orderMutationResponseSchema, { variants: orderMutationVariants }),
  entry('orders.replace', 'Replace brokerage order', 'websocket', 'highRiskMutation', 'cancelOrder -> simpleCreateOrder (non-atomic)', jsonValue, { variants: orderReplacementVariants }),
  entry('portfolio.current', 'Portfolio positions', 'websocket', 'read', 'compactPortfolioByTypeV2', z.union([jsonRecord, normalizedArrayWrappers])),
  entry('portfolio.cash', 'Available cash', 'websocket', 'read', 'availableCash', z.array(availableCashItemSchema)),
  entry('portfolio.markToMarketValue', 'Portfolio status', 'websocket', 'read', 'portfolioStatus', jsonValue),
  entry('portfolio.savingsPlans', 'Savings plans', 'websocket', 'read', 'savingsPlans', normalizedArrayWrappers),
  entry('portfolio.privateMarketsPositions', 'Private markets positions', 'websocket', 'read', 'privateMarketsPositions', jsonValue),
  entry('portfolio.portfolioChart', 'Portfolio chart', 'rest', 'read', 'GET /api-gateway/portfolio-chart/v2/chart', jsonValue),
  entry('portfolio.bondValuation', 'Bond valuation', 'websocket', 'read', 'bondValuationV2', jsonValue),
  entry('portfolio.fixedSavingsValuation', 'Fixed savings valuation', 'websocket', 'read', 'fixedSavingsValuation', jsonValue),
  entry('market.subscriptions', 'Market subscriptions', 'rest', 'read', 'GET /api-gateway/subscriptions/api/v1/subscriptions', z.array(marketSubscriptionSchema)),
  entry('market.entitlements', 'Market topic entitlements', 'rest', 'read', 'GET /api-gateway/subscriptions/api/v1/entitlements/topics/{topic}', marketEntitlementsSchema),
  entry('market.candles.standard', 'Stock, ETF and fund price history candles', 'websocket', 'read', 'tradeAggregateHistory', standardCandlesResponseSchema, { variants: ['stock', 'etf', 'fund', 'mutualFund'] }),
  entry('market.candles.light', 'Derivative and crypto price history candles', 'websocket', 'read', 'aggregateHistoryLightV2', lightCandlesResponseSchema, { variants: ['derivative', 'crypto'] }),
  entry('market.candles.bond', 'Bond yield history candles', 'rest', 'read', 'GET /api-gateway/quotes-api/v1/instruments/{isin}.{exchangeId}/ytm/aggregateHistory', bondCandlesResponseSchema, { variants: ['bond'] }),
  entry('market.quote', 'Market quote', 'websocket', 'read', 'ticker', jsonValue, { variants: ['stock', 'crypto'] }),
  entry('market.liveFeed', 'Live quote feed', 'websocket', 'read', 'tickerV3', jsonValue, { variants: ['stock', 'crypto'], live: { sample: 'stream' } }),
  entry('market.availableL2Books', 'Available L2 books', 'websocket', 'read', 'instrument', jsonValue),
  entry('market.l2OrderBook', 'L2 order book stream', 'websocket', 'read', 'L2', l2OrderBookSchema, { live: { sample: 'stream' } }),
  entry('timeline.list', 'Timeline activity', 'websocket', 'read', 'timelineActivityLog', timelineActivityResponseSchema),
  entry('timeline.actions', 'Timeline actions', 'websocket', 'read', 'timelineActionsV2', normalizedArrayWrappers),
  entry('timeline.detail', 'Timeline detail', 'websocket', 'read', 'timelineDetailV2', jsonRecord),
  entry('priceAlarms.list', 'Price alarms', 'websocket', 'read', 'priceAlarms', normalizedArrayWrappers),
  entry('priceAlarms.notifications', 'Price alarm notifications', 'websocket', 'read', 'priceAlarmNotifications', normalizedArrayWrappers),
  entry('priceAlarms.create', 'Create price alarm', 'websocket', 'lowRiskMutation', 'createPriceAlarm', priceAlarmMutationSchema, { live: { sample: 'cleanup' } }),
  entry('priceAlarms.cancel', 'Cancel price alarm', 'websocket', 'lowRiskMutation', 'cancelPriceAlarm', priceAlarmMutationSchema, { live: { sample: 'cleanup' } }),
  entry('instruments.news', 'Instrument news', 'websocket', 'read', 'neonNews', normalizedArrayWrappers),
  entry('instruments.etfDetails', 'ETF details', 'websocket', 'read', 'etfDetails', jsonValue),
  entry('instruments.etfComposition', 'ETF composition', 'websocket', 'read', 'etfComposition', jsonValue),
  entry('instruments.fundDetails', 'Fund details', 'websocket', 'read', 'mutualFundDetails', jsonValue),
  entry('instruments.fundComposition', 'Fund composition', 'websocket', 'read', 'mutualFundComposition', jsonValue),
  entry('instruments.cryptoDetails', 'Crypto details', 'websocket', 'read', 'cryptoDetails', jsonValue),
  entry('instruments.yieldToMaturity', 'Yield to maturity', 'websocket', 'read', 'yieldToMaturity', jsonValue),
  entry('trading.priceForOrder', 'Price for order quote', 'websocket', 'read', 'priceForOrderV2', jsonValue),
  entry('trading.availableSize', 'Available size', 'websocket', 'read', 'availableSize', jsonValue),
  entry('trading.homeOrderDestination', 'Home order destination and capabilities', 'websocket', 'read', 'homeInstrumentExchange', jsonValue),
  entry('trading.orderDestinations', 'Order destinations', 'rest', 'read', 'GET /api-gateway/order-router/api/v2/instruments/{isin}/destinations?jurisdiction=DE', orderDestinationsResponseSchema),
  entry('trading.orderBookSnapshot', 'Execution order-book snapshot', 'rest', 'read', 'GET /web-trading-gateway/api/customer/v1/trades/{tradeId}/order-book-snapshot', orderBookSnapshotSchema),
  entry('trading.tapeSnapshot', 'Execution tape snapshot', 'rest', 'read', 'GET /web-trading-gateway/api/customer/v1/trades/{tradeId}/tape-snapshot', tapeSnapshotSchema),
  entry('trading.dailyPnl', 'Daily PnL', 'rest', 'read', 'POST /web-trading-gateway/api/customer/v1/pnl/daily', dailyPnlResponseSchema),
  entry('trading.tape', 'Last trades tape', 'websocket', 'read', 'tape', jsonValue, { live: { sample: 'stream' } }),
  entry('trading.tradeAggregateHistory', 'Trade aggregate history', 'websocket', 'read', 'tradeAggregateHistory', jsonValue),
  entry('discovery.exchangeDetails', 'Exchange details', 'rest', 'read', 'GET /api-gateway/instrument-universe/api/v1/exchanges-details', normalizedArrayWrappers),
  entry('discovery.exchangeSchedule', 'Exchange schedule', 'rest', 'read', 'GET /api-gateway/instrument-universe/api/v1/exchanges/{exchange}/schedule', jsonRecord),
  entry('discovery.instrumentStatus', 'Instrument status', 'rest', 'read', 'GET /api-gateway/instrument-universe/api/v1/instruments/{isin}/status/{exchange}', jsonRecord),
  entry('discovery.watchlists', 'Watchlists', 'rest', 'read', 'GET /api-gateway/watchlists/api/v2/watchlists', z.union([
    z.array(watchlistSchema),
    z.strictObject({ watchlists: z.array(watchlistSchema) }),
    z.strictObject({ data: z.array(watchlistSchema) }),
  ])),
  entry('discovery.watchlists.items', 'Watchlist items', 'rest', 'read', 'GET /api-gateway/watchlists/api/v2/watchlists/{watchlistId}/items', z.union([
    z.array(watchlistItemSchema),
    z.strictObject({ items: z.array(watchlistItemSchema) }),
    z.strictObject({
      total: z.number(),
      items: z.array(watchlistItemSchema),
      cursor: z.string().nullable(),
    }),
    z.strictObject({ data: z.array(watchlistItemSchema) }),
  ])),
  entry('discovery.watchlists.addItem', 'Add watchlist item', 'rest', 'lowRiskMutation', 'POST /api-gateway/watchlists/api/v2/watchlists/{watchlistId}/items', watchlistMutationSchema, { live: { sample: 'cleanup' } }),
  entry('discovery.watchlists.removeItem', 'Remove watchlist item', 'rest', 'lowRiskMutation', 'DELETE /api-gateway/watchlists/api/v2/watchlists/{watchlistId}/items/{instrumentId}', watchlistMutationSchema, { live: { sample: 'cleanup' } }),
  entry('discovery.screeners', 'Screeners', 'rest', 'read', 'GET /api-gateway/screeners/api/v2/screeners', jsonValue),
  entry('discovery.screenerOptions', 'Screener options', 'rest', 'read', 'GET /api-gateway/screeners/api/v2/screeners/options', jsonValue),
  entry('discovery.userPreferences', 'User preferences', 'rest', 'read', 'GET /api-gateway/pro-trading/api/v1/user-preferences', jsonValue),
  entry('documents.documents', 'Documents', 'rest', 'read', 'GET /api/v1/documents/all', jsonValue),
  entry('tax.taxInformation', 'Tax information', 'rest', 'read', 'GET /api/v1/taxes/information', jsonValue),
  entry('tax.exemptionOrder', 'Tax exemption order', 'rest', 'read', 'GET /api/v1/taxes/exemptionorders', jsonValue),
  entry('tax.taxResidencies', 'Tax residencies', 'rest', 'read', 'GET /api/v1/auth/account/change/taxresidencies', jsonValue),
  entry('tax.taxResidencyCountries', 'Tax residency countries', 'rest', 'read', 'GET /api/v1/country/taxresidency', jsonValue),
  entry('tax.accountUtilization', 'Tax wrapper account utilization', 'websocket', 'read', 'taxWrapperAccountUtilization', jsonValue),
  entry('payments.paymentMethods', 'Payment methods', 'rest', 'read', 'GET /api/v2/payment/methods', jsonValue),
  entry('payments.iban', 'IBAN information', 'rest', 'read', 'GET /api/v1/customer/relationships/detailed', ibanRelationshipsSchema),
] as const satisfies readonly TradeRepublicSchemaEntry[];

const schemasByName = new Map<string, TradeRepublicSchemaEntry>(schemaRegistry.map((item) => [item.name, item]));

export function validateRawResponse(schemaName: string, value: unknown): unknown {
  const entry = schemasByName.get(schemaName);
  if (!entry) throw new Error(`Unknown Trade Republic schema: ${schemaName}`);
  const result = entry.responseSchema.safeParse(value);
  if (result.success) return result.data;
  throw new TradeRepublicSchemaError(
    `Trade Republic schema validation failed for ${schemaName}`,
    schemaName,
    result.error.issues,
    summarizeRaw(value),
    result.error,
  );
}

export function schemaCatalogMarkdown(): string {
  const lines = [
    '# Trade Republic API Schemas',
    '',
    'Generated from `src/schemas/registry.ts`. These schemas validate raw Trade Republic responses before SDK normalization.',
    '',
    '| Name | Risk | Transport | Request | Variants |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const entry of schemaRegistry) {
    lines.push(`| \`${entry.name}\` | \`${entry.risk}\` | \`${entry.transport}\` | \`${entry.request.replaceAll('|', '\\|')}\` | ${entry.variants?.join(', ') ?? ''} |`);
  }
  lines.push('');
  lines.push('`highRiskMutation` entries can move money or alter live orders. Unattended probes require explicit clock, venue-state, price-distance, non-replay, and cleanup safeguards.');
  return `${lines.join('\n')}\n`;
}

function entry(
  name: string,
  title: string,
  transport: SchemaTransport,
  risk: SchemaRisk,
  request: string,
  responseSchema: ZodType<unknown>,
  options: Pick<TradeRepublicSchemaEntry, 'variants' | 'live'> = {},
): TradeRepublicSchemaEntry {
  return { name, title, transport, risk, request, requestSchema: jsonValue, responseSchema, ...options };
}

function summarizeRaw(value: unknown): unknown {
  if (Array.isArray(value)) return { kind: 'array', length: value.length, first: summarizeRaw(value[0]) };
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return {
    kind: 'object',
    keys: Object.keys(record).slice(0, 40),
  };
}
