export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type EndpointKey =
  | 'auth.qrChallenge'
  | 'auth.qrStatus'
  | 'auth.login'
  | 'auth.loginProcess'
  | 'auth.account'
  | 'auth.session'
  | 'boards.list'
  | 'boards.detail'
  | 'assets.search'
  | 'assets.detail'
  | 'assets.all'
  | 'derivatives.search'
  | 'derivatives.forUnderlying'
  | 'derivatives.detail'
  | 'orders.all'
  | 'orders.mutualFunds'
  | 'orders.privateMarkets'
  | 'portfolio.current'
  | 'portfolio.cash'
  | 'portfolio.markToMarket'
  | 'market.subscriptions'
  | 'market.candles'
  | 'market.liveFeed'
  | 'market.availableL2Books'
  | 'market.l2OrderBook';

export type EndpointMap = Partial<Record<EndpointKey, string>>;
export type RawSchemaValidationMode = boolean | 'throw' | 'passthrough';

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
  defaultHeaders?: Record<string, string> | undefined;
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

export interface Account {
  raw: unknown;
}

export interface Board {
  id: string;
  name?: string | undefined;
  widgets: BoardWidget[];
  raw: unknown;
}

export interface BoardWidget {
  id: string;
  type: string;
  settings?: Record<string, unknown> | undefined;
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
  webContext?: TradeRepublicWebContext | undefined;
  cookies?: Record<string, string> | undefined;
  expiresAt?: string | undefined;
  accountId?: string | undefined;
  deviceId?: string | undefined;
  securitiesAccountNumber?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
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

export interface InstantLoginChallenge {
  id: string;
  qrCode?: string | undefined;
  qrCodeDataUrl?: string | undefined;
  deepLink?: string | undefined;
  expiresAt?: string | undefined;
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

export type OrderExpiry =
  | { type: 'gfd'; value?: never }
  | { type: 'gtc'; value?: never }
  | { type: 'eom'; value?: never }
  | { type: 'gtd'; value: string };

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
  expiry?: OrderExpiry | undefined;
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

interface OrderSubmissionBase {
  orderId?: string | undefined;
  clientProcessId: string;
  updates: unknown[];
  raw: unknown;
}

export interface OrderSubmissionSucceeded extends OrderSubmissionBase {
  status: 'succeeded';
}

export interface OrderSubmissionFailed extends OrderSubmissionBase {
  status: 'failed';
  error: unknown;
}

export interface OrderSubmissionOutcomeUnknown extends OrderSubmissionBase {
  status: 'outcomeUnknown';
  outcomeReason: MutationOutcomeUnknownReason;
  connectionLoss?: WebSocketDisconnectEvent | undefined;
  error: unknown;
}

export type OrderSubmission = OrderSubmissionSucceeded | OrderSubmissionFailed | OrderSubmissionOutcomeUnknown;

interface OrderCancellationBase {
  orderId: string;
  updates: unknown[];
  raw: unknown;
}

export interface OrderCancellationSucceeded extends OrderCancellationBase {
  status: 'succeeded';
}

export interface OrderCancellationFailed extends OrderCancellationBase {
  status: 'failed';
  error: unknown;
}

export interface OrderCancellationOutcomeUnknown extends OrderCancellationBase {
  status: 'outcomeUnknown';
  outcomeReason: MutationOutcomeUnknownReason;
  connectionLoss?: WebSocketDisconnectEvent | undefined;
  error: unknown;
}

export type OrderCancellation = OrderCancellationSucceeded | OrderCancellationFailed | OrderCancellationOutcomeUnknown;

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
  raw: unknown;
}

export interface Trade {
  id: string;
  isin?: string | undefined;
  side?: string | undefined;
  quantity?: number | undefined;
  amount?: number | undefined;
  currency?: string | undefined;
  executedAt?: string | undefined;
  raw: unknown;
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
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '4h'
  | '1d'
  | '1w'
  | '1M';

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
  timeframe: CandleTimeframe;
  from: string | Date;
  to?: string | Date | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

export interface MarketSubscriptionsOptions {
  assetId?: string | undefined;
  exchangeId?: string | undefined;
  type?: string | undefined;
}

export interface MarketSubscription {
  id: string;
  assetId?: string | undefined;
  exchangeId?: string | undefined;
  type?: string | undefined;
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
  depth?: number | undefined;
  throttleMs?: number | undefined;
}

export interface L2Venue {
  exchangeId: string;
  name?: string | undefined;
  raw: unknown;
}

export interface L2OrderBook {
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
