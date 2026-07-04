import { describe, expect, it } from './test-compat.js';
import { MemorySessionStore, redactSession } from '../src/session.js';

describe('session stores', () => {
  it('redacts sensitive session fields', () => {
    expect(redactSession({
      accessToken: 'access',
      refreshToken: 'refresh',
      sessionToken: 'session',
      accountId: 'account',
      cookies: { tr_session: 'cookie' },
    })).toEqual({
      accessToken: '[redacted]',
      refreshToken: '[redacted]',
      sessionToken: '[redacted]',
      accountId: 'account',
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
});
