import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BOND_CANDLE_RESOLUTIONS,
  DERIVATIVE_AND_CRYPTO_CANDLE_RESOLUTIONS,
  STANDARD_CANDLE_RESOLUTIONS,
  type AssetSearchType,
  type CandleTimeframe,
  type TradeRepublicClient,
} from '../../src/index.js';
import {
  APPLE, BITCOIN, BITCOIN_EXCHANGE, DEFAULT_EXCHANGE, TIB,
  assertArray, assertRecord, firstAsset, firstDestination, nextStreamValue, withLiveClient,
} from './support.js';

describe('market integration', () => {
  it('reads candles, subscriptions, entitlements, and venue data', { timeout: 360_000 }, () => withLiveClient('market', async (client, note) => {
    await assertCandleMatrix(client, APPLE, DEFAULT_EXCHANGE, 'stock', STANDARD_CANDLE_RESOLUTIONS, true);
    await assertCandleMatrix(client, BITCOIN, BITCOIN_EXCHANGE, 'crypto', DERIVATIVE_AND_CRYPTO_CANDLE_RESOLUTIONS);
    await assertDiscoveredCandleMatrix(client, 'derivative', DERIVATIVE_AND_CRYPTO_CANDLE_RESOLUTIONS, note);
    await assertDiscoveredCandleMatrix(client, 'bond', BOND_CANDLE_RESOLUTIONS, note);
    await assertDiscoveredCandleMatrix(client, 'etf', ['1d'], note);
    await assertDiscoveredCandleMatrix(client, 'mutualFund', ['1d'], note);
    assertArray(await client.market.subscriptions(), 'market.subscriptions');
    assertRecord(await client.market.entitlements('L2', { exchangeIds: [TIB, DEFAULT_EXCHANGE] }), 'market.entitlements');
    assertRecord(await client.market.quote(APPLE, DEFAULT_EXCHANGE), 'market.quote');
    assertArray(await client.market.availableL2Books(APPLE), 'market.availableL2Books');
    const open = (await client.trading.orderDestinations(APPLE)).find((destination) => destination.open === true);
    if (!open) return note('no open Apple destination; streaming market data not observed');
    assertRecord(await nextStreamValue(client.market.subscribeLiveFeed({ assetId: APPLE, exchangeId: open.id }), 'AAPL ticker'), 'ticker event');
    assertRecord(await nextStreamValue(client.trading.tape(APPLE, open.id), 'AAPL tape'), 'tape event');
    const l2Book = await client.market.snapshotL2OrderBook(APPLE, TIB);
    assert.ok(l2Book.bids.length + l2Book.asks.length > 0, 'expected at least one L2 level');
  }));
});

async function assertCandleMatrix(
  client: TradeRepublicClient,
  assetId: string,
  exchangeId: string,
  instrumentType: AssetSearchType,
  resolutions: readonly CandleTimeframe[],
  requireVolume = false,
): Promise<void> {
  for (const timeframe of resolutions) {
    const candles = await client.market.candles({ assetId, exchangeId, instrumentType, timeframe, range: candleProbeRange(timeframe) });
    assert.ok(candles.length > 0, `expected ${assetId} ${timeframe} candles`);
    for (const candle of candles) {
      assert.equal(typeof candle.time, 'string');
      for (const field of ['open', 'high', 'low', 'close'] as const) assert.equal(typeof candle[field], 'number');
      if (requireVolume || candle.volume !== undefined) assert.equal(typeof candle.volume, 'number');
    }
  }
}

function candleProbeRange(timeframe: CandleTimeframe): '5d' | '1m' | '6m' | '1y' {
  if (['1m', '3m', '5m', '10m', '15m', '20m', '30m', '45m'].includes(timeframe)) return '5d';
  if (['1h', '2h', '4h'].includes(timeframe)) return '1m';
  if (timeframe === '1d') return '6m';
  return '1y';
}

async function assertDiscoveredCandleMatrix(
  client: TradeRepublicClient,
  type: AssetSearchType,
  resolutions: readonly CandleTimeframe[],
  note: (message: string) => void,
): Promise<void> {
  const asset = await firstAsset(client, type);
  if (!asset?.id) return note(`${type}: no fixture discovered`);
  const destination = await firstDestination(client, asset.id);
  if (!destination) return note(`${type}: no order destination discovered`);
  await assertCandleMatrix(client, destination.instrumentId, destination.exchangeId, type, resolutions);
}
