import { EventEmitter } from 'node:events';
import { describe, expect, it } from './test-compat.js';
import { TradeRepublicClient } from '../src/index.js';
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
});

class ManualSocket extends EventEmitter implements WebSocketLike {
  readonly sent: string[] = [];
  closed = false;

  send(data: string | ArrayBuffer | Buffer): void {
    this.sent.push(String(data));
  }

  close(): void {
    this.closed = true;
    this.emit('close');
  }
}
