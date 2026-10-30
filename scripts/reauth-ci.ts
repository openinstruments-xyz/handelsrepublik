import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  collectTradeRepublicWebContext,
  FileSessionStore,
  MemorySessionStore,
  TradeRepublicClient,
  TradeRepublicHttpError,
  toTradeRepublicWafToken,
} from '../src/index.js';
import type { Session, TradeRepublicBrowserLike, TradeRepublicWebContext } from '../src/index.js';

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
  pin?(sessionPath: string): Promise<boolean>;
}

type CiReauthMode = 'enroll' | 'refresh' | 'check-session' | 'pin';

interface ParsedOptions {
  options: Options;
  mode: CiReauthMode;
}

const DEFAULT_REPOSITORY = 'openinstruments-xyz/handelsrepublik';

export class SavedSessionUnavailableError extends Error {}

export async function checkCiSession(refresh: () => Promise<void>): Promise<boolean> {
  try {
    await refresh();
    return true;
  } catch (error) {
    if (error instanceof SavedSessionUnavailableError
      || (error instanceof TradeRepublicHttpError && error.status === 401)) {
      console.log('Saved CI session unavailable or expired; skipping authenticated tests without starting a login.');
      return false;
    }
    throw error;
  }
}

export function isCiPinLoginAllowed(
  context: { eventName?: string; schedule?: string; runAttempt?: string },
  now = new Date(),
): boolean {
  const localTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(now);
  // Ignore reruns, manual requests, and schedules delayed beyond the phone-approval window.
  return context.eventName === 'schedule' && context.schedule === '0 15 * * *'
    && context.runAttempt === '1' && /^(15|16|17):\d{2}$/.test(localTime);
}

function ciPinLoginAllowedNow(): boolean {
  return process.env.GITHUB_ACTIONS !== 'true' || isCiPinLoginAllowed({
    eventName: process.env.GITHUB_EVENT_NAME ?? '',
    schedule: process.env.TR_LOGIN_SCHEDULE ?? '',
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? '',
  });
}

export async function runCiReauth(
  sessionPath: string | undefined,
  options: Options,
  operations: ReauthOperations,
  mode: CiReauthMode = 'enroll',
): Promise<boolean | void> {
  if (mode === 'refresh' || mode === 'check-session' || mode === 'pin') {
    assert.ok(sessionPath, `TR_SESSION_FILE is required for --${mode}.`);
    if (mode === 'pin') {
      assert.ok(operations.pin, 'PIN login operation is required.');
      return operations.pin(sessionPath);
    } else if (mode === 'check-session') {
      return checkCiSession(() => operations.refresh(sessionPath));
    } else {
      await operations.refresh(sessionPath);
    }
    return;
  }
  await operations.enroll(options);
}

export async function loginWithCiPin(
  client: Pick<TradeRepublicClient, 'auth'>,
  credentials: { phoneNumber?: string | undefined; pin?: string | undefined },
): Promise<Session> {
  const phoneNumber = credentials.phoneNumber?.trim();
  const pin = credentials.pin?.trim();
  assert.ok(phoneNumber && pin, 'TR_PHONE_NUMBER and TR_PIN are required for CI PIN login.');
  console.log('Approve the Trade Republic login in the app within two minutes.');
  try {
    return await client.auth.loginWithPin({
      phoneNumber,
      pin,
      otpLess: true,
      timeoutMs: 120_000,
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    // Do not print API response bodies or causes from a credentialed login.
    if (error instanceof TradeRepublicHttpError) {
      throw new Error(`Trade Republic CI PIN login failed (HTTP ${error.status}).`);
    }
    throw new Error('Trade Republic CI PIN login was not approved or could not finish within two minutes.');
  }
}

async function loginSavedSessionWithPin(sessionPath: string): Promise<boolean> {
  if (!ciPinLoginAllowedNow()) {
    console.log('Skipping PIN login: only the daily first scheduled run from 15:00 until 18:00 Europe/Berlin may request approval.');
    return false;
  }
  assert.ok(process.env.TR_PHONE_NUMBER?.trim() && process.env.TR_PIN?.trim(),
    'TR_PHONE_NUMBER and TR_PIN are required for CI PIN login.');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  let client: TradeRepublicClient | undefined;
  try {
    const webContext = await collectTradeRepublicWebContext(browser, {
      timeoutMs: 60_000,
      settleMs: 1_000,
    });
    if (!ciPinLoginAllowedNow()) {
      console.log('Skipping PIN login: browser setup finished outside the daily approval window.');
      return false;
    }
    // Start with fresh browser proof and device information, without stale auth cookies.
    client = TradeRepublicClient.create({ webContext, wafToken: toTradeRepublicWafToken(webContext) });
    const authenticated = await loginWithCiPin(client, {
      phoneNumber: process.env.TR_PHONE_NUMBER,
      pin: process.env.TR_PIN,
    });
    const session = completeFreshEnrollmentSession(authenticated, webContext);
    await new FileSessionStore(sessionPath).save(session);
    console.log('Trade Republic CI PIN login approved; saved the new session.');
    return true;
  } finally {
    client?.close();
    await browser.close();
  }
}

async function refreshSavedSession(sessionPath: string): Promise<void> {
  const client = TradeRepublicClient.create({
    sessionStore: new FileSessionStore(sessionPath),
  });
  try {
    const restored = await client.auth.restoreSession();
    if (!restored) throw new SavedSessionUnavailableError('The saved CI session could not be restored.');
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
    console.log('Collecting the Trade Republic web context...');
    const webContext = await collectTradeRepublicWebContext(browser, {
      timeoutMs: 60_000,
      settleMs: 1_000,
    });
    client = TradeRepublicClient.create({
      sessionStore,
      webContext,
      wafToken: toTradeRepublicWafToken(webContext),
    });

    const authenticatedSession = await loginWithRotatingQr(client, options);
    const session = completeFreshEnrollmentSession(authenticatedSession, webContext);
    client.setSession(session);
    await client.auth.saveSession(session);
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

export function completeFreshEnrollmentSession(
  session: Session,
  webContext: TradeRepublicWebContext,
): Session {
  const completeSession = {
    ...session,
    webContext: structuredClone(webContext),
  };
  assertAuthMaterial(completeSession);
  assertCompleteWebContext(completeSession.webContext);
  return completeSession;
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

function parseOptions(args: string[]): ParsedOptions | undefined {
  const options: Options = {
    repo: DEFAULT_REPOSITORY,
    secret: 'TR_SESSION_JSON',
    environment: 'Live Integration Tests',
    deviceName: 'handelsrepublik github actions',
    timeoutMs: 10 * 60_000,
    debug: false,
  };
  let mode: CiReauthMode = 'enroll';

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--refresh') mode = 'refresh';
    else if (argument === '--check-session') mode = 'check-session';
    else if (argument === '--pin') mode = 'pin';
    else if (argument === '--debug') options.debug = true;
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

Starts a fresh interactive QR enrollment and updates the environment secret.
It ignores TR_SESSION_FILE so that an old partial session cannot be reused.
Use --refresh only for the scheduled GitHub Actions refresh workflow.

Options:
  --refresh                Refresh TR_SESSION_FILE instead of interactive enrollment
  --check-session          Refresh without login; report session_valid=false for missing/expired sessions
  --pin                    Log in with TR_PHONE_NUMBER/TR_PIN; wait at most two minutes
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
  return { options, mode };
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

function assertCompleteWebContext(webContext: TradeRepublicWebContext | undefined): void {
  assert.ok(webContext, 'The new Trade Republic session contains no browser web context.');
  toTradeRepublicWafToken(webContext);
  const hasCookies = Boolean(webContext.cookieHeader || Object.keys(webContext.cookies ?? {}).length > 0);
  assert.ok(hasCookies, 'The new Trade Republic session browser context contains no cookies.');
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0);
}

async function main(): Promise<void> {
  const parsed = parseOptions(process.argv.slice(2));
  if (!parsed) return;
  const valid = await runCiReauth(process.env.TR_SESSION_FILE, parsed.options, {
    refresh: refreshSavedSession,
    enroll: enrollRepositorySession,
    pin: loginSavedSessionWithPin,
  }, parsed.mode);
  if (typeof valid === 'boolean' && process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `session_valid=${valid}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
