import { ZodType } from 'zod';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type EndpointKey = 'auth.qrChallenge' | 'auth.qrStatus' | 'auth.login' | 'auth.loginProcess' | 'auth.account' | 'auth.session' | 'boards.list' | 'boards.detail' | 'assets.search' | 'assets.detail' | 'assets.all' | 'derivatives.search' | 'derivatives.forUnderlying' | 'derivatives.detail' | 'orders.all' | 'orders.mutualFunds' | 'orders.privateMarkets' | 'portfolio.current' | 'portfolio.cash' | 'portfolio.markToMarket' | 'market.subscriptions' | 'market.candles' | 'market.liveFeed' | 'market.availableL2Books' | 'market.l2OrderBook';
type EndpointMap = Partial<Record<EndpointKey, string>>;
type RawSchemaValidationMode = boolean | 'throw' | 'passthrough';
interface RawSchemaValidationFailure {
    schemaName: string;
    value: unknown;
    error: unknown;
}
interface WebSocketDisconnectEvent {
    disconnectedAt: string;
    code?: number | undefined;
    reason?: string | undefined;
    reconnectDelayMs: number;
}
interface WebSocketReconnectEvent {
    disconnectedAt: string;
    reconnectedAt: string;
    downtimeMs: number;
    reconnectAttempts: number;
}
interface TradeRepublicClientOptions {
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
    onWebSocketDisconnect?: ((event: WebSocketDisconnectEvent) => void | Promise<void>) | undefined;
    onWebSocketReconnect?: ((event: WebSocketReconnectEvent) => void | Promise<void>) | undefined;
    rawSchemaValidation?: RawSchemaValidationMode | undefined;
    onRawSchemaValidationFailure?: ((failure: RawSchemaValidationFailure) => void) | undefined;
}
type RawSchemaValidator = (schemaName: string, value: unknown) => unknown;
interface Board {
    id: string;
    name?: string | undefined;
    widgets: BoardWidget[];
    raw: unknown;
}
interface BoardWidget {
    id: string;
    type: string;
    settings?: Record<string, unknown> | undefined;
    raw: unknown;
}
interface RequestOptions {
    headers?: Record<string, string> | undefined;
    signal?: AbortSignal | undefined;
}
interface Session {
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
interface SessionStore {
    load(): Promise<Session | undefined>;
    save(session: Session): Promise<void>;
    clear(): Promise<void>;
}
interface TradeRepublicWebContext {
    headers?: Record<string, string> | undefined;
    cookies?: Record<string, string> | undefined;
    cookieHeader?: string | undefined;
    awsWafToken?: string | undefined;
    xsrfToken?: string | undefined;
    capturedAt?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}
interface InstantLoginChallenge {
    id: string;
    qrCode?: string | undefined;
    qrCodeDataUrl?: string | undefined;
    deepLink?: string | undefined;
    expiresAt?: string | undefined;
    serverTime?: string | undefined;
    raw: unknown;
}
interface Asset {
    id: string;
    isin?: string | undefined;
    name?: string | undefined;
    type?: string | undefined;
    exchangeIds?: string[] | undefined;
    raw: unknown;
}
type AssetSearchType = 'stock' | 'etf' | 'fund' | 'mutualFund' | 'privateFund' | 'derivative' | 'crypto' | 'bond' | 'synthetic';
interface WatchlistItem extends Asset {
    rank?: number | undefined;
}
interface Watchlist {
    id: string;
    name?: string | undefined;
    items: WatchlistItem[];
    raw: unknown;
}
interface AssetDetail extends Asset {
    issuer?: string | undefined;
    createdAt?: string | undefined;
    endsAt?: string | undefined;
    knockout?: number | undefined;
    entryPrice?: number | undefined;
    direction?: 'long' | 'short' | undefined;
    leverage?: number | undefined;
}
interface Derivative extends AssetDetail {
    underlyingId?: string | undefined;
    productType?: string | undefined;
}
interface Order {
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
type OrderSide = 'buy' | 'sell';
type OrderMode = 'market' | 'limit' | 'stopMarket';
type OrderExpiry = {
    type: 'gfd';
    value?: never;
} | {
    type: 'gtc';
    value?: never;
} | {
    type: 'eom';
    value?: never;
} | {
    type: 'gtd';
    value: string;
};
interface CreateOrderOptions {
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
interface PreparedOrder {
    parameters: Record<string, unknown>;
    clientProcessId: string;
    secAccNo: string;
    warningsShown: string[];
    lastClientPrice?: number | undefined;
}
interface OrderFeeItem {
    name?: string | undefined;
    amount?: number | undefined;
    currency?: string | undefined;
    raw: unknown;
}
interface OrderPreview {
    order: PreparedOrder;
    fees: OrderFeeItem[];
    totalFees?: number | undefined;
    currency?: string | undefined;
    estimatedGross?: number | undefined;
    estimatedTotal?: number | undefined;
    raw: unknown;
}
type OrderSubmissionStatus = 'received' | 'waiting' | 'confirmationNeeded' | 'succeeded' | 'failed' | 'outcomeUnknown' | string;
interface OrderSubmission {
    status: OrderSubmissionStatus;
    orderId?: string | undefined;
    clientProcessId: string;
    updates: unknown[];
    outcomeReason?: 'disconnect' | 'timeout' | undefined;
    connectionLoss?: WebSocketDisconnectEvent | undefined;
    error?: unknown;
    raw: unknown;
}
interface OrderCancellation {
    orderId: string;
    status?: string | undefined;
    outcomeReason?: 'disconnect' | 'timeout' | undefined;
    connectionLoss?: WebSocketDisconnectEvent | undefined;
    error?: unknown;
    raw: unknown;
}
interface OrdersListOptions {
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
interface MutualFundOrdersOptions {
    page?: number | undefined;
    pageSize?: number | undefined;
    openOnly?: boolean | undefined;
    excludeQuantityNull?: boolean | undefined;
    orderBy?: string | undefined;
    order?: 'ASC' | 'DESC' | undefined;
    filters?: Record<string, string | number | boolean | undefined> | undefined;
}
interface PrivateMarketsOrdersOptions {
    pageNumber?: number | undefined;
    pageSize?: number | undefined;
    sortBy?: string | undefined;
    sortAscending?: boolean | undefined;
    filters?: Record<string, string | number | boolean | string[] | undefined> | undefined;
}
interface PortfolioPosition {
    id: string;
    isin?: string | undefined;
    name?: string | undefined;
    quantity?: number | undefined;
    value?: number | undefined;
    currency?: string | undefined;
    categoryType?: string | undefined;
    raw: unknown;
}
interface Portfolio {
    positions: PortfolioPosition[];
    raw: unknown;
}
interface CashSummary {
    amount?: number | undefined;
    currency?: string | undefined;
    raw: unknown;
}
interface TimelineItem {
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
interface TimelineAction {
    id: string;
    type?: string | undefined;
    title?: string | undefined;
    raw: unknown;
}
interface TimelineDetail {
    id: string;
    type?: string | undefined;
    raw: unknown;
}
type TimelineDetailKind = 'timeline' | 'order' | 'savingsPlan';
interface PriceAlarm {
    id: string;
    isin?: string | undefined;
    name?: string | undefined;
    price?: number | undefined;
    currency?: string | undefined;
    triggeredAt?: string | undefined;
    raw: unknown;
}
interface SavingsPlan {
    id: string;
    isin?: string | undefined;
    name?: string | undefined;
    amount?: number | undefined;
    currency?: string | undefined;
    raw: unknown;
}
interface PortfolioChart {
    points: unknown[];
    raw: unknown;
}
interface InstrumentNewsItem {
    id: string;
    title?: string | undefined;
    publishedAt?: string | undefined;
    raw: unknown;
}
interface OrderDestination {
    id: string;
    name?: string | undefined;
    raw: unknown;
}
interface Trade {
    id: string;
    isin?: string | undefined;
    side?: string | undefined;
    quantity?: number | undefined;
    amount?: number | undefined;
    currency?: string | undefined;
    executedAt?: string | undefined;
    raw: unknown;
}
interface ExchangeDetails {
    id: string;
    name?: string | undefined;
    raw: unknown;
}
interface ExchangeSchedule {
    exchangeId?: string | undefined;
    raw: unknown;
}
interface InstrumentStatus {
    isin?: string | undefined;
    exchangeId?: string | undefined;
    status?: string | undefined;
    raw: unknown;
}
type CandleTimeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w' | '1M';
interface Candle {
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number | undefined;
    raw: unknown;
}
interface CandleDownloadOptions {
    assetId: string;
    exchangeId: string;
    timeframe: CandleTimeframe;
    from: string | Date;
    to?: string | Date | undefined;
    limit?: number | undefined;
    cursor?: string | undefined;
}
interface MarketSubscriptionsOptions {
    assetId?: string | undefined;
    exchangeId?: string | undefined;
    type?: string | undefined;
}
interface MarketSubscription {
    id: string;
    assetId?: string | undefined;
    exchangeId?: string | undefined;
    type?: string | undefined;
    raw: unknown;
}
interface LiveFeedOptions {
    assetId: string;
    exchangeId?: string | undefined;
    fields?: string[] | undefined;
}
interface LiveFeedEvent {
    type: string;
    assetId?: string | undefined;
    exchangeId?: string | undefined;
    raw: unknown;
}
interface MarketQuote {
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
interface L2OrderBookOptions {
    assetId: string;
    exchangeId: string;
    depth?: number | undefined;
    throttleMs?: number | undefined;
}
interface L2Venue {
    exchangeId: string;
    name?: string | undefined;
    raw: unknown;
}
interface L2OrderBook {
    bids: Array<[price: number, size: number]>;
    asks: Array<[price: number, size: number]>;
    raw: unknown;
}
interface RawRequest {
    method?: HttpMethod;
    path: string;
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
}
interface WebSocketLike {
    send(data: string | ArrayBuffer | Buffer): void;
    close(code?: number, reason?: string): void;
    addEventListener?(event: string, listener: (...args: any[]) => void): void;
    removeEventListener?(event: string, listener: (...args: any[]) => void): void;
    on?(event: string, listener: (...args: any[]) => void): void;
    off?(event: string, listener: (...args: any[]) => void): void;
}
type WebSocketFactory = (url: string, headers: Record<string, string>) => WebSocketLike;

declare class EndpointResolver {
    private readonly endpoints;
    constructor(overrides?: EndpointMap);
    resolve(key: EndpointKey, params?: Record<string, string | number>): string;
}

interface HttpClientOptions {
    apiBaseUrl: string;
    locale: string;
    userAgent: string;
    sdkHeaders?: Record<string, string> | undefined;
    defaultHeaders?: Record<string, string> | undefined;
    fetch: typeof fetch;
    getSession: () => Session | undefined;
}
declare class HttpClient {
    private readonly options;
    constructor(options: HttpClientOptions);
    request<T>(method: HttpMethod, path: string, body?: unknown, query?: Record<string, string | number | boolean | undefined>, requestOptions?: RequestOptions): Promise<T>;
    requestDetailed<T>(method: HttpMethod, path: string, body?: unknown, query?: Record<string, string | number | boolean | undefined>, requestOptions?: RequestOptions): Promise<{
        body: T;
        headers: Headers;
        status: number;
        url: string;
    }>;
    headers(extra?: Record<string, string>, hasJsonBody?: boolean): Record<string, string>;
}

interface CreateInstantLoginOptions {
    phoneNumber?: string;
    deviceName?: string;
    signal?: AbortSignal;
}
interface StartLoginWithPinOptions {
    phoneNumber: string;
    pin: string;
    otpLess?: boolean | undefined;
    signal?: AbortSignal;
}
interface LoginWithPinOptions extends StartLoginWithPinOptions, PollInstantLoginOptions {
}
interface PollInstantLoginOptions {
    intervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    debug?: boolean;
}
interface LoginProgressState {
    status: string | undefined;
    processId: string | undefined;
    session: Session | undefined;
}
type SessionReadyHandler = (session: Session) => Promise<Session | void> | Session | void;
declare class AuthApi {
    private readonly http;
    private readonly endpoints;
    private readonly getSession;
    private readonly setSession;
    private readonly sessionStore?;
    private readonly onSessionReady?;
    constructor(http: HttpClient, endpoints: EndpointResolver, getSession: () => Session | undefined, setSession: (session: Session) => void, sessionStore?: SessionStore | undefined, onSessionReady?: SessionReadyHandler | undefined);
    createInstantLogin(options?: CreateInstantLoginOptions): Promise<InstantLoginChallenge>;
    startLoginWithPin(options: StartLoginWithPinOptions): Promise<LoginProgressState>;
    loginWithPin(options: LoginWithPinOptions): Promise<Session>;
    pollInstantLogin(challenge: Pick<InstantLoginChallenge, 'id'>, options?: PollInstantLoginOptions): Promise<Session>;
    pollLoginProcess(processId: string, options?: PollInstantLoginOptions): Promise<Session>;
    restoreSession(): Promise<Session | undefined>;
    saveSession(session?: Session | undefined): Promise<void>;
    refreshSession(options?: {
        signal?: AbortSignal;
        debug?: boolean;
    }): Promise<Session>;
    clearSession(): Promise<void>;
    private completeWebSession;
    private finalizeSession;
    private pollLoginProgress;
}

declare class TradeRepublicError extends Error {
    readonly cause?: unknown | undefined;
    constructor(message: string, cause?: unknown | undefined);
}
declare class TradeRepublicHttpError extends TradeRepublicError {
    readonly status: number;
    readonly responseBody: unknown;
    constructor(message: string, status: number, responseBody: unknown);
}
declare class TradeRepublicProtocolError extends TradeRepublicError {
    constructor(message: string, cause?: unknown);
}
declare class TradeRepublicSchemaError extends TradeRepublicError {
    readonly schemaName: string;
    readonly issues: unknown;
    readonly rawSummary: unknown;
    constructor(message: string, schemaName: string, issues: unknown, rawSummary: unknown, cause?: unknown);
}

interface MapperSubscription extends AsyncIterable<unknown> {
    close(): void;
}
interface MapperSubscriptionOptions {
    replayOnReconnect?: boolean | undefined;
}

interface RawSubscription extends MapperSubscription {
}
interface RawSubscriptionOptions extends MapperSubscriptionOptions {
}
interface RawQueryOptions extends RawSubscriptionOptions {
    timeoutMs?: number | undefined;
}
declare class RawApi {
    private readonly http;
    private readonly websocketUrl;
    private readonly websocketFactory;
    private readonly getSession;
    private readonly reconnectDelayMs;
    private readonly onWebSocketDisconnect?;
    private readonly onWebSocketReconnect?;
    private readonly sharedConnection;
    private readonly isolatedConnections;
    constructor(http: HttpClient, websocketUrl: string, websocketFactory: WebSocketFactory, getSession: () => Session | undefined, websocketMode?: 'shared' | 'isolated', reconnectDelayMs?: number, onWebSocketDisconnect?: ((event: WebSocketDisconnectEvent) => void | Promise<void>) | undefined, onWebSocketReconnect?: ((event: WebSocketReconnectEvent) => void | Promise<void>) | undefined);
    request<T = unknown>(request: RawRequest): Promise<T>;
    subscribe(topic: string, payload?: unknown): RawSubscription;
    subscribeLegacy(topic: string, payload?: unknown): RawSubscription;
    subscribeResource(payload: Record<string, unknown>, options?: RawSubscriptionOptions): RawSubscription;
    query<T = unknown>(payload: Record<string, unknown>, options?: RawQueryOptions): Promise<T>;
    queryResource<T = unknown>(payload: Record<string, unknown>, options?: RawQueryOptions): Promise<T>;
    /** Reconnect active subscriptions after session or browser-context changes. */
    refreshSession(): void;
    close(): void;
    private openSubscription;
    private createConnection;
}

interface QuerySpec<TParams, TResult> {
    endpoint?: EndpointKey;
    method?: HttpMethod;
    resource?: (params: TParams) => Record<string, unknown>;
    pathParams?: (params: TParams) => Record<string, string | number>;
    query?: (params: TParams) => Record<string, string | number | boolean | undefined>;
    body?: (params: TParams) => unknown;
    schemaName?: string | undefined;
    normalize: (raw: unknown, params: TParams) => TResult;
}
interface StreamSpec<TParams, TResult> {
    topic: string;
    payload: (params: TParams) => unknown;
    schemaName?: string | undefined;
    normalize: (raw: unknown, params: TParams) => TResult;
}
interface Subscription<T> extends AsyncIterable<T> {
    close(): void;
    map<U>(mapper: (value: T) => U): Subscription<U>;
}
declare class ResourceClient {
    private readonly http;
    private readonly endpoints;
    private readonly raw;
    private readonly validateRaw;
    constructor(http: HttpClient, endpoints: EndpointResolver, raw: RawApi, validateRaw?: RawSchemaValidator);
    query<TParams, TResult>(spec: QuerySpec<TParams, TResult>, params: TParams): Promise<TResult>;
    stream<TParams, TResult>(spec: StreamSpec<TParams, TResult>, params: TParams): Subscription<TResult>;
}

declare class CandleQuery {
    private readonly resources;
    private readonly options;
    constructor(resources: ResourceClient, options: CandleDownloadOptions);
    fetch(): Promise<Candle[]>;
    pages(options?: {
        maxCandlesPerRequest?: number;
    }): AsyncIterable<Candle[]>;
    download(options?: {
        maxCandlesPerRequest?: number;
    }): Promise<Candle[]>;
}

interface OperationBase<TParams, TResult> {
    name: string;
    schemaName?: string | undefined;
    normalize: (raw: unknown, params: TParams) => TResult;
}
interface RestOperation<TParams, TResult> extends OperationBase<TParams, TResult> {
    transport: 'rest';
    method?: HttpMethod | undefined;
    path?: string | ((params: TParams) => string) | undefined;
    endpoint?: EndpointKey | undefined;
    pathParams?: ((params: TParams) => Record<string, string | number>) | undefined;
    query?: ((params: TParams) => Record<string, string | number | boolean | undefined>) | undefined;
    body?: ((params: TParams) => unknown) | undefined;
}
interface MapperQueryOperation<TParams, TResult> extends OperationBase<TParams, TResult> {
    transport: 'mapper-query';
    payload: (params: TParams) => Record<string, unknown>;
    timeoutMs?: ((params: TParams) => number | undefined) | undefined;
}
interface MapperStreamOperation<TParams, TResult> extends OperationBase<TParams, TResult> {
    transport: 'mapper-stream';
    payload: (params: TParams) => Record<string, unknown>;
}
type Operation<TParams, TResult> = RestOperation<TParams, TResult> | MapperQueryOperation<TParams, TResult> | MapperStreamOperation<TParams, TResult>;
declare class OperationClient {
    private readonly http;
    private readonly raw;
    private readonly validateRaw;
    private readonly endpoints?;
    constructor(http: HttpClient, raw: RawApi, validateRaw: RawSchemaValidator, endpoints?: EndpointResolver | undefined);
    execute<TParams, TResult>(operation: Exclude<Operation<TParams, TResult>, MapperStreamOperation<TParams, TResult>>, params: TParams): Promise<TResult>;
    executeRaw<TParams, TResult>(operation: Exclude<Operation<TParams, TResult>, MapperStreamOperation<TParams, TResult>>, params: TParams): Promise<unknown>;
    stream<TParams, TResult>(operation: MapperStreamOperation<TParams, TResult>, params: TParams): Subscription<TResult>;
    private resolvePath;
}

interface AccountIdentityAdapter {
    get(): string | undefined;
    set(value: string): void;
    fallback?(): Promise<string | undefined>;
}
/** Shared internal dependency and account-identity boundary for all domain APIs. */
declare class ClientRuntime {
    readonly http: HttpClient;
    readonly endpoints: EndpointResolver;
    readonly raw: RawApi;
    readonly validateRaw: RawSchemaValidator;
    private readonly accountIdentity;
    readonly resources: ResourceClient;
    readonly operations: OperationClient;
    constructor(http: HttpClient, endpoints: EndpointResolver, raw: RawApi, validateRaw: RawSchemaValidator, accountIdentity: AccountIdentityAdapter);
    get securitiesAccountNumber(): string | undefined;
    rememberSecuritiesAccountNumber(value: string): void;
    resolveSecuritiesAccountNumber(timeoutMs?: number): Promise<string>;
}

declare class AccountApi {
    private readonly operations;
    constructor(operations: OperationClient);
    current(): Promise<unknown>;
    session(): Promise<unknown>;
    accountSettings(): Promise<unknown>;
    personalDetails(): Promise<unknown>;
    relationships(): Promise<unknown>;
    cardsHome(): Promise<unknown>;
}
declare class BoardsApi {
    private readonly operations;
    constructor(operations: OperationClient);
    list(): Promise<Board[]>;
    get(boardId: string): Promise<Board>;
}

declare class DocumentsApi {
    private readonly operations;
    constructor(operations: OperationClient);
    documents(): Promise<unknown>;
    rawDocuments(): Promise<unknown>;
}
declare class TaxApi {
    private readonly operations;
    constructor(operations: OperationClient);
    taxInformation(): Promise<unknown>;
    rawTaxInformation(): Promise<unknown>;
    exemptionOrder(): Promise<unknown>;
    rawExemptionOrder(): Promise<unknown>;
    taxResidencies(): Promise<unknown>;
    rawTaxResidencies(): Promise<unknown>;
    taxResidencyCountries(): Promise<unknown>;
    rawTaxResidencyCountries(): Promise<unknown>;
}
declare class PaymentsApi {
    private readonly operations;
    constructor(operations: OperationClient);
    paymentMethods(): Promise<unknown>;
    rawPaymentMethods(): Promise<unknown>;
    iban(): Promise<unknown>;
    rawIban(): Promise<unknown>;
    interestDetails(): Promise<unknown>;
    rawInterestDetails(): Promise<unknown>;
}

declare class DiscoveryApi {
    private readonly operations;
    constructor(operations: OperationClient);
    exchangeDetails(): Promise<ExchangeDetails[]>;
    rawExchangeDetails(): Promise<unknown>;
    exchangeSchedule(exchange: string): Promise<ExchangeSchedule>;
    rawExchangeSchedule(exchange: string): Promise<unknown>;
    instrumentStatus(isin: string, exchange: string): Promise<InstrumentStatus>;
    rawInstrumentStatus(isin: string, exchange: string): Promise<unknown>;
    watchlists(): Promise<unknown>;
    cloudWatchlist(options?: {
        pageSize?: number;
    }): Promise<Watchlist | undefined>;
    rawWatchlistItems(watchlistId: string, options?: {
        pageSize?: number;
    }): Promise<unknown>;
    rawWatchlists(): Promise<unknown>;
    cloneWatchlist(watchlistId: string): Promise<unknown>;
    rawCloneWatchlist(watchlistId: string): Promise<unknown>;
    renameWatchlist(watchlistId: string, name: string): Promise<unknown>;
    rawRenameWatchlist(watchlistId: string, name: string): Promise<unknown>;
    deleteWatchlist(watchlistId: string): Promise<unknown>;
    rawDeleteWatchlist(watchlistId: string): Promise<unknown>;
    addWatchlistItem(watchlistId: string, instrumentId: string, options?: Record<string, unknown>): Promise<unknown>;
    rawAddWatchlistItem(watchlistId: string, instrumentId: string, options?: Record<string, unknown>): Promise<unknown>;
    removeWatchlistItem(watchlistId: string, instrumentId: string): Promise<unknown>;
    rawRemoveWatchlistItem(watchlistId: string, instrumentId: string): Promise<unknown>;
    screeners(): Promise<unknown>;
    rawScreeners(): Promise<unknown>;
    screenerOptions(): Promise<unknown>;
    rawScreenerOptions(): Promise<unknown>;
    userPreferences(): Promise<unknown>;
    rawUserPreferences(): Promise<unknown>;
}

declare class TradeRepublicClient {
    readonly auth: AuthApi;
    readonly raw: RawApi;
    readonly account: AccountApi;
    readonly boards: BoardsApi;
    readonly assets: AssetsApi;
    readonly derivatives: DerivativesApi;
    readonly orders: OrdersApi;
    readonly portfolio: PortfolioApi;
    readonly market: MarketApi;
    readonly timeline: TimelineApi;
    readonly priceAlarms: PriceAlarmsApi;
    readonly instruments: InstrumentsApi;
    readonly trading: TradingApi;
    readonly discovery: DiscoveryApi;
    readonly documents: DocumentsApi;
    readonly tax: TaxApi;
    readonly payments: PaymentsApi;
    readonly web: WebApi;
    securitiesAccountNumber: string | undefined;
    private session;
    private readonly http;
    private readonly endpoints;
    private readonly resources;
    private readonly operations;
    private readonly runtime;
    private readonly validateRaw;
    constructor(options?: TradeRepublicClientOptions);
    static create(options?: TradeRepublicClientOptions): TradeRepublicClient;
    getSession(): Session | undefined;
    setSession(session: Session): void;
    useWebContext(webContext: TradeRepublicWebContext): Session;
    close(): void;
    private setSecuritiesAccountNumber;
    private captureSecuritiesAccountNumber;
    private resolveSecuritiesAccountNumberFromRest;
}
declare class AssetsApi {
    private readonly raw;
    private readonly validateRaw;
    constructor(raw: RawApi, validateRaw: RawSchemaValidator);
    search(query: string, options?: {
        limit?: number;
        page?: number;
        type?: AssetSearchType;
        filters?: Record<string, string | number | boolean | undefined>;
    }): Promise<Asset[]>;
    get(assetId: string): Promise<AssetDetail>;
    listAll(options?: {
        cursor?: string;
        limit?: number;
        type?: AssetSearchType;
        filters?: Record<string, string | number | boolean | undefined>;
    }): Promise<Asset[]>;
}
declare class DerivativesApi {
    private readonly raw;
    private readonly validateRaw;
    constructor(raw: RawApi, validateRaw: RawSchemaValidator);
    search(query: string, options?: {
        underlyingId?: string;
        direction?: 'long' | 'short';
        limit?: number;
    }): Promise<Derivative[]>;
    listForUnderlying(underlyingId: string, options?: {
        direction?: 'long' | 'short';
        productType?: string;
        limit?: number;
    }): Promise<Derivative[]>;
    get(derivativeId: string): Promise<Derivative>;
}
declare class OrdersApi {
    private readonly runtime;
    private readonly http;
    private readonly endpoints;
    private readonly raw;
    private readonly validateRaw;
    constructor(runtime: ClientRuntime);
    open(options?: OrdersListOptions): Promise<Order[]>;
    closed(options?: OrdersListOptions): Promise<Order[]>;
    executed(options?: OrdersListOptions): Promise<Order[]>;
    all(options?: OrdersListOptions): Promise<Order[]>;
    rawAll(options?: OrdersListOptions): Promise<unknown>;
    mutualFunds(options?: MutualFundOrdersOptions): Promise<Order[]>;
    rawMutualFunds(options?: MutualFundOrdersOptions): Promise<unknown>;
    privateMarkets(options?: PrivateMarketsOrdersOptions): Promise<Order[]>;
    rawPrivateMarkets(options?: PrivateMarketsOrdersOptions): Promise<unknown>;
    orderUpdates(secAccNo: string): Subscription<unknown>;
    rawOrderUpdates(secAccNo?: string): Promise<unknown>;
    prepare(options: CreateOrderOptions): Promise<PreparedOrder>;
    preview(options: CreateOrderOptions): Promise<OrderPreview>;
    submit(options: CreateOrderOptions | PreparedOrder): Promise<OrderSubmission>;
    cancel(orderId: string, options?: {
        timeoutMs?: number;
    }): Promise<OrderCancellation>;
    private resolveAmountSizeStep;
}
declare class PortfolioApi {
    private readonly runtime;
    private readonly http;
    private readonly raw;
    private readonly validateRaw;
    constructor(runtime: ClientRuntime);
    current(options?: {
        timeoutMs?: number;
    }): Promise<Portfolio>;
    cash(): Promise<CashSummary>;
    markToMarketValue(): Promise<CashSummary>;
    savingsPlans(secAccNo?: string): Promise<SavingsPlan[]>;
    rawSavingsPlans(secAccNo?: string): Promise<unknown>;
    privateMarketsPositions(secAccNo?: string): Promise<unknown>;
    rawPrivateMarketsPositions(secAccNo?: string): Promise<unknown>;
    portfolioChart(secAccNo?: string, range?: string, options?: {
        currency?: string;
        instrumentCategories?: string;
    }): Promise<PortfolioChart>;
    rawPortfolioChart(secAccNo?: string, range?: string, options?: {
        currency?: string;
        instrumentCategories?: string;
    }): Promise<unknown>;
    positionsForAccount(secAccNo: string, options?: {
        timeoutMs?: number;
    }): Promise<Portfolio>;
    private resolveSecuritiesAccountNumber;
}
declare class MarketApi {
    private readonly resources;
    constructor(resources: ResourceClient);
    subscriptions(options?: MarketSubscriptionsOptions): Promise<MarketSubscription[]>;
    candleQuery(options: CandleDownloadOptions): CandleQuery;
    candles(options: CandleDownloadOptions): Promise<Candle[]>;
    quote(assetId: string, exchangeId: string): Promise<MarketQuote>;
    downloadCandles(options: CandleDownloadOptions, paging?: {
        maxCandlesPerRequest?: number;
    }): Promise<Candle[]>;
    subscribeLiveFeed(options: LiveFeedOptions): Subscription<LiveFeedEvent>;
    liveFeed(assetId: string, options?: Omit<LiveFeedOptions, 'assetId'>): Subscription<LiveFeedEvent>;
    availableL2Books(assetId: string): Promise<L2Venue[]>;
    subscribeL2OrderBook(options: L2OrderBookOptions): Subscription<L2OrderBook>;
    l2OrderBook(assetId: string, exchangeId: string, options?: Omit<L2OrderBookOptions, 'assetId' | 'exchangeId'>): Subscription<L2OrderBook>;
}
declare class TimelineApi {
    private readonly raw;
    private readonly validateRaw;
    constructor(raw: RawApi, validateRaw: RawSchemaValidator);
    list(options?: {
        after?: string;
        timeoutMs?: number;
    }): Promise<TimelineItem[]>;
    rawList(options?: {
        after?: string;
        timeoutMs?: number;
    }): Promise<unknown>;
    actions(options?: {
        timeoutMs?: number;
    }): Promise<TimelineAction[]>;
    rawActions(options?: {
        timeoutMs?: number;
    }): Promise<unknown>;
    detail(id: string, kind?: TimelineDetailKind, options?: {
        timeoutMs?: number;
    }): Promise<TimelineDetail>;
    rawDetail(id: string, kind?: TimelineDetailKind, options?: {
        timeoutMs?: number;
    }): Promise<unknown>;
}
declare class PriceAlarmsApi {
    private readonly raw;
    private readonly validateRaw;
    constructor(raw: RawApi, validateRaw: RawSchemaValidator);
    list(options?: {
        timeoutMs?: number;
    }): Promise<PriceAlarm[]>;
    rawList(options?: {
        timeoutMs?: number;
    }): Promise<unknown>;
    notifications(options?: {
        timeoutMs?: number;
    }): Promise<PriceAlarm[]>;
    rawNotifications(options?: {
        timeoutMs?: number;
    }): Promise<unknown>;
    create(options: {
        isin: string;
        price: number;
        timeoutMs?: number;
    }): Promise<unknown>;
    rawCreate(payload: Record<string, unknown>, options?: {
        timeoutMs?: number;
    }): Promise<unknown>;
    cancel(id: string, options?: {
        timeoutMs?: number;
    }): Promise<unknown>;
    rawCancel(id: string, options?: {
        timeoutMs?: number;
    }): Promise<unknown>;
}
declare class InstrumentsApi {
    private readonly raw;
    private readonly validateRaw;
    constructor(raw: RawApi, validateRaw: RawSchemaValidator);
    news(isin: string, options?: {
        timeoutMs?: number;
    }): Promise<InstrumentNewsItem[]>;
    rawNews(isin: string, options?: {
        timeoutMs?: number;
    }): Promise<unknown>;
    etfDetails(id: string, options?: {
        timeoutMs?: number;
    }): Promise<unknown>;
    rawEtfDetails(id: string, options?: {
        timeoutMs?: number;
    }): Promise<unknown>;
    etfComposition(id: string, after?: string, options?: {
        timeoutMs?: number;
    }): Promise<unknown>;
    rawEtfComposition(id: string, after?: string, options?: {
        timeoutMs?: number;
    }): Promise<unknown>;
    fundDetails(id: string, options?: {
        timeoutMs?: number;
    }): Promise<unknown>;
    rawFundDetails(id: string, options?: {
        timeoutMs?: number;
    }): Promise<unknown>;
    fundComposition(id: string, after?: string, options?: {
        timeoutMs?: number;
    }): Promise<unknown>;
    rawFundComposition(id: string, after?: string, options?: {
        timeoutMs?: number;
    }): Promise<unknown>;
    cryptoDetails(id: string, options?: {
        timeoutMs?: number;
    }): Promise<unknown>;
    rawCryptoDetails(id: string, options?: {
        timeoutMs?: number;
    }): Promise<unknown>;
    yieldToMaturity(id: string, options?: {
        timeoutMs?: number;
    }): Promise<unknown>;
    rawYieldToMaturity(id: string, options?: {
        timeoutMs?: number;
    }): Promise<unknown>;
}
declare class TradingApi {
    private readonly runtime;
    private readonly http;
    private readonly raw;
    private readonly validateRaw;
    constructor(runtime: ClientRuntime);
    priceForOrder(options: {
        isin: string;
        exchangeId: string;
        side: string;
        unit?: string;
    }, queryOptions?: {
        timeoutMs?: number;
    }): Promise<unknown>;
    availableSize(instrumentId: string, secAccNo?: string, options?: {
        timeoutMs?: number;
    }): Promise<unknown>;
    orderDestinations(isin: string, query?: Record<string, string | number | boolean | undefined>): Promise<OrderDestination[]>;
    rawOrderDestinations(isin: string, query?: Record<string, string | number | boolean | undefined>): Promise<unknown>;
    trades(query?: Record<string, string | number | boolean | undefined>): Promise<Trade[]>;
    rawTrades(query?: Record<string, string | number | boolean | undefined>): Promise<unknown>;
    dailyPnl(items: unknown[]): Promise<unknown>;
    rawDailyPnl(items: unknown[]): Promise<unknown>;
    private resolveSecuritiesAccountNumber;
}
declare class WebApi {
    private readonly runtime;
    private readonly http;
    private readonly raw;
    constructor(runtime: ClientRuntime);
    request<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, options?: {
        body?: unknown;
        query?: Record<string, string | number | boolean | undefined>;
    }): Promise<T>;
    requestDetailed<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, options?: {
        body?: unknown;
        query?: Record<string, string | number | boolean | undefined>;
    }): Promise<{
        body: T;
        headers: Headers;
        status: number;
        url: string;
    }>;
    query<T = unknown>(payload: Record<string, unknown>, options?: {
        timeoutMs?: number;
    }): Promise<T>;
    subscribe(payload: Record<string, unknown>): Subscription<unknown>;
    timeline(after?: string): Promise<unknown>;
    timelineActions(): Promise<unknown>;
    timelineDetail(id: string, kind?: 'timeline' | 'order' | 'savingsPlan'): Promise<unknown>;
    priceAlarms(): Promise<unknown>;
    priceAlarmNotifications(): Promise<unknown>;
    savingsPlans(secAccNo?: string): Promise<unknown>;
    portfolioChart(secAccNo: string, range?: string, options?: {
        currency?: string;
        instrumentCategories?: string;
    }): Promise<unknown>;
    news(isin: string): Promise<unknown>;
    etfDetails(id: string): Promise<unknown>;
    etfComposition(id: string, after?: string): Promise<unknown>;
    mutualFundDetails(id: string): Promise<unknown>;
    mutualFundComposition(id: string, after?: string): Promise<unknown>;
    cryptoDetails(id: string): Promise<unknown>;
    yieldToMaturity(id: string): Promise<unknown>;
    bondValuation(instrumentId: string, secAccNo?: string): Promise<unknown>;
    fixedSavingsValuation(instrumentId: string, secAccNo?: string): Promise<unknown>;
    privateMarketsPositions(secAccNo?: string): Promise<unknown>;
    tape(isin: string, exchangeId: string, unit?: string): Subscription<unknown>;
    tradeAggregateHistory(isin: string, exchangeId: string, resolution: string, from: string, until?: string): Promise<unknown>;
    priceForOrder(options: {
        isin: string;
        exchangeId: string;
        side: string;
        unit?: string;
    }): Promise<unknown>;
    availableSize(instrumentId: string, secAccNo?: string): Promise<unknown>;
    taxWrapperAccountUtilization(secAccNo: string): Promise<unknown>;
    userPreferences(): Promise<unknown>;
    exchangeDetails(): Promise<unknown>;
    exchangeSchedule(exchange: string): Promise<unknown>;
    instrumentStatus(isin: string, exchange: string): Promise<unknown>;
    orderDestinations(isin: string, query?: Record<string, string | number | boolean | undefined>): Promise<unknown>;
    trades(query?: Record<string, string | number | boolean | undefined>): Promise<unknown>;
    dailyPnl(items: unknown[]): Promise<unknown>;
    documents(): Promise<unknown>;
    personalDetails(): Promise<unknown>;
    relationships(): Promise<unknown>;
    cardsHome(): Promise<unknown>;
    accountSettings(): Promise<unknown>;
    appUsageConsents(): Promise<unknown>;
    paymentMethods(): Promise<unknown>;
    iban(): Promise<unknown>;
    taxInformation(): Promise<unknown>;
    exemptionOrder(): Promise<unknown>;
    taxResidencies(): Promise<unknown>;
    taxResidencyCountries(): Promise<unknown>;
    interestDetails(): Promise<unknown>;
    watchlists(): Promise<unknown>;
    screeners(): Promise<unknown>;
    screenerOptions(): Promise<unknown>;
    private withSecAccNo;
}

declare function redactSession(session: Session): Record<string, unknown>;
declare class MemorySessionStore implements SessionStore {
    private session;
    load(): Promise<Session | undefined>;
    save(session: Session): Promise<void>;
    clear(): Promise<void>;
}
declare class FileSessionStore implements SessionStore {
    private readonly filePath;
    constructor(filePath: string);
    load(): Promise<Session | undefined>;
    save(session: Session): Promise<void>;
    clear(): Promise<void>;
}

interface TradeRepublicBrowserLike {
    newContext(options?: TradeRepublicBrowserContextOptions): Promise<TradeRepublicBrowserContextLike>;
}
type TradeRepublicBrowserContextOptions = Record<string, unknown>;
interface CollectTradeRepublicWebContextOptions {
    appUrl?: string | undefined;
    apiUrl?: string | undefined;
    contextOptions?: TradeRepublicBrowserContextOptions | undefined;
    timeoutMs?: number | undefined;
    settleMs?: number | undefined;
    waitUntil?: string | undefined;
}
interface TradeRepublicBrowserContextLike {
    newPage(): Promise<TradeRepublicPageLike>;
    cookies(urls?: string | string[]): Promise<TradeRepublicCookieLike[]>;
    close(): Promise<void> | void;
    on?(event: 'request', listener: (request: TradeRepublicRequestLike) => void): void;
}
interface TradeRepublicPageLike {
    goto(url: string, options?: {
        waitUntil?: string;
        timeout?: number;
    }): Promise<unknown>;
    waitForLoadState?(state?: string, options?: {
        timeout?: number;
    }): Promise<unknown>;
    waitForTimeout?(timeout: number): Promise<unknown>;
    evaluate?<T>(fn: () => T): Promise<T>;
    on?(event: 'request', listener: (request: TradeRepublicRequestLike) => void): void;
}
interface TradeRepublicRequestLike {
    url(): string;
    headers(): Record<string, string>;
}
interface TradeRepublicCookieLike {
    name: string;
    value: string;
    domain?: string | undefined;
    path?: string | undefined;
    expires?: number | undefined;
}
declare function collectTradeRepublicWebContext(browser: TradeRepublicBrowserLike, options?: CollectTradeRepublicWebContextOptions): Promise<TradeRepublicWebContext>;

type SchemaRisk = 'read' | 'lowRiskMutation' | 'highRiskMutation' | 'blockedMutation';
type SchemaTransport = 'rest' | 'websocket';
interface TradeRepublicSchemaEntry {
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
declare const schemaRegistry: readonly [TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry, TradeRepublicSchemaEntry];
declare function validateRawResponse(schemaName: string, value: unknown): unknown;
declare function schemaCatalogMarkdown(): string;

export { type Asset, type AssetDetail, type AssetSearchType, type Candle, type CandleDownloadOptions, CandleQuery, type CandleTimeframe, type CashSummary, type CollectTradeRepublicWebContextOptions, type CreateOrderOptions, type Derivative, type EndpointMap, type ExchangeDetails, type ExchangeSchedule, FileSessionStore, type HttpMethod, type InstantLoginChallenge, type InstrumentNewsItem, type InstrumentStatus, type L2OrderBook, type L2OrderBookOptions, type L2Venue, type LiveFeedEvent, type LiveFeedOptions, type MarketQuote, type MarketSubscription, type MarketSubscriptionsOptions, MemorySessionStore, type MutualFundOrdersOptions, type Order, type OrderCancellation, type OrderDestination, type OrderExpiry, type OrderFeeItem, type OrderMode, type OrderPreview, type OrderSide, type OrderSubmission, type OrderSubmissionStatus, type OrdersListOptions, type Portfolio, type PortfolioChart, type PortfolioPosition, type PreparedOrder, type PriceAlarm, type PrivateMarketsOrdersOptions, type QuerySpec, type RequestOptions, type SavingsPlan, type SchemaRisk, type SchemaTransport, type Session, type SessionStore, type StreamSpec, type Subscription, type TimelineAction, type TimelineDetail, type TimelineDetailKind, type TimelineItem, type Trade, type TradeRepublicBrowserContextLike, type TradeRepublicBrowserLike, TradeRepublicClient, type TradeRepublicClientOptions, type TradeRepublicCookieLike, TradeRepublicError, TradeRepublicHttpError, type TradeRepublicPageLike, TradeRepublicProtocolError, type TradeRepublicRequestLike, type TradeRepublicSchemaEntry, TradeRepublicSchemaError, type TradeRepublicWebContext, type Watchlist, type WatchlistItem, type WebSocketDisconnectEvent, type WebSocketReconnectEvent, collectTradeRepublicWebContext, redactSession, schemaCatalogMarkdown, schemaRegistry, validateRawResponse };
