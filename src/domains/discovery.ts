import { arrayPayload, normalizeWatchlist } from '../normalizers.js';
import { discoveryOperations } from '../operation-specs.js';
import type { OperationClient } from '../operations.js';
import type { ExchangeDetails, ExchangeSchedule, InstrumentStatus, Watchlist } from '../types.js';

export class DiscoveryApi {
  constructor(private readonly operations: OperationClient) {}

  exchangeDetails(): Promise<ExchangeDetails[]> {
    return this.operations.execute(discoveryOperations.exchangeDetails, {});
  }

  rawExchangeDetails(): Promise<unknown> {
    return this.operations.executeRaw(discoveryOperations.exchangeDetails, {});
  }

  exchangeSchedule(exchange: string): Promise<ExchangeSchedule> {
    return this.operations.execute(discoveryOperations.exchangeSchedule, { exchange });
  }

  rawExchangeSchedule(exchange: string): Promise<unknown> {
    return this.operations.executeRaw(discoveryOperations.exchangeSchedule, { exchange });
  }

  instrumentStatus(isin: string, exchange: string): Promise<InstrumentStatus> {
    return this.operations.execute(discoveryOperations.instrumentStatus, { isin, exchange });
  }

  rawInstrumentStatus(isin: string, exchange: string): Promise<unknown> {
    return this.operations.executeRaw(discoveryOperations.instrumentStatus, { isin, exchange });
  }

  watchlists(): Promise<Watchlist[]> {
    return this.operations.execute(discoveryOperations.watchlists, {});
  }

  async cloudWatchlist(options: { pageSize?: number } = {}): Promise<Watchlist | undefined> {
    const watchlist = (await this.watchlists())[0];
    if (!watchlist) return undefined;
    if (!watchlist.id) return watchlist;
    const items = arrayPayload(await this.rawWatchlistItems(watchlist.id, options));
    return normalizeWatchlist(watchlist.raw, items);
  }

  rawWatchlistItems(watchlistId: string, options: { pageSize?: number } = {}): Promise<unknown> {
    return this.operations.executeRaw(discoveryOperations.watchlistItems, {
      watchlistId,
      ...(options.pageSize === undefined ? {} : { pageSize: options.pageSize }),
    });
  }

  rawWatchlists(): Promise<unknown> {
    return this.operations.executeRaw(discoveryOperations.watchlists, {});
  }

  cloneWatchlist(watchlistId: string): Promise<unknown> {
    return this.rawCloneWatchlist(watchlistId);
  }

  rawCloneWatchlist(watchlistId: string): Promise<unknown> {
    return this.operations.executeRaw(discoveryOperations.cloneWatchlist, { watchlistId });
  }

  renameWatchlist(watchlistId: string, name: string): Promise<unknown> {
    return this.rawRenameWatchlist(watchlistId, name);
  }

  rawRenameWatchlist(watchlistId: string, name: string): Promise<unknown> {
    return this.operations.executeRaw(discoveryOperations.renameWatchlist, { watchlistId, name });
  }

  deleteWatchlist(watchlistId: string): Promise<unknown> {
    return this.rawDeleteWatchlist(watchlistId);
  }

  rawDeleteWatchlist(watchlistId: string): Promise<unknown> {
    return this.operations.executeRaw(discoveryOperations.deleteWatchlist, { watchlistId });
  }

  addWatchlistItem(watchlistId: string, instrumentId: string, options: Record<string, unknown> = {}): Promise<unknown> {
    return this.rawAddWatchlistItem(watchlistId, instrumentId, options);
  }

  rawAddWatchlistItem(watchlistId: string, instrumentId: string, options: Record<string, unknown> = {}): Promise<unknown> {
    return this.operations.executeRaw(discoveryOperations.addWatchlistItem, { watchlistId, instrumentId, options });
  }

  removeWatchlistItem(watchlistId: string, instrumentId: string): Promise<unknown> {
    return this.rawRemoveWatchlistItem(watchlistId, instrumentId);
  }

  rawRemoveWatchlistItem(watchlistId: string, instrumentId: string): Promise<unknown> {
    return this.operations.executeRaw(discoveryOperations.removeWatchlistItem, { watchlistId, instrumentId });
  }

  screeners(): Promise<unknown> {
    return this.rawScreeners();
  }

  rawScreeners(): Promise<unknown> {
    return this.operations.executeRaw(discoveryOperations.screeners, {});
  }

  screenerOptions(): Promise<unknown> {
    return this.rawScreenerOptions();
  }

  rawScreenerOptions(): Promise<unknown> {
    return this.operations.executeRaw(discoveryOperations.screenerOptions, {});
  }

  userPreferences(): Promise<unknown> {
    return this.rawUserPreferences();
  }

  rawUserPreferences(): Promise<unknown> {
    return this.operations.executeRaw(discoveryOperations.userPreferences, {});
  }
}
