import assert from 'node:assert/strict';
import test from 'node:test';

import worker, { renderBadge } from '../src/index.mjs';

test('renders a compact status-only SVG', () => {
  const svg = renderBadge('passing', '#4c1');

  assert.match(svg, /height="20"/);
  assert.match(svg, /aria-label="CI: passing"/);
  assert.match(svg, />passing<\/text>/);
  assert.doesNotMatch(svg, /handelsrepublik/i);
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
