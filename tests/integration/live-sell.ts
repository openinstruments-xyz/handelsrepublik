import type {
  CreateOrderOptions,
  OrderDestination,
  OrderPriceQuote,
  OrderSubmission,
} from '../../src/index.js';

export interface LiveSellClient {
  trading: {
    orderDestinations(instrumentId: string): Promise<OrderDestination[]>;
    priceForOrder(options: {
      instrumentId: string;
      exchangeId: string;
      side: 'sell';
    }, queryOptions?: { timeoutMs?: number }): Promise<OrderPriceQuote>;
  };
  orders: {
    submit(options: CreateOrderOptions): Promise<OrderSubmission>;
  };
}

export type LiveSellAttempt =
  | { status: 'skipped'; reason: string }
  | { status: 'submitted'; destination: OrderDestination; submission: OrderSubmission };

export async function submitLiveMarketSell(
  client: LiveSellClient,
  instrumentId: string,
  size: number,
): Promise<LiveSellAttempt> {
  const destinations = await client.trading.orderDestinations(instrumentId);
  const destination = destinations.find(
    ({ open, orderModes }) => open === true
      && orderModes?.some((mode) => mode.toLowerCase() === 'market'),
  );
  if (!destination) {
    return {
      status: 'skipped',
      reason: `no explicitly open market-order venue is available for ${instrumentId}; refusing to execute orders`,
    };
  }

  const quote = await client.trading.priceForOrder({
    instrumentId,
    exchangeId: destination.id,
    side: 'sell',
  }, { timeoutMs: 60_000 });
  const lastClientPrice = quote.bid ?? quote.price;
  if (lastClientPrice === undefined || !Number.isFinite(lastClientPrice) || lastClientPrice <= 0) {
    return {
      status: 'skipped',
      reason: `no positive current bid or market price is available for ${instrumentId} at ${destination.id}; refusing to execute orders`,
    };
  }

  const submission = await client.orders.submit({
    instrumentId,
    exchangeId: destination.id,
    side: 'sell',
    mode: 'market',
    size,
    lastClientPrice,
    validity: 'day',
    timeoutMs: 60_000,
  });
  return { status: 'submitted', destination, submission };
}
