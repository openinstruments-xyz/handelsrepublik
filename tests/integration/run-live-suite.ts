import { liveCases } from './live-cases.js';
import { runLiveCase, type LiveSuite } from './live-runtime.js';
import { withLiveDiagnostics } from '../live-diagnostics.js';

const suite = (process.argv[2]?.trim() || 'read') as LiveSuite;
const selected = liveCases.filter((testCase) => testCase.suite === suite);
if (selected.length === 0) {
  console.error(`Unknown or empty live suite ${suite}.`);
  process.exitCode = 1;
}

const failures: string[] = [];
for (const testCase of selected) {
  try {
    await withLiveDiagnostics(testCase.id, () => runLiveCase(testCase));
  } catch {
    failures.push(testCase.id);
  }
}

if (failures.length > 0) {
  console.error(`[live-integration] ${failures.length} live cases failed: ${failures.join(', ')}`);
  process.exitCode = 1;
}
