import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Session, SessionStore } from './types.js';

const SECRET_KEYS = new Set(['accessToken', 'refreshToken', 'sessionToken', 'cookies']);

export function redactSession(session: Session): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(session).map(([key, value]) => [key, SECRET_KEYS.has(key) ? '[redacted]' : value]),
  );
}

export class MemorySessionStore implements SessionStore {
  private session: Session | undefined;

  async load(): Promise<Session | undefined> {
    return this.session ? structuredClone(this.session) : undefined;
  }

  async save(session: Session): Promise<void> {
    this.session = structuredClone(session);
  }

  async clear(): Promise<void> {
    this.session = undefined;
  }
}

export class FileSessionStore implements SessionStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<Session | undefined> {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8')) as Session;
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT') return undefined;
      if (error instanceof SyntaxError) return undefined;
      throw error;
    }
  }

  async save(session: Session): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
  }

  async clear(): Promise<void> {
    await rm(this.filePath, { force: true });
  }
}
