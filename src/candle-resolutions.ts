import type { CandleResolution, CandleTimeframe } from './types.js';

export const CANDLE_TIMEFRAME_MS: Record<CandleTimeframe, number> = {
  '1m': 60_000,
  '3m': 3 * 60_000,
  '5m': 5 * 60_000,
  '10m': 10 * 60_000,
  '15m': 15 * 60_000,
  '20m': 20 * 60_000,
  '30m': 30 * 60_000,
  '45m': 45 * 60_000,
  '1h': 60 * 60_000,
  '2h': 2 * 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
  '1w': 7 * 24 * 60 * 60_000,
  '1M': 30 * 24 * 60 * 60_000,
};

export const STANDARD_CANDLE_RESOLUTIONS: readonly CandleTimeframe[] = [
  '1m',
  '3m',
  '5m',
  '10m',
  '15m',
  '20m',
  '30m',
  '45m',
  '1h',
  '2h',
  '4h',
  '1d',
  '1w',
  '1M',
];

export const DERIVATIVE_AND_CRYPTO_CANDLE_RESOLUTIONS: readonly CandleTimeframe[] = [
  '10m',
  '1h',
  '4h',
  '1d',
  '1w',
];

export const BOND_CANDLE_RESOLUTIONS: readonly CandleTimeframe[] = [
  '1d',
  '1w',
];

export function candleResolutionsForInstrumentType(instrumentType: string | undefined): CandleTimeframe[] {
  const normalized = instrumentType?.trim().toLowerCase();
  if (normalized === 'derivative' || normalized === 'crypto') {
    return [...DERIVATIVE_AND_CRYPTO_CANDLE_RESOLUTIONS];
  }
  if (normalized === 'bond') return [...BOND_CANDLE_RESOLUTIONS];
  return [...STANDARD_CANDLE_RESOLUTIONS];
}

export function candleResolutionMs(resolution: CandleResolution): number {
  const milliseconds = typeof resolution === 'number' ? resolution : CANDLE_TIMEFRAME_MS[resolution];
  if (!Number.isFinite(milliseconds) || milliseconds <= 0 || !Number.isInteger(milliseconds)) {
    throw new TypeError('Candle resolution must be a positive integer number of milliseconds.');
  }
  return milliseconds;
}
