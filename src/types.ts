export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type EndpointKey =
  | 'auth.qrChallenge'
  | 'auth.qrStatus'
  | 'auth.login'
  | 'auth.loginProcess'
  | 'auth.account'
  | 'auth.session'
  | 'orders.all'
  | 'orders.mutualFunds'
  | 'orders.privateMarkets'
  | 'market.subscriptions'
  | 'market.entitlements'
  | 'market.bondCandles';

export type EndpointMap = Partial<Record<EndpointKey, string>>;
export type RawSchemaValidationMode = 'throw' | 'passthrough' | 'off';

export interface RawSchemaValidationFailure {
  schemaName: string;
  value: unknown;
  error: unknown;
}

export interface WebSocketDisconnectEvent {
  disconnectedAt: string;
  code?: number | undefined;
  reason?: string | undefined;
  reconnectDelayMs: number;
}

export interface WebSocketReconnectEvent {
  disconnectedAt: string;
  reconnectedAt: string;
  downtimeMs: number;
  reconnectAttempts: number;
}

export interface TradeRepublicClientOptions {
  apiBaseUrl?: string | undefined;
  websocketUrl?: string | undefined;
  locale?: string | undefined;
  userAgent?: string | undefined;
  deviceInfo?: Partial<TradeRepublicDeviceInfo> | undefined;
  defaultHeaders?: TradeRepublicDefaultHeaders | undefined;
  wafToken?: TradeRepublicWafToken | undefined;
  webContext?: TradeRepublicWebContext | undefined;
  session?: Session | undefined;
  sessionStore?: SessionStore | undefined;
  endpoints?: EndpointMap | undefined;
  fetch?: typeof fetch | undefined;
  websocketFactory?: WebSocketFactory | undefined;
  websocketMode?: 'shared' | 'isolated' | undefined;
  websocketReconnectDelayMs?: number | undefined;
  websocketHandshakeTimeoutMs?: number | undefined;
  onWebSocketDisconnect?: ((event: WebSocketDisconnectEvent) => void | Promise<void>) | undefined;
  onWebSocketReconnect?: ((event: WebSocketReconnectEvent) => void | Promise<void>) | undefined;
  rawSchemaValidation?: RawSchemaValidationMode | undefined;
  onRawSchemaValidationFailure?: ((failure: RawSchemaValidationFailure) => void) | undefined;
}

export type RawSchemaValidator = (schemaName: string, value: unknown) => unknown;

export interface AccountRelationshipBankingInfo {
  iban?: string | undefined;
  bic?: string | undefined;
  raw: unknown;
}

export interface AccountRelationship {
  customerId?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  relationshipType?: string | undefined;
  bankingInfo?: AccountRelationshipBankingInfo | undefined;
  raw: unknown;
}

export interface IbanInfo {
  iban: string;
  bic?: string | undefined;
  accountHolder?: string | undefined;
  customerId?: string | undefined;
  relationshipType?: string | undefined;
  raw: unknown;
}

export interface RequestOptions {
  headers?: Record<string, string> | undefined;
  signal?: AbortSignal | undefined;
}

export interface Session {
  accessToken?: string | undefined;
  refreshToken?: string | undefined;
  sessionToken?: string | undefined;
  deviceInfo?: TradeRepublicDeviceInfo | undefined;
  webContext?: TradeRepublicWebContext | undefined;
  cookies?: Record<string, string> | undefined;
  expiresAt?: string | undefined;
  accountId?: string | undefined;
  deviceId?: string | undefined;
  securitiesAccountNumber?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface TradeRepublicDeviceInfo {
  stableDeviceId: string | null;
  model?: string | undefined;
  browser?: string | undefined;
  browserVersion?: string | undefined;
  os?: string | undefined;
  osVersion?: string | undefined;
  timezone?: string | undefined;
  timezoneOffset?: number | undefined;
  screen?: string | undefined;
  preferredLanguages?: string[] | undefined;
  numberOfCores?: number | undefined;
  deviceMemory?: number | undefined;
}

export interface TradeRepublicDefaultHeaders {
  accept?: string | undefined;
  'accept-language'?: string | undefined;
  authorization?: string | undefined;
  cookie?: string | undefined;
  'content-type'?: string | undefined;
  origin?: string | undefined;
  referer?: string | undefined;
  'user-agent'?: string | undefined;
  'x-aws-waf-token'?: string | undefined;
  'x-tr-app-version'?: string | undefined;
  'x-tr-device-info'?: string | undefined;
  'x-tr-platform'?: string | undefined;
  'x-tr-session'?: string | undefined;
  'x-xsrf-token'?: string | undefined;
  [headerName: string]: string | undefined;
}

export interface SessionStore {
  load(): Promise<Session | undefined>;
  save(session: Session): Promise<void>;
  clear(): Promise<void>;
}

export interface TradeRepublicWebContext {
  headers?: Record<string, string> | undefined;
  cookies?: Record<string, string> | undefined;
  cookieHeader?: string | undefined;
  awsWafToken?: string | undefined;
  xsrfToken?: string | undefined;
  capturedAt?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface TradeRepublicWafToken {
  awsWafToken: string;
  xsrfToken?: string | undefined;
  capturedAt?: string | undefined;
}

export interface InstantLoginChallenge {
  id: string;
  qrCode?: string | undefined;
  qrCodeDataUrl?: string | undefined;
  deepLink?: string | undefined;
  challengeExpiresAt?: string | undefined;
  qrCodeTokenExpiresAt?: string | undefined;
  serverTime?: string | undefined;
  raw: unknown;
}

export interface Asset {
  id: string;
  isin?: string | undefined;
  name?: string | undefined;
  type?: string | undefined;
  exchangeIds?: string[] | undefined;
  raw: unknown;
}

export type AssetSearchType =
  | 'stock'
  | 'etf'
  | 'fund'
  | 'mutualFund'
  | 'privateFund'
  | 'derivative'
  | 'crypto'
  | 'bond'
  | 'synthetic';

export interface WatchlistItem extends Asset {
  rank?: number | undefined;
}

export interface Watchlist {
  id: string;
  name?: string | undefined;
  items: WatchlistItem[];
  raw: unknown;
}

export interface AssetDetail extends Asset {
  issuer?: string | undefined;
  createdAt?: string | undefined;
  endsAt?: string | undefined;
  knockout?: number | undefined;
  entryPrice?: number | undefined;
  direction?: 'long' | 'short' | undefined;
  leverage?: number | undefined;
}

export interface Derivative extends AssetDetail {
  underlyingId?: string | undefined;
  productType?: string | undefined;
}

export interface Order {
  id: string;
  status?: string | undefined;
  isin?: string | undefined;
  instrumentId?: string | undefined;
  name?: string | undefined;
  side?: string | undefined;
  type?: string | undefined;
  createdAt?: string | undefined;
  submittedAt?: string | undefined;
  updatedAt?: string | undefined;
  closedAt?: string | undefined;
  executedAt?: string | undefined;
  cancelledAt?: string | undefined;
  expiredAt?: string | undefined;
  rejectedAt?: string | undefined;
  quantity?: number | undefined;
  executedQuantity?: number | undefined;
  executionPrice?: number | undefined;
  amount?: number | undefined;
  currency?: string | undefined;
  raw: unknown;
}

export type OrderSide = 'buy' | 'sell';
export type OrderMode = 'market' | 'limit' | 'stopMarket';

export type OrderValidityPreset = 'day' | 'endOfMonth' | 'goodTillCancelled';

export type OrderValidity =
  | OrderValidityPreset
  | {
      type: 'month' | 'year';
      referenceDate?: string | Date | undefined;
    }
  | {
      type: 'date';
      value: string | Date | number;
    };

export interface CreateOrderOptions {
  instrumentId: string;
  exchangeId: string;
  side: OrderSide;
  mode: OrderMode;
  size?: number | undefined;
  amount?: number | undefined;
  sizeStep?: number | undefined;
  limit?: number | undefined;
  stop?: number | undefined;
  validity?: OrderValidity | undefined;
  settlementCurrency?: string | undefined;
  tradingCurrency?: string | undefined;
  sellFractions?: boolean | undefined;
  destinationId?: string | undefined;
  isDMA?: boolean | undefined;
  acceptedTerms?: unknown[] | undefined;
  warningsShown?: string[] | undefined;
  lastClientPrice?: number | undefined;
  clientProcessId?: string | undefined;
  secAccNo?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface PreparedOrder {
  parameters: Record<string, unknown>;
  clientProcessId: string;
  secAccNo: string;
  warningsShown: string[];
  lastClientPrice?: number | undefined;
}

export interface OrderFeeItem {
  name?: string | undefined;
  amount?: number | undefined;
  currency?: string | undefined;
  raw: unknown;
}

export interface OrderPreview {
  order: PreparedOrder;
  fees: OrderFeeItem[];
  totalFees?: number | undefined;
  currency?: string | undefined;
  estimatedGross?: number | undefined;
  estimatedTotal?: number | undefined;
  raw: unknown;
}

export type OrderSubmissionStatus = 'succeeded' | 'failed' | 'outcomeUnknown';
export type MutationOutcomeUnknownReason = 'clientClosed' | 'disconnect' | 'sendFailure' | 'sessionRefresh' | 'timeout';

export type OrderMutationStatus = 'received' | 'waiting' | 'confirmationNeeded' | 'succeeded' | 'failed';

export type OrderMutationErrorCode =
  | 'cashMissing'
  | 'currentQuoteMissing'
  | 'exchangeClosed'
  | 'instrumentSuspended'
  | 'internalError'
  | 'invalidSecurityDerivative'
  | 'invalidSecurityNonDerivative'
  | 'limitDenied'
  | 'maxQuantityExceeded'
  | 'noRefPriceAvailable'
  | 'noRouteToMarket'
  | 'orderAlreadyDeleted'
  | 'orderAlreadyExists'
  | 'orderNotFound'
  | 'orderRejectedAtExchange'
  | 'portfolioInactive'
  | 'quoteMissing'
  | 'savingsplanSharesMissingToday'
  | 'sharesMissing'
  | 'shortPositionNotAllowed'
  | 'timeoutError'
  | 'unknownInstrument'
  | (string & {});

export interface OrderMutationErrorDetails {
  exchangeId?: string | undefined;
  isin?: string | undefined;
  orderId?: string | undefined;
  userId?: string | undefined;
  clientProcessId?: string | undefined;
  isNostro?: boolean | undefined;
  raw: unknown;
}

export interface OrderMutationError {
  code?: OrderMutationErrorCode | undefined;
  message?: string | undefined;
  details?: OrderMutationErrorDetails | undefined;
  raw: unknown;
}

export interface OrderMutationUpdate {
  status: OrderMutationStatus;
  orderId?: string | undefined;
  message?: string | undefined;
  error?: OrderMutationError | undefined;
  raw: unknown;
}

interface OrderSubmissionBase {
  orderId?: string | undefined;
  clientProcessId: string;
  updates: OrderMutationUpdate[];
  raw: unknown;
}

export interface OrderSubmissionSucceeded extends OrderSubmissionBase {
  status: 'succeeded';
}

export interface OrderSubmissionFailed extends OrderSubmissionBase {
  status: 'failed';
  error: OrderMutationError;
}

export interface OrderSubmissionOutcomeUnknown extends OrderSubmissionBase {
  status: 'outcomeUnknown';
  outcomeReason: MutationOutcomeUnknownReason;
  connectionLoss?: WebSocketDisconnectEvent | undefined;
  error: Error;
}

export type OrderSubmission = OrderSubmissionSucceeded | OrderSubmissionFailed | OrderSubmissionOutcomeUnknown;

interface OrderCancellationBase {
  orderId: string;
  updates: OrderMutationUpdate[];
  raw: unknown;
}

export interface OrderCancellationSucceeded extends OrderCancellationBase {
  status: 'succeeded';
}

export interface OrderCancellationFailed extends OrderCancellationBase {
  status: 'failed';
  error: OrderMutationError;
}

export interface OrderCancellationOutcomeUnknown extends OrderCancellationBase {
  status: 'outcomeUnknown';
  outcomeReason: MutationOutcomeUnknownReason;
  connectionLoss?: WebSocketDisconnectEvent | undefined;
  error: Error;
}

export type OrderCancellation = OrderCancellationSucceeded | OrderCancellationFailed | OrderCancellationOutcomeUnknown;

export interface OrderReplacementOptions {
  cancellationTimeoutMs?: number | undefined;
  submissionTimeoutMs?: number | undefined;
}

interface OrderReplacementBase {
  previousOrderId: string;
  cancellation: OrderCancellation;
}

export interface OrderReplacementCancelFailed extends OrderReplacementBase {
  status: 'cancelFailed';
  cancellation: OrderCancellationFailed;
  submission?: never;
}

export interface OrderReplacementCancelOutcomeUnknown extends OrderReplacementBase {
  status: 'cancelOutcomeUnknown';
  cancellation: OrderCancellationOutcomeUnknown;
  submission?: never;
}

export interface OrderReplacementNotSent extends OrderReplacementBase {
  status: 'replacementNotSent';
  cancellation: OrderCancellationSucceeded;
  submission?: never;
  error: Error;
}

export interface OrderReplacementSucceeded extends OrderReplacementBase {
  status: 'succeeded';
  cancellation: OrderCancellationSucceeded;
  submission: OrderSubmissionSucceeded;
}

export interface OrderReplacementFailed extends OrderReplacementBase {
  status: 'failed';
  cancellation: OrderCancellationSucceeded;
  submission: OrderSubmissionFailed;
}

export interface OrderReplacementOutcomeUnknown extends OrderReplacementBase {
  status: 'outcomeUnknown';
  cancellation: OrderCancellationSucceeded;
  submission: OrderSubmissionOutcomeUnknown;
}

export type OrderReplacement =
  | OrderReplacementCancelFailed
  | OrderReplacementCancelOutcomeUnknown
  | OrderReplacementNotSent
  | OrderReplacementSucceeded
  | OrderReplacementFailed
  | OrderReplacementOutcomeUnknown;

export interface OrdersListOptions {
  secAccNo?: string | undefined;
  instrumentId?: string | undefined;
  instrumentCategory?: 'brokerage' | 'crypto' | 'fixedIncome' | string | undefined;
  accountType?: 'default' | 'taxWrapperFr' | string | undefined;
  sort?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
  filters?: Record<string, string | number | boolean | undefined> | undefined;
}

export interface MutualFundOrdersOptions {
  page?: number | undefined;
  pageSize?: number | undefined;
  openOnly?: boolean | undefined;
  excludeQuantityNull?: boolean | undefined;
  orderBy?: string | undefined;
  order?: 'ASC' | 'DESC' | undefined;
  filters?: Record<string, string | number | boolean | undefined> | undefined;
}

export interface PrivateMarketsOrdersOptions {
  pageNumber?: number | undefined;
  pageSize?: number | undefined;
  sortBy?: string | undefined;
  sortAscending?: boolean | undefined;
  filters?: Record<string, string | number | boolean | string[] | undefined> | undefined;
}

export interface PortfolioPosition {
  id: string;
  isin?: string | undefined;
  name?: string | undefined;
  quantity?: number | undefined;
  value?: number | undefined;
  currency?: string | undefined;
  categoryType?: string | undefined;
  raw: unknown;
}

export interface Portfolio {
  positions: PortfolioPosition[];
  raw: unknown;
}

export interface CashSummary {
  amount?: number | undefined;
  currency?: string | undefined;
  raw: unknown;
}

export interface TimelineItem {
  id: string;
  type?: string | undefined;
  title?: string | undefined;
  subtitle?: string | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  instrumentId?: string | undefined;
  orderId?: string | undefined;
  savingsPlanId?: string | undefined;
  raw: unknown;
}

export interface TimelineAction {
  id: string;
  type?: string | undefined;
  title?: string | undefined;
  raw: unknown;
}

export interface TimelineDetail {
  id: string;
  type?: string | undefined;
  raw: unknown;
}

export type TimelineDetailKind = 'timeline' | 'order' | 'savingsPlan';

export interface PriceAlarm {
  id: string;
  isin?: string | undefined;
  name?: string | undefined;
  price?: number | undefined;
  currency?: string | undefined;
  triggeredAt?: string | undefined;
  raw: unknown;
}

export type PriceAlarmMutationStatus = 'created' | 'ok' | (string & {});

export interface PriceAlarmCreation {
  alarmId?: string | undefined;
  status?: PriceAlarmMutationStatus | undefined;
  raw: unknown;
}

export interface PriceAlarmCancellation {
  alarmId: string;
  status?: PriceAlarmMutationStatus | undefined;
  raw: unknown;
}

export interface SavingsPlan {
  id: string;
  isin?: string | undefined;
  name?: string | undefined;
  amount?: number | undefined;
  currency?: string | undefined;
  raw: unknown;
}

export interface PortfolioChart {
  points: unknown[];
  raw: unknown;
}

export interface InstrumentNewsItem {
  id: string;
  title?: string | undefined;
  publishedAt?: string | undefined;
  raw: unknown;
}

export interface OrderDestination {
  id: string;
  name?: string | undefined;
  type?: string | undefined;
  orderModes?: string[] | undefined;
  orderExpiries?: string[] | undefined;
  listingId?: string | undefined;
  currencyId?: string | undefined;
  open?: boolean | undefined;
  openTimeOffsetMillis?: number | undefined;
  closeTimeOffsetMillis?: number | undefined;
  timeZoneId?: string | undefined;
  maintenanceWindow?: unknown;
  ongoingOutage?: boolean | undefined;
  priority?: number | undefined;
  tickSizes?: number[][] | null | undefined;
  raw: unknown;
}

export interface OrderPriceOptions {
  instrumentId?: string | undefined;
  isin?: string | undefined;
  exchangeId: string;
  side: OrderSide | 'BUY' | 'SELL';
  unit?: string | undefined;
}

export interface OrderPriceQuote {
  instrumentId: string;
  exchangeId: string;
  side: OrderSide;
  price?: number | undefined;
  bid?: number | undefined;
  ask?: number | undefined;
  unit?: string | undefined;
  time?: string | undefined;
  raw: unknown;
}

export interface ExecutionOrderBookSnapshotLevel {
  price: number;
  qty: number;
}

export interface ExecutionOrderBookSnapshot {
  priceLevels: {
    bidLevels: ExecutionOrderBookSnapshotLevel[];
    askLevels: ExecutionOrderBookSnapshotLevel[];
  };
}

export interface ExecutionTapeSnapshotTrade {
  timestamp: string | number;
  price: {
    value: string | number;
    currency: string;
  };
  size: number;
}

export interface ExecutionTapeSnapshot {
  trades: ExecutionTapeSnapshotTrade[];
}

export interface DailyPnlRequestItem {
  secAccNo: string;
  instrumentId: string;
  day: string;
  quantity: number;
}

export interface DailyPnlResult {
  currentQty: number;
  day: string;
  instrumentId: string;
  intradayOpenCost: number;
  realizedBase: number;
  secAccNo: string;
  sodOpenQty: number;
  sodQty: number;
  sodSoldQty: number;
}

export interface ExchangeDetails {
  id: string;
  name?: string | undefined;
  raw: unknown;
}

export interface ExchangeSchedule {
  exchangeId?: string | undefined;
  raw: unknown;
}

export interface InstrumentStatus {
  isin?: string | undefined;
  exchangeId?: string | undefined;
  status?: string | undefined;
  raw: unknown;
}

export type CandleTimeframe =
  | '1m'
  | '3m'
  | '5m'
  | '10m'
  | '15m'
  | '20m'
  | '30m'
  | '45m'
  | '1h'
  | '2h'
  | '4h'
  | '1d'
  | '1w'
  | '1M';

export type CandleResolution = CandleTimeframe | number;
export type CandleRange = '1d' | '5d' | '1m' | '3m' | '6m' | '1y' | string;

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | undefined;
  raw: unknown;
}

export interface CandleDownloadOptions {
  assetId: string;
  exchangeId: string;
  timeframe: CandleResolution;
  instrumentType?: AssetSearchType | undefined;
  range?: CandleRange | undefined;
  from?: string | Date | undefined;
  to?: string | Date | undefined;
  unit?: string | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

export interface CandleSeries {
  resolutionMs: number;
  expectedClosingTime?: string | undefined;
  lastAggregateEndTime?: string | undefined;
  unit?: string | undefined;
  candles: Candle[];
  raw: unknown;
}

export interface AvailableCandleResolutionsOptions {
  assetId: string;
}

export interface MarketSubscription {
  id: string;
  plan: MarketSubscriptionPlan;
  createdAt?: string | undefined;
  terms: MarketSubscriptionTerm[];
  raw: unknown;
}

export interface MarketSubscriptionPlan {
  id: string;
  name: string;
  description?: string | undefined;
  product: string;
  group: string;
  price: MarketSubscriptionPrice;
  termPeriod?: string | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  imageId?: string | undefined;
  version?: number | undefined;
  tier?: MarketSubscriptionTier | undefined;
  raw: unknown;
}

export interface MarketSubscriptionPrice {
  value: string;
  currency: string;
  raw: unknown;
}

export interface MarketSubscriptionTier {
  level: number;
  group: string;
  raw: unknown;
}

export interface MarketSubscriptionTerm {
  id: string;
  activatedAt?: string | undefined;
  validUntil?: string | undefined;
  raw: unknown;
}

export type MarketDataTopic = 'L2' | 'tickerV3' | 'tape' | 'tradeAggregateHistory' | (string & {});

export interface MarketEntitlementsOptions {
  exchangeIds: string[];
}

export interface MarketEntitlementSet {
  kind: string;
  name: string;
  entitlements: MarketEntitlement[];
  raw: unknown;
}

export interface MarketEntitlement {
  query: MarketEntitlementQuery[];
  planId?: string | undefined;
  subscribedUntil?: string | undefined;
  isSubscribed: boolean;
  isCanceled: boolean;
  raw: unknown;
}

export interface MarketEntitlementQuery {
  name: string;
  value: string;
  raw: unknown;
}

export interface LiveFeedOptions {
  assetId: string;
  exchangeId?: string | undefined;
  fields?: string[] | undefined;
}

export interface LiveFeedEvent {
  type: string;
  assetId?: string | undefined;
  exchangeId?: string | undefined;
  raw: unknown;
}

export interface MarketQuote {
  assetId: string;
  exchangeId: string;
  currency?: string | undefined;
  last?: number | undefined;
  lastSize?: number | undefined;
  bid?: number | undefined;
  bidSize?: number | undefined;
  ask?: number | undefined;
  askSize?: number | undefined;
  time?: string | undefined;
  raw: unknown;
}

export interface L2OrderBookOptions {
  assetId: string;
  exchangeId: string;
}

export interface L2Venue {
  exchangeId: string;
  name?: string | undefined;
  raw: unknown;
}

export interface L2OrderBook {
  instrumentId?: string | undefined;
  currency?: string | undefined;
  timestamp?: number | undefined;
  bids: Array<[price: number, size: number]>;
  asks: Array<[price: number, size: number]>;
  raw: unknown;
}

export interface RawRequest {
  method?: HttpMethod;
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

export interface WebSocketLike {
  send(data: string | ArrayBuffer | Buffer): void;
  close(code?: number, reason?: string): void;
  addEventListener?(event: string, listener: (...args: any[]) => void): void;
  removeEventListener?(event: string, listener: (...args: any[]) => void): void;
  on?(event: string, listener: (...args: any[]) => void): void;
  off?(event: string, listener: (...args: any[]) => void): void;
}

export type WebSocketFactory = (url: string, headers: Record<string, string>) => WebSocketLike;
