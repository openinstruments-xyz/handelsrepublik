import assert from 'node:assert/strict';
import test from 'node:test';

import worker, { renderBadge } from '../src/index.mjs';

test('renders a compact status-only SVG', () => {
  const svg = renderBadge('passing', '#4c1');

  assert.match(svg, /aria-label="CI: passing"/);
  assert.match(svg, />passing<\/text>/);
  assert.doesNotMatch(svg, /handelsrepublik/i);
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
