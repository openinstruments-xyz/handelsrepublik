import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from './test-compat.js';
import { FileSessionStore, MemorySessionStore, redactSession } from '../src/session.js';

describe('session stores', () => {
  it('redacts sensitive session fields', () => {
    expect(redactSession({
      accessToken: 'access',
      refreshToken: 'refresh',
      sessionToken: 'session',
      accountId: 'account',
      webContext: { awsWafToken: 'waf-token' },
      cookies: { tr_session: 'cookie' },
    })).toEqual({
      accessToken: '[redacted]',
      refreshToken: '[redacted]',
      sessionToken: '[redacted]',
      accountId: 'account',
      webContext: '[redacted]',
      cookies: '[redacted]',
    });
  });

  it('stores cloned session values in memory', async () => {
    const store = new MemorySessionStore();
    const session = { accessToken: 'a', metadata: { nested: true } };
    await store.save(session);
    session.accessToken = 'changed';
    expect(await store.load()).toEqual({ accessToken: 'a', metadata: { nested: true } });
    await store.clear();
    expect(await store.load()).toBeUndefined();
  });

  it('persists, restores, and clears file sessions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'handelsrepublik-session-'));
    const path = join(directory, 'nested', 'session.json');
    const store = new FileSessionStore(path);
    try {
      expect(await store.load()).toBeUndefined();
      await store.save({
        sessionToken: 'session-token',
        deviceInfo: {
          stableDeviceId: 'stored-fingerprint',
          preferredLanguages: ['de-DE', 'de'],
          numberOfCores: 8,
        },
        metadata: { source: 'test' },
      });
      expect(await store.load()).toEqual({
        sessionToken: 'session-token',
        deviceInfo: {
          stableDeviceId: 'stored-fingerprint',
          preferredLanguages: ['de-DE', 'de'],
          numberOfCores: 8,
        },
        metadata: { source: 'test' },
      });
      expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
        sessionToken: 'session-token',
        deviceInfo: {
          stableDeviceId: 'stored-fingerprint',
          preferredLanguages: ['de-DE', 'de'],
          numberOfCores: 8,
        },
        metadata: { source: 'test' },
      });
      await store.clear();
      expect(await store.load()).toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('treats malformed file sessions as unavailable', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'handelsrepublik-session-'));
    const path = join(directory, 'session.json');
    try {
      await writeFile(path, '{not-json', 'utf8');
      expect(await new FileSessionStore(path).load()).toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
