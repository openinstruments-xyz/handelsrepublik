import { AuthApi } from './auth.js';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { CandleQuery } from './candles.js';
import { ClientRuntime, firstStringByKey } from './client-runtime.js';
import { EndpointResolver } from './endpoints.js';
import { AccountApi, BoardsApi } from './domains/account.js';
import { DocumentsApi, PaymentsApi, TaxApi } from './domains/customer.js';
import { DiscoveryApi } from './domains/discovery.js';
import { HttpClient } from './http.js';
import { MapperRequestError, mapperTimeoutError } from './mapper-connection.js';
import { OperationClient } from './operations.js';
import { TradeRepublicProtocolError } from './errors.js';
import {
  availableL2BooksSpec,
  availableCandleResolutionsSpec,
  candleSeriesSpec,
  candlesSpec,
  l2OrderBookSpec,
  liveFeedSpec,
  marketEntitlementsSpec,
  marketSubscriptionsSpec,
  quoteSpec,
} from './market-specs.js';
import {
  arrayPayload,
  normalizeAsset,
  normalizeAssetDetail,
  normalizeCash,
  normalizeDerivative,
  normalizeIbanInfo,
  normalizeInstrumentNewsItem,
  normalizeOrder,
  normalizeOrderDestination,
  normalizeOrderPriceQuote,
  normalizePortfolio,
  normalizePortfolioChart,
  normalizePriceAlarm,
  normalizePriceAlarmCancellation,
  normalizePriceAlarmCreation,
  normalizeSavingsPlan,
  normalizeTimelineAction,
  normalizeTimelineDetail,
  normalizeTimelineItem,
  normalizeTrade,
} from './normalizers.js';
import { defaultWebSocketFactory, RawApi, type RawQueryOptions, type RawSubscriptionOptions } from './raw.js';
import { ResourceClient, toSubscription, type Subscription } from './resource.js';
import { validateRawResponse } from './schemas/registry.js';
import { mergeTradeRepublicWebContexts, normalizeTradeRepublicWebContext } from './waf.js';
import type {
  Asset,
  AssetDetail,
  AssetSearchType,
  AvailableCandleResolutionsOptions,
  Candle,
  CandleDownloadOptions,
  CandleSeries,
  CandleTimeframe,
  CashSummary,
  Derivative,
  IbanInfo,
  InstrumentNewsItem,
  L2OrderBook,
  L2OrderBookOptions,
  L2Venue,
  LiveFeedEvent,
  LiveFeedOptions,
  MarketDataTopic,
  MarketEntitlementSet,
  MarketEntitlementsOptions,
  MarketQuote,
  MarketSubscription,
  MutualFundOrdersOptions,
  MutationOutcomeUnknownReason,
  Order,
  OrderCancellation,
  CreateOrderOptions,
  OrderFeeItem,
  OrderMutationError,
  OrderMutationErrorDetails,
  OrderMutationStatus,
  OrderMutationUpdate,
  OrderPriceOptions,
  OrderPriceQuote,
  OrderPreview,
  OrderReplacement,
  OrderReplacementOptions,
  OrderSubmission,
  PreparedOrder,
  OrderDestination,
  OrdersListOptions,
  Portfolio,
  PortfolioChart,
  PrivateMarketsOrdersOptions,
  PriceAlarm,
  PriceAlarmCancellation,
  PriceAlarmCreation,
  SavingsPlan,
  Session,
  TimelineAction,
  TimelineDetail,
  TimelineDetailKind,
  TimelineItem,
  Trade,
  TradeRepublicClientOptions,
  TradeRepublicDeviceInfo,
  TradeRepublicWebContext,
  RawSchemaValidator,
  RawSchemaValidationFailure,
  RawSchemaValidationMode,
} from './types.js';

const DEFAULT_API_BASE_URL = 'https://api.traderepublic.com';
const DEFAULT_WEBSOCKET_URL = 'wss://api.traderepublic.com';
const DEFAULT_LOCALE = 'de-DE';
const FIREFOX_VERSION = '152.0.6';
const DEFAULT_TR_HEADERS = {
  'x-tr-app-version': '15.101.0',
  'x-tr-platform': 'web-pro',
} as const;
const PLAUSIBLE_SCREENS = ['1920x1080x24', '2560x1440x24', '1536x864x24', '1366x768x24', '1920x1200x24'];
const GERMAN_LANGUAGE_PROFILES = [
  ['de-DE', 'de', 'en-US', 'en'],
  ['de-DE', 'de', 'en-GB', 'en'],
  ['de-DE', 'de'],
];

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
  private deviceInfo: TradeRepublicDeviceInfo;
  private readonly http: HttpClient;
  private readonly endpoints: EndpointResolver;
  private readonly resources: ResourceClient;
  private readonly operations: OperationClient;
  private readonly runtime: ClientRuntime;
  private readonly validateRaw: RawSchemaValidator;

  constructor(options: TradeRepublicClientOptions = {}) {
    if (options.session && !options.session.deviceInfo) {
      throw new TypeError('Trade Republic sessions must contain deviceInfo.');
    }
    this.deviceInfo = createDeviceInfo(options.session?.deviceInfo ?? options.deviceInfo);
    this.session = withClientContext(options.session, options.webContext, this.deviceInfo);
    this.securitiesAccountNumber = options.session?.securitiesAccountNumber;
    this.validateRaw = createRawSchemaValidator(options.rawSchemaValidation, options.onRawSchemaValidationFailure);
    this.endpoints = new EndpointResolver(options.endpoints);
    this.http = new HttpClient({
      apiBaseUrl: options.apiBaseUrl ?? DEFAULT_API_BASE_URL,
      locale: options.locale ?? DEFAULT_LOCALE,
      userAgent: options.userAgent ?? firefoxUserAgent(),
      sdkHeaders: DEFAULT_TR_HEADERS,
      defaultHeaders: options.defaultHeaders,
      fetch: options.fetch ?? fetch,
      getSession: () => this.session,
      getDeviceInfo: () => this.deviceInfo,
    });

    this.auth = new AuthApi(this.http, this.endpoints, () => this.session, (session) => {
      this.setSession(session);
    }, options.sessionStore, (session) => this.captureSecuritiesAccountNumber(session));
    this.raw = new RawApi(
      this.http,
      options.websocketUrl ?? DEFAULT_WEBSOCKET_URL,
      options.websocketFactory ?? defaultWebSocketFactory,
      () => this.session,
      options.websocketMode,
      options.websocketReconnectDelayMs,
      options.websocketHandshakeTimeoutMs,
      options.onWebSocketDisconnect,
      options.onWebSocketReconnect,
    );
    this.runtime = new ClientRuntime(this.http, this.endpoints, this.raw, this.validateRaw, {
      get: () => this.securitiesAccountNumber ?? this.session?.securitiesAccountNumber,
      set: (value) => this.setSecuritiesAccountNumber(value),
      fallback: () => this.resolveSecuritiesAccountNumberFromRest(),
    });
    this.operations = this.runtime.operations;
    this.account = new AccountApi(this.operations);
    this.boards = new BoardsApi(this.operations);
    this.resources = this.runtime.resources;
    this.assets = new AssetsApi(this.raw, this.validateRaw);
    this.derivatives = new DerivativesApi(this.raw, this.validateRaw);
    this.orders = new OrdersApi(this.runtime);
    this.portfolio = new PortfolioApi(this.runtime);
    this.market = new MarketApi(this.resources);
    this.timeline = new TimelineApi(this.raw, this.validateRaw);
    this.priceAlarms = new PriceAlarmsApi(this.raw, this.validateRaw);
    this.instruments = new InstrumentsApi(this.raw, this.validateRaw);
    this.trading = new TradingApi(this.runtime);
    this.discovery = new DiscoveryApi(this.operations);
    this.documents = new DocumentsApi(this.operations);
    this.tax = new TaxApi(this.operations);
    this.payments = new PaymentsApi(this.operations);
    this.web = new WebApi(this.runtime);
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
    const withDeviceInfo = Object.keys(session).length > 0
      ? { ...session, deviceInfo: structuredClone(session.deviceInfo ?? this.deviceInfo) }
      : session;
    const nextSession = shouldPreserveWebContext && this.session?.webContext
      ? { ...withDeviceInfo, webContext: this.session.webContext }
      : withDeviceInfo;
    this.session = structuredClone(nextSession);
    if (session.deviceInfo) this.deviceInfo = structuredClone(session.deviceInfo);
    this.raw?.refreshSession();
    if (session.securitiesAccountNumber) this.setSecuritiesAccountNumber(session.securitiesAccountNumber);
    else if (Object.keys(session).length === 0) this.securitiesAccountNumber = undefined;
  }

  useWebContext(webContext: TradeRepublicWebContext): Session {
    const session = {
      ...(this.session ?? {}),
      deviceInfo: structuredClone(this.deviceInfo),
      webContext: mergeTradeRepublicWebContexts(this.session?.webContext, normalizeTradeRepublicWebContext(webContext)),
    };
    this.setSession(session);
    return this.getSession() ?? session;
  }

  close(): void {
    this.raw.close();
  }

  private setSecuritiesAccountNumber(value: string | undefined): void {
    if (!value) return;
    this.securitiesAccountNumber = value;
    if (this.session) this.session.securitiesAccountNumber = value;
  }

  private async captureSecuritiesAccountNumber(session: Session): Promise<Session> {
    const sessionWithDeviceInfo = {
      ...session,
      deviceInfo: structuredClone(session.deviceInfo ?? this.deviceInfo),
    };
    if (session.securitiesAccountNumber) {
      this.setSecuritiesAccountNumber(session.securitiesAccountNumber);
      return sessionWithDeviceInfo;
    }
    try {
      const accountNumber = await this.runtime.resolveSecuritiesAccountNumber(5_000);
      return { ...sessionWithDeviceInfo, securitiesAccountNumber: accountNumber };
    } catch {
      return sessionWithDeviceInfo;
    }
  }

  private async resolveSecuritiesAccountNumberFromRest(): Promise<string | undefined> {
    const account = await this.account.current();
    const accountNumber = firstStringByKey(account, 'securitiesAccountNumber');
    if (accountNumber) this.setSecuritiesAccountNumber(accountNumber);
    return accountNumber;
  }
}

function withClientContext(
  session: Session | undefined,
  webContext: TradeRepublicWebContext | undefined,
  deviceInfo: TradeRepublicDeviceInfo,
): Session | undefined {
  if (!session && !webContext) return undefined;
  return {
    ...(session ? structuredClone(session) : {}),
    deviceInfo: structuredClone(deviceInfo),
    ...(webContext ? { webContext: mergeTradeRepublicWebContexts(session?.webContext, webContext) } : {}),
  };
}

function createDeviceInfo(overrides: Partial<TradeRepublicDeviceInfo> | undefined): TradeRepublicDeviceInfo {
  const runtime = runtimeDeviceInfo();
  return {
    ...runtime,
    ...definedProperties(overrides),
    preferredLanguages: overrides?.preferredLanguages
      ? [...overrides.preferredLanguages]
      : runtime.preferredLanguages,
  };
}

function runtimeDeviceInfo(): TradeRepublicDeviceInfo {
  const nodePlatform = platform();
  return {
    stableDeviceId: randomBytes(64).toString('hex'),
    browser: 'Firefox',
    browserVersion: FIREFOX_VERSION,
    os: operatingSystemName(nodePlatform),
    osVersion: release(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset: new Date().getTimezoneOffset(),
    screen: randomItem(PLAUSIBLE_SCREENS),
    preferredLanguages: [...randomItem(GERMAN_LANGUAGE_PROFILES)],
    numberOfCores: cpus().length,
    deviceMemory: Math.max(1, Math.round(totalmem() / 1024 ** 3)),
  };
}

function operatingSystemName(nodePlatform: NodeJS.Platform): string {
  if (nodePlatform === 'win32') return 'Windows';
  if (nodePlatform === 'darwin') return 'Mac OS';
  if (nodePlatform === 'linux') return 'Linux';
  return nodePlatform;
}

function firefoxUserAgent(): string {
  const majorVersion = FIREFOX_VERSION.split('.')[0];
  const nodePlatform = platform();
  const system = nodePlatform === 'win32'
    ? `Windows NT 10.0; Win64; ${arch() === 'arm64' ? 'ARM64' : 'x64'}`
    : nodePlatform === 'darwin'
      ? 'Macintosh; Intel Mac OS X 10.15'
      : `X11; Linux ${arch() === 'arm64' ? 'aarch64' : 'x86_64'}`;
  return `Mozilla/5.0 (${system}; rv:${majorVersion}.0) Gecko/20100101 Firefox/${majorVersion}.0`;
}

function randomItem<T>(values: readonly T[]): T {
  return values[randomInt(values.length)]!;
}

function definedProperties<T extends object>(value: Partial<T> | undefined): Partial<T> {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter(([, property]) => property !== undefined),
  ) as Partial<T>;
}

export class AssetsApi {
  constructor(
    private readonly raw: RawApi,
    private readonly validateRaw: RawSchemaValidator,
  ) {}

  async search(query: string, options: { limit?: number; page?: number; type?: AssetSearchType; filters?: Record<string, string | number | boolean | undefined> } = {}): Promise<Asset[]> {
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

  async listAll(options: { cursor?: string; limit?: number; type?: AssetSearchType; filters?: Record<string, string | number | boolean | undefined> } = {}): Promise<Asset[]> {
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

  async listForUnderlying(underlyingId: string, options: {
    direction?: 'long' | 'short' | 'call' | 'put';
    productType?: 'knockouts' | 'warrants' | 'factors' | 'knockOutProduct' | 'vanillaWarrant' | 'factorCertificate';
    limit?: number;
  } = {}): Promise<Derivative[]> {
    const category = options.productType ? derivativeCategory(options.productType) : undefined;
    const categories = category ? [category] : DERIVATIVE_CATEGORIES;
    const requests = categories.flatMap((item) => {
      const directions = options.direction ? [options.direction] : item.directions;
      if (directions.some((direction) => !item.directions.includes(direction))) {
        throw new TypeError(`${options.direction} is not valid for derivative category ${item.name}.`);
      }
      return directions.map((direction) => ({
        type: 'derivatives',
        jurisdiction: 'DE',
        lang: 'en',
        underlying: underlyingId,
        productCategory: item.resourceValue,
        optionType: direction,
        sortBy: item.sortBy,
        sortDirection: 'asc',
        pageSize: null,
      }));
    });
    const rawPages = await Promise.all(requests.map((request) => validated(
      this.validateRaw,
      'derivatives.listForUnderlying',
      this.raw.query(request),
    )));
    return rawPages.flatMap(arrayPayload).map(normalizeDerivative).slice(0, options.limit);
  }

  async get(derivativeId: string): Promise<Derivative> {
    return normalizeDerivative(await validated(this.validateRaw, 'assets.get', this.raw.query({ type: 'instrument', id: derivativeId })));
  }
}

type DerivativeDirection = 'long' | 'short' | 'call' | 'put';

interface DerivativeCategorySpec {
  name: 'knockouts' | 'warrants' | 'factors';
  resourceValue: 'knockOutProduct' | 'vanillaWarrant' | 'factorCertificate';
  directions: readonly DerivativeDirection[];
  sortBy: 'leverage' | 'delta' | 'factor';
}

const DERIVATIVE_CATEGORIES: readonly DerivativeCategorySpec[] = [
  { name: 'knockouts', resourceValue: 'knockOutProduct', directions: ['long', 'short'], sortBy: 'leverage' },
  { name: 'warrants', resourceValue: 'vanillaWarrant', directions: ['call', 'put'], sortBy: 'delta' },
  { name: 'factors', resourceValue: 'factorCertificate', directions: ['long', 'short'], sortBy: 'factor' },
];

function derivativeCategory(value: NonNullable<Parameters<DerivativesApi['listForUnderlying']>[1]>['productType']): DerivativeCategorySpec {
  const category = DERIVATIVE_CATEGORIES.find((item) => item.name === value || item.resourceValue === value);
  if (!category) throw new TypeError(`Unknown derivative category: ${value}`);
  return category;
}

export class OrdersApi {
  private readonly http: HttpClient;
  private readonly endpoints: EndpointResolver;
  private readonly raw: RawApi;
  private readonly validateRaw: RawSchemaValidator;

  constructor(private readonly runtime: ClientRuntime) {
    this.http = runtime.http;
    this.endpoints = runtime.endpoints;
    this.raw = runtime.raw;
    this.validateRaw = runtime.validateRaw;
  }

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
    const secAccNo = providedSecAccNo ?? await this.runtime.resolveSecuritiesAccountNumber();
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
    return toSubscription(this.raw.subscribeProtobufResource('orderUpdates', { accountNumber: secAccNo }))
      .map((raw) => this.validateRaw('orders.orderUpdates', raw));
  }

  async rawOrderUpdates(secAccNo?: string): Promise<unknown> {
    const accountNumber = secAccNo ?? await this.runtime.resolveSecuritiesAccountNumber();
    return validated(
      this.validateRaw,
      'orders.orderUpdates',
      this.raw.queryProtobufResource('orderUpdates', { accountNumber }),
    );
  }

  async prepare(options: CreateOrderOptions): Promise<PreparedOrder> {
    const normalizedOptions = options.amount !== undefined && options.sizeStep === undefined
      ? { ...options, sizeStep: await this.resolveAmountSizeStep(options.instrumentId, options.exchangeId) }
      : options;
    const normalized = normalizeCreateOrderOptions(normalizedOptions);
    const secAccNo = options.secAccNo ?? await this.runtime.resolveSecuritiesAccountNumber();
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

  async submit(
    options: CreateOrderOptions | PreparedOrder,
    runtimeOptions: { timeoutMs?: number } = {},
  ): Promise<OrderSubmission> {
    const order = isPreparedOrder(options) ? options : await this.prepare(options);
    const timeoutMs = runtimeOptions.timeoutMs ?? (isPreparedOrder(options) ? 120_000 : options.timeoutMs ?? 120_000);
    const payload = {
      type: 'simpleCreateOrder',
      parameters: order.parameters,
      warningsShown: order.warningsShown,
      ...(order.lastClientPrice !== undefined ? { lastClientPrice: order.lastClientPrice } : {}),
      clientProcessId: order.clientProcessId,
      secAccNo: order.secAccNo,
    };
    const subscription = this.raw.subscribeResource(payload, { operation: 'mutation' });
    const iterator = subscription[Symbol.asyncIterator]();
    const updates: OrderMutationUpdate[] = [];
    const deadline = Date.now() + timeoutMs;
    try {
      while (Date.now() < deadline) {
        const remaining = Math.max(1, deadline - Date.now());
        const result = await nextOrderUpdate(iterator, remaining);
        if (result.done || ('timedOut' in result && result.timedOut)) break;
        const raw = this.validateRaw('orders.submit', result.value);
        throwResourceErrors(raw, 'simpleCreateOrder');
        const update = normalizeOrderMutationUpdate(raw);
        updates.push(update);
        const { status, orderId } = update;
        if (status === 'succeeded' || (orderId && !status)) {
          return { status: 'succeeded', orderId, clientProcessId: order.clientProcessId, updates, raw };
        }
        if (status === 'failed') {
          return {
            status,
            ...(orderId ? { orderId } : {}),
            clientProcessId: order.clientProcessId,
            updates,
            error: update.error ?? normalizeOrderMutationError(undefined, update.message),
            raw,
          };
        }
      }
      throw mapperTimeoutError('simpleCreateOrder', subscription.deliveryState);
    } catch (error) {
      if (!(error instanceof MapperRequestError) || error.deliveryState !== 'sent') throw error;
      return {
        status: 'outcomeUnknown',
        clientProcessId: order.clientProcessId,
        updates,
        outcomeReason: mutationOutcomeReason(error),
        ...(error.connectionLoss ? { connectionLoss: error.connectionLoss } : {}),
        error,
        raw: updates.at(-1)?.raw,
      };
    } finally {
      subscription.close();
    }
  }

  async cancel(orderId: string, options: { timeoutMs?: number } = {}): Promise<OrderCancellation> {
    const id = requiredString(orderId, 'orderId');
    const timeoutMs = options.timeoutMs ?? 15_000;
    const subscription = this.raw.subscribeResource(
      { type: 'cancelOrder', orderId: id },
      { operation: 'mutation' },
    );
    const iterator = subscription[Symbol.asyncIterator]();
    const updates: OrderMutationUpdate[] = [];
    const deadline = Date.now() + timeoutMs;
    try {
      while (Date.now() < deadline) {
        const remaining = Math.max(1, deadline - Date.now());
        const result = await nextOrderUpdate(iterator, remaining);
        if (result.done || ('timedOut' in result && result.timedOut)) break;
        const raw = this.validateRaw('orders.cancel', result.value);
        throwResourceErrors(raw, 'cancelOrder');
        const update = normalizeOrderMutationUpdate(raw);
        updates.push(update);
        const { status } = update;
        const resolvedOrderId = update.orderId ?? id;
        if (status === 'succeeded') return { orderId: resolvedOrderId, status, updates, raw };
        if (status === 'failed') {
          return {
            orderId: resolvedOrderId,
            status,
            updates,
            error: update.error ?? normalizeOrderMutationError(undefined, update.message),
            raw,
          };
        }
      }
      throw mapperTimeoutError('cancelOrder', subscription.deliveryState);
    } catch (error) {
      if (!(error instanceof MapperRequestError) || error.deliveryState !== 'sent') throw error;
      return {
        orderId: id,
        status: 'outcomeUnknown',
        updates,
        outcomeReason: mutationOutcomeReason(error),
        ...(error.connectionLoss ? { connectionLoss: error.connectionLoss } : {}),
        error,
        raw: updates.at(-1)?.raw,
      };
    } finally {
      subscription.close();
    }
  }

  async replace(
    orderId: string,
    replacement: CreateOrderOptions | PreparedOrder,
    options: OrderReplacementOptions = {},
  ): Promise<OrderReplacement> {
    const previousOrderId = requiredString(orderId, 'orderId');
    const prepared = isPreparedOrder(replacement) ? replacement : await this.prepare(replacement);
    const submissionTimeoutMs = options.submissionTimeoutMs
      ?? (isPreparedOrder(replacement) ? undefined : replacement.timeoutMs);
    const cancellation = await this.cancel(previousOrderId, {
      ...(options.cancellationTimeoutMs !== undefined ? { timeoutMs: options.cancellationTimeoutMs } : {}),
    });
    if (cancellation.status === 'failed') {
      return { status: 'cancelFailed', previousOrderId, cancellation };
    }
    if (cancellation.status === 'outcomeUnknown') {
      return { status: 'cancelOutcomeUnknown', previousOrderId, cancellation };
    }
    try {
      const submission = await this.submit(prepared, {
        ...(submissionTimeoutMs !== undefined ? { timeoutMs: submissionTimeoutMs } : {}),
      });
      switch (submission.status) {
        case 'succeeded': return { status: submission.status, previousOrderId, cancellation, submission };
        case 'failed': return { status: submission.status, previousOrderId, cancellation, submission };
        case 'outcomeUnknown': return { status: submission.status, previousOrderId, cancellation, submission };
      }
    } catch (error) {
      if (error instanceof MapperRequestError && error.deliveryState === 'notSent') {
        return { status: 'replacementNotSent', previousOrderId, cancellation, error };
      }
      throw error;
    }
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
  const expiry = normalizeOrderValidity(options.validity, options.expiry);
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

function normalizeOrderValidity(
  validity: CreateOrderOptions['validity'],
  expiry: CreateOrderOptions['expiry'],
): Record<string, string> {
  if (validity !== undefined && expiry !== undefined) {
    throw new TypeError('Provide either validity or expiry, not both.');
  }
  if (validity === undefined) return normalizeOrderExpiry(expiry);
  const preset = typeof validity === 'string' ? validity : validity.type;
  if (preset === 'day') return { type: 'gfd' };
  if (preset === 'goodTillCancelled') return { type: 'gtc' };
  if (preset !== 'month' && preset !== 'year') {
    throw new TypeError('validity must be "day", "month", "year", or "goodTillCancelled".');
  }
  const referenceDate = typeof validity === 'string' ? new Date() : parseValidityReferenceDate(validity.referenceDate);
  referenceDate.setUTCDate(referenceDate.getUTCDate() + (preset === 'month' ? 30 : 365));
  return { type: 'gtd', value: referenceDate.toISOString().slice(0, 10) };
}

function parseValidityReferenceDate(value: string | Date | undefined): Date {
  if (value === undefined) return new Date();
  const date = value instanceof Date
    ? new Date(value.getTime())
    : /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00Z`)
      : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('validity.referenceDate must be a valid date.');
  return date;
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

const ORDER_MUTATION_STATUSES: readonly OrderMutationStatus[] = [
  'received',
  'waiting',
  'confirmationNeeded',
  'succeeded',
  'failed',
];

function orderMutationStatus(value: unknown): OrderMutationStatus | undefined {
  const status = firstStringAtPaths(value, ['status'], ['state'], ['result.status']);
  if (!status) return undefined;
  const normalized = status.replaceAll('_', '').replaceAll('-', '').toLowerCase();
  if (normalized === 'confirmationneeded') return 'confirmationNeeded';
  return ORDER_MUTATION_STATUSES.find((candidate) => candidate.toLowerCase() === normalized);
}

function normalizeOrderMutationUpdate(value: unknown): OrderMutationUpdate {
  const status = orderMutationStatus(value);
  if (!status) throw new TradeRepublicProtocolError('Trade Republic returned an order mutation update without a known status.');
  const rawError = firstValueAtPaths(value, ['error'], ['errors']);
  const message = firstStringAtPaths(value, ['message']);
  return {
    status,
    orderId: firstStringAtPaths(value, ['orderId'], ['id'], ['order', 'id'], ['order.id']),
    message,
    error: rawError === undefined ? undefined : normalizeOrderMutationError(rawError, message),
    raw: value,
  };
}

function normalizeOrderMutationError(value: unknown, fallbackMessage?: string): OrderMutationError {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const rawDetails = record.details;
  const detailsRecord = rawDetails && typeof rawDetails === 'object' && !Array.isArray(rawDetails)
    ? rawDetails as Record<string, unknown>
    : undefined;
  const details: OrderMutationErrorDetails | undefined = detailsRecord ? {
    exchangeId: firstStringAtPaths(detailsRecord, ['exchangeId']),
    isin: firstStringAtPaths(detailsRecord, ['isin']),
    orderId: firstStringAtPaths(detailsRecord, ['orderId']),
    userId: firstStringAtPaths(detailsRecord, ['userId']),
    clientProcessId: firstStringAtPaths(detailsRecord, ['clientProcessId']),
    isNostro: typeof detailsRecord.isNostro === 'boolean' ? detailsRecord.isNostro : undefined,
    raw: rawDetails,
  } : undefined;
  return {
    code: firstStringAtPaths(record, ['code']),
    message: typeof value === 'string' ? value : firstStringAtPaths(record, ['message']) ?? fallbackMessage,
    details,
    raw: value,
  };
}

function mutationOutcomeReason(error: MapperRequestError): MutationOutcomeUnknownReason {
  switch (error.reason) {
    case 'clientClosed':
    case 'disconnect':
    case 'sendFailure':
    case 'sessionRefresh':
    case 'timeout':
      return error.reason;
    case 'connectFailure':
    case 'handshakeTimeout':
      throw error;
  }
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
  private readonly http: HttpClient;
  private readonly raw: RawApi;
  private readonly validateRaw: RawSchemaValidator;

  constructor(private readonly runtime: ClientRuntime) {
    this.http = runtime.http;
    this.raw = runtime.raw;
    this.validateRaw = runtime.validateRaw;
  }

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
    return this.runtime.resolveSecuritiesAccountNumber();
  }
}

function pickTimeoutOptions(options: { timeoutMs?: number }): { timeoutMs?: number } | undefined {
  return options.timeoutMs ? { timeoutMs: options.timeoutMs } : undefined;
}

function numberString(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function neonSearchFilters(type: AssetSearchType, filters: Record<string, string | number | boolean | undefined> = {}): Array<{ key: string; value: string | number | boolean }> {
  return [
    { key: 'type', value: type === 'etf' ? 'fund' : type },
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

  subscriptions(): Promise<MarketSubscription[]> {
    return this.resources.query(marketSubscriptionsSpec, undefined);
  }

  entitlements(topic: MarketDataTopic, options: MarketEntitlementsOptions): Promise<MarketEntitlementSet> {
    if (!topic.trim()) throw new TypeError('Market entitlement topic must not be empty.');
    if (options.exchangeIds.length === 0 || options.exchangeIds.some((exchangeId) => !exchangeId.trim())) {
      throw new TypeError('Market entitlements require at least one non-empty exchange ID.');
    }
    return this.resources.query(marketEntitlementsSpec, { topic, options });
  }

  candleQuery(options: CandleDownloadOptions): CandleQuery {
    return new CandleQuery(this.resources, options);
  }

  candles(options: CandleDownloadOptions): Promise<Candle[]> {
    return this.resources.query(candlesSpec, options);
  }

  candleSeries(options: CandleDownloadOptions): Promise<CandleSeries> {
    return this.resources.query(candleSeriesSpec, options);
  }

  availableCandleResolutions(options: AvailableCandleResolutionsOptions): Promise<CandleTimeframe[]> {
    return this.resources.query(availableCandleResolutionsSpec, options);
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
    return this.resources.protobufStream(l2OrderBookSpec, options);
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
    return validated(
      this.validateRaw,
      'priceAlarms.notifications',
      this.raw.queryProtobufResource('priceAlarmNotifications', {}, pickTimeoutOptions(options)),
    );
  }

  async create(options: { isin: string; price: number; timeoutMs?: number }): Promise<PriceAlarmCreation> {
    const { timeoutMs, isin, price } = options;
    const payload = { instrumentId: isin, targetPrice: price };
    const raw = await this.rawCreate(payload, timeoutMs === undefined ? {} : { timeoutMs });
    return normalizePriceAlarmCreation(raw);
  }

  rawCreate(payload: Record<string, unknown>, options: { timeoutMs?: number } = {}): Promise<unknown> {
    return validated(this.validateRaw, 'priceAlarms.create', this.raw.query({ type: 'createPriceAlarm', ...payload }, pickTimeoutOptions(options)));
  }

  async cancel(id: string, options: { timeoutMs?: number } = {}): Promise<PriceAlarmCancellation> {
    return normalizePriceAlarmCancellation(await this.rawCancel(id, options), id);
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
  private readonly http: HttpClient;
  private readonly raw: RawApi;
  private readonly validateRaw: RawSchemaValidator;

  constructor(private readonly runtime: ClientRuntime) {
    this.http = runtime.http;
    this.raw = runtime.raw;
    this.validateRaw = runtime.validateRaw;
  }

  async priceForOrder(options: OrderPriceOptions, queryOptions: { timeoutMs?: number } = {}): Promise<OrderPriceQuote> {
    const instrumentId = requiredString(options.instrumentId ?? options.isin, 'instrumentId');
    const exchangeId = requiredString(options.exchangeId, 'exchangeId');
    const side = options.side.toLowerCase();
    if (side !== 'buy' && side !== 'sell') throw new TypeError('side must be "buy" or "sell".');
    const normalized = { ...options, exchangeId, side: side as 'buy' | 'sell' };
    const raw = await this.rawPriceForOrder(normalized, queryOptions);
    return normalizeOrderPriceQuote(raw, normalized, instrumentId);
  }

  rawPriceForOrder(options: OrderPriceOptions, queryOptions: { timeoutMs?: number } = {}): Promise<unknown> {
    const instrumentId = requiredString(options.instrumentId ?? options.isin, 'instrumentId');
    const exchangeId = requiredString(options.exchangeId, 'exchangeId');
    const side = options.side.toLowerCase();
    if (side !== 'buy' && side !== 'sell') throw new TypeError('side must be "buy" or "sell".');
    return validated(this.validateRaw, 'trading.priceForOrder', this.raw.query({
      type: 'priceForOrderV2',
      unit: options.unit?.trim() || 'EUR',
      isin: instrumentId,
      exchangeId,
      side,
    }, pickTimeoutOptions(queryOptions)));
  }

  async availableSize(instrumentId: string, secAccNo?: string, options: { timeoutMs?: number } = {}): Promise<unknown> {
    const accountNumber = secAccNo ?? await this.resolveSecuritiesAccountNumber();
    return validated(this.validateRaw, 'trading.availableSize', this.raw.query({ type: 'availableSize', parameters: { instrumentId }, secAccNo: accountNumber }, pickTimeoutOptions(options)));
  }

  async orderDestinations(isin: string, query: Record<string, string | number | boolean | undefined> = {}): Promise<OrderDestination[]> {
    return arrayPayload(await this.rawOrderDestinations(isin, query)).map(normalizeOrderDestination);
  }

  async homeOrderDestination(instrumentId: string, options: { timeoutMs?: number } = {}): Promise<OrderDestination> {
    return normalizeOrderDestination(await this.rawHomeOrderDestination(instrumentId, options));
  }

  rawHomeOrderDestination(instrumentId: string, options: { timeoutMs?: number } = {}): Promise<unknown> {
    return validated(this.validateRaw, 'trading.homeOrderDestination', this.raw.query({
      type: 'homeInstrumentExchange',
      id: requiredString(instrumentId, 'instrumentId'),
    }, pickTimeoutOptions(options)));
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
    return this.runtime.resolveSecuritiesAccountNumber();
  }
}

export class WebApi {
  private readonly http: HttpClient;
  private readonly raw: RawApi;

  constructor(private readonly runtime: ClientRuntime) {
    this.http = runtime.http;
    this.raw = runtime.raw;
  }

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

  query<T = unknown>(payload: Record<string, unknown>, options: RawQueryOptions = {}): Promise<T> {
    return this.raw.query<T>(payload, options);
  }

  subscribe(payload: Record<string, unknown>, options: RawSubscriptionOptions = {}): Subscription<unknown> {
    return toSubscription(this.raw.subscribeResource(payload, options));
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
    const mapperUnit = unit === 'PKT' ? 'PTS' : unit === 'PRZ' ? 'PCT' : unit;
    return this.subscribe({ type: 'tape', isin, exchangeId, unit: mapperUnit });
  }

  tradeAggregateHistory(isin: string, exchangeId: string, resolution: number, from: number, until?: number): Promise<unknown> {
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

  async iban(): Promise<IbanInfo> {
    return normalizeIbanInfo(await this.rawIban());
  }

  rawIban(): Promise<unknown> {
    return this.request('GET', '/api/v1/customer/relationships/detailed');
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
    const accountNumber = secAccNo ?? await this.runtime.resolveSecuritiesAccountNumber();
    return fn(accountNumber);
  }
}
