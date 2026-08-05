import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  collectTradeRepublicWafToken,
  FileSessionStore,
  MemorySessionStore,
  TradeRepublicClient,
} from '../src/index.js';
import type { Session, TradeRepublicBrowserLike } from '../src/index.js';

const require = createRequire(import.meta.url);
const qrcodeTerminal = require('qrcode-terminal') as {
  generate(payload: string, options: { small: boolean }, callback: (output: string) => void): void;
};
const jsQR = require('jsqr') as (
  data: Uint8ClampedArray,
  width: number,
  height: number,
) => { data?: string } | null;
const { PNG } = require('pngjs') as {
  PNG: {
    sync: {
      read(buffer: Buffer): { data: Uint8Array; width: number; height: number };
    };
  };
};

interface Options {
  repo: string;
  secret: string;
  environment: string;
  deviceName: string;
  timeoutMs: number;
  debug: boolean;
}

interface ReauthOperations {
  refresh(sessionPath: string): Promise<void>;
  enroll(options: Options): Promise<void>;
}

const DEFAULT_REPOSITORY = 'openinstruments-xyz/handelsrepublik';

export async function runCiReauth(
  sessionPath: string | undefined,
  options: Options,
  operations: ReauthOperations,
): Promise<void> {
  if (sessionPath) {
    await operations.refresh(sessionPath);
    return;
  }
  await operations.enroll(options);
}

async function refreshSavedSession(sessionPath: string): Promise<void> {
  await access(sessionPath);
  const client = TradeRepublicClient.create({
    sessionStore: new FileSessionStore(sessionPath),
  });
  try {
    const restored = await client.auth.restoreSession();
    if (!restored) throw new Error('The saved CI session could not be restored.');
    await client.auth.refreshSession();
  } finally {
    client.close();
  }
}

async function enrollRepositorySession(options: Options): Promise<void> {
  await gh(['auth', 'status']);
  console.log(`GitHub repository: ${options.repo}`);

  const sessionStore = new MemorySessionStore();
  const browser = await launchBrowser();
  let client: TradeRepublicClient | undefined;

  try {
    console.log('Collecting the Trade Republic WAF token...');
    const wafToken = await collectTradeRepublicWafToken(browser, {
      timeoutMs: 60_000,
      settleMs: 1_000,
    });
    client = TradeRepublicClient.create({ sessionStore, wafToken });

    const session = await loginWithRotatingQr(client, options);
    assertAuthMaterial(session);
    console.log('Trade Republic login approved.');

    console.log(`Updating environment secret ${options.repo}/${options.environment}/${options.secret}...`);
    await gh(
      ['secret', 'set', options.secret, '--repo', options.repo, '--env', options.environment],
      `${JSON.stringify(session, null, 2)}\n`,
    );
    console.log('GitHub Actions session updated.');
  } finally {
    client?.close();
    await browser.close().catch(() => undefined);
  }
}

async function loginWithRotatingQr(
  client: TradeRepublicClient,
  options: Options,
): Promise<Session> {
  let challengeId: string | undefined;
  let displayedPayload: string | undefined;
  let attempt = 0;

  return client.auth.loginWithQr({
    deviceName: options.deviceName,
    intervalMs: 1_500,
    timeoutMs: options.timeoutMs,
    debug: options.debug,
    onChallengeUpdate(update) {
      const payload = firstString(update.qrCode, update.deepLink)
        ?? decodeQrDataUrl(firstString(update.qrCodeDataUrl));
      assert.ok(payload, 'Trade Republic did not return a usable QR payload.');
      if (payload === displayedPayload) return;

      const firstPayload = challengeId === undefined;
      const replacedChallenge = challengeId !== undefined && challengeId !== update.id;
      if (challengeId !== update.id) attempt += 1;
      challengeId = update.id;
      displayedPayload = payload;

      console.log(firstPayload
        ? `\nScan QR code ${attempt} with the Trade Republic app and approve the login:\n`
        : replacedChallenge
          ? '\nQR challenge expired. Scan the replacement QR code:\n'
          : '\nTrade Republic rotated the QR token. Scan the newest QR code:\n');
      console.log(renderQr(payload));
      console.log('Waiting for approval. Rotated QR tokens will appear automatically...');
    },
  });
}

async function launchBrowser(): Promise<TradeRepublicBrowserLike & { close(): Promise<void> }> {
  const { chromium } = await import('playwright');
  try {
    return await chromium.launch({ headless: false, channel: 'chrome' });
  } catch {
    return chromium.launch({ headless: false });
  }
}

function decodeQrDataUrl(dataUrl: string | undefined): string | undefined {
  if (!dataUrl?.startsWith('data:image/')) return undefined;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return undefined;
  const metadata = dataUrl.slice(0, comma);
  const encoded = dataUrl.slice(comma + 1);
  const buffer = metadata.includes(';base64')
    ? Buffer.from(encoded, 'base64')
    : Buffer.from(decodeURIComponent(encoded));
  const image = PNG.sync.read(buffer);
  return jsQR(
    new Uint8ClampedArray(image.data),
    image.width,
    image.height,
  )?.data;
}

function renderQr(payload: string): string {
  let output = '';
  qrcodeTerminal.generate(payload, { small: true }, (rendered) => {
    output = rendered;
  });
  return output;
}

function gh(args: string[], input?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'gh.exe' : 'gh', args, {
      stdio: [input === undefined ? 'inherit' : 'pipe', 'inherit', 'inherit'],
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`gh ${args.join(' ')} exited with code ${code ?? 'unknown'}.`));
    });
    if (input !== undefined) child.stdin?.end(input);
  });
}

function parseOptions(args: string[]): Options | undefined {
  const options: Options = {
    repo: DEFAULT_REPOSITORY,
    secret: 'TR_SESSION_JSON',
    environment: 'Live Integration Tests',
    deviceName: 'handelsrepublik github actions',
    timeoutMs: 10 * 60_000,
    debug: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--debug') options.debug = true;
    else if (argument === '--repo') options.repo = requiredValue(args, ++index, argument);
    else if (argument === '--secret') options.secret = requiredValue(args, ++index, argument);
    else if (argument === '--environment') options.environment = requiredValue(args, ++index, argument);
    else if (argument === '--device-name') options.deviceName = requiredValue(args, ++index, argument);
    else if (argument === '--timeout-minutes') {
      const minutes = Number(requiredValue(args, ++index, argument));
      assert.ok(Number.isFinite(minutes) && minutes > 0, '--timeout-minutes must be a positive number.');
      options.timeoutMs = minutes * 60_000;
    } else if (argument === '--help' || argument === '-h') {
      console.log(`Usage: npm run ci:reauth -- -- [options]

With TR_SESSION_FILE set, refreshes that saved session for GitHub Actions.
Without TR_SESSION_FILE, opens an interactive QR login and updates the environment secret.

Options:
  --repo OWNER/REPO       GitHub repository (default: ${DEFAULT_REPOSITORY})
  --secret NAME           Environment secret (default: TR_SESSION_JSON)
  --environment NAME      GitHub environment (default: Live Integration Tests)
  --device-name NAME      Trade Republic device label
  --timeout-minutes N     QR approval timeout (default: 10)
  --debug                 Print SDK authentication diagnostics`);
      return undefined;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  return options;
}

function requiredValue(args: string[], index: number, option: string): string {
  const value = args[index];
  assert.ok(value, `${option} requires a value.`);
  return value;
}

function assertAuthMaterial(session: Session): void {
  const hasCookies = Boolean(session.cookies && Object.keys(session.cookies).length > 0);
  const hasToken = [session.accessToken, session.refreshToken, session.sessionToken]
    .some((value) => typeof value === 'string' && value.length > 0);
  assert.ok(hasCookies || hasToken, 'The new Trade Republic session contains no cookies or tokens.');
  assert.ok(session.deviceInfo, 'The new Trade Republic session contains no device profile.');
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (!options) return;
  await runCiReauth(process.env.TR_SESSION_FILE, options, {
    refresh: refreshSavedSession,
    enroll: enrollRepositorySession,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
