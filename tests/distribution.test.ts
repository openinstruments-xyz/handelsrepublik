import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

describe('committed distribution', () => {
  it('keeps source maps reproducible across checkout line endings', () => {
    const map = JSON.parse(readFileSync(join(process.cwd(), 'dist', 'index.js.map'), 'utf8')) as {
      sourcesContent?: unknown;
    };
    assert.ok(Array.isArray(map.sourcesContent), 'published source maps must retain embedded sources');
    for (const source of map.sourcesContent) {
      if (typeof source === 'string') assert.equal(source.includes('\r'), false, 'embedded sources must use LF line endings');
    }
  });
});
