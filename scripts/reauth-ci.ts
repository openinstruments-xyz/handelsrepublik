import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  collectTradeRepublicWebContext,
  MemorySessionStore,
  TradeRepublicClient,
} from '../src/index.js';
import type {
  Session,
  TradeRepublicBrowserLike,
} from '../src/index.js';

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
  repo?: string;
  secret: string;
  workflow: string;
  ref: string;
  deviceName: string;
  timeoutMs: number;
  watch: boolean;
  debug: boolean;
}

const options = parseOptions(process.argv.slice(2));

await run();

async function run(): Promise<void> {
  await gh(['auth', 'status']);
  const repo = options.repo ?? await detectRepository();
  console.log(`GitHub repository: ${repo}`);

  const sessionStore = new MemorySessionStore();
  const browser = await launchBrowser();
  let client: TradeRepublicClient | undefined;

  try {
    console.log('Collecting the Trade Republic browser/WAF context...');
    const webContext = await collectTradeRepublicWebContext(browser, {
      timeoutMs: 60_000,
      settleMs: 1_000,
    });
    client = TradeRepublicClient.create({ sessionStore, webContext });

    const session = await loginWithRotatingQr(client);
    assertAuthMaterial(session);
    console.log('Trade Republic login approved.');

    const serialized = `${JSON.stringify(session, null, 2)}\n`;
    console.log(`Updating repository secret ${repo}/${options.secret}...`);
    await gh(
      [
        'secret',
        'set',
        options.secret,
        '--repo',
        repo,
      ],
      serialized,
    );

    console.log(`Dispatching ${options.workflow} on ${options.ref}...`);
    const dispatchedAt = new Date();
    await gh([
      'workflow',
      'run',
      options.workflow,
      '--repo',
      repo,
      '--ref',
      options.ref,
    ]);

    const run = await findDispatchedRun(repo, dispatchedAt);
    console.log(`Workflow run: ${run.url}`);
    if (options.watch) {
      await gh(['run', 'watch', String(run.id), '--repo', repo, '--exit-status']);
    }
  } finally {
    client?.close();
    await browser.close().catch(() => undefined);
  }
}

async function loginWithRotatingQr(client: TradeRepublicClient): Promise<Session> {
  let attempt = 0;
  let challengeId: string | undefined;
  let displayedPayload: string | undefined;
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
    try {
      return await chromium.launch({ headless: false });
    } catch {
      return await chromium.launch({ headless: true });
    }
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

async function detectRepository(): Promise<string> {
  const output = await gh([
    'repo',
    'view',
    '--json',
    'nameWithOwner',
    '--jq',
    '.nameWithOwner',
  ], undefined, true);
  assert.ok(output, 'Could not determine the GitHub repository.');
  return output;
}

async function findDispatchedRun(
  repo: string,
  dispatchedAt: Date,
): Promise<{ id: number; url: string }> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const output = await gh([
      'run',
      'list',
      '--repo',
      repo,
      '--workflow',
      options.workflow,
      '--event',
      'workflow_dispatch',
      '--limit',
      '5',
      '--json',
      'databaseId,createdAt,url,headBranch',
    ], undefined, true);
    const runs = JSON.parse(output) as Array<{
      databaseId: number;
      createdAt: string;
      url: string;
      headBranch: string;
    }>;
    const run = runs.find((candidate) => (
      candidate.headBranch === options.ref
      && new Date(candidate.createdAt).getTime() >= dispatchedAt.getTime() - 5_000
    ));
    if (run) return { id: run.databaseId, url: run.url };
    await delay(1_000);
  }
  throw new Error('The workflow was dispatched, but its run did not appear within 30 seconds.');
}

function gh(args: string[], input?: string, capture = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'gh.exe' : 'gh', args, {
      stdio: [input === undefined ? 'inherit' : 'pipe', capture ? 'pipe' : 'inherit', 'inherit'],
    });
    let stdout = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`gh ${args.join(' ')} failed with exit code ${code ?? 'unknown'}.`));
    });
    if (input !== undefined) child.stdin?.end(input);
  });
}

function parseOptions(args: string[]): Options {
  const options: Options = {
    secret: 'TR_SESSION_JSON',
    workflow: 'live-integration.yml',
    ref: 'main',
    deviceName: 'handelsrepublik github actions',
    timeoutMs: 10 * 60_000,
    watch: true,
    debug: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--no-watch') options.watch = false;
    else if (argument === '--debug') options.debug = true;
    else if (argument === '--repo') options.repo = requiredValue(args, ++index, argument);
    else if (argument === '--secret') options.secret = requiredValue(args, ++index, argument);
    else if (argument === '--workflow') options.workflow = requiredValue(args, ++index, argument);
    else if (argument === '--ref') options.ref = requiredValue(args, ++index, argument);
    else if (argument === '--device-name') options.deviceName = requiredValue(args, ++index, argument);
    else if (argument === '--timeout-minutes') {
      const minutes = Number(requiredValue(args, ++index, argument));
      assert.ok(Number.isFinite(minutes) && minutes > 0, '--timeout-minutes must be a positive number.');
      options.timeoutMs = minutes * 60_000;
    } else if (argument === '--help' || argument === '-h') {
      console.log(`Usage: npm run ci:reauth -- [options]

Options:
  --repo OWNER/REPO       GitHub repository (defaults to the current repo)
  --secret NAME           Repository secret (default: TR_SESSION_JSON)
  --workflow FILE         Workflow file/name (default: live-integration.yml)
  --ref BRANCH            Branch to dispatch (default: main)
  --device-name NAME      Trade Republic device label
  --timeout-minutes N     QR approval timeout (default: 10)
  --no-watch              Dispatch without watching the run
  --debug                 Print SDK authentication diagnostics`);
      process.exit(0);
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
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
