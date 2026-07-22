import type { RestOperation } from './operations.js';
import { identity } from './operations.js';
import {
  arrayPayload,
  normalizeAccountRelationships,
  normalizeExchangeDetails,
  normalizeExchangeSchedule,
  normalizeIbanInfo,
  normalizeInstrumentStatus,
  normalizeWatchlist,
} from './normalizers.js';
import type { AccountRelationship, ExchangeDetails, ExchangeSchedule, IbanInfo, InstrumentStatus, Watchlist } from './types.js';

export const accountOperations = {
  current: endpoint('auth.account', 'auth.account'),
  session: endpoint('auth.session', 'auth.session'),
  accountSettings: endpoint('auth.account', 'auth.account'),
  personalDetails: rest('account.personalDetails', '/api/v1/customer/personal-details'),
  appUsageConsents: rest('account.appUsageConsents', '/api/v1/customer/app-usage-data-consents'),
  relationships: {
    ...rest('account.relationships', '/api/v1/customer/relationships/detailed'),
    normalize: (raw: unknown): AccountRelationship[] => normalizeAccountRelationships(raw),
  } satisfies RestOperation<Record<string, never>, AccountRelationship[]>,
  cardsHome: rest('account.cardsHome', '/api/v1/card/cards/home'),
} as const;

export const discoveryOperations = {
  exchangeDetails: {
    ...rest('discovery.exchangeDetails', '/api-gateway/instrument-universe/api/v1/exchanges-details'),
    query: () => ({ includeMaintenanceWindow: false }),
    normalize: (raw: unknown): ExchangeDetails[] => arrayPayload(raw).map(normalizeExchangeDetails),
  },
  exchangeSchedule: {
    transport: 'rest',
    name: 'discovery.exchangeSchedule',
    schemaName: 'discovery.exchangeSchedule',
    path: ({ exchange }: { exchange: string }) => `/api-gateway/instrument-universe/api/v1/exchanges/${encodeURIComponent(exchange)}/schedule`,
    normalize: (raw: unknown): ExchangeSchedule => normalizeExchangeSchedule(raw),
  } satisfies RestOperation<{ exchange: string }, ExchangeSchedule>,
  instrumentStatus: {
    transport: 'rest',
    name: 'discovery.instrumentStatus',
    schemaName: 'discovery.instrumentStatus',
    path: ({ isin, exchange }: { isin: string; exchange: string }) => `/api-gateway/instrument-universe/api/v1/instruments/${encodeURIComponent(isin)}/status/${encodeURIComponent(exchange)}`,
    normalize: (raw: unknown): InstrumentStatus => normalizeInstrumentStatus(raw),
  } satisfies RestOperation<{ isin: string; exchange: string }, InstrumentStatus>,
  watchlists: {
    ...rest('discovery.watchlists', '/api-gateway/watchlists/api/v2/watchlists'),
    normalize: (raw: unknown): Watchlist[] => arrayPayload(raw).map((watchlist) => normalizeWatchlist(watchlist)),
  } satisfies RestOperation<Record<string, never>, Watchlist[]>,
  watchlistItems: {
    transport: 'rest',
    name: 'discovery.watchlists.items',
    schemaName: 'discovery.watchlists.items',
    path: ({ watchlistId }: { watchlistId: string; pageSize?: number }) => `/api-gateway/watchlists/api/v2/watchlists/${encodeURIComponent(watchlistId)}/items`,
    query: ({ pageSize }: { watchlistId: string; pageSize?: number }) => ({ pageSize: pageSize ?? 200 }),
    normalize: identity<unknown>,
  } satisfies RestOperation<{ watchlistId: string; pageSize?: number }, unknown>,
  addWatchlistItem: mutation('discovery.watchlists.addItem', 'POST', ({ watchlistId }: WatchlistItemParams) => `/api-gateway/watchlists/api/v2/watchlists/${encodeURIComponent(watchlistId)}/items`, ({ instrumentId, options }: WatchlistItemParams) => ({ instrument_id: instrumentId, item_rank: -1, ...options })),
  removeWatchlistItem: mutation('discovery.watchlists.removeItem', 'DELETE', ({ watchlistId, instrumentId }: Omit<WatchlistItemParams, 'options'>) => `/api-gateway/watchlists/api/v2/watchlists/${encodeURIComponent(watchlistId)}/items/${encodeURIComponent(instrumentId)}`),
  screeners: rest('discovery.screeners', '/api-gateway/screeners/api/v2/screeners'),
  screenerOptions: rest('discovery.screenerOptions', '/api-gateway/screeners/api/v2/screeners/options'),
  userPreferences: rest('discovery.userPreferences', '/api-gateway/pro-trading/api/v1/user-preferences'),
} as const;

export const customerOperations = {
  documents: rest('documents.documents', '/api/v1/documents/all'),
  taxInformation: rest('tax.taxInformation', '/api/v1/taxes/information'),
  exemptionOrder: rest('tax.exemptionOrder', '/api/v1/taxes/exemptionorders'),
  taxResidencies: rest('tax.taxResidencies', '/api/v1/auth/account/change/taxresidencies'),
  taxResidencyCountries: rest('tax.taxResidencyCountries', '/api/v1/country/taxresidency'),
  paymentMethods: rest('payments.paymentMethods', '/api/v2/payment/methods'),
  iban: {
    transport: 'rest',
    name: 'payments.iban',
    schemaName: 'payments.iban',
    path: '/api/v1/customer/relationships/detailed',
    normalize: normalizeIbanInfo,
  } satisfies RestOperation<Record<string, never>, IbanInfo>,
} as const;

interface WatchlistItemParams {
  watchlistId: string;
  instrumentId: string;
  options: Record<string, unknown>;
}

function rest(name: string, path: string): RestOperation<Record<string, never>, unknown> {
  return { transport: 'rest', name, schemaName: name, path, normalize: identity<unknown> };
}

function endpoint(name: string, endpointKey: 'auth.account' | 'auth.session'): RestOperation<Record<string, never>, unknown> {
  return { transport: 'rest', name, schemaName: name, endpoint: endpointKey, normalize: identity<unknown> };
}

function mutation<TParams>(
  name: string,
  method: 'POST' | 'PUT' | 'DELETE',
  path: string | ((params: TParams) => string),
  body?: (params: TParams) => unknown,
): RestOperation<TParams, unknown> {
  return {
    transport: 'rest',
    name,
    schemaName: name,
    method,
    path,
    ...(body ? { body } : {}),
    normalize: identity<unknown>,
  };
}
