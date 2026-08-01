import { appendFileSync, readFileSync } from 'node:fs';

const manifest = JSON.parse(
  readFileSync(new URL('./live-suites/manifest.json', import.meta.url), 'utf8'),
);
const selection = process.env.CI_LIVE_SUITE ?? 'all';
const selected = selection === 'all'
  ? manifest
  : selection === 'automatic'
    ? manifest.filter((suite) => suite.automatic)
    : manifest.filter((suite) => suite.id === selection);

if (selected.length === 0) {
  throw new Error(`Unknown live suite ${selection}.`);
}
if (!process.env.GITHUB_OUTPUT) {
  throw new Error('GITHUB_OUTPUT is required.');
}

appendFileSync(
  process.env.GITHUB_OUTPUT,
  `selection=${selection}\nsuites=${JSON.stringify(selected.map(({ id, name }) => ({ id, name })))}\n`,
  'utf8',
);
