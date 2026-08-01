import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GhCommandError,
  isMissingRemoteWorkflow,
} from '../scripts/reauth-support.js';

describe('CI reauthentication workflow probe', () => {
  it('treats a missing workflow during migration as not deployed yet', () => {
    const error = new GhCommandError(
      ['api', 'repos/example/repo/contents/.github/workflows/live-validation.yml?ref=main'],
      1,
      'gh: Not Found (HTTP 404)\n',
    );

    assert.equal(isMissingRemoteWorkflow(error), true);
  });

  it('does not hide authentication or unrelated GitHub failures', () => {
    assert.equal(
      isMissingRemoteWorkflow(new GhCommandError(['api'], 1, 'gh: HTTP 401\n')),
      false,
    );
    assert.equal(isMissingRemoteWorkflow(new Error('network unavailable')), false);
  });
});
