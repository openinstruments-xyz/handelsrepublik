import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import { describe, expect, it } from './test-compat.js';
import { MapperRequestError, TradeRepublicClient } from '../src/index.js';
import type { WebSocketLike } from '../src/types.js';

describe('mapper connection', () => {
  it('multiplexes concurrent subscriptions over one shared socket', () => {
    const sockets: ManualSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketFactory: () => {
        const socket = new ManualSocket();
        sockets.push(socket);
        return socket;
      },
    });

    const first = client.raw.subscribeResource({ type: 'tickerV3', isin: 'US1' });
    const second = client.raw.subscribeResource({ type: 'L2', isin: 'US1' });

    expect(sockets).toHaveLength(1);
    sockets[0]?.emit('open');
    sockets[0]?.emit('message', 'connected');
    expect(sockets[0]?.sent[1]).toBe('sub 1 {"type":"tickerV3","isin":"US1"}');
    expect(sockets[0]?.sent[2]).toBe('sub 2 {"type":"L2","isin":"US1"}');

    first.close();
    expect(sockets[0]?.closed).toBe(false);
    second.close();
    expect(sockets[0]?.closed).toBe(true);
  });

  it('keeps isolated mode available for protocol troubleshooting', () => {
    const sockets: ManualSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketMode: 'isolated',
      websocketFactory: () => {
        const socket = new ManualSocket();
        sockets.push(socket);
        return socket;
      },
    });

    const first = client.raw.subscribeResource({ type: 'tickerV3' });
    const second = client.raw.subscribeResource({ type: 'L2' });

    expect(sockets).toHaveLength(2);
    client.close();
    expect(sockets.every((socket) => socket.closed)).toBe(true);
    first.close();
    second.close();
  });

  it('reconnects active subscriptions after an unexpected close', async () => {
    const sockets: ManualSocket[] = [];
    const disconnects: any[] = [];
    const reconnects: any[] = [];
    const client = TradeRepublicClient.create({
      websocketReconnectDelayMs: 0,
      onWebSocketDisconnect: (event) => { disconnects.push(event); },
      onWebSocketReconnect: (event) => { reconnects.push(event); },
      websocketFactory: () => {
        const socket = new ManualSocket();
        sockets.push(socket);
        return socket;
      },
    });
    const subscription = client.raw.subscribeResource({ type: 'tickerV3', isin: 'US1' });
    sockets[0]?.emit('open');
    sockets[0]?.emit('message', 'connected');

    sockets[0]?.emit('close', 1006, Buffer.from('network lost'));
    await Promise.resolve();
    expect(disconnects).toEqual([{ code: 1006, reason: 'network lost' }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sockets).toHaveLength(2);
    sockets[1]?.emit('open');
    sockets[1]?.emit('message', 'connected');
    await Promise.resolve();
    expect(sockets[1]?.sent[1]).toBe('sub 1 {"type":"tickerV3","isin":"US1"}');
    expect(reconnects).toHaveLength(1);
    expect(reconnects[0]?.reconnectAttempts).toBe(1);
    expect(typeof reconnects[0]?.downtimeMs).toBe('number');
    subscription.close();
  });

  it('does not report expected session refreshes as disconnects', async () => {
    const sockets: ManualSocket[] = [];
    const disconnects: unknown[] = [];
    const reconnects: unknown[] = [];
    const client = TradeRepublicClient.create({
      onWebSocketDisconnect: (event) => { disconnects.push(event); },
      onWebSocketReconnect: (event) => { reconnects.push(event); },
      websocketFactory: () => {
        const socket = new ManualSocket();
        sockets.push(socket);
        return socket;
      },
    });
    const subscription = client.raw.subscribeResource({ type: 'tickerV3' });
    sockets[0]?.emit('open');
    sockets[0]?.emit('message', 'connected');

    client.setSession({ sessionToken: 'fresh' });
    sockets[1]?.emit('open');
    sockets[1]?.emit('message', 'connected');
    await Promise.resolve();

    expect(disconnects).toHaveLength(0);
    expect(reconnects).toHaveLength(0);
    expect(sockets[1]?.sent[1]).toContain('tickerV3');
    subscription.close();
  });

  it('rejects initial connection failures as definitely not sent', async () => {
    const client = TradeRepublicClient.create({
      websocketFactory: () => { throw new Error('factory failed'); },
    });
    const subscription = client.raw.subscribeResource({ type: 'simpleCreateOrder' });

    await assert.rejects(subscription[Symbol.asyncIterator]().next(), (error: unknown) => {
      assert.ok(error instanceof MapperRequestError);
      assert.equal(error.reason, 'connectFailure');
      assert.equal(error.deliveryState, 'notSent');
      assert.equal(error.outcomeUnknown, false);
      return true;
    });
  });

  it('rejects a stalled initial handshake instead of hanging', async () => {
    const client = TradeRepublicClient.create({
      websocketHandshakeTimeoutMs: 1,
      websocketFactory: () => new ManualSocket(),
    });
    const subscription = client.raw.subscribeResource({ type: 'simpleCreateOrder' });

    await assert.rejects(subscription[Symbol.asyncIterator]().next(), (error: unknown) => {
      assert.ok(error instanceof MapperRequestError);
      assert.equal(error.reason, 'handshakeTimeout');
      assert.equal(error.deliveryState, 'notSent');
      return true;
    });
  });

  it('retries safely when subscription send throws before accepting bytes', async () => {
    const sockets: ManualSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketReconnectDelayMs: 0,
      websocketFactory: () => {
        const socket = new ManualSocket(sockets.length === 0 ? (data) => String(data).startsWith('sub ') : undefined);
        sockets.push(socket);
        return socket;
      },
    });
    const subscription = client.raw.subscribeResource({ type: 'simpleCreateOrder' });
    sockets[0]?.emit('open');
    sockets[0]?.emit('message', 'connected');
    await new Promise((resolve) => setTimeout(resolve, 0));
    sockets[1]?.emit('open');
    sockets[1]?.emit('message', 'connected');

    expect(subscription.deliveryState).toBe('sent');
    expect(sockets[1]?.sent[1]).toContain('simpleCreateOrder');
    subscription.close();
  });

  it('keeps retrying an outage when a reconnect factory attempt throws', async () => {
    const sockets: ManualSocket[] = [];
    let attempts = 0;
    const client = TradeRepublicClient.create({
      websocketReconnectDelayMs: 0,
      websocketFactory: () => {
        attempts += 1;
        if (attempts === 2) throw new Error('temporary factory failure');
        const socket = new ManualSocket();
        sockets.push(socket);
        return socket;
      },
    });
    const subscription = client.raw.subscribeResource({ type: 'tickerV3' });
    sockets[0]?.emit('open');
    sockets[0]?.emit('message', 'connected');
    sockets[0]?.emit('close', 1006);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(attempts).toBe(3);
    sockets[1]?.emit('open');
    sockets[1]?.emit('message', 'connected');
    expect(sockets[1]?.sent[1]).toContain('tickerV3');
    subscription.close();
  });

  it('starts recovery from an error event even when no close follows', async () => {
    const sockets: ManualSocket[] = [];
    const disconnects: unknown[] = [];
    const client = TradeRepublicClient.create({
      websocketReconnectDelayMs: 0,
      onWebSocketDisconnect: (event) => { disconnects.push(event); },
      websocketFactory: () => {
        const socket = new ManualSocket();
        sockets.push(socket);
        return socket;
      },
    });
    const subscription = client.raw.subscribeResource({ type: 'tickerV3' });
    sockets[0]?.emit('open');
    sockets[0]?.emit('message', 'connected');
    sockets[0]?.emit('error', new Error('transport failed'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(disconnects).toHaveLength(1);
    expect(sockets).toHaveLength(2);
    sockets[1]?.emit('open');
    sockets[1]?.emit('message', 'connected');
    expect(sockets[1]?.sent[1]).toContain('tickerV3');
    subscription.close();
  });

  it('replays reads but terminates a sent mutation sharing the same socket', async () => {
    const sockets: ManualSocket[] = [];
    const client = TradeRepublicClient.create({
      websocketReconnectDelayMs: 0,
      websocketFactory: () => {
        const socket = new ManualSocket();
        sockets.push(socket);
        return socket;
      },
    });
    const read = client.raw.subscribeResource({ type: 'tickerV3' });
    const mutation = client.raw.subscribeResource({ type: 'simpleCreateOrder' });
    const mutationNext = mutation[Symbol.asyncIterator]().next();
    sockets[0]?.emit('open');
    sockets[0]?.emit('message', 'connected');
    sockets[0]?.emit('close', 1006);

    await assert.rejects(mutationNext, (error: unknown) => error instanceof MapperRequestError && error.deliveryState === 'sent');
    await new Promise((resolve) => setTimeout(resolve, 0));
    sockets[1]?.emit('open');
    sockets[1]?.emit('message', 'connected');

    expect(sockets[1]?.sent.some((message) => message.includes('tickerV3'))).toBe(true);
    expect(sockets[1]?.sent.some((message) => message.includes('simpleCreateOrder'))).toBe(false);
    read.close();
  });

  it('isolates callback failures and supports repeated outage cycles', async () => {
    const sockets: ManualSocket[] = [];
    let disconnects = 0;
    let reconnects = 0;
    const client = TradeRepublicClient.create({
      websocketReconnectDelayMs: 0,
      onWebSocketDisconnect: () => {
        disconnects += 1;
        throw new Error('consumer disconnect callback failed');
      },
      onWebSocketReconnect: async () => {
        reconnects += 1;
        throw new Error('consumer reconnect callback failed');
      },
      websocketFactory: () => {
        const socket = new ManualSocket();
        sockets.push(socket);
        return socket;
      },
    });
    const subscription = client.raw.subscribeResource({ type: 'tickerV3' });
    sockets[0]?.emit('open');
    sockets[0]?.emit('message', 'connected');
    sockets[0]?.emit('close', 1006);
    await new Promise((resolve) => setTimeout(resolve, 0));
    sockets[1]?.emit('open');
    sockets[1]?.emit('message', 'connected');
    sockets[1]?.emit('close', 1006);
    await new Promise((resolve) => setTimeout(resolve, 0));
    sockets[2]?.emit('open');
    sockets[2]?.emit('message', 'connected');
    await Promise.resolve();

    expect(disconnects).toBe(2);
    expect(reconnects).toBe(2);
    subscription.close();
  });
});

class ManualSocket extends EventEmitter implements WebSocketLike {
  readonly sent: string[] = [];
  closed = false;

  constructor(private readonly shouldThrow?: (data: string | ArrayBuffer | Buffer) => boolean) {
    super();
  }

  send(data: string | ArrayBuffer | Buffer): void {
    if (this.shouldThrow?.(data)) throw new Error('send failed');
    this.sent.push(String(data));
  }

  close(): void {
    this.closed = true;
    this.emit('close');
  }
}
