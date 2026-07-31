import assert from 'node:assert/strict';
import test from 'node:test';

import worker, { formatRunTitle, renderBadge } from '../src/index.mjs';

class MemoryKv {
  values = new Map();

  async get(key, type) {
    const value = this.values.get(key);
    return type === 'json' && value !== undefined ? JSON.parse(value) : value ?? null;
  }

  async put(key, value) {
    this.values.set(key, value);
  }
}

const resultToken = 'test-ingest-token';

function resultReport(overrides = {}) {
  return {
    schemaVersion: 1,
    workflow: 'account-market-mutations',
    runId: 123,
    runAttempt: 1,
    runUrl: 'https://github.com/openinstruments-xyz/handelsrepublik/actions/runs/123',
    event: 'schedule',
    sha: 'abcdef1234567890',
    createdAt: '2026-07-24T21:45:00Z',
    conclusion: 'success',
    results: [{
      id: 'account.current',
      name: 'account.current',
      status: 'passed',
      durationMs: 42,
      note: 'validated',
    }],
    ...overrides,
  };
}

async function ingestResult(kv, report, token = resultToken) {
  return worker.fetch(
    new Request('https://example.com/results/account-market-mutations', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(report),
    }),
    { CI_RESULTS: kv, CI_RESULTS_INGEST_TOKEN: resultToken },
    { waitUntil() {} },
  );
}

test('renders a compact status-only SVG', () => {
  const svg = renderBadge('passing', '#4c1');

  assert.match(svg, /height="20"/);
  assert.match(svg, /aria-label="CI: passing"/);
  assert.match(svg, />passing<\/text>/);
  assert.doesNotMatch(svg, /handelsrepublik/i);
});

test('formats the run start in Berlin time for the badge title', () => {
  assert.equal(
    formatRunTitle('passing', { run_started_at: '2026-07-24T21:45:00Z' }),
    'passing - 24/7 23:45',
  );
  assert.equal(
    formatRunTitle('passing', { run_started_at: '2026-01-24T22:45:00Z' }),
    'passing - 24/1 23:45',
  );
});

test('expands failing badges into a vertical failed-check list', () => {
  const svg = renderBadge('failing', '#e05d44', [
    'validate cash response',
    'validate portfolio <shape>',
  ]);

  assert.match(svg, /height="62"/);
  assert.match(svg, /failed checks: validate cash response; validate portfolio &lt;shape&gt;/);
  assert.match(svg, /× validate cash response/);
  assert.match(svg, /× validate portfolio &lt;shape&gt;/);
});

test('keeps bottom padding below the final failed check', () => {
  const svg = renderBadge('failing', '#e05d44', ['validate cash response']);
  const height = Number(svg.match(/<svg[^>]* height="(\d+)"/)?.[1]);
  const baselines = [...svg.matchAll(/<text x="8" y="(\d+)"/g)]
    .map((match) => Number(match[1]));
  const finalBaseline = baselines.at(-1);

  assert.ok(
    height - finalBaseline >= 10,
    `expected at least 10px below the final baseline, received ${height - finalBaseline}px`,
  );
});

test('uses the available detail width before truncating', () => {
  const failure = 'validate closed venue and rejected EUR 1 market buy';
  const svg = renderBadge('failing', '#e05d44', [failure]);

  assert.match(svg, new RegExp(`× ${failure}<`));
});

test('limits and truncates long failure lists', () => {
  const svg = renderBadge('failing', '#e05d44', [
    'a'.repeat(80),
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
  ]);

  assert.match(svg, /a+…/);
  assert.match(svg, /\+2 more/);
  assert.doesNotMatch(svg, />× six<\/text>/);
});

test('rejects unknown and removed workflow aliases', async () => {
  for (const alias of ['arbitrary', 'reads', 'venue', 'mutations']) {
    const response = await worker.fetch(
      new Request(`https://example.com/${alias}/latest.svg`),
      { GH_TOKEN: 'unused' },
      { waitUntil() {} },
    );

    assert.equal(response.status, 404);
  }
});

test('resolves the weekend lifecycle badge to its workflow', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return Response.json({ workflow_runs: [] });
  };
  try {
    const response = await worker.fetch(
      new Request('https://example.com/weekend-lifecycle/latest.svg'),
      { GH_TOKEN: 'test-token' },
      { waitUntil() {} },
    );

    assert.equal(response.status, 200);
    assert.match(requestedUrl, /actions\/workflows\/validate-weekend-limit-order-lifecycle\.yml\/runs/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('returns an SVG without exposing configuration errors', async () => {
  const response = await worker.fetch(
    new Request('https://example.com/quality/latest.svg'),
    {},
    { waitUntil() {} },
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
  assert.match(await response.text(), />unknown<\/text>/);
});

test('loads failed steps only for a failing run', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];

  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));

    if (String(url).includes('/actions/workflows/')) {
      return Response.json({
        workflow_runs: [{ id: 123, status: 'completed', conclusion: 'failure' }],
      });
    }

    return Response.json({
      jobs: [{
        name: 'validation job',
        conclusion: 'failure',
        steps: [
          { name: 'validate cash response', conclusion: 'failure' },
          { name: 'publish test result table', conclusion: 'failure' },
        ],
      }],
    });
  };
  try {
    const response = await worker.fetch(
      new Request('https://example.com/destinations/scheduled.svg'),
      { GH_TOKEN: 'test-token' },
      { waitUntil() {} },
    );
    const svg = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.equal(requestedUrls.length, 2);
    assert.match(requestedUrls[1], /\/actions\/runs\/123\/jobs/);
    assert.match(svg, /× validate cash response/);
    assert.doesNotMatch(svg, /publish test result table/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('stores structured results and renders exact failed case names', async () => {
  const kv = new MemoryKv();
  const report = resultReport({
    conclusion: 'failure',
    results: [
      {
        id: 'account.current',
        name: 'account.current',
        status: 'passed',
        durationMs: 42,
        note: 'validated',
      },
      {
        id: 'mutations.price-alert',
        name: 'mutations.price-alert',
        status: 'failed',
        durationMs: 84,
        note: 'failed',
      },
    ],
  });

  const ingest = await ingestResult(kv, report);
  assert.equal(ingest.status, 201);

  const response = await worker.fetch(
    new Request('https://example.com/account-market-mutations/latest.svg'),
    { CI_RESULTS: kv },
    { waitUntil() {} },
  );
  const svg = await response.text();

  assert.equal(response.status, 200);
  assert.match(svg, />failing<\/text>/);
  assert.match(svg, /\u00d7 mutations.price-alert/);
  assert.equal(
    kv.values.get('result:account-market-mutations:latest'),
    kv.values.get('result:account-market-mutations:scheduled'),
  );
});

test('rejects unauthorized and stale result ingestion', async () => {
  const kv = new MemoryKv();
  assert.equal(await ingestResult(kv, resultReport(), 'wrong-token').then((response) => response.status), 401);
  assert.equal(await ingestResult(kv, resultReport({ runId: 200 })).then((response) => response.status), 201);
  assert.equal(await ingestResult(kv, resultReport({ runId: 199 })).then((response) => response.status), 202);

  const stored = JSON.parse(kv.values.get('result:account-market-mutations:latest'));
  assert.equal(stored.runId, 200);
});

test('rejects a conclusion that disagrees with its case results', async () => {
  const kv = new MemoryKv();
  const response = await ingestResult(kv, resultReport({
    conclusion: 'success',
    results: [{
      id: 'mutations.price-alert',
      name: 'mutations.price-alert',
      status: 'failed',
      durationMs: 12,
      note: 'broker rejected mutation',
    }],
  }));

  assert.equal(response.status, 400);
  assert.equal(kv.values.size, 0);
});

test('redirects each badge link to the run selected for its event', async () => {
  const kv = new MemoryKv();
  const cases = [
    { alias: 'latest', event: 'push', runId: 101 },
    { alias: 'scheduled', event: 'schedule', runId: 102 },
    { alias: 'manual', event: 'workflow_dispatch', runId: 103 },
  ];

  for (const { alias, event, runId } of cases) {
    const report = resultReport({
      runId,
      event,
      runUrl: `https://github.com/openinstruments-xyz/handelsrepublik/actions/runs/${runId}`,
    });
    kv.values.set(`result:account-market-mutations:${alias}`, JSON.stringify(report));
    const response = await worker.fetch(
      new Request(`https://example.com/account-market-mutations/${alias}/run`),
      { CI_RESULTS: kv },
      { waitUntil() {} },
    );

    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get('location'),
      `https://github.com/openinstruments-xyz/handelsrepublik/actions/runs/${runId}`,
    );
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('keeps the Berlin run time out of the visible badge label', async () => {
  const kv = new MemoryKv();
  kv.values.set('result:account-market-mutations:latest', JSON.stringify(resultReport()));
  const response = await worker.fetch(
    new Request('https://example.com/account-market-mutations/latest.svg'),
    { CI_RESULTS: kv },
    { waitUntil() {} },
  );
  const svg = await response.text();

  assert.match(svg, /<title>passing - 24\/7 23:45<\/title>/);
  assert.match(svg, /aria-label="passing - 24\/7 23:45"/);
  assert.match(svg, />passing<\/text>/);
  assert.doesNotMatch(svg, />passing - 24\/7 23:45<\/text>/);
});
