import assert from 'node:assert/strict';
import { describe, expect, it } from '../test-compat.js';
import { MapperRequestError, TradeRepublicClient } from '../../src/index.js';
import { decodeMapperProtobufRequest, encodeMapperProtobufDataEnvelope, encodeMapperProtobufTopicPayload } from '../../src/mapper-protobuf.js';
import { FakeSocket } from '../fake-socket.js';
import { TEST_DEVICE_INFO, preparedReplacement, mockFetch, mockFetchSequence, expectOrderCall, parseSubPayload, accountPairsPayload, jsonResponse, EventEmitterOnlySocket } from './test-helpers.js';
import { isOpenBerlinWindow, selectNvidiaLimitOrderCandidate } from '../integration/support.js';

describe('orders namespace', () => {
  it('lists orders through the web-trading customer orders endpoint', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      session: {
        deviceInfo: TEST_DEVICE_INFO,
        cookies: {
          tr_session: 'restored-session',
        },
      },
      fetch: mockFetchSequence(calls, [
        jsonResponse([{ id: 'o1', instrumentId: 'US1', side: 'BUY', submittedAt: '2026-07-03T10:00:00.000Z', trades: [] }]),
        jsonResponse([{ id: 'o2', instrumentId: 'US2', side: 'SELL', executedAt: '2026-07-03T11:00:00.000Z' }]),
        jsonResponse([{ id: 'o3', instrumentId: 'US3', side: 'BUY', submittedAt: '2026-07-03T12:00:00.000Z' }]),
      ]),
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') {
            socket.emit('message', `${id} A ${JSON.stringify(accountPairsPayload())}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.orders.open({ limit: 25 })).resolves.toEqual([expect.objectContaining({ id: 'o1', status: 'open' })]);
    await expect(client.orders.closed({ cursor: '2' })).resolves.toEqual([expect.objectContaining({ id: 'o2', status: 'executed' })]);
    await expect(client.orders.all({ sort: 'createdAt,asc', instrumentId: 'US3' })).resolves.toEqual([expect.objectContaining({ id: 'o3' })]);

    expect(sockets).toHaveLength(3);
    expectOrderCall(calls[0], {
      secAccNo: '0000000001',
      page: '1',
      pageSize: '25',
      sort: 'orderUpdatedAt,desc',
    });
    expectOrderCall(calls[1], {
      secAccNo: '0000000001',
      page: '2',
      pageSize: '100',
      sort: 'orderUpdatedAt,desc',
    });
    expectOrderCall(calls[2], {
      secAccNo: '0000000001',
      page: '1',
      pageSize: '100',
      sort: 'createdAt,asc',
      instrumentId: 'US3',
    });
    expect(client.securitiesAccountNumber).toBe('0000000001');
  });

  it('returns only filled and partially filled account executions', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = TradeRepublicClient.create({
      fetch: mockFetch(calls, [
        { id: 'filled', status: 'EXECUTED', instrument: { name: 'Apple' }, executedAt: '2026-07-03T10:00:00.000Z', executedQuantity: '2', averageExecutionPrice: '123.45' },
        { id: 'partial', status: 'PARTIALLY_FILLED', trades: [{ executionSize: '1', executionPrice: '100', executionTime: '2026-07-03T11:00:00.000Z' }] },
        { id: 'cancelled', status: 'CANCELLED', cancelledAt: '2026-07-03T12:00:00.000Z' },
        { id: 'rejected', status: 'REJECTED', rejectedAt: '2026-07-03T12:00:00.000Z' },
        { id: 'open', status: 'OPEN', trades: [] },
      ]),
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'accountPairs') socket.emit('message', `${id} A ${JSON.stringify(accountPairsPayload())}`);
        });
        return socket;
      },
      session: { deviceInfo: TEST_DEVICE_INFO, securitiesAccountNumber: '0000000001' },
    });

    await expect(client.orders.executed()).resolves.toEqual([
      expect.objectContaining({ id: 'filled', name: 'Apple', executedQuantity: 2, executionPrice: 123.45 }),
      expect.objectContaining({ id: 'partial', executedQuantity: 1, executionPrice: 100, executedAt: '2026-07-03T11:00:00.000Z' }),
    ]);
  });

  it('subscribes to order updates by securities account number', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      rawSchemaValidation: 'throw',
      websocketFactory: () => {
        const socket = new FakeSocket(undefined, (binary) => {
          const request = decodeMapperProtobufRequest(binary);
          const payload = encodeMapperProtobufTopicPayload(request.topic, {
            id: { id: Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]) },
            secAccNo: '0000000000',
            instrumentId: 'US0378331005',
            size: { unscaled: Uint8Array.from([0x7b]), scale: 2 },
            createdAt: 1_753_447_200_000n,
            updatedAt: 1_753_447_201_000n,
            receivedAt: 1_753_447_202_000n,
            submittedAt: 1_753_447_203_000n,
            trades: [],
          });
          socket.emit('message', encodeMapperProtobufDataEnvelope(request.subscriptionId, payload), true);
        });
        sockets.push(socket);
        return socket;
      },
    });

    const subscription = client.orders.orderUpdates('0000000000');
    await expect(subscription[Symbol.asyncIterator]().next()).resolves.toEqual({
      done: false,
      value: expect.objectContaining({
        id: '00000000-0000-0000-0000-000000000001',
        size: '1.23',
        createdAt: '2025-07-25T12:40:00.000Z',
        updatedAt: '2025-07-25T12:40:01.000Z',
        receivedAt: '2025-07-25T12:40:02.000Z',
        submittedAt: '2025-07-25T12:40:03.000Z',
      }),
    });

    expect(decodeMapperProtobufRequest(sockets[0]!.binarySent[0]!)).toEqual({
      subscriptionId: 1,
      topic: 'orderUpdates',
      accountNumber: '0000000000',
    });
    subscription.close();
  });

  it('previews order fees without submitting an order', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'orderFeesV2') {
            socket.emit('message', `${id} A ${JSON.stringify({
              fees: [{ name: 'External costs', absolute: { value: 1, currency: 'EUR' } }],
              total: { absolute: { value: 1, currency: 'EUR' } },
            })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    await expect(client.orders.preview({
      instrumentId: 'US0378331005',
      exchangeId: 'LSX',
      side: 'buy',
      mode: 'limit',
      size: 2,
      limit: 100,
      secAccNo: '0000000000',
    })).resolves.toMatchObject({
      totalFees: 1,
      currency: 'EUR',
      estimatedGross: 200,
      estimatedTotal: 201,
      fees: [{ name: 'External costs', amount: 1, currency: 'EUR' }],
      order: {
        parameters: {
          instrumentId: 'US0378331005',
          exchangeId: 'LSX',
          type: 'buy',
          mode: 'limit',
          size: 2,
          limit: 100,
          expiry: { type: 'gfd' },
        },
      },
    });
    expect(parseSubPayload(sockets[0]?.sent[1])).toMatchObject({
      type: 'orderFeesV2',
      parameters: { instrumentId: 'US0378331005', exchangeId: 'LSX', type: 'buy', mode: 'limit', size: 2, limit: 100, currency: 'EUR' },
      secAccNo: '0000000000',
    });
  });

  it('waits through order confirmation states until submission succeeds', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type !== 'simpleCreateOrder') return;
          socket.emit('message', `${id} A ${JSON.stringify({ status: 'received' })}`);
          socket.emit('message', `${id} A ${JSON.stringify({ status: 'confirmationNeeded' })}`);
          socket.emit('message', `${id} A ${JSON.stringify({ status: 'succeeded', orderId: 'order-1' })}`);
        });
        sockets.push(socket);
        return socket;
      },
    });

    const result = await client.orders.submit({
      instrumentId: 'US0378331005',
      exchangeId: 'LSX',
      side: 'buy',
      mode: 'market',
      size: 1,
      lastClientPrice: 201.5,
      clientProcessId: 'process-1',
      secAccNo: '0000000000',
    });

    expect(result).toMatchObject({ status: 'succeeded', orderId: 'order-1', clientProcessId: 'process-1' });
    expect(result.updates).toHaveLength(3);
    expect(parseSubPayload(sockets[0]?.sent[1])).toEqual({
      type: 'simpleCreateOrder',
      parameters: {
        instrumentId: 'US0378331005', exchangeId: 'LSX', mode: 'market', size: 1, type: 'buy',
        expiry: { type: 'gfd' }, sellFractions: false, settlementCurrency: 'EUR',
      },
      warningsShown: [],
      lastClientPrice: 201.5,
      clientProcessId: 'process-1',
      secAccNo: '0000000000',
    });
  });

  it('returns a definitive failed result from the broker', async () => {
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'simpleCreateOrder') {
            socket.emit('message', `${id} A ${JSON.stringify({
              status: 'failed',
              message: 'Exchange is closed',
              error: {
                code: 'exchangeClosed',
                message: 'Exchange is closed',
                details: {
                  exchangeId: 'LSX',
                  isin: 'US0378331005',
                  isNostro: false,
                  clientProcessId: 'failed-process-1',
                },
              },
            })}`);
          }
        });
        return socket;
      },
    });

    const result = await client.orders.submit({
      instrumentId: 'US0378331005', exchangeId: 'LSX', side: 'buy', mode: 'market', size: 1,
      lastClientPrice: 201.5, clientProcessId: 'failed-process-1', secAccNo: '0000000000',
    });

    expect(result).toMatchObject({
      status: 'failed',
      error: {
        code: 'exchangeClosed',
        message: 'Exchange is closed',
        details: {
          exchangeId: 'LSX',
          isin: 'US0378331005',
          isNostro: false,
          clientProcessId: 'failed-process-1',
        },
      },
    });
    client.close();
  });

  it('returns outcomeUnknown and never replays an order after connection loss', async () => {
    const sockets: FakeSocket[] = [];
    const submittedPayloads: Record<string, unknown>[] = [];
    const disconnects: unknown[] = [];
    const reconnects: unknown[] = [];
    const client = TradeRepublicClient.create({
      websocketReconnectDelayMs: 0,
      onWebSocketDisconnect: (event) => { disconnects.push(event); },
      onWebSocketReconnect: (event) => { reconnects.push(event); },
      websocketFactory: () => {
        const socket = new FakeSocket((payload) => {
          if (payload.type !== 'simpleCreateOrder') return;
          submittedPayloads.push(payload);
          if (submittedPayloads.length === 1) {
            queueMicrotask(() => socket.emit('close', 1006, Buffer.from('network lost')));
          }
        });
        sockets.push(socket);
        return socket;
      },
    });

    const result = await client.orders.submit({
      instrumentId: 'US0378331005',
      exchangeId: 'LSX',
      side: 'buy',
      mode: 'market',
      size: 1,
      lastClientPrice: 201.5,
      clientProcessId: 'lost-process-1',
      secAccNo: '0000000000',
    });

    expect(result).toMatchObject({
      status: 'outcomeUnknown',
      outcomeReason: 'disconnect',
      clientProcessId: 'lost-process-1',
      connectionLoss: { code: 1006, reason: 'network lost' },
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(sockets).toHaveLength(2);
    expect(submittedPayloads).toHaveLength(1);
    expect(disconnects).toHaveLength(1);
    expect(reconnects).toHaveLength(1);
    client.close();
  });

  it('returns outcomeUnknown when an order submission times out', async () => {
    const client = TradeRepublicClient.create({ websocketFactory: () => new FakeSocket() });

    const result = await client.orders.submit({
      instrumentId: 'US0378331005', exchangeId: 'LSX', side: 'buy', mode: 'market', size: 1,
      lastClientPrice: 201.5, clientProcessId: 'timed-out-process-1', secAccNo: '0000000000', timeoutMs: 1,
    });

    expect(result).toMatchObject({
      status: 'outcomeUnknown',
      outcomeReason: 'timeout',
      clientProcessId: 'timed-out-process-1',
    });
    client.close();
  });

  it('rejects a submission timeout when the order was definitely not sent', async () => {
    const client = TradeRepublicClient.create({
      websocketFactory: () => new EventEmitterOnlySocket(),
    });

    await assert.rejects(client.orders.submit({
      instrumentId: 'US0378331005', exchangeId: 'LSX', side: 'buy', mode: 'market', size: 1,
      lastClientPrice: 201.5, clientProcessId: 'not-sent-process-1', secAccNo: '0000000000', timeoutMs: 1,
    }), (error: unknown) => {
      assert.ok(error instanceof MapperRequestError);
      assert.equal(error.reason, 'timeout');
      assert.equal(error.deliveryState, 'notSent');
      assert.equal(error.outcomeUnknown, false);
      return true;
    });
    client.close();
  });

  it('returns outcomeUnknown when the session changes after submission was sent', async () => {
    let client: TradeRepublicClient;
    client = TradeRepublicClient.create({
      websocketFactory: () => new FakeSocket((payload) => {
        if (payload.type === 'simpleCreateOrder') queueMicrotask(() => client.setSession({ sessionToken: 'fresh' }));
      }),
    });

    const result = await client.orders.submit({
      instrumentId: 'US0378331005', exchangeId: 'LSX', side: 'buy', mode: 'market', size: 1,
      lastClientPrice: 201.5, clientProcessId: 'refreshed-process-1', secAccNo: '0000000000',
    });

    expect(result).toMatchObject({ status: 'outcomeUnknown', outcomeReason: 'sessionRefresh' });
    client.close();
  });

  it('returns outcomeUnknown when the client closes after submission was sent', async () => {
    let client: TradeRepublicClient;
    client = TradeRepublicClient.create({
      websocketFactory: () => new FakeSocket((payload) => {
        if (payload.type === 'simpleCreateOrder') queueMicrotask(() => client.close());
      }),
    });

    const result = await client.orders.submit({
      instrumentId: 'US0378331005', exchangeId: 'LSX', side: 'buy', mode: 'market', size: 1,
      lastClientPrice: 201.5, clientProcessId: 'closed-process-1', secAccNo: '0000000000',
    });

    expect(result).toMatchObject({ status: 'outcomeUnknown', outcomeReason: 'clientClosed' });
  });

  it('supports current amount-based order payloads while previewing fees by derived size', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'instrument') {
            socket.emit('message', `${id} A ${JSON.stringify({ id: 'XF000BTC0017', type: 'crypto' })}`);
          }
          if (payload.type === 'orderFeesV2') {
            socket.emit('message', `${id} A ${JSON.stringify({ total: { absolute: { value: 1, currency: 'EUR' } } })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });
    const preview = await client.orders.preview({
      instrumentId: 'XF000BTC0017', exchangeId: 'BHS', side: 'buy', mode: 'market', amount: 1,
      lastClientPrice: 56_700, secAccNo: '0000000000', clientProcessId: 'amount-1',
    });
    expect(preview).toMatchObject({ estimatedGross: 1, estimatedTotal: 2, order: { parameters: { size: 0.000017, amount: 1 } } });
    const feePayload = parseSubPayload(sockets[1]?.sent[1]) as { parameters: Record<string, unknown> };
    expect(feePayload).toMatchObject({
      type: 'orderFeesV2', parameters: { size: 0.000017, currency: 'EUR' },
    });
    assert.equal('amount' in feePayload.parameters, false);
  });

  it('cancels an order through the current cancelOrder resource', async () => {
    const sockets: FakeSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'cancelOrder') {
            socket.emit('message', `${id} A ${JSON.stringify({ status: 'received', orderId: 'order-1' })}`);
            socket.emit('message', `${id} A ${JSON.stringify({ status: 'succeeded', orderId: 'order-1' })}`);
          }
        });
        sockets.push(socket);
        return socket;
      },
    });
    await expect(client.orders.cancel('order-1')).resolves.toMatchObject({ orderId: 'order-1', status: 'succeeded', updates: [{ status: 'received' }, { status: 'succeeded' }] });
    expect(parseSubPayload(sockets[0]?.sent[1])).toEqual({ type: 'cancelOrder', orderId: 'order-1' });
  });

  it('replaces an order through the captured cancel-then-create sequence', async () => {
    const payloads: Record<string, unknown>[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          payloads.push(payload);
          if (payload.type === 'cancelOrder') {
            socket.emit('message', `${id} A ${JSON.stringify({ status: 'succeeded', orderId: 'old-order' })}`);
          }
          if (payload.type === 'simpleCreateOrder') {
            socket.emit('message', `${id} A ${JSON.stringify({ status: 'succeeded', orderId: 'new-order' })}`);
          }
        });
        return socket;
      },
    });

    const result = await client.orders.replace('old-order', preparedReplacement(), { cancellationTimeoutMs: 100 });

    expect(result).toMatchObject({
      status: 'succeeded',
      previousOrderId: 'old-order',
      cancellation: { status: 'succeeded' },
      submission: { status: 'succeeded', orderId: 'new-order' },
    });
    expect(payloads).toEqual([
      { type: 'cancelOrder', orderId: 'old-order' },
      {
        type: 'simpleCreateOrder',
        parameters: expect.objectContaining({ mode: 'limit', limit: 1.51 }),
        warningsShown: ['appropriatenessTestingAppropriateUser'],
        clientProcessId: 'replacement-process',
        secAccNo: '0000000000',
      },
    ]);
  });

  it('never submits a replacement after a definitive cancellation failure', async () => {
    const payloads: Record<string, unknown>[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new FakeSocket((payload, id) => {
          payloads.push(payload);
          if (payload.type === 'cancelOrder') {
            socket.emit('message', `${id} A ${JSON.stringify({
              status: 'failed',
              orderId: 'old-order',
              message: 'Could not find the order',
              error: {
                code: 'orderNotFound',
                message: 'Order not found',
                details: { orderId: 'old-order', userId: 'user-1' },
              },
            })}`);
          }
        });
        return socket;
      },
    });

    await expect(client.orders.replace('old-order', preparedReplacement())).resolves.toMatchObject({
      status: 'cancelFailed',
      previousOrderId: 'old-order',
      cancellation: {
        status: 'failed',
        error: {
          code: 'orderNotFound',
          message: 'Order not found',
          details: { orderId: 'old-order', userId: 'user-1' },
        },
      },
    });
    expect(payloads).toEqual([{ type: 'cancelOrder', orderId: 'old-order' }]);
  });

  it('never submits a replacement after an ambiguous cancellation', async () => {
    const payloads: Record<string, unknown>[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => new FakeSocket((payload) => { payloads.push(payload); }),
    });

    await expect(client.orders.replace('old-order', preparedReplacement(), {
      cancellationTimeoutMs: 1,
    })).resolves.toMatchObject({
      status: 'cancelOutcomeUnknown',
      previousOrderId: 'old-order',
      cancellation: { status: 'outcomeUnknown', outcomeReason: 'timeout' },
    });
    expect(payloads).toEqual([{ type: 'cancelOrder', orderId: 'old-order' }]);
    client.close();
  });

  it('reports when cancellation succeeded but the replacement was definitely not sent', async () => {
    let connection = 0;
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        connection += 1;
        if (connection > 1) return new EventEmitterOnlySocket();
        const socket = new FakeSocket((payload, id) => {
          if (payload.type === 'cancelOrder') {
            socket.emit('message', `${id} A ${JSON.stringify({ status: 'succeeded', orderId: 'old-order' })}`);
          }
        });
        return socket;
      },
    });

    await expect(client.orders.replace('old-order', preparedReplacement(), {
      submissionTimeoutMs: 1,
    })).resolves.toMatchObject({
      status: 'replacementNotSent',
      previousOrderId: 'old-order',
      cancellation: { status: 'succeeded' },
      error: { deliveryState: 'notSent', outcomeUnknown: false },
    });
    client.close();
  });

  it('returns outcomeUnknown and never replays cancellation after connection loss', async () => {
    const payloads: Record<string, unknown>[] = [];
    const client = TradeRepublicClient.create({
      websocketReconnectDelayMs: 0,
      websocketFactory: () => {
        const socket = new FakeSocket((payload) => {
          if (payload.type !== 'cancelOrder') return;
          payloads.push(payload);
          if (payloads.length === 1) queueMicrotask(() => socket.emit('close', 1006, Buffer.from('network lost')));
        });
        return socket;
      },
    });

    const result = await client.orders.cancel('order-1');

    expect(result).toMatchObject({
      orderId: 'order-1',
      status: 'outcomeUnknown',
      outcomeReason: 'disconnect',
      connectionLoss: { code: 1006, reason: 'network lost' },
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(payloads).toHaveLength(1);
    client.close();
  });

  it('returns outcomeUnknown when a sent cancellation times out', async () => {
    const client = TradeRepublicClient.create({ websocketFactory: () => new FakeSocket() });

    const result = await client.orders.cancel('order-1', { timeoutMs: 1 });

    expect(result).toMatchObject({
      orderId: 'order-1',
      status: 'outcomeUnknown',
      outcomeReason: 'timeout',
    });
    client.close();
  });

  it('finishes the isolated reconnect lifecycle after an ambiguous mutation', async () => {
    const disconnects: unknown[] = [];
    const reconnects: unknown[] = [];
    let resolveReconnect!: () => void;
    const reconnected = new Promise<void>((resolve) => { resolveReconnect = resolve; });
    let submissions = 0;
    const client = TradeRepublicClient.create({
      websocketMode: 'isolated',
      websocketReconnectDelayMs: 0,
      onWebSocketDisconnect: (event) => { disconnects.push(event); },
      onWebSocketReconnect: (event) => {
        reconnects.push(event);
        resolveReconnect();
      },
      websocketFactory: () => {
        const socket = new FakeSocket((payload) => {
          if (payload.type !== 'simpleCreateOrder') return;
          submissions += 1;
          if (submissions === 1) queueMicrotask(() => socket.emit('close', 1006, Buffer.from('network lost')));
        });
        return socket;
      },
    });

    const pending = client.orders.submit({
      instrumentId: 'US0378331005', exchangeId: 'LSX', side: 'buy', mode: 'market', size: 1,
      lastClientPrice: 201.5, clientProcessId: 'isolated-process-1', secAccNo: '0000000000',
    });
    const result = await pending;
    await Promise.race([
      reconnected,
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('timed out waiting for isolated reconnect')), 1_000)),
    ]);

    expect(result.status).toBe('outcomeUnknown');
    expect(submissions).toBe(1);
    expect(disconnects).toHaveLength(1);
    expect(reconnects).toHaveLength(1);
    client.close();
  });

  it('rejects malformed order options before opening a websocket', async () => {
    let sockets = 0;
    const client = TradeRepublicClient.create({ websocketFactory: () => { sockets += 1; return new FakeSocket(); } });
    await assert.rejects(client.orders.prepare({
      instrumentId: 'US0378331005', exchangeId: 'LSX', side: 'buy', mode: 'limit', size: 1, secAccNo: '1',
    }), /limit is required/);
    assert.equal(sockets, 0);
  });

  it('maps friendly month and year validity choices to broker expiry payloads', async () => {
    const client = TradeRepublicClient.create();
    const base = {
      instrumentId: 'DE000FC95YR4',
      exchangeId: 'SGL',
      side: 'sell' as const,
      mode: 'stopMarket' as const,
      size: 3,
      stop: 0.8,
      secAccNo: '0000000000',
    };

    const month = await client.orders.prepare({
      ...base,
      validity: { type: 'month', referenceDate: '2026-07-16' },
    });
    const year = await client.orders.prepare({
      ...base,
      validity: { type: 'year', referenceDate: '2026-07-16' },
    });
    const goodTillCancelled = await client.orders.prepare({ ...base, validity: 'goodTillCancelled' });
    const endOfMonth = await client.orders.prepare({ ...base, validity: 'endOfMonth' });

    expect(month.parameters.expiry).toEqual({ type: 'gtd', value: '2026-08-15' });
    expect(year.parameters.expiry).toEqual({ type: 'gtd', value: '2027-07-16' });
    expect(goodTillCancelled.parameters.expiry).toEqual({ type: 'gtc' });
    expect(endOfMonth.parameters.expiry).toEqual({ type: 'eom' });
  });

  it('normalizes explicit validity dates and timestamps to broker gtd dates', async () => {
    const client = TradeRepublicClient.create();
    const base = {
      instrumentId: 'DE0007164600',
      exchangeId: 'LSX',
      side: 'buy' as const,
      mode: 'limit' as const,
      size: 1,
      limit: 100,
      secAccNo: '0000000000',
    };

    const date = await client.orders.prepare({ ...base, validity: { type: 'date', value: '2026-10-20' } });
    const isoTimestamp = await client.orders.prepare({
      ...base,
      validity: { type: 'date', value: '2026-10-20T21:59:59.000Z' },
    });
    const dateObject = await client.orders.prepare({
      ...base,
      validity: { type: 'date', value: new Date('2026-10-20T21:59:59.000Z') },
    });
    const unixMilliseconds = await client.orders.prepare({
      ...base,
      validity: { type: 'date', value: Date.parse('2026-10-20T21:59:59.000Z') },
    });

    for (const order of [date, isoTimestamp, dateObject, unixMilliseconds]) {
      expect(order.parameters.expiry).toEqual({ type: 'gtd', value: '2026-10-20' });
    }
    await assert.rejects(
      client.orders.prepare({ ...base, validity: { type: 'date', value: '2026-02-30' } }),
      /date validity requires/i,
    );
  });

  it('allows manual orders only during the guarded Berlin weekday window', () => {
    assert.equal(isOpenBerlinWindow(new Date('2026-07-22T04:59:00Z')), false);
    assert.equal(isOpenBerlinWindow(new Date('2026-07-22T05:00:00Z')), true);
    assert.equal(isOpenBerlinWindow(new Date('2026-07-22T20:39:00Z')), true);
    assert.equal(isOpenBerlinWindow(new Date('2026-07-22T20:40:00Z')), false);
    assert.equal(isOpenBerlinWindow(new Date('2026-07-25T10:00:00Z')), false);
  });

  it('selects only an open Nvidia limit venue with a bid of at least EUR 10', async () => {
    const client = {
      trading: {
        async orderDestinations(instrumentId: string) {
          assert.equal(instrumentId, 'US67066G1040');
          return [
            { id: 'CLOSED', open: false, orderModes: ['limit'] },
            { id: 'OPEN', open: true, orderModes: ['limit'] },
          ];
        },
      },
      market: {
        async quote(_instrumentId: string, exchangeId: string) {
          return { bid: exchangeId === 'OPEN' ? 200 : 0 };
        },
      },
    } as unknown as TradeRepublicClient;

    assert.deepEqual(await selectNvidiaLimitOrderCandidate(client), {
      instrumentId: 'US67066G1040',
      destination: { id: 'OPEN', open: true, orderModes: ['limit'] },
    });
  });
});
