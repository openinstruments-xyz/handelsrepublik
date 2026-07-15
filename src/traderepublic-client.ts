import { AuthApi } from './auth.js';
import { randomUUID } from 'node:crypto';
import { CandleQuery } from './candles.js';
import { EndpointResolver } from './endpoints.js';
import { HttpClient } from './http.js';
import { TradeRepublicProtocolError } from './errors.js';
import {
  availableL2BooksSpec,
  candlesSpec,
  l2OrderBookSpec,
  liveFeedSpec,
  marketSubscriptionsSpec,
  quoteSpec,
} from './market-specs.js';
import {
  arrayPayload,
  normalizeAsset,
  normalizeAssetDetail,
  normalizeBoard,
  normalizeCash,
  normalizeDerivative,
  normalizeExchangeDetails,
  normalizeExchangeSchedule,
  normalizeInstrumentNewsItem,
  normalizeInstrumentStatus,
  normalizeOrder,
  normalizeOrderDestination,
  normalizePortfolio,
  normalizePortfolioChart,
  normalizePriceAlarm,
  normalizeSavingsPlan,
  normalizeTimelineAction,
  normalizeTimelineDetail,
  normalizeTimelineItem,
  normalizeTrade,
  normalizeWatchlist,
} from './normalizers.js';
import { defaultWebSocketFactory, RawApi } from './raw.js';
import { ResourceClient, toSubscription, type Subscription } from './resource.js';
import { validateRawResponse } from './schemas/registry.js';
import { mergeTradeRepublicWebContexts, normalizeTradeRepublicWebContext } from './waf.js';
import type {
  Asset,
  AssetDetail,
  Board,
  Candle,
  CandleDownloadOptions,
  CandleTimeframe,
  CashSummary,
  Derivative,
  ExchangeDetails,
  ExchangeSchedule,
  InstrumentNewsItem,
  InstrumentStatus,
  L2OrderBook,
  L2OrderBookOptions,
  L2Venue,
  LiveFeedEvent,
  LiveFeedOptions,
  MarketQuote,
  MarketSubscription,
  MarketSubscriptionsOptions,
  MutualFundOrdersOptions,
  Order,
  OrderCancellation,
  CreateOrderOptions,
  OrderFeeItem,
  OrderPreview,
  OrderSubmission,
  PreparedOrder,
  OrderDestination,
  OrdersListOptions,
  Portfolio,
  PortfolioChart,
  PrivateMarketsOrdersOptions,
  PriceAlarm,
  SavingsPlan,
  Session,
  TimelineAction,
  TimelineDetail,
  TimelineDetailKind,
  TimelineItem,
  Trade,
  TradeRepublicClientOptions,
  TradeRepublicWebContext,
  Watchlist,
  RawSchemaValidator,
  RawSchemaValidationFailure,
  RawSchemaValidationMode,
} from './types.js';

const DEFAULT_API_BASE_URL = 'https://api.traderepublic.com';
const DEFAULT_WEBSOCKET_URL = 'wss://api.traderepublic.com';
const DEFAULT_LOCALE = 'en';
const DEFAULT_USER_AGENT = 'handelsrepublik/0.1.0';
const DEFAULT_TR_HEADERS = {
  'x-tr-app-version': '15.101.0',
  'x-tr-platform': 'web-pro',
  'x-tr-device-info': 'eyJzdGFibGVEZXZpY2VJZCI6IjFlMTEyMjA3ZmNlZDhhZTNhZDRlY2ZiNGNiYjlmZTIyZDhkYjI1NDk5YmUwMzk4OGU2ODlmOTVmMmVlYTBlYTg4NWJhOTI2NmU2YWIwMTE5ZmRjZGQ1MDI2NGIzMDgyZWZmZDgxZGViZmEwYmQ1YTMzNjdmN2QwNzljMDZjMDcwIiwiYnJvd3NlciI6IkNocm9tZSIsImJyb3dzZXJWZXJzaW9uIjoiMTUwLjAuMC4wIiwib3MiOiJXaW5kb3dzIiwib3NWZXJzaW9uIjoiMTAiLCJ0aW1lem9uZSI6IkV1cm9wZS9CZXJsaW4iLCJ0aW1lem9uZU9mZnNldCI6LTEyMCwic2NyZWVuIjoiMTI4MHg3MjB4MjQiLCJwcmVmZXJyZWRMYW5ndWFnZXMiOlsiZW4tVVMiLCJlbiJdLCJudW1iZXJPZkNvcmVzIjoxMiwiZGV2aWNlTWVtb3J5IjozMn0=',
} as const;

export class TradeRepublicClient {
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

  private session: Session | undefined;
  private readonly http: HttpClient;
  private readonly endpoints: EndpointResolver;
  private readonly resources: ResourceClient;
  private readonly validateRaw: RawSchemaValidator;

  constructor(options: TradeRepublicClientOptions = {}) {
    this.session = withWebContext(options.session, options.webContext);
    this.securitiesAccountNumber = options.session?.securitiesAccountNumber;
    this.validateRaw = createRawSchemaValidator(options.rawSchemaValidation, options.onRawSchemaValidationFailure);
    this.endpoints = new EndpointResolver(options.endpoints);
    this.http = new HttpClient({
      apiBaseUrl: options.apiBaseUrl ?? DEFAULT_API_BASE_URL,
      locale: options.locale ?? DEFAULT_LOCALE,
      userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
      sdkHeaders: DEFAULT_TR_HEADERS,
      defaultHeaders: options.defaultHeaders,
      fetch: options.fetch ?? fetch,
      getSession: () => this.session,
    });

    this.auth = new AuthApi(this.http, this.endpoints, () => this.session, (session) => {
      this.setSession(session);
    }, options.sessionStore, (session) => this.captureSecuritiesAccountNumber(session));
    this.raw = new RawApi(
      this.http,
      options.websocketUrl ?? DEFAULT_WEBSOCKET_URL,
      options.websocketFactory ?? defaultWebSocketFactory,
      () => this.session,
    );
    this.account = new AccountApi(this.http, this.endpoints, this.validateRaw);
    this.boards = new BoardsApi(this.http, this.endpoints, this.validateRaw);
    this.resources = new ResourceClient(this.http, this.endpoints, this.raw, this.validateRaw);
    this.assets = new AssetsApi(this.raw, this.validateRaw);
    this.derivatives = new DerivativesApi(this.raw, this.validateRaw);
    const getAccountNumber = () => this.securitiesAccountNumber ?? this.session?.securitiesAccountNumber;
    const resolveAccountNumberFromRest = () => this.resolveSecuritiesAccountNumberFromRest();
    this.orders = new OrdersApi(this.http, this.endpoints, this.raw, this.validateRaw, getAccountNumber, (value) => this.setSecuritiesAccountNumber(value), resolveAccountNumberFromRest);
    this.portfolio = new PortfolioApi(this.http, this.endpoints, this.raw, this.validateRaw, getAccountNumber, (value) => this.setSecuritiesAccountNumber(value), resolveAccountNumberFromRest);
    this.market = new MarketApi(this.resources);
    this.timeline = new TimelineApi(this.raw, this.validateRaw);
    this.priceAlarms = new PriceAlarmsApi(this.raw, this.validateRaw);
    this.instruments = new InstrumentsApi(this.raw, this.validateRaw);
    this.trading = new TradingApi(this.http, this.raw, this.validateRaw, getAccountNumber, (value) => this.setSecuritiesAccountNumber(value), resolveAccountNumberFromRest);
    this.discovery = new DiscoveryApi(this.http, this.validateRaw);
    this.documents = new DocumentsApi(this.http, this.validateRaw);
    this.tax = new TaxApi(this.http, this.validateRaw);
    this.payments = new PaymentsApi(this.http, this.validateRaw);
    this.web = new WebApi(this.http, this.raw, getAccountNumber, (value) => this.setSecuritiesAccountNumber(value), resolveAccountNumberFromRest);
  }

  static create(options: TradeRepublicClientOptions = {}): TradeRepublicClient {
    return new TradeRepublicClient(options);
  }

  getSession(): Session | undefined {
    if (!this.session) return undefined;
    return structuredClone({
      ...this.session,
      securitiesAccountNumber: this.session.securitiesAccountNumber ?? this.securitiesAccountNumber,
    });
  }

  setSession(session: Session): void {
    const shouldPreserveWebContext = Object.keys(session).length > 0 && !session.webContext;
    const nextSession = shouldPreserveWebContext && this.session?.webContext
      ? { ...session, webContext: this.session.webContext }
      : session;
    this.session = structuredClone(nextSession);
    if (session.securitiesAccountNumber) this.setSecuritiesAccountNumber(session.securitiesAccountNumber);
    else if (Object.keys(session).length === 0) this.securitiesAccountNumber = undefined;
  }

  useWebContext(webContext: TradeRepublicWebContext): Session {
    const session = {
      ...(this.session ?? {}),
      webContext: mergeTradeRepublicWebContexts(this.session?.webContext, normalizeTradeRepublicWebContext(webContext)),
    };
    this.setSession(session);
    return this.getSession() ?? session;
  }

  private setSecuritiesAccountNumber(value: string | undefined): void {
    if (!value) return;
    this.securitiesAccountNumber = value;
    if (this.session) this.session.securitiesAccountNumber = value;
  }

  private async captureSecuritiesAccountNumber(session: Session): Promise<Session> {
    if (session.securitiesAccountNumber) {
      this.setSecuritiesAccountNumber(session.securitiesAccountNumber);
      return session;
    }
    try {
      const accountNumber = await resolveSecuritiesAccountNumber(this.raw, this.securitiesAccountNumber, (value) => this.setSecuritiesAccountNumber(value), 5_000, () => this.resolveSecuritiesAccountNumberFromRest());
      return { ...session, securitiesAccountNumber: accountNumber };
    } catch {
      return session;
    }
  }

  private async resolveSecuritiesAccountNumberFromRest(): Promise<string | undefined> {
    const account = await this.account.current();
    const accountNumber = firstStringByKey(account, 'securitiesAccountNumber');
    if (accountNumber) this.setSecuritiesAccountNumber(accountNumber);
    return accountNumber;
  }
}

function withWebContext(session: Session | undefined, webContext: TradeRepublicWebContext | undefined): Session | undefined {
  if (!webContext) return session ? structuredClone(session) : undefined;
  return {
    ...(session ? structuredClone(session) : {}),
    webContext: mergeTradeRepublicWebContexts(session?.webContext, webContext),
  };
}

export class AssetsApi {
  constructor(
    private readonly raw: RawApi,
    private readonly validateRaw: RawSchemaValidator,
  ) {}

  async search(query: string, options: { limit?: number; page?: number; type?: string; filters?: Record<string, string | number | boolean | undefined> } = {}): Promise<Asset[]> {
    const raw = await validated(this.validateRaw, 'assets.search', this.raw.query({
      type: 'neonSearch',
      data: {
        q: query.trim(),
        page: options.page ?? 1,
        pageSize: options.limit ?? 20,
        filter: neonSearchFilters(options.type ?? 'stock', options.filters),
      },
    }));
    return arrayPayload(raw).map(normalizeAsset);
  }

  async get(assetId: string): Promise<AssetDetail> {
    return normalizeAssetDetail(await validated(this.validateRaw, 'assets.get', this.raw.query({ type: 'instrument', id: assetId })));
  }

  async listAll(options: { cursor?: string; limit?: number; type?: string; filters?: Record<string, string | number | boolean | undefined> } = {}): Promise<Asset[]> {
    const page = numberString(options.cursor) ?? 1;
    const raw = await validated(this.validateRaw, 'assets.search', this.raw.query({
      type: 'neonSearch',
      data: {
        q: '',
        page,
        pageSize: options.limit ?? 20,
        filter: neonSearchFilters(options.type ?? 'stock', options.filters),
      },
    }));
    return arrayPayload(raw).map(normalizeAsset);
  }
}

export class AccountApi {
  constructor(
    private readonly http: HttpClient,
    private readonly endpoints: EndpointResolver,
    private readonly validateRaw: RawSchemaValidator,
  ) {}

  current(): Promise<unknown> {
    return validated(this.validateRaw, 'auth.account', this.http.request('GET', this.endpoints.resolve('auth.account')));
  }

  session(): Promise<unknown> {
    return validated(this.validateRaw, 'auth.session', this.http.request('GET', this.endpoints.resolve('auth.session')));
  }

  accountSettings(): Promise<unknown> {
    return this.current();
  }

  personalDetails(): Promise<unknown> {
    return validated(this.validateRaw, 'account.personalDetails', this.http.request('GET', '/api/v1/customer/personal-details'));
  }

  relationships(): Promise<unknown> {
    return validated(this.validateRaw, 'account.relationships', this.http.request('GET', '/api/v1/customer/relationships/detailed'));
  }

  cardsHome(): Promise<unknown> {
    return validated(this.validateRaw, 'account.cardsHome', this.http.request('GET', '/api/v1/card/cards/home'));
  }
}

export class BoardsApi {
  constructor(
    private readonly http: HttpClient,
    private readonly endpoints: EndpointResolver,
    private readonly validateRaw: RawSchemaValidator,
  ) {}

  async list(): Promise<Board[]> {
    const raw = await validated(this.validateRaw, 'boards.list', this.http.request<unknown>('GET', this.endpoints.resolve('boards.list')));
    return arrayPayload(raw).map(normalizeBoard);
  }

  async get(boardId: string): Promise<Board> {
    return normalizeBoard(await validated(this.validateRaw, 'boards.detail', this.http.request('GET', this.endpoints.resolve('boards.detail', { boardId }))));
  }
}

export class DerivativesApi {
  constructor(
    private readonly raw: RawApi,
    private readonly validateRaw: RawSchemaValidator,
  ) {}

  async search(query: string, options: { underlyingId?: string; direction?: 'long' | 'short'; limit?: number } = {}): Promise<Derivative[]> {
    const raw = await validated(this.validateRaw, 'derivatives.search', this.raw.query({
      type: 'neonSearch',
      data: {
        q: query.trim(),
        page: 1,
        pageSize: options.limit ?? 20,
        filter: neonSearchFilters('derivative', {
          underlying: options.underlyingId,
          optionType: options.direction,
        }),
      },
    }));
    return arrayPayload(raw).map(normalizeDerivative);
  }

  async listForUnderlying(underlyingId: string, options: { direction?: 'long' | 'short'; productType?: string; limit?: number } = {}): Promise<Derivative[]> {
    const raw = await validated(this.validateRaw, 'derivatives.listForUnderlying', this.raw.query({
      type: 'derivatives',
      jurisdiction: 'DE',
      lang: 'en',
      underlying: underlyingId,
      productCategory: options.productType,
      optionType: options.direction,
      pageSize: options.limit ?? null,
    }));
    return arrayPayload(raw).map(normalizeDerivative);
  }

  async get(derivativeId: string): Promise<Derivative> {
    return normalizeDerivative(await validated(this.validateRaw, 'assets.get', this.raw.query({ type: 'instrument', id: derivativeId })));
  }
}

export class OrdersApi {
  constructor(
    private readonly http: HttpClient,
    private readonly endpoints: EndpointResolver,
    private readonly raw: RawApi,
    private readonly validateRaw: RawSchemaValidator,
    private readonly getSecuritiesAccountNumber?: () => string | undefined,
    private readonly setSecuritiesAccountNumber?: (value: string) => void,
    private readonly resolveSecuritiesAccountNumberFallback?: () => Promise<string | undefined>,
  ) {}

  async open(options: OrdersListOptions = {}): Promise<Order[]> {
    const orders = await this.all(options);
    return orders.filter(isOpenOrder);
  }

  async closed(options: OrdersListOptions = {}): Promise<Order[]> {
    const orders = await this.all(options);
    return orders.filter((order) => !isOpenOrder(order));
  }

  async executed(options: OrdersListOptions = {}): Promise<Order[]> {
    const orders = await this.all(options);
    return orders.filter(isExecutedOrder);
  }

  async all(options: OrdersListOptions = {}): Promise<Order[]> {
    return arrayPayload(await this.rawAll(options)).map(normalizeOrder);
  }

  async rawAll(options: OrdersListOptions = {}): Promise<unknown> {
    const { filters, secAccNo: providedSecAccNo, ...rest } = options;
    const secAccNo = providedSecAccNo ?? await resolveSecuritiesAccountNumber(this.raw, this.getSecuritiesAccountNumber?.(), this.setSecuritiesAccountNumber, undefined, this.resolveSecuritiesAccountNumberFallback);
    return validated(this.validateRaw, 'orders.all', this.http.request<unknown>('GET', this.endpoints.resolve('orders.all'), undefined, {
      secAccNo,
      page: rest.page ?? numberString(rest.cursor) ?? 1,
      pageSize: rest.pageSize ?? rest.limit ?? 100,
      sort: rest.sort ?? 'orderUpdatedAt,desc',
      instrumentId: rest.instrumentId,
      instrumentCategory: rest.instrumentCategory,
      accountType: rest.accountType,
      ...filters,
    }));
  }

  async mutualFunds(options: MutualFundOrdersOptions = {}): Promise<Order[]> {
    return arrayPayload(await this.rawMutualFunds(options)).map(normalizeOrder);
  }

  async rawMutualFunds(options: MutualFundOrdersOptions = {}): Promise<unknown> {
    const { filters, ...rest } = options;
    return validated(this.validateRaw, 'orders.mutualFunds', this.http.request('GET', this.endpoints.resolve('orders.mutualFunds'), undefined, {
      openOnly: false,
      excludeQuantityNull: false,
      page: 1,
      pageSize: 100,
      ...rest,
      ...filters,
    }));
  }

  async privateMarkets(options: PrivateMarketsOrdersOptions = {}): Promise<Order[]> {
    return arrayPayload(await this.rawPrivateMarkets(options)).map(normalizeOrder);
  }

  async rawPrivateMarkets(options: PrivateMarketsOrdersOptions = {}): Promise<unknown> {
    const { filters, ...rest } = options;
    return validated(this.validateRaw, 'orders.privateMarkets', this.http.request('GET', this.endpoints.resolve('orders.privateMarkets'), undefined, {
      sortBy: 'CREATED_AT',
      sortAscending: false,
      pageNumber: 1,
      pageSize: 100,
      ...rest,
      ...filters,
    }));
  }

  orderUpdates(secAccNo: string): Subscription<unknown> {
    return toSubscription(this.raw.subscribeResource({
      type: 'orderUpdates',
      selector: { case: 'bySecAccNo', value: { accountNumber: secAccNo } },
    })).map((raw) => this.validateRaw('orders.orderUpdates', raw));
  }

  async rawOrderUpdates(secAccNo?: string): Promise<unknown> {
    const accountNumber = secAccNo ?? await resolveSecuritiesAccountNumber(this.raw, this.getSecuritiesAccountNumber?.(), this.setSecuritiesAccountNumber, undefined, this.resolveSecuritiesAccountNumberFallback);
    return validated(this.validateRaw, 'orders.orderUpdates', this.raw.query({
      type: 'orderUpdates',
      selector: { case: 'bySecAccNo', value: { accountNumber } },
    }));
  }

  async prepare(options: CreateOrderOptions): Promise<PreparedOrder> {
    const normalizedOptions = options.amount !== undefined && options.sizeStep === undefined
      ? { ...options, sizeStep: await this.resolveAmountSizeStep(options.instrumentId, options.exchangeId) }
      : options;
    const normalized = normalizeCreateOrderOptions(normalizedOptions);
    const secAccNo = options.secAccNo ?? await resolveSecuritiesAccountNumber(
      this.raw,
      this.getSecuritiesAccountNumber?.(),
      this.setSecuritiesAccountNumber,
      undefined,
      this.resolveSecuritiesAccountNumberFallback,
    );
    return {
      parameters: normalized.parameters,
      clientProcessId: options.clientProcessId ?? createClientProcessId(),
      secAccNo,
      warningsShown: options.warningsShown ?? [],
      ...(options.lastClientPrice !== undefined ? { lastClientPrice: positiveNumber(options.lastClientPrice, 'lastClientPrice') } : {}),
    };
  }

  async preview(options: CreateOrderOptions): Promise<OrderPreview> {
    const order = await this.prepare(options);
    const currency = options.settlementCurrency?.trim() || 'EUR';
    const feeParameters: Record<string, unknown> = {
      ...order.parameters,
      currency,
    };
    delete feeParameters.expiry;
    delete feeParameters.settlementCurrency;
    delete feeParameters.tradingCurrency;
    delete feeParameters.acceptedTerms;
    const unitPrice = options.mode === 'limit' ? options.limit : options.mode === 'stopMarket' ? options.stop : options.lastClientPrice;
    if (options.amount !== undefined) {
      if (unitPrice === undefined) throw new TypeError('Amount-based order previews require lastClientPrice for market orders.');
      delete feeParameters.amount;
    }
    const raw = await validated(this.validateRaw, 'orders.fees', this.raw.query({
      type: 'orderFeesV2',
      parameters: feeParameters,
      secAccNo: order.secAccNo,
    }, options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }));
    const fees = normalizeOrderFees(raw);
    const totalFees = firstNumberAtPaths(raw, ['total.absolute.value'], ['total.value'], ['totalFees'], ['total']);
    const feeCurrency = firstStringAtPaths(raw, ['total.absolute.currency'], ['total.currency'], ['currency'], ['currencyId']) ?? currency;
    const estimatedGross = options.amount !== undefined
      ? options.amount
      : unitPrice === undefined || options.size === undefined ? undefined : unitPrice * options.size;
    const estimatedTotal = estimatedGross === undefined
      ? undefined
      : options.side === 'buy'
        ? estimatedGross + (totalFees ?? 0)
        : estimatedGross - (totalFees ?? 0);
    return {
      order,
      fees,
      ...(totalFees !== undefined ? { totalFees } : {}),
      ...(feeCurrency ? { currency: feeCurrency } : {}),
      ...(estimatedGross !== undefined ? { estimatedGross } : {}),
      ...(estimatedTotal !== undefined ? { estimatedTotal } : {}),
      raw,
    };
  }

  async submit(options: CreateOrderOptions | PreparedOrder): Promise<OrderSubmission> {
    const order = isPreparedOrder(options) ? options : await this.prepare(options);
    const timeoutMs = isPreparedOrder(options) ? 120_000 : options.timeoutMs ?? 120_000;
    const payload = {
      type: 'simpleCreateOrder',
      parameters: order.parameters,
      warningsShown: order.warningsShown,
      ...(order.lastClientPrice !== undefined ? { lastClientPrice: order.lastClientPrice } : {}),
      clientProcessId: order.clientProcessId,
      secAccNo: order.secAccNo,
    };
    const subscription = this.raw.subscribeResource(payload);
    const iterator = subscription[Symbol.asyncIterator]();
    const updates: unknown[] = [];
    const deadline = Date.now() + timeoutMs;
    try {
      while (Date.now() < deadline) {
        const remaining = Math.max(1, deadline - Date.now());
        const result = await nextOrderUpdate(iterator, remaining);
        if (result.done || ('timedOut' in result && result.timedOut)) break;
        const raw = this.validateRaw('orders.submit', result.value);
        throwResourceErrors(raw, 'simpleCreateOrder');
        updates.push(raw);
        const status = orderMutationStatus(raw);
        const orderId = firstStringAtPaths(raw, ['orderId'], ['id'], ['order.id']);
        if (status === 'succeeded' || (orderId && !status)) {
          return { status: 'succeeded', orderId, clientProcessId: order.clientProcessId, updates, raw };
        }
        if (status === 'failed') {
          return {
            status,
            ...(orderId ? { orderId } : {}),
            clientProcessId: order.clientProcessId,
            updates,
            error: firstValueAtPaths(raw, ['error'], ['errors'], ['message']),
            raw,
          };
        }
      }
      const lastStatus = updates.length > 0 ? orderMutationStatus(updates.at(-1)) : undefined;
      throw new TradeRepublicProtocolError(`Timed out waiting for order submission${lastStatus ? ` after status ${lastStatus}` : ''}. The order may still be pending; inspect orders.open() before retrying.`);
    } finally {
      subscription.close();
    }
  }

  async cancel(orderId: string, options: { timeoutMs?: number } = {}): Promise<OrderCancellation> {
    const id = requiredString(orderId, 'orderId');
    const raw = await validated(this.validateRaw, 'orders.cancel', this.raw.query({ type: 'cancelOrder', orderId: id }, pickTimeoutOptions(options)));
    return {
      orderId: firstStringAtPaths(raw, ['orderId'], ['id']) ?? id,
      ...(orderMutationStatus(raw) ? { status: orderMutationStatus(raw) } : {}),
      raw,
    };
  }

  private async resolveAmountSizeStep(instrumentId: string, exchangeId: string): Promise<number> {
    const id = requiredString(instrumentId, 'instrumentId');
    const venue = requiredString(exchangeId, 'exchangeId');
    const instrument = await this.raw.query({ type: 'instrument', id });
    const exchange = findNestedRecordById(instrument, venue);
    const explicit = firstNumberAtPaths(exchange, ['stepSize'], ['fractionalTrading.stepSize'], ['orderSizeStep'], ['sizeStep']);
    if (explicit !== undefined && explicit > 0) return explicit;
    const assetType = (normalizeAsset(instrument).type
      ?? firstNestedStringByKeys(instrument, 'instrumentType', 'assetType', 'category', 'type'))?.toLowerCase();
    if (assetType?.includes('crypto') || assetType?.includes('fund')) return 0.000001;
    throw new TradeRepublicProtocolError(`Could not determine the order size step for amount-based order ${id}.${venue}. Pass sizeStep explicitly.`);
  }
}

function normalizeCreateOrderOptions(options: CreateOrderOptions): { parameters: Record<string, unknown> } {
  const instrumentId = requiredString(options.instrumentId, 'instrumentId');
  const exchangeId = requiredString(options.exchangeId, 'exchangeId');
  const side = options.side?.toLowerCase();
  if (side !== 'buy' && side !== 'sell') throw new TypeError('side must be "buy" or "sell".');
  if (options.mode !== 'market' && options.mode !== 'limit' && options.mode !== 'stopMarket') {
    throw new TypeError('mode must be "market", "limit", or "stopMarket".');
  }
  const hasSize = options.size !== undefined;
  const hasAmount = options.amount !== undefined;
  if (hasSize === hasAmount) throw new TypeError('Provide exactly one of size or amount.');
  const amount = hasAmount ? roundCurrency(positiveNumber(options.amount, 'amount')) : undefined;
  const amountUnitPrice = options.mode === 'limit' ? options.limit : options.mode === 'stopMarket' ? options.stop : options.lastClientPrice;
  if (hasAmount && amountUnitPrice === undefined) throw new TypeError('Amount-based market orders require lastClientPrice.');
  const size = hasSize
    ? positiveNumber(options.size, 'size')
    : floorToStep(
        positiveNumber(Number(amount) / positiveNumber(amountUnitPrice, 'order price'), 'derived size'),
        positiveNumber(options.sizeStep, 'sizeStep'),
      );
  if (options.mode === 'limit' && options.limit === undefined) throw new TypeError('limit is required for a limit order.');
  if (options.mode === 'stopMarket' && options.stop === undefined) throw new TypeError('stop is required for a stop-market order.');
  if (options.mode === 'market' && (options.limit !== undefined || options.stop !== undefined)) {
    throw new TypeError('Market orders must not include limit or stop prices.');
  }
  const expiry = normalizeOrderExpiry(options.expiry);
  const parameters: Record<string, unknown> = {
    instrumentId,
    exchangeId,
    mode: options.mode,
    size,
    type: side,
    expiry,
    sellFractions: options.sellFractions ?? false,
    settlementCurrency: options.settlementCurrency?.trim() || 'EUR',
  };
  if (amount !== undefined) parameters.amount = amount;
  if (options.limit !== undefined) parameters.limit = positiveNumber(options.limit, 'limit');
  if (options.stop !== undefined) parameters.stop = positiveNumber(options.stop, 'stop');
  if (options.tradingCurrency?.trim()) parameters.tradingCurrency = options.tradingCurrency.trim();
  if (options.destinationId?.trim()) parameters.destinationId = options.destinationId.trim();
  if (options.isDMA !== undefined) parameters.isDMA = options.isDMA;
  if (options.acceptedTerms?.length) parameters.acceptedTerms = options.acceptedTerms;
  return { parameters };
}

function normalizeOrderExpiry(expiry: CreateOrderOptions['expiry']): Record<string, string> {
  if (!expiry) return { type: 'gfd' };
  if (expiry.type !== 'gfd' && expiry.type !== 'gtc' && expiry.type !== 'eom' && expiry.type !== 'gtd') {
    throw new TypeError('expiry.type must be "gfd", "gtc", "eom", or "gtd".');
  }
  if (expiry.type !== 'gtd') return { type: expiry.type };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry.value) || Number.isNaN(Date.parse(`${expiry.value}T00:00:00Z`))) {
    throw new TypeError('A gtd expiry requires value in YYYY-MM-DD format.');
  }
  return { type: expiry.type, value: expiry.value };
}

function normalizeOrderFees(raw: unknown): OrderFeeItem[] {
  const value = firstValueAtPaths(raw, ['fees'], ['data.fees'], ['result.fees']);
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    ...(firstStringAtPaths(item, ['name'], ['title'], ['type'], ['label']) ? { name: firstStringAtPaths(item, ['name'], ['title'], ['type'], ['label']) } : {}),
    ...(firstNumberAtPaths(item, ['absolute.value'], ['amount.value'], ['amount'], ['value']) !== undefined
      ? { amount: firstNumberAtPaths(item, ['absolute.value'], ['amount.value'], ['amount'], ['value']) }
      : {}),
    ...(firstStringAtPaths(item, ['absolute.currency'], ['amount.currency'], ['currency'], ['currencyId'])
      ? { currency: firstStringAtPaths(item, ['absolute.currency'], ['amount.currency'], ['currency'], ['currencyId']) }
      : {}),
    raw: item,
  }));
}

function isPreparedOrder(value: CreateOrderOptions | PreparedOrder): value is PreparedOrder {
  return Boolean(value && typeof value === 'object' && 'parameters' in value && 'clientProcessId' in value && 'secAccNo' in value);
}

function orderMutationStatus(value: unknown): string | undefined {
  const status = firstStringAtPaths(value, ['status'], ['state'], ['result.status']);
  if (!status) return undefined;
  const normalized = status.replaceAll('_', '').replaceAll('-', '').toLowerCase();
  if (normalized === 'confirmationneeded') return 'confirmationNeeded';
  return normalized;
}

function throwResourceErrors(value: unknown, resource: string): void {
  const errors = firstValueAtPaths(value, ['errors']);
  if (Array.isArray(errors) && errors.length > 0) {
    throw new TradeRepublicProtocolError(`Trade Republic resource failed: ${resource} ${JSON.stringify(errors)}`);
  }
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a non-empty string.`);
  return value.trim();
}

function positiveNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new TypeError(`${name} must be a finite number greater than zero.`);
  return value;
}

function roundCurrency(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return positiveNumber(rounded, 'amount rounded to currency precision');
}

function floorToStep(value: number, step: number): number {
  const decimals = Math.min(12, Math.max(0, decimalPlaces(step)));
  const floored = Math.floor(value / step + 1e-10) * step;
  return positiveNumber(Number(floored.toFixed(decimals)), 'derived size rounded to sizeStep');
}

function decimalPlaces(value: number): number {
  const text = value.toString().toLowerCase();
  if (text.includes('e-')) return Number(text.split('e-')[1] ?? 0);
  return text.includes('.') ? (text.split('.')[1]?.length ?? 0) : 0;
}

function createClientProcessId(): string {
  return randomUUID();
}

function firstValueAtPaths(value: unknown, ...paths: string[][]): unknown {
  for (const path of paths) {
    let current = value;
    for (const part of path[0]?.split('.') ?? []) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[part];
    }
    if (current !== undefined && current !== null) return current;
  }
  return undefined;
}

function firstStringAtPaths(value: unknown, ...paths: string[][]): string | undefined {
  const candidate = firstValueAtPaths(value, ...paths);
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
}

function firstNumberAtPaths(value: unknown, ...paths: string[][]): number | undefined {
  const candidate = firstValueAtPaths(value, ...paths);
  if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
  if (typeof candidate === 'string' && candidate.trim() && Number.isFinite(Number(candidate))) return Number(candidate);
  return undefined;
}

function firstNestedStringByKeys(value: unknown, ...keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstNestedStringByKeys(item, ...keys);
      if (found) return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === 'string' && direct.trim()) return direct.trim();
  }
  for (const item of Object.values(record)) {
    const found = firstNestedStringByKeys(item, ...keys);
    if (found) return found;
  }
  return undefined;
}

function findNestedRecordById(value: unknown, id: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNestedRecordById(item, id);
      if (found) return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if ([record.id, record.exchangeId, record.slug, record.destinationId].some((candidate) => candidate === id)) return record;
  for (const item of Object.values(record)) {
    const found = findNestedRecordById(item, id);
    if (found) return found;
  }
  return undefined;
}

function nextOrderUpdate(iterator: AsyncIterator<unknown>, timeoutMs: number): Promise<IteratorResult<unknown> | { done: true; value: undefined; timedOut: true }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ done: true, value: undefined, timedOut: true }), timeoutMs);
    timer.unref?.();
    iterator.next().then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function isOpenOrder(order: Order): boolean {
  const status = order.status?.toUpperCase();
  return status === 'OPEN' || status === 'OPENED' || status === 'PARTIALLYFILLED' || status === 'PARTIALLY_FILLED' || status === 'RECEIVED';
}

function isExecutedOrder(order: Order): boolean {
  const status = order.status?.toUpperCase().replaceAll('_', '').replaceAll('-', '');
  return Boolean(
    order.executedAt
    || (order.executedQuantity !== undefined && order.executedQuantity > 0)
    || status === 'EXECUTED'
    || status === 'FILLED'
    || status === 'PARTIALLYFILLED',
  );
}

export class PortfolioApi {
  constructor(
    private readonly http: HttpClient,
    private readonly endpoints: EndpointResolver,
    private readonly raw: RawApi,
    private readonly validateRaw: RawSchemaValidator,
    private readonly getSecuritiesAccountNumber?: () => string | undefined,
    private readonly setSecuritiesAccountNumber?: (value: string) => void,
    private readonly resolveSecuritiesAccountNumberFallback?: () => Promise<string | undefined>,
  ) {}

  async current(options: { timeoutMs?: number } = {}): Promise<Portfolio> {
    const secAccNo = await this.resolveSecuritiesAccountNumber();
    const raw = await validated(this.validateRaw, 'portfolio.current', this.raw.query({ type: 'compactPortfolioByTypeV2', secAccNo }, pickTimeoutOptions(options)));
    return normalizePortfolio(raw);
  }

  async cash(): Promise<CashSummary> {
    return normalizeCash(await validated(this.validateRaw, 'portfolio.cash', this.raw.query({ type: 'availableCash' })));
  }

  async markToMarketValue(): Promise<CashSummary> {
    return normalizeCash(await validated(this.validateRaw, 'portfolio.markToMarketValue', this.raw.query({ type: 'portfolioStatus' })));
  }

  async savingsPlans(secAccNo?: string): Promise<SavingsPlan[]> {
    return arrayPayload(await this.rawSavingsPlans(secAccNo)).map(normalizeSavingsPlan);
  }

  async rawSavingsPlans(secAccNo?: string): Promise<unknown> {
    const accountNumber = secAccNo ?? await this.resolveSecuritiesAccountNumber();
    return validated(this.validateRaw, 'portfolio.savingsPlans', this.raw.query({ type: 'savingsPlans', secAccNo: accountNumber }));
  }

  async privateMarketsPositions(secAccNo?: string): Promise<unknown> {
    return this.rawPrivateMarketsPositions(secAccNo);
  }

  async rawPrivateMarketsPositions(secAccNo?: string): Promise<unknown> {
    const accountNumber = secAccNo ?? await this.resolveSecuritiesAccountNumber();
    return validated(this.validateRaw, 'portfolio.privateMarketsPositions', this.raw.query({ type: 'privateMarketsPositions', secAccNo: accountNumber }));
  }

  async portfolioChart(secAccNo?: string, range = '1y', options: { currency?: string; instrumentCategories?: string } = {}): Promise<PortfolioChart> {
    return normalizePortfolioChart(await this.rawPortfolioChart(secAccNo, range, options));
  }

  async rawPortfolioChart(secAccNo?: string, range = '1y', options: { currency?: string; instrumentCategories?: string } = {}): Promise<unknown> {
    const accountNumber = secAccNo ?? await this.resolveSecuritiesAccountNumber();
    return validated(this.validateRaw, 'portfolio.portfolioChart', this.http.request('GET', '/api-gateway/portfolio-chart/v2/chart', undefined, {
      secAccNo: accountNumber,
      range,
      ...options,
    }));
  }

  async positionsForAccount(secAccNo: string, options: { timeoutMs?: number } = {}): Promise<Portfolio> {
    const raw = await validated(this.validateRaw, 'portfolio.current', this.raw.query({ type: 'compactPortfolioByTypeV2', secAccNo }, pickTimeoutOptions(options)));
    return normalizePortfolio(raw);
  }

  private async resolveSecuritiesAccountNumber(): Promise<string> {
    return resolveSecuritiesAccountNumber(this.raw, this.getSecuritiesAccountNumber?.(), this.setSecuritiesAccountNumber, undefined, this.resolveSecuritiesAccountNumberFallback);
  }
}

function pickTimeoutOptions(options: { timeoutMs?: number }): { timeoutMs?: number } | undefined {
  return options.timeoutMs ? { timeoutMs: options.timeoutMs } : undefined;
}

async function resolveSecuritiesAccountNumber(
  raw: RawApi,
  cached?: string,
  remember?: (value: string) => void,
  timeoutMs?: number,
  fallback?: () => Promise<string | undefined>,
): Promise<string> {
  try {
    const accountPairs = await raw.query({ type: 'accountPairs' }, timeoutMs ? { timeoutMs } : undefined);
    const accountNumber = firstStringByKey(accountPairs, 'securitiesAccountNumber');
    if (accountNumber) {
      remember?.(accountNumber);
      return accountNumber;
    }
  } catch {
    if (cached) return cached;
    const accountNumber = await fallback?.();
    if (accountNumber) {
      remember?.(accountNumber);
      return accountNumber;
    }
    throw new Error('Trade Republic securities account number was not available from accountPairs or account profile.');
  }
  if (cached) return cached;
  const accountNumber = await fallback?.();
  if (accountNumber) {
    remember?.(accountNumber);
    return accountNumber;
  }
  throw new Error('Trade Republic securities account number was not available from accountPairs or account profile.');
}

function firstStringByKey(value: unknown, key: string): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = firstStringByKey(item, key);
      if (match) return match;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record[key] === 'string' && record[key].length > 0) return record[key];
  for (const item of Object.values(record)) {
    const match = firstStringByKey(item, key);
    if (match) return match;
  }
  return undefined;
}

function numberString(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function neonSearchFilters(type: string, filters: Record<string, string | number | boolean | undefined> = {}): Array<{ key: string; value: string | number | boolean }> {
  return [
    { key: 'type', value: type },
    { key: 'jurisdiction', value: 'DE' },
    ...Object.entries(filters).flatMap(([key, value]) => value === undefined ? [] : [{ key, value }]),
  ];
}

async function validated<T>(validateRaw: RawSchemaValidator, schemaName: string, value: Promise<T>): Promise<T> {
  return validateRaw(schemaName, await value) as T;
}

function skipRawSchemaValidation(_schemaName: string, value: unknown): unknown {
  return value;
}

function createRawSchemaValidator(
  mode: RawSchemaValidationMode = true,
  onFailure?: (failure: RawSchemaValidationFailure) => void,
): RawSchemaValidator {
  if (mode === false) return skipRawSchemaValidation;
  if (mode === 'passthrough') {
    return (schemaName, value) => {
      try {
        return validateRawResponse(schemaName, value);
      } catch (error) {
        onFailure?.({ schemaName, value, error });
        return value;
      }
    };
  }
  return validateRawResponse;
}

export class MarketApi {
  constructor(private readonly resources: ResourceClient) {}

  subscriptions(options: MarketSubscriptionsOptions = {}): Promise<MarketSubscription[]> {
    return this.resources.query(marketSubscriptionsSpec, options);
  }

  candleQuery(options: CandleDownloadOptions): CandleQuery {
    return new CandleQuery(this.resources, options);
  }

  candles(options: CandleDownloadOptions): Promise<Candle[]> {
    return this.resources.query(candlesSpec, options);
  }

  quote(assetId: string, exchangeId: string): Promise<MarketQuote> {
    return this.resources.query(quoteSpec, { assetId, exchangeId });
  }

  downloadCandles(options: CandleDownloadOptions, paging: { maxCandlesPerRequest?: number } = {}): Promise<Candle[]> {
    return this.candleQuery(options).download(paging);
  }

  subscribeLiveFeed(options: LiveFeedOptions): Subscription<LiveFeedEvent> {
    return this.resources.stream(liveFeedSpec, options);
  }

  liveFeed(assetId: string, options: Omit<LiveFeedOptions, 'assetId'> = {}): Subscription<LiveFeedEvent> {
    return this.subscribeLiveFeed({ ...options, assetId });
  }

  availableL2Books(assetId: string): Promise<L2Venue[]> {
    return this.resources.query(availableL2BooksSpec, { assetId });
  }

  subscribeL2OrderBook(options: L2OrderBookOptions): Subscription<L2OrderBook> {
    return this.resources.stream(l2OrderBookSpec, options);
  }

  l2OrderBook(assetId: string, exchangeId: string, options: Omit<L2OrderBookOptions, 'assetId' | 'exchangeId'> = {}): Subscription<L2OrderBook> {
    return this.subscribeL2OrderBook({ ...options, assetId, exchangeId });
  }
}

export class TimelineApi {
  constructor(
    private readonly raw: RawApi,
    private readonly validateRaw: RawSchemaValidator,
  ) {}

  async list(options: { after?: string; timeoutMs?: number } = {}): Promise<TimelineItem[]> {
    return arrayPayload(await this.rawList(options)).map(normalizeTimelineItem);
  }

  rawList(options: { after?: string; timeoutMs?: number } = {}): Promise<unknown> {
    const { after } = options;
    return validated(this.validateRaw, 'timeline.list', this.raw.query({ type: 'timelineActivityLog', ...(after ? { after } : {}) }, pickTimeoutOptions(options)));
  }

  async actions(options: { timeoutMs?: number } = {}): Promise<TimelineAction[]> {
    return arrayPayload(await this.rawActions(options)).map(normalizeTimelineAction);
  }

  rawActions(options: { timeoutMs?: number } = {}): Promise<unknown> {
    return validated(this.validateRaw, 'timeline.actions', this.raw.query({ type: 'timelineActionsV2' }, pickTimeoutOptions(options)));
  }

  async detail(id: string, kind: TimelineDetailKind = 'timeline', options: { timeoutMs?: number } = {}): Promise<TimelineDetail> {
    return normalizeTimelineDetail(await this.rawDetail(id, kind, options));
  }

  rawDetail(id: string, kind: TimelineDetailKind = 'timeline', options: { timeoutMs?: number } = {}): Promise<unknown> {
    const key = kind === 'order' ? 'orderId' : kind === 'savingsPlan' ? 'savingsPlanId' : 'id';
    return validated(this.validateRaw, 'timeline.detail', this.raw.query({ type: 'timelineDetailV2', [key]: id }, pickTimeoutOptions(options)));
  }
}

export class PriceAlarmsApi {
  constructor(
    private readonly raw: RawApi,
    private readonly validateRaw: RawSchemaValidator,
  ) {}

  async list(options: { timeoutMs?: number } = {}): Promise<PriceAlarm[]> {
    return arrayPayload(await this.rawList(options)).map(normalizePriceAlarm);
  }

  rawList(options: { timeoutMs?: number } = {}): Promise<unknown> {
    return validated(this.validateRaw, 'priceAlarms.list', this.raw.query({ type: 'priceAlarms' }, pickTimeoutOptions(options)));
  }

  async notifications(options: { timeoutMs?: number } = {}): Promise<PriceAlarm[]> {
    return arrayPayload(await this.rawNotifications(options)).map(normalizePriceAlarm);
  }

  rawNotifications(options: { timeoutMs?: number } = {}): Promise<unknown> {
    return validated(this.validateRaw, 'priceAlarms.notifications', this.raw.query({ type: 'priceAlarmNotifications' }, pickTimeoutOptions(options)));
  }

  create(options: { isin: string; price: number; timeoutMs?: number }): Promise<unknown> {
    const { timeoutMs, isin, price } = options;
    const payload = { instrumentId: isin, targetPrice: price };
    return this.rawCreate(payload, timeoutMs === undefined ? {} : { timeoutMs });
  }

  rawCreate(payload: Record<string, unknown>, options: { timeoutMs?: number } = {}): Promise<unknown> {
    return validated(this.validateRaw, 'priceAlarms.create', this.raw.query({ type: 'createPriceAlarm', ...payload }, pickTimeoutOptions(options)));
  }

  cancel(id: string, options: { timeoutMs?: number } = {}): Promise<unknown> {
    return this.rawCancel(id, options);
  }

  rawCancel(id: string, options: { timeoutMs?: number } = {}): Promise<unknown> {
    return validated(this.validateRaw, 'priceAlarms.cancel', this.raw.query({ type: 'cancelPriceAlarm', id }, pickTimeoutOptions(options)));
  }
}

export class InstrumentsApi {
  constructor(
    private readonly raw: RawApi,
    private readonly validateRaw: RawSchemaValidator,
  ) {}

  async news(isin: string, options: { timeoutMs?: number } = {}): Promise<InstrumentNewsItem[]> {
    return arrayPayload(await this.rawNews(isin, options)).map(normalizeInstrumentNewsItem);
  }

  rawNews(isin: string, options: { timeoutMs?: number } = {}): Promise<unknown> {
    return validated(this.validateRaw, 'instruments.news', this.raw.query({ type: 'neonNews', isin }, pickTimeoutOptions(options)));
  }

  etfDetails(id: string, options: { timeoutMs?: number } = {}): Promise<unknown> {
    return this.rawEtfDetails(id, options);
  }

  rawEtfDetails(id: string, options: { timeoutMs?: number } = {}): Promise<unknown> {
    return validated(this.validateRaw, 'instruments.etfDetails', this.raw.query({ type: 'etfDetails', id }, pickTimeoutOptions(options)));
  }

  etfComposition(id: string, after?: string, options: { timeoutMs?: number } = {}): Promise<unknown> {
    return this.rawEtfComposition(id, after, options);
  }

  rawEtfComposition(id: string, after?: string, options: { timeoutMs?: number } = {}): Promise<unknown> {
    return validated(this.validateRaw, 'instruments.etfComposition', this.raw.query({ type: 'etfComposition', id, ...(after ? { after } : {}) }, pickTimeoutOptions(options)));
  }

  fundDetails(id: string, options: { timeoutMs?: number } = {}): Promise<unknown> {
    return this.rawFundDetails(id, options);
  }

  rawFundDetails(id: string, options: { timeoutMs?: number } = {}): Promise<unknown> {
    return validated(this.validateRaw, 'instruments.fundDetails', this.raw.query({ type: 'mutualFundDetails', id }, pickTimeoutOptions(options)));
  }

  fundComposition(id: string, after?: string, options: { timeoutMs?: number } = {}): Promise<unknown> {
    return this.rawFundComposition(id, after, options);
  }

  rawFundComposition(id: string, after?: string, options: { timeoutMs?: number } = {}): Promise<unknown> {
    return validated(this.validateRaw, 'instruments.fundComposition', this.raw.query({ type: 'mutualFundComposition', id, ...(after ? { after } : {}) }, pickTimeoutOptions(options)));
  }

  cryptoDetails(id: string, options: { timeoutMs?: number } = {}): Promise<unknown> {
    return this.rawCryptoDetails(id, options);
  }

  rawCryptoDetails(id: string, options: { timeoutMs?: number } = {}): Promise<unknown> {
    return validated(this.validateRaw, 'instruments.cryptoDetails', this.raw.query({ type: 'cryptoDetails', id }, pickTimeoutOptions(options)));
  }

  yieldToMaturity(id: string, options: { timeoutMs?: number } = {}): Promise<unknown> {
    return this.rawYieldToMaturity(id, options);
  }

  rawYieldToMaturity(id: string, options: { timeoutMs?: number } = {}): Promise<unknown> {
    return validated(this.validateRaw, 'instruments.yieldToMaturity', this.raw.query({ type: 'yieldToMaturity', id }, pickTimeoutOptions(options)));
  }
}

export class TradingApi {
  constructor(
    private readonly http: HttpClient,
    private readonly raw: RawApi,
    private readonly validateRaw: RawSchemaValidator,
    private readonly getSecuritiesAccountNumber?: () => string | undefined,
    private readonly setSecuritiesAccountNumber?: (value: string) => void,
    private readonly resolveSecuritiesAccountNumberFallback?: () => Promise<string | undefined>,
  ) {}

  priceForOrder(options: { isin: string; exchangeId: string; side: string; unit?: string }, queryOptions: { timeoutMs?: number } = {}): Promise<unknown> {
    return validated(this.validateRaw, 'trading.priceForOrder', this.raw.query({ type: 'priceForOrderV2', unit: 'EUR', ...options }, pickTimeoutOptions(queryOptions)));
  }

  async availableSize(instrumentId: string, secAccNo?: string, options: { timeoutMs?: number } = {}): Promise<unknown> {
    const accountNumber = secAccNo ?? await this.resolveSecuritiesAccountNumber();
    return validated(this.validateRaw, 'trading.availableSize', this.raw.query({ type: 'availableSize', parameters: { instrumentId }, secAccNo: accountNumber }, pickTimeoutOptions(options)));
  }

  async orderDestinations(isin: string, query: Record<string, string | number | boolean | undefined> = {}): Promise<OrderDestination[]> {
    return arrayPayload(await this.rawOrderDestinations(isin, query)).map(normalizeOrderDestination);
  }

  rawOrderDestinations(isin: string, query: Record<string, string | number | boolean | undefined> = {}): Promise<unknown> {
    return validated(this.validateRaw, 'trading.orderDestinations', this.http.request('GET', `/api-gateway/order-router/api/v2/instruments/${encodeURIComponent(isin)}/destinations`, undefined, {
      jurisdiction: 'DE',
      ...query,
    }));
  }

  async trades(query: Record<string, string | number | boolean | undefined> = {}): Promise<Trade[]> {
    return arrayPayload(await this.rawTrades(query)).map(normalizeTrade);
  }

  rawTrades(query: Record<string, string | number | boolean | undefined> = {}): Promise<unknown> {
    return validated(this.validateRaw, 'trading.trades', this.http.request('GET', '/web-trading-gateway/api/customer/v1/trades', undefined, query));
  }

  dailyPnl(items: unknown[]): Promise<unknown> {
    return this.rawDailyPnl(items);
  }

  rawDailyPnl(items: unknown[]): Promise<unknown> {
    return validated(this.validateRaw, 'trading.dailyPnl', this.http.request('POST', '/web-trading-gateway/api/customer/v1/pnl/daily', { items }));
  }

  private resolveSecuritiesAccountNumber(): Promise<string> {
    return resolveSecuritiesAccountNumber(this.raw, this.getSecuritiesAccountNumber?.(), this.setSecuritiesAccountNumber, undefined, this.resolveSecuritiesAccountNumberFallback);
  }
}

export class DiscoveryApi {
  constructor(
    private readonly http: HttpClient,
    private readonly validateRaw: RawSchemaValidator,
  ) {}

  async exchangeDetails(): Promise<ExchangeDetails[]> {
    return arrayPayload(await this.rawExchangeDetails()).map(normalizeExchangeDetails);
  }

  rawExchangeDetails(): Promise<unknown> {
    return validated(this.validateRaw, 'discovery.exchangeDetails', this.http.request('GET', '/api-gateway/instrument-universe/api/v1/exchanges-details', undefined, { includeMaintenanceWindow: false }));
  }

  async exchangeSchedule(exchange: string): Promise<ExchangeSchedule> {
    return normalizeExchangeSchedule(await this.rawExchangeSchedule(exchange));
  }

  rawExchangeSchedule(exchange: string): Promise<unknown> {
    return validated(this.validateRaw, 'discovery.exchangeSchedule', this.http.request('GET', `/api-gateway/instrument-universe/api/v1/exchanges/${encodeURIComponent(exchange)}/schedule`));
  }

  async instrumentStatus(isin: string, exchange: string): Promise<InstrumentStatus> {
    return normalizeInstrumentStatus(await this.rawInstrumentStatus(isin, exchange));
  }

  rawInstrumentStatus(isin: string, exchange: string): Promise<unknown> {
    return validated(this.validateRaw, 'discovery.instrumentStatus', this.http.request('GET', `/api-gateway/instrument-universe/api/v1/instruments/${encodeURIComponent(isin)}/status/${encodeURIComponent(exchange)}`));
  }

  watchlists(): Promise<unknown> {
    return this.rawWatchlists();
  }

  async cloudWatchlist(options: { pageSize?: number } = {}): Promise<Watchlist | undefined> {
    const watchlist = arrayPayload(await this.rawWatchlists())[0];
    if (!watchlist) return undefined;
    const normalized = normalizeWatchlist(watchlist);
    if (!normalized.id) return normalized;
    const items = arrayPayload(await this.rawWatchlistItems(normalized.id, options));
    return normalizeWatchlist(watchlist, items);
  }

  rawWatchlistItems(watchlistId: string, options: { pageSize?: number } = {}): Promise<unknown> {
    return validated(this.validateRaw, 'discovery.watchlists.items', this.http.request(
      'GET',
      `/api-gateway/watchlists/api/v2/watchlists/${encodeURIComponent(watchlistId)}/items`,
      undefined,
      { pageSize: options.pageSize ?? 200 },
    ));
  }

  rawWatchlists(): Promise<unknown> {
    return validated(this.validateRaw, 'discovery.watchlists', this.http.request('GET', '/api-gateway/watchlists/api/v2/watchlists'));
  }

  cloneWatchlist(watchlistId: string): Promise<unknown> {
    return this.rawCloneWatchlist(watchlistId);
  }

  rawCloneWatchlist(watchlistId: string): Promise<unknown> {
    return validated(this.validateRaw, 'discovery.watchlists.clone', this.http.request('POST', `/api-gateway/watchlists/api/v2/watchlists/${encodeURIComponent(watchlistId)}/clone`));
  }

  renameWatchlist(watchlistId: string, name: string): Promise<unknown> {
    return this.rawRenameWatchlist(watchlistId, name);
  }

  rawRenameWatchlist(watchlistId: string, name: string): Promise<unknown> {
    return validated(this.validateRaw, 'discovery.watchlists.rename', this.http.request('PUT', `/api-gateway/watchlists/api/v2/watchlists/${encodeURIComponent(watchlistId)}`, { name }));
  }

  deleteWatchlist(watchlistId: string): Promise<unknown> {
    return this.rawDeleteWatchlist(watchlistId);
  }

  rawDeleteWatchlist(watchlistId: string): Promise<unknown> {
    return validated(this.validateRaw, 'discovery.watchlists.delete', this.http.request('DELETE', `/api-gateway/watchlists/api/v2/watchlists/${encodeURIComponent(watchlistId)}`));
  }

  addWatchlistItem(watchlistId: string, instrumentId: string, options: Record<string, unknown> = {}): Promise<unknown> {
    return this.rawAddWatchlistItem(watchlistId, instrumentId, options);
  }

  rawAddWatchlistItem(watchlistId: string, instrumentId: string, options: Record<string, unknown> = {}): Promise<unknown> {
    return validated(this.validateRaw, 'discovery.watchlists.addItem', this.http.request('POST', `/api-gateway/watchlists/api/v2/watchlists/${encodeURIComponent(watchlistId)}/items`, { instrument_id: instrumentId, item_rank: -1, ...options }));
  }

  removeWatchlistItem(watchlistId: string, instrumentId: string): Promise<unknown> {
    return this.rawRemoveWatchlistItem(watchlistId, instrumentId);
  }

  rawRemoveWatchlistItem(watchlistId: string, instrumentId: string): Promise<unknown> {
    return validated(this.validateRaw, 'discovery.watchlists.removeItem', this.http.request('DELETE', `/api-gateway/watchlists/api/v2/watchlists/${encodeURIComponent(watchlistId)}/items/${encodeURIComponent(instrumentId)}`));
  }

  screeners(): Promise<unknown> {
    return this.rawScreeners();
  }

  rawScreeners(): Promise<unknown> {
    return validated(this.validateRaw, 'discovery.screeners', this.http.request('GET', '/api-gateway/screeners/api/v2/screeners'));
  }

  screenerOptions(): Promise<unknown> {
    return this.rawScreenerOptions();
  }

  rawScreenerOptions(): Promise<unknown> {
    return validated(this.validateRaw, 'discovery.screenerOptions', this.http.request('GET', '/api-gateway/screeners/api/v2/screeners/options'));
  }

  userPreferences(): Promise<unknown> {
    return this.rawUserPreferences();
  }

  rawUserPreferences(): Promise<unknown> {
    return validated(this.validateRaw, 'discovery.userPreferences', this.http.request('GET', '/api-gateway/pro-trading/api/v1/user-preferences'));
  }
}

export class DocumentsApi {
  constructor(
    private readonly http: HttpClient,
    private readonly validateRaw: RawSchemaValidator,
  ) {}

  documents(): Promise<unknown> {
    return this.rawDocuments();
  }

  rawDocuments(): Promise<unknown> {
    return validated(this.validateRaw, 'documents.documents', this.http.request('GET', '/api/v1/documents/all'));
  }
}

export class TaxApi {
  constructor(
    private readonly http: HttpClient,
    private readonly validateRaw: RawSchemaValidator,
  ) {}

  taxInformation(): Promise<unknown> {
    return this.rawTaxInformation();
  }

  rawTaxInformation(): Promise<unknown> {
    return validated(this.validateRaw, 'tax.taxInformation', this.http.request('GET', '/api/v1/taxes/information'));
  }

  exemptionOrder(): Promise<unknown> {
    return this.rawExemptionOrder();
  }

  rawExemptionOrder(): Promise<unknown> {
    return validated(this.validateRaw, 'tax.exemptionOrder', this.http.request('GET', '/api/v1/taxes/exemptionorders'));
  }

  taxResidencies(): Promise<unknown> {
    return this.rawTaxResidencies();
  }

  rawTaxResidencies(): Promise<unknown> {
    return validated(this.validateRaw, 'tax.taxResidencies', this.http.request('GET', '/api/v1/auth/account/change/taxresidencies'));
  }

  taxResidencyCountries(): Promise<unknown> {
    return this.rawTaxResidencyCountries();
  }

  rawTaxResidencyCountries(): Promise<unknown> {
    return validated(this.validateRaw, 'tax.taxResidencyCountries', this.http.request('GET', '/api/v1/country/taxresidency'));
  }
}

export class PaymentsApi {
  constructor(
    private readonly http: HttpClient,
    private readonly validateRaw: RawSchemaValidator,
  ) {}

  paymentMethods(): Promise<unknown> {
    return this.rawPaymentMethods();
  }

  rawPaymentMethods(): Promise<unknown> {
    return validated(this.validateRaw, 'payments.paymentMethods', this.http.request('GET', '/api/v2/payment/methods'));
  }

  iban(): Promise<unknown> {
    return this.rawIban();
  }

  rawIban(): Promise<unknown> {
    return validated(this.validateRaw, 'payments.iban', this.http.request('GET', '/api/v1/auth/account/iban'));
  }

  interestDetails(): Promise<unknown> {
    return this.rawInterestDetails();
  }

  rawInterestDetails(): Promise<unknown> {
    return validated(this.validateRaw, 'payments.interestDetails', this.http.request('GET', '/api/v1/interest/details'));
  }
}

export class WebApi {
  constructor(
    private readonly http: HttpClient,
    private readonly raw: RawApi,
    private readonly getSecuritiesAccountNumber?: () => string | undefined,
    private readonly setSecuritiesAccountNumber?: (value: string) => void,
    private readonly resolveSecuritiesAccountNumberFallback?: () => Promise<string | undefined>,
  ) {}

  request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options: { body?: unknown; query?: Record<string, string | number | boolean | undefined> } = {},
  ): Promise<T> {
    return this.http.request<T>(method, path, options.body, options.query);
  }

  requestDetailed<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options: { body?: unknown; query?: Record<string, string | number | boolean | undefined> } = {},
  ): Promise<{ body: T; headers: Headers; status: number; url: string }> {
    return this.http.requestDetailed<T>(method, path, options.body, options.query);
  }

  query<T = unknown>(payload: Record<string, unknown>, options: { timeoutMs?: number } = {}): Promise<T> {
    return this.raw.query<T>(payload, options);
  }

  subscribe(payload: Record<string, unknown>): Subscription<unknown> {
    return toSubscription(this.raw.subscribeResource(payload));
  }

  timeline(after?: string): Promise<unknown> {
    return this.query({ type: 'timelineActivityLog', ...(after ? { after } : {}) });
  }

  timelineActions(): Promise<unknown> {
    return this.query({ type: 'timelineActionsV2' });
  }

  timelineDetail(id: string, kind: 'timeline' | 'order' | 'savingsPlan' = 'timeline'): Promise<unknown> {
    const key = kind === 'order' ? 'orderId' : kind === 'savingsPlan' ? 'savingsPlanId' : 'id';
    return this.query({ type: 'timelineDetailV2', [key]: id });
  }

  priceAlarms(): Promise<unknown> {
    return this.query({ type: 'priceAlarms' });
  }

  priceAlarmNotifications(): Promise<unknown> {
    return this.query({ type: 'priceAlarmNotifications' });
  }

  savingsPlans(secAccNo?: string): Promise<unknown> {
    return this.withSecAccNo(secAccNo, (accountNumber) => this.query({ type: 'savingsPlans', secAccNo: accountNumber }));
  }

  portfolioChart(secAccNo: string, range = '1y', options: { currency?: string; instrumentCategories?: string } = {}): Promise<unknown> {
    return this.request('GET', '/api-gateway/portfolio-chart/v2/chart', {
      query: { secAccNo, range, ...options },
    });
  }

  news(isin: string): Promise<unknown> {
    return this.query({ type: 'neonNews', isin });
  }

  etfDetails(id: string): Promise<unknown> {
    return this.query({ type: 'etfDetails', id });
  }

  etfComposition(id: string, after?: string): Promise<unknown> {
    return this.query({ type: 'etfComposition', id, after });
  }

  mutualFundDetails(id: string): Promise<unknown> {
    return this.query({ type: 'mutualFundDetails', id });
  }

  mutualFundComposition(id: string, after?: string): Promise<unknown> {
    return this.query({ type: 'mutualFundComposition', id, after });
  }

  cryptoDetails(id: string): Promise<unknown> {
    return this.query({ type: 'cryptoDetails', id });
  }

  yieldToMaturity(id: string): Promise<unknown> {
    return this.query({ type: 'yieldToMaturity', id });
  }

  bondValuation(instrumentId: string, secAccNo?: string): Promise<unknown> {
    return this.withSecAccNo(secAccNo, (accountNumber) => this.query({ type: 'bondValuationV2', instrumentId, secAccNo: accountNumber }));
  }

  fixedSavingsValuation(instrumentId: string, secAccNo?: string): Promise<unknown> {
    return this.withSecAccNo(secAccNo, (accountNumber) => this.query({ type: 'fixedSavingsValuation', instrumentId, secAccNo: accountNumber }));
  }

  privateMarketsPositions(secAccNo?: string): Promise<unknown> {
    return this.withSecAccNo(secAccNo, (accountNumber) => this.query({ type: 'privateMarketsPositions', secAccNo: accountNumber }));
  }

  tape(isin: string, exchangeId: string, unit = 'EUR'): Subscription<unknown> {
    return this.subscribe({ type: 'tape', isin, exchangeId, unit });
  }

  tradeAggregateHistory(isin: string, exchangeId: string, resolution: string, from: string, until?: string): Promise<unknown> {
    return this.query({ type: 'tradeAggregateHistory', isin, exchangeId, resolution, from, until });
  }

  priceForOrder(options: { isin: string; exchangeId: string; side: string; unit?: string }): Promise<unknown> {
    return this.query({ type: 'priceForOrderV2', unit: 'EUR', ...options });
  }

  availableSize(instrumentId: string, secAccNo?: string): Promise<unknown> {
    return this.withSecAccNo(secAccNo, (accountNumber) => this.query({ type: 'availableSize', parameters: { instrumentId }, secAccNo: accountNumber }));
  }

  taxWrapperAccountUtilization(secAccNo: string): Promise<unknown> {
    return this.query({ type: 'taxWrapperAccountUtilization', secAccNo });
  }

  userPreferences(): Promise<unknown> {
    return this.request('GET', '/api-gateway/pro-trading/api/v1/user-preferences');
  }

  exchangeDetails(): Promise<unknown> {
    return this.request('GET', '/api-gateway/instrument-universe/api/v1/exchanges-details', { query: { includeMaintenanceWindow: false } });
  }

  exchangeSchedule(exchange: string): Promise<unknown> {
    return this.request('GET', `/api-gateway/instrument-universe/api/v1/exchanges/${encodeURIComponent(exchange)}/schedule`);
  }

  instrumentStatus(isin: string, exchange: string): Promise<unknown> {
    return this.request('GET', `/api-gateway/instrument-universe/api/v1/instruments/${encodeURIComponent(isin)}/status/${encodeURIComponent(exchange)}`);
  }

  orderDestinations(isin: string, query: Record<string, string | number | boolean | undefined> = {}): Promise<unknown> {
    return this.request('GET', `/api-gateway/order-router/api/v2/instruments/${encodeURIComponent(isin)}/destinations`, { query });
  }

  trades(query: Record<string, string | number | boolean | undefined> = {}): Promise<unknown> {
    return this.request('GET', '/web-trading-gateway/api/customer/v1/trades', { query });
  }

  dailyPnl(items: unknown[]): Promise<unknown> {
    return this.request('POST', '/web-trading-gateway/api/customer/v1/pnl/daily', { body: { items } });
  }

  documents(): Promise<unknown> {
    return this.request('GET', '/api/v1/documents/all');
  }

  personalDetails(): Promise<unknown> {
    return this.request('GET', '/api/v1/customer/personal-details');
  }

  relationships(): Promise<unknown> {
    return this.request('GET', '/api/v1/customer/relationships/detailed');
  }

  cardsHome(): Promise<unknown> {
    return this.request('GET', '/api/v1/card/cards/home');
  }

  accountSettings(): Promise<unknown> {
    return this.request('GET', '/api/v2/auth/account');
  }

  appUsageConsents(): Promise<unknown> {
    return this.request('GET', '/api/v1/customer/app-usage-data-consents');
  }

  paymentMethods(): Promise<unknown> {
    return this.request('GET', '/api/v2/payment/methods');
  }

  iban(): Promise<unknown> {
    return this.request('GET', '/api/v1/auth/account/iban');
  }

  taxInformation(): Promise<unknown> {
    return this.request('GET', '/api/v1/taxes/information');
  }

  exemptionOrder(): Promise<unknown> {
    return this.request('GET', '/api/v1/taxes/exemptionorders');
  }

  taxResidencies(): Promise<unknown> {
    return this.request('GET', '/api/v1/auth/account/change/taxresidencies');
  }

  taxResidencyCountries(): Promise<unknown> {
    return this.request('GET', '/api/v1/country/taxresidency');
  }

  interestDetails(): Promise<unknown> {
    return this.request('GET', '/api/v1/interest/details');
  }

  watchlists(): Promise<unknown> {
    return this.request('GET', '/api-gateway/watchlists/api/v2/watchlists');
  }

  screeners(): Promise<unknown> {
    return this.request('GET', '/api-gateway/screeners/api/v2/screeners');
  }

  screenerOptions(): Promise<unknown> {
    return this.request('GET', '/api-gateway/screeners/api/v2/screeners/options');
  }

  private async withSecAccNo(secAccNo: string | undefined, fn: (secAccNo: string) => Promise<unknown>): Promise<unknown> {
    const accountNumber = secAccNo ?? await resolveSecuritiesAccountNumber(this.raw, this.getSecuritiesAccountNumber?.(), this.setSecuritiesAccountNumber, undefined, this.resolveSecuritiesAccountNumberFallback);
    return fn(accountNumber);
  }
}
