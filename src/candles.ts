import type { ResourceClient } from './resource.js';
import { candlesSpec } from './market-specs.js';
import type { Candle, CandleDownloadOptions, CandleTimeframe } from './types.js';

const TIMEFRAME_MS: Record<CandleTimeframe, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
  '1w': 7 * 24 * 60 * 60_000,
  '1M': 31 * 24 * 60 * 60_000,
};

export class CandleQuery {
  constructor(
    private readonly resources: ResourceClient,
    private readonly options: CandleDownloadOptions,
  ) {}

  fetch(): Promise<Candle[]> {
    return this.resources.query(candlesSpec, this.options);
  }

  async *pages(options: { maxCandlesPerRequest?: number } = {}): AsyncIterable<Candle[]> {
    const maxCandlesPerRequest = options.maxCandlesPerRequest ?? this.options.limit ?? 500;
    const to = this.options.to ? asDate(this.options.to) : undefined;
    if (!to) {
      yield await this.fetch();
      return;
    }

    const stepMs = TIMEFRAME_MS[this.options.timeframe] * maxCandlesPerRequest;
    let cursor = asDate(this.options.from);
    while (cursor < to) {
      const next = new Date(Math.min(cursor.getTime() + stepMs, to.getTime()));
      yield await this.resources.query(candlesSpec, {
        ...this.options,
        from: cursor,
        to: next,
        limit: maxCandlesPerRequest,
      });
      cursor = next;
    }
  }

  async download(options: { maxCandlesPerRequest?: number } = {}): Promise<Candle[]> {
    const candles: Candle[] = [];
    for await (const page of this.pages(options)) candles.push(...page);
    return dedupeCandles(candles);
  }
}

function asDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function dedupeCandles(candles: Candle[]): Candle[] {
  const byTime = new Map<string, Candle>();
  for (const candle of candles) byTime.set(candle.time, candle);
  return [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
}
