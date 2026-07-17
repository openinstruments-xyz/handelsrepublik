import { EventEmitter } from 'node:events';
import type { WebSocketLike } from '../src/types.js';

export class FakeSocket extends EventEmitter implements WebSocketLike {
  readonly sent: string[] = [];
  readonly binarySent: Uint8Array[] = [];

  constructor(
    private readonly onSubscribe?: (payload: Record<string, unknown>, id: number) => void,
    private readonly onBinarySubscribe?: (payload: Uint8Array) => void,
  ) {
    super();
    queueMicrotask(() => this.emit('open'));
  }

  send(data: string | ArrayBuffer | Buffer): void {
    if (typeof data !== 'string') {
      const payload = data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      this.binarySent.push(payload);
      queueMicrotask(() => this.onBinarySubscribe?.(payload));
      return;
    }
    const text = String(data);
    this.sent.push(text);
    if (text.startsWith('connect ')) {
      queueMicrotask(() => this.emit('message', 'connected'));
      return;
    }
    if (text.startsWith('sub ')) {
      const firstSpace = text.indexOf(' ');
      const secondSpace = text.indexOf(' ', firstSpace + 1);
      const id = Number(text.slice(firstSpace + 1, secondSpace));
      const payload = JSON.parse(text.slice(secondSpace + 1)) as Record<string, unknown>;
      queueMicrotask(() => this.onSubscribe?.(payload, id));
    }
  }

  close(): void {
    this.emit('close');
  }
}
