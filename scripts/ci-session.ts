import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { FileSessionStore, TradeRepublicClient } from '../src/index.js';
import type { Session } from '../src/index.js';

const [command, fileArgument] = process.argv.slice(2);

if (!fileArgument || (command !== 'materialize' && command !== 'refresh')) {
  throw new Error('Usage: ci-session.ts <materialize|refresh> <session-file>');
}

const sessionPath = resolve(fileArgument);

if (command === 'materialize') {
  const serialized = process.env.TR_SESSION_JSON;
  assert.ok(serialized, 'The TR_SESSION_JSON GitHub Actions secret is missing or empty.');

  const session = parseSession(serialized);
  assertAuthMaterial(session);
  await mkdir(dirname(sessionPath), { recursive: true });
  await writeFile(sessionPath, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
  console.log('Materialized the encrypted Trade Republic test session.');
} else {
  const sessionStore = new FileSessionStore(sessionPath);
  const client = TradeRepublicClient.create({ sessionStore });
  const restored = await client.auth.restoreSession();
  assert.ok(restored, 'The materialized Trade Republic session could not be restored.');
  assertAuthMaterial(restored);

  const refreshed = await client.auth.refreshSession();
  assertAuthMaterial(refreshed);

  // refreshSession persists through FileSessionStore. Reading it back catches
  // accidental persistence regressions before the GitHub secret is rotated.
  const persisted = parseSession(await readFile(sessionPath, 'utf8'));
  assertAuthMaterial(persisted);
  console.log('Refreshed and persisted the Trade Republic test session.');
}

function parseSession(serialized: string): Session {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error('The Trade Republic Actions session secret is not valid JSON.');
  }

  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'The Trade Republic Actions session secret must contain a JSON object.');
  return value as Session;
}

function assertAuthMaterial(session: Session): void {
  const hasCookies = Boolean(session.cookies && Object.keys(session.cookies).length > 0);
  const hasToken = [session.accessToken, session.refreshToken, session.sessionToken]
    .some((value) => typeof value === 'string' && value.length > 0);
  assert.ok(hasCookies || hasToken, 'The Trade Republic session does not contain cookies or tokens.');
}
