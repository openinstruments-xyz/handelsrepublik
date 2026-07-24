import { describe, test } from 'node:test';
import { withLiveDiagnostics } from '../live-diagnostics.js';
import { liveCases } from './live-cases.js';
import { runLiveCase } from './live-runtime.js';

const READ_LIVE_CONCURRENCY = 4;
const readCases = liveCases.filter((testCase) => testCase.suite === 'read');

describe('read-only live validations', { concurrency: READ_LIVE_CONCURRENCY }, () => {
  for (const testCase of readCases) {
    test(testCase.id, { timeout: testCase.timeoutMs + 15_000 }, async () => {
      await withLiveDiagnostics(testCase.id, () => runLiveCase(testCase));
    });
  }
});
