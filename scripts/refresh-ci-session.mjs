import { access } from 'node:fs/promises';
import { FileSessionStore, TradeRepublicClient } from '../src/index.ts';

const sessionPath = process.env.TR_SESSION_FILE;
if (!sessionPath) throw new Error('TR_SESSION_FILE is required.');

await access(sessionPath);
const client = TradeRepublicClient.create({ sessionStore: new FileSessionStore(sessionPath) });
try {
  const restored = await client.auth.restoreSession();
  if (!restored) throw new Error('The saved CI session could not be restored.');
  await client.auth.refreshSession();
} finally {
  client.close();
}
