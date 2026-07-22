import type {
  CreateOrderOptions,
  OrderDestination,
  OrderPriceQuote,
  OrderSubmission,
} from '../../src/index.js';

export interface LiveBuyClient {
  trading: {
    orderDestinations(instrumentId: string): Promise<OrderDestination[]>;
    priceForOrder(options: {
      instrumentId: string;
      exchangeId: string;
      side: 'buy';
    }, queryOptions?: { timeoutMs?: number }): Promise<OrderPriceQuote>;
  };
  orders: {
    submit(options: CreateOrderOptions): Promise<OrderSubmission>;
  };
}

export type LiveBuyAttempt =
  | { status: 'skipped'; reason: string }
  | { status: 'submitted'; destination: OrderDestination; submission: OrderSubmission };

export async function submitLiveMarketBuy(
  client: LiveBuyClient,
  instrumentId: string,
  amount: number,
): Promise<LiveBuyAttempt> {
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
    side: 'buy',
  }, { timeoutMs: 60_000 });
  const lastClientPrice = quote.ask ?? quote.price;
  if (lastClientPrice === undefined || !Number.isFinite(lastClientPrice) || lastClientPrice <= 0) {
    return {
      status: 'skipped',
      reason: `no positive current ask or market price is available for ${instrumentId} at ${destination.id}; refusing to execute orders`,
    };
  }

  const submission = await client.orders.submit({
    instrumentId,
    exchangeId: destination.id,
    side: 'buy',
    mode: 'market',
    amount,
    lastClientPrice,
    sizeStep: 1,
    validity: 'day',
    timeoutMs: 60_000,
  });
  return { status: 'submitted', destination, submission };
}
