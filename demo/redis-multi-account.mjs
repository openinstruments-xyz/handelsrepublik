import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { Redis } from 'ioredis';
import { TradeRepublicClient } from '../dist/index.js';

// ---------------------------------------------------------------------------
// Demo configuration
// ---------------------------------------------------------------------------

// These are application-level identifiers, not Trade Republic credentials.
// Every account receives its own SDK client and its own Redis session key.
const ACCOUNT_IDS = ['alice', 'bob'];

// Change this when Redis is not running locally or requires authentication.
// ioredis also supports URLs such as redis://username:password@host:6379/0.
// Do not commit a URL containing production credentials.
const REDIS_URL = 'redis://127.0.0.1:6379';

// All account-specific session keys are stored below this Redis namespace.
const REDIS_SESSION_NAMESPACE = 'handelsrepublik:sessions';

// Replace this placeholder with a stable, base64-encoded 32-byte secret.
// Generate one once with:
// node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
// Do not commit the real key. Changing it makes existing sessions unreadable.
const SESSION_ENCRYPTION_KEY_BASE64 = 'REPLACE_ME';

// Keep this false to see the WAF browser. Set it to true on a host where
// headless Chromium can pass Trade Republic's WAF challenge.
const WAF_BROWSER_HEADLESS = process.env.WAF_BROWSER_HEADLESS;

// Maximum total time for QR login, including automatic QR/challenge rotation.
const QR_LOGIN_TIMEOUT_MS = 10 * 60_000;

const encryptionKey = readEncryptionKey(SESSION_ENCRYPTION_KEY_BASE64);
const redis = new Redis(REDIS_URL);
const clients = new Map();

redis.on('error', (error) => {
  console.error('Redis connection error:', error.message);
});

try {
  await redis.ping();

  // This proof is anonymous and may be shared by account-specific clients.
  const wafContext = await TradeRepublicClient.collectWafToken({
    browserLaunchOptions: {
      headless: WAF_BROWSER_HEADLESS,
    },
  });

  for (const accountId of ACCOUNT_IDS) {
    const sessionStore = new EncryptedRedisSessionStore(
      redis,
      sessionKey(REDIS_SESSION_NAMESPACE, accountId),
      encryptionKey,
    );
    const client = TradeRepublicClient.create({
      wafContext,
      sessionStore,
      rawSchemaValidation: 'passthrough',
      onRawSchemaValidationFailure({ schemaName, error }) {
        console.warn(
          `[${accountId}] Trade Republic schema drift in ${schemaName}:`,
          error.message,
        );
      },
    });
    clients.set(accountId, client);
  }

  await Promise.all([...clients].map(async ([accountId, client]) => {
    await authenticate(accountId, client);
    const cash = await client.portfolio.cash();
    const amount = cash.amount ?? 'unknown';
    const currency = cash.currency ?? '';
    console.log(`[${accountId}] authenticated; cash=${amount} ${currency}`.trim());
  }));
} finally {
  for (const client of clients.values()) client.close();
  redis.disconnect();
}

// ---------------------------------------------------------------------------
// Account authentication
// ---------------------------------------------------------------------------

async function authenticate(accountId, client) {
  let session = await client.auth.restoreSession();

  if (session) {
    session = await client.auth.refreshSession().catch(async (error) => {
      console.warn(
        `[${accountId}] saved session is invalid; starting QR login:`,
        error.message,
      );
      await client.auth.clearSession();
      return undefined;
    });
  }

  if (!session) {
    session = await client.auth.loginWithQr({
      deviceName: 'handelsrepublik redis demo',
      timeoutMs: QR_LOGIN_TIMEOUT_MS,
      onChallengeUpdate(challenge) {
        publishLoginChallenge(accountId, challenge);
      },
    });
  }

  // loginWithQr() and refreshSession() already save through this account's
  // RedisSessionStore. Use auth.saveSession(session) only for an explicit save.
  return session;
}

function publishLoginChallenge(accountId, challenge) {
  // In a real backend, send this only to the authenticated owner over SSE or a
  // WebSocket. QR values are short-lived authentication secrets; never
  // broadcast them.
  console.log(JSON.stringify({
    type: 'trade-republic.login-challenge',
    accountId,
    challengeId: challenge.id,
    qrCodeDataUrl: challenge.qrCodeDataUrl,
    deepLink: challenge.deepLink,
    qrCode: challenge.qrCode,
    challengeExpiresAt: challenge.challengeExpiresAt,
    qrCodeTokenExpiresAt: challenge.qrCodeTokenExpiresAt,
  }));
}

// ---------------------------------------------------------------------------
// Encrypted Redis SessionStore
// ---------------------------------------------------------------------------

class EncryptedRedisSessionStore {
  constructor(redisClient, key, keyBytes) {
    this.redis = redisClient;
    this.key = key;
    this.keyBytes = keyBytes;
  }

  async load() {
    const encrypted = await this.redis.get(this.key);
    return encrypted ? decryptSession(encrypted, this.keyBytes) : undefined;
  }

  async save(session) {
    await this.redis.set(this.key, encryptSession(session, this.keyBytes));
  }

  async clear() {
    await this.redis.del(this.key);
  }
}

// ---------------------------------------------------------------------------
// Encryption and Redis-key helpers
// ---------------------------------------------------------------------------

function encryptSession(session, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(session), 'utf8'),
    cipher.final(),
  ]);
  return JSON.stringify({
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    authenticationTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  });
}

function decryptSession(serialized, key) {
  const envelope = JSON.parse(serialized);
  if (envelope?.version !== 1 || envelope?.algorithm !== 'aes-256-gcm') {
    throw new Error('Unsupported encrypted Trade Republic session format.');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(envelope.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(envelope.authenticationTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8'));
}

function readEncryptionKey(value) {
  if (!value || value === 'REPLACE_ME') {
    throw new Error(
      'Replace SESSION_ENCRYPTION_KEY_BASE64 with a base64-encoded 32-byte key.',
    );
  }
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'SESSION_ENCRYPTION_KEY_BASE64 must be a base64-encoded 32-byte key.',
    );
  }
  return key;
}

function sessionKey(namespace, accountId) {
  const accountHash = createHash('sha256').update(accountId).digest('hex');
  return `${namespace}:${accountHash}`;
}
