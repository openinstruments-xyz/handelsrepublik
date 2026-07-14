import { z, type ZodType } from 'zod';
import { TradeRepublicSchemaError } from '../errors.js';

export type SchemaRisk = 'read' | 'lowRiskMutation' | 'highRiskMutation' | 'blockedMutation';
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
    optionalStatuses?: number[] | undefined;
    sample?: 'once' | 'stream' | 'cleanup' | undefined;
  } | undefined;
}

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const jsonValue: ZodType<unknown> = z.lazy(() => z.union([scalar, z.array(jsonValue), z.record(z.string(), jsonValue)]));
const jsonRecord = z.record(z.string(), jsonValue);
const emptyObject = z.strictObject({});
const optionalNullableString = z.string().nullable().optional();
const optionalNullableNumber = z.number().nullable().optional();
const optionalNullableBoolean = z.boolean().nullable().optional();

const errorItemSchema = z.strictObject({
  errorCode: optionalNullableString,
  errorField: optionalNullableString,
  errorMessage: optionalNullableString,
  meta: jsonValue.optional(),
});

const emptyOrErrorResponse = z.union([
  emptyObject,
  z.strictObject({ errors: z.array(errorItemSchema) }),
]);

const availableCashItemSchema = z.strictObject({
  accountNumber: z.string(),
  currencyId: z.string(),
  amount: z.number(),
});

const accountPairSchema = z.strictObject({
  securitiesAccountNumber: z.string(),
  cashAccountNumber: z.string().optional(),
  accountProductType: z.string().optional(),
});

const normalizedArrayWrappers = z.union([
  z.array(jsonValue),
  z.strictObject({ data: z.array(jsonValue) }),
  z.strictObject({ items: z.array(jsonValue) }),
  z.strictObject({ results: z.array(jsonValue) }),
  z.strictObject({ results: z.array(jsonValue), resultCount: z.number().optional(), correlationId: z.string().optional() }),
  z.strictObject({ orders: z.array(jsonValue) }),
  z.strictObject({ positions: z.array(jsonValue) }),
  z.strictObject({ assets: z.array(jsonValue) }),
  z.strictObject({ derivatives: z.array(jsonValue) }),
  z.strictObject({ subscriptions: z.array(jsonValue) }),
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

const orderDestinationsResponseSchema = z.union([
  normalizedArrayWrappers,
  z.strictObject({
    destinations: z.array(jsonValue),
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
  z.strictObject({ priceAlarmId: z.string() }),
  z.strictObject({ status: z.string().optional(), id: z.string().optional() }),
]);

const watchlistMutationSchema = z.union([
  emptyObject,
  jsonRecord,
]);

export const schemaRegistry = [
  entry('auth.session', 'Auth web session', 'rest', 'read', 'GET /api/v1/auth/web/session', sessionSchema),
  entry('auth.account', 'Auth account', 'rest', 'read', 'GET /api/v2/auth/account', accountSchema),
  entry('account.personalDetails', 'Personal details', 'rest', 'read', 'GET /api/v1/customer/personal-details', jsonRecord),
  entry('account.relationships', 'Account relationships', 'rest', 'read', 'GET /api/v1/customer/relationships/detailed', jsonRecord),
  entry('account.cardsHome', 'Cards home', 'rest', 'read', 'GET /api/v1/card/cards/home', jsonRecord, { live: { optionalStatuses: [404, 500] } }),
  entry('boards.list', 'Boards list', 'rest', 'read', 'GET /api-gateway/pro-trading/api/v2/boards', normalizedArrayWrappers),
  entry('boards.detail', 'Board detail', 'rest', 'read', 'GET /api-gateway/pro-trading/api/v2/boards/{boardId}', jsonRecord),
  entry('assets.search', 'Asset search', 'websocket', 'read', 'neonSearch', normalizedArrayWrappers, { variants: ['stock', 'crypto', 'fund', 'etf', 'bond'] }),
  entry('assets.get', 'Instrument detail', 'websocket', 'read', 'instrument', jsonRecord),
  entry('derivatives.search', 'Derivative search', 'websocket', 'read', 'neonSearch type=derivative', normalizedArrayWrappers),
  entry('derivatives.listForUnderlying', 'Derivatives for underlying', 'websocket', 'read', 'derivatives', normalizedArrayWrappers),
  entry('orders.all', 'Orders list', 'rest', 'read', 'GET /web-trading-gateway/api/customer/v1/orders', normalizedArrayWrappers),
  entry('orders.mutualFunds', 'Mutual fund orders', 'rest', 'read', 'GET /api-gateway/mutual-funds/api/v1/orders', normalizedArrayWrappers),
  entry('orders.privateMarkets', 'Private market orders', 'rest', 'read', 'GET /api/v1/private-markets/orders/all', normalizedArrayWrappers),
  entry('orders.orderUpdates', 'Order update stream', 'websocket', 'read', 'orderUpdates', jsonValue, { live: { sample: 'stream' } }),
  entry('orders.fees', 'Order fee preview', 'websocket', 'read', 'orderFeesV2', jsonValue),
  entry('orders.submit', 'Submit brokerage order', 'websocket', 'highRiskMutation', 'simpleCreateOrder', jsonValue),
  entry('orders.cancel', 'Cancel brokerage order', 'websocket', 'highRiskMutation', 'cancelOrder', jsonValue),
  entry('portfolio.current', 'Portfolio positions', 'websocket', 'read', 'compactPortfolioByTypeV2', z.union([jsonRecord, normalizedArrayWrappers])),
  entry('portfolio.cash', 'Available cash', 'websocket', 'read', 'availableCash', z.array(availableCashItemSchema)),
  entry('portfolio.markToMarketValue', 'Portfolio status', 'websocket', 'read', 'portfolioStatus', jsonValue),
  entry('portfolio.savingsPlans', 'Savings plans', 'websocket', 'read', 'savingsPlans', normalizedArrayWrappers),
  entry('portfolio.privateMarketsPositions', 'Private markets positions', 'websocket', 'read', 'privateMarketsPositions', jsonValue),
  entry('portfolio.portfolioChart', 'Portfolio chart', 'rest', 'read', 'GET /api-gateway/portfolio-chart/v2/chart', jsonValue),
  entry('market.subscriptions', 'Market subscriptions', 'websocket', 'read', 'accountPairs', z.union([z.array(accountPairSchema), normalizedArrayWrappers])),
  entry('market.candles', 'Price history candles', 'websocket', 'read', 'aggregateHistoryLightV2', jsonValue, { variants: ['stock', 'crypto'] }),
  entry('market.quote', 'Market quote', 'websocket', 'read', 'ticker', jsonValue, { variants: ['stock', 'crypto'] }),
  entry('market.liveFeed', 'Live quote feed', 'websocket', 'read', 'tickerV3', jsonValue, { variants: ['stock', 'crypto'], live: { sample: 'stream' } }),
  entry('market.availableL2Books', 'Available L2 books', 'websocket', 'read', 'instrument', jsonValue),
  entry('market.l2OrderBook', 'L2 order book stream', 'websocket', 'read', 'L2', jsonValue, { live: { sample: 'stream' } }),
  entry('timeline.list', 'Timeline activity', 'websocket', 'read', 'timelineActivityLog', normalizedArrayWrappers),
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
  entry('trading.orderDestinations', 'Order destinations', 'rest', 'read', 'GET /api-gateway/order-router/api/v2/instruments/{isin}/destinations?jurisdiction=DE', orderDestinationsResponseSchema),
  entry('trading.trades', 'Trades', 'rest', 'read', 'GET /web-trading-gateway/api/customer/v1/trades', normalizedArrayWrappers),
  entry('trading.dailyPnl', 'Daily PnL', 'rest', 'read', 'POST /web-trading-gateway/api/customer/v1/pnl/daily', jsonValue),
  entry('discovery.exchangeDetails', 'Exchange details', 'rest', 'read', 'GET /api-gateway/instrument-universe/api/v1/exchanges-details', normalizedArrayWrappers),
  entry('discovery.exchangeSchedule', 'Exchange schedule', 'rest', 'read', 'GET /api-gateway/instrument-universe/api/v1/exchanges/{exchange}/schedule', jsonRecord),
  entry('discovery.instrumentStatus', 'Instrument status', 'rest', 'read', 'GET /api-gateway/instrument-universe/api/v1/instruments/{isin}/status/{exchange}', jsonRecord),
  entry('discovery.watchlists', 'Watchlists', 'rest', 'read', 'GET /api-gateway/watchlists/api/v2/watchlists', jsonValue),
  entry('discovery.watchlists.items', 'Watchlist items', 'rest', 'read', 'GET /api-gateway/watchlists/api/v2/watchlists/{watchlistId}/items', jsonValue),
  entry('discovery.watchlists.create', 'Create watchlist', 'rest', 'lowRiskMutation', 'POST /api-gateway/watchlists/api/v2/watchlists', watchlistMutationSchema, { live: { sample: 'cleanup' } }),
  entry('discovery.watchlists.rename', 'Rename watchlist', 'rest', 'lowRiskMutation', 'PUT /api-gateway/watchlists/api/v2/watchlists/{watchlistId}', watchlistMutationSchema, { live: { sample: 'cleanup' } }),
  entry('discovery.watchlists.delete', 'Delete watchlist', 'rest', 'lowRiskMutation', 'DELETE /api-gateway/watchlists/api/v2/watchlists/{watchlistId}', watchlistMutationSchema, { live: { sample: 'cleanup' } }),
  entry('discovery.watchlists.addItem', 'Add watchlist item', 'rest', 'lowRiskMutation', 'POST /api-gateway/watchlists/api/v2/watchlists/{watchlistId}/items', watchlistMutationSchema, { live: { sample: 'cleanup' } }),
  entry('discovery.watchlists.removeItem', 'Remove watchlist item', 'rest', 'lowRiskMutation', 'DELETE /api-gateway/watchlists/api/v2/watchlists/{watchlistId}/items/{instrumentId}', watchlistMutationSchema, { live: { sample: 'cleanup' } }),
  entry('discovery.screeners', 'Screeners', 'rest', 'read', 'GET /api-gateway/screeners/api/v2/screeners', jsonValue),
  entry('discovery.screenerOptions', 'Screener options', 'rest', 'read', 'GET /api-gateway/screeners/api/v2/screeners/options', jsonValue),
  entry('discovery.userPreferences', 'User preferences', 'rest', 'read', 'GET /api-gateway/pro-trading/api/v1/user-preferences', jsonValue),
  entry('documents.documents', 'Documents', 'rest', 'read', 'GET /api/v1/documents/all', jsonValue),
  entry('tax.taxInformation', 'Tax information', 'rest', 'read', 'GET /api/v1/taxes/information', jsonValue),
  entry('tax.exemptionOrder', 'Tax exemption order', 'rest', 'read', 'GET /api/v1/taxes/exemptionorders', jsonValue),
  entry('tax.taxResidencies', 'Tax residencies', 'rest', 'read', 'GET /api/v1/auth/account/change/taxresidencies', jsonValue, { live: { optionalStatuses: [404, 500] } }),
  entry('tax.taxResidencyCountries', 'Tax residency countries', 'rest', 'read', 'GET /api/v1/country/taxresidency', jsonValue),
  entry('payments.paymentMethods', 'Payment methods', 'rest', 'read', 'GET /api/v2/payment/methods', jsonValue),
  entry('payments.iban', 'IBAN', 'rest', 'read', 'GET /api/v1/auth/account/iban', z.union([jsonRecord, emptyOrErrorResponse]), { live: { optionalStatuses: [404, 500] } }),
  entry('payments.interestDetails', 'Interest details', 'rest', 'read', 'GET /api/v1/interest/details', z.union([jsonRecord, emptyOrErrorResponse]), { live: { optionalStatuses: [404, 500] } }),
  entry('blocked.orderMutations', 'Unsupported legacy order change/confirm resources', 'websocket', 'blockedMutation', 'confirmOrder|changeOrder', jsonValue),
  entry('blocked.bankTransfers', 'Payouts and bank transfers', 'rest', 'blockedMutation', 'POST /api/v1/payout and payment authorization paths', jsonValue),
  entry('blocked.documentAcceptance', 'Document acceptance', 'rest', 'blockedMutation', 'api/v1/documents/group/accept and terms accept paths', jsonValue),
  entry('blocked.accountSecurity', 'Account identity, tax, PIN, login security mutations', 'rest', 'blockedMutation', 'change account/tax/security paths', jsonValue),
] as const satisfies readonly TradeRepublicSchemaEntry[];

export type SchemaName = (typeof schemaRegistry)[number]['name'];

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
  lines.push('`highRiskMutation` entries can move money or alter live orders and must never be exercised by unattended integration tests. `blockedMutation` entries remain unsupported.');
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
