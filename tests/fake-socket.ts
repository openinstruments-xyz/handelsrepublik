import { EventEmitter } from 'node:events';
import type { WebSocketLike } from '../src/types.js';

export class FakeSocket extends EventEmitter implements WebSocketLike {
  readonly sent: string[] = [];

  constructor(private readonly onSubscribe?: (payload: Record<string, unknown>, id: number) => void) {
    super();
    queueMicrotask(() => this.emit('open'));
  }

  send(data: string | ArrayBuffer | Buffer): void {
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
