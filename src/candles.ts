import { candleResolutionMs } from './candle-resolutions.js';
import type { Candle, CandleDownloadOptions } from './types.js';

export class CandleQuery {
  constructor(
    private readonly fetchPage: (options: CandleDownloadOptions) => Promise<Candle[]>,
    private readonly options: CandleDownloadOptions,
  ) {}

  fetch(): Promise<Candle[]> {
    return this.fetchPage(this.options);
  }

  async *pages(options: { maxCandlesPerRequest?: number } = {}): AsyncIterable<Candle[]> {
    const maxCandlesPerRequest = options.maxCandlesPerRequest ?? this.options.limit ?? 500;
    const to = this.options.to ? asDate(this.options.to) : undefined;
    if (!to) {
      yield await this.fetch();
      return;
    }
    if (!this.options.from) throw new TypeError('from is required when to is provided for paged candle downloads.');

    const stepMs = candleResolutionMs(this.options.timeframe) * maxCandlesPerRequest;
    let cursor = asDate(this.options.from);
    while (cursor < to) {
      const next = new Date(Math.min(cursor.getTime() + stepMs, to.getTime()));
      yield await this.fetchPage({
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
