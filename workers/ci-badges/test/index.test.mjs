import assert from 'node:assert/strict';
import test from 'node:test';

import worker, { formatRunTitle, renderBadge } from '../src/index.mjs';

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

test('rejects workflows outside the allowlist', async () => {
  const response = await worker.fetch(
    new Request('https://example.com/arbitrary/latest.svg'),
    { GH_TOKEN: 'unused' },
    { waitUntil() {} },
  );

  assert.equal(response.status, 404);
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
      new Request('https://example.com/reads/scheduled.svg'),
      { GH_TOKEN: 'test-token' },
      { waitUntil() {} },
    );
    const svg = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(requestedUrls.length, 2);
    assert.match(requestedUrls[1], /\/actions\/runs\/123\/jobs/);
    assert.match(svg, /× validate cash response/);
    assert.doesNotMatch(svg, /publish test result table/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('redirects each badge link to the run selected for its event', async () => {
  const originalFetch = globalThis.fetch;
  const cases = [
    { alias: 'latest', expectedEvent: undefined, runId: 101 },
    { alias: 'scheduled', expectedEvent: 'schedule', runId: 102 },
    { alias: 'manual', expectedEvent: 'workflow_dispatch', runId: 103 },
  ];

  try {
    for (const { alias, expectedEvent, runId } of cases) {
      globalThis.fetch = async (url) => {
        const endpoint = new URL(url);
        assert.equal(endpoint.searchParams.get('event') ?? undefined, expectedEvent);
        return Response.json({
          workflow_runs: [{
            id: runId,
            html_url: `https://github.com/VIEWVIEWVIEW/handelsrepublik/actions/runs/${runId}`,
          }],
        });
      };

      const response = await worker.fetch(
        new Request(`https://example.com/reads/${alias}/run`),
        { GH_TOKEN: 'test-token' },
        { waitUntil() {} },
      );

      assert.equal(response.status, 302);
      assert.equal(
        response.headers.get('location'),
        `https://github.com/VIEWVIEWVIEW/handelsrepublik/actions/runs/${runId}`,
      );
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('includes the Berlin run time in a fetched badge title', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    workflow_runs: [{
      id: 123,
      status: 'completed',
      conclusion: 'success',
      run_started_at: '2026-07-24T21:45:00Z',
    }],
  });

  try {
    const response = await worker.fetch(
      new Request('https://example.com/reads/latest.svg'),
      { GH_TOKEN: 'test-token' },
      { waitUntil() {} },
    );
    const svg = await response.text();

    assert.match(svg, /<title>passing - 24\/7 23:45<\/title>/);
    assert.match(svg, /aria-label="passing - 24\/7 23:45"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
