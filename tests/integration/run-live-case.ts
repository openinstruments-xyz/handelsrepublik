import { getLiveCase } from './live-cases.js';
import { runLiveCase } from './live-runtime.js';
import { withLiveDiagnostics } from '../live-diagnostics.js';

const id = process.argv[2]?.trim();
if (!id) {
  console.error('Pass a live case id, for example: npm run test:integration:case -- account.current');
  process.exitCode = 1;
} else {
  try {
    await withLiveDiagnostics(id, () => runLiveCase(getLiveCase(id)));
  } catch {
    process.exitCode = 1;
  }
}
