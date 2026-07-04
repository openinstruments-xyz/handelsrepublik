export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type EndpointKey =
  | 'auth.qrChallenge'
  | 'auth.qrStatus'
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

export interface TradeRepublicClientOptions {
  apiBaseUrl?: string | undefined;
  websocketUrl?: string | undefined;
  locale?: string | undefined;
  userAgent?: string | undefined;
  defaultHeaders?: Record<string, string> | undefined;
  session?: Session | undefined;
  sessionStore?: SessionStore | undefined;
  endpoints?: EndpointMap | undefined;
  fetch?: typeof fetch | undefined;
  websocketFactory?: WebSocketFactory | undefined;
}

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

export interface InstantLoginChallenge {
  id: string;
  qrCode?: string | undefined;
  qrCodeDataUrl?: string | undefined;
  deepLink?: string | undefined;
  expiresAt?: string | undefined;
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
  amount?: number | undefined;
  currency?: string | undefined;
  raw: unknown;
}

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
