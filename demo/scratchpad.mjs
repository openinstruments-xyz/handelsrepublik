// Working example: preview or submit the full gold-short-certificate position
// as a EUR 0.90 day-limit sell order through the saved demo session.
//
// Validate, preview, and submit:
//   node --import tsx demo/scratchpad.mjs

import { FileSessionStore, TradeRepublicClient } from '../dist/index.js';

const INSTRUMENT_ID = 'DE000HM8CS45';
const EXCHANGE_ID = 'TUB';
const EXPECTED_SIZE = 6;
const LIMIT_EUR = 0.9;

const client = TradeRepublicClient.create({
  sessionStore: new FileSessionStore('./demo/.demo-session.json'),
  rawSchemaValidation: 'throw',
});

try {
  // restore the session and refresh it to ensure the demo session is still valid
  const restored = await client.auth.restoreSession();
  if (!restored) throw new Error('The demo session could not be restored.');
  await client.auth.refreshSession();


  // get current portfolio
  const portfolio = await client.portfolio.current({ timeoutMs: 15_000 });

  // check if we have gold short position
  const position = portfolio.positions.find((item) => item.id === INSTRUMENT_ID);
  if (!position) throw new Error(`${INSTRUMENT_ID} is no longer in the portfolio.`);

  const asset = await client.assets.get(INSTRUMENT_ID);
  if (!/gold/i.test(asset.name ?? '') || !/short/i.test(position.name ?? '')) {
    throw new Error('The instrument no longer matches the confirmed gold short certificate.');
  }

  console.log(position)
  //console.dir(position, { depth: null, colors: true });
  //console.dir(asset, { depth: null, colors: true });
  

  const [availableSize, quote, destinations] = await Promise.all([
    client.trading.availableSize(INSTRUMENT_ID, undefined, { timeoutMs: 15_000 }),
    client.trading.priceForOrder(
      { instrumentId: INSTRUMENT_ID, exchangeId: EXCHANGE_ID, side: 'sell' },
      { timeoutMs: 15_000 },
    ),
    client.trading.orderDestinations(INSTRUMENT_ID, { productContext: 'derivative' }),
  ]);

  console.log(availableSize, quote, destinations);


  const destination = destinations.find((item) => item.id === EXCHANGE_ID);
  if (!destination?.open) throw new Error(`${EXCHANGE_ID} is not currently open.`);

  const preview = await client.orders.preview({
    instrumentId: INSTRUMENT_ID,
    exchangeId: EXCHANGE_ID,
    side: 'sell',
    mode: 'market',
    size: position.quantity,
    validity: 'day',
  });

  console.log("=== Order Preview ===");

  console.log({
    action: 'submit',
    instrument: `${asset.issuer ?? ''} ${asset.name ?? position.name}`.trim(),
    instrumentId: INSTRUMENT_ID,
    exchangeId: EXCHANGE_ID,
    size: position.quantity,
    validity: 'day',
    latestBid: quote.bid ?? quote.price,
    quoteTime: quote.time,
    fees: preview.totalFees,
    estimatedProceeds: preview.estimatedTotal,
  });

  const result = await client.orders.submit(preview.order);
  console.log("=== Order Result ===");
  switch (result.status) {
    case 'succeeded':
      // Order successfully submitted; the order ID is available for reconciliation.
      console.log({ status: result.status, orderId: result.orderId });
      // Reconcile the order to confirm its status and details.
      if (result.orderId) await printOrderStatus(result.orderId);
      break;
    case 'failed':
      console.error({ status: result.status, error: result.error });
      process.exitCode = 1;
      break;
    case 'outcomeUnknown':
      console.error({
        status: result.status,
        reason: result.outcomeReason,
        connectionLoss: result.connectionLoss,
        warning: 'Do not retry automatically; reconcile the order first.',
      });
      process.exitCode = 2;
      break;
  }
} finally {
  client.close();
}

async function printOrderStatus(orderId) {
  const orders = await client.orders.all({ instrumentId: INSTRUMENT_ID, limit: 100 });
  const order = orders.find((item) => item.id === orderId);
  console.log(order ? {
    reconciliation: 'found',
    orderId: order.id,
    status: order.status,
    side: order.side,
    quantity: order.quantity,
    executedQuantity: order.executedQuantity,
    executionPrice: order.executionPrice,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  } : {
    reconciliation: 'not-yet-visible',
    orderId,
  });
}
