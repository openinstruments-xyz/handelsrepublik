import {
  TradeRepublicHttpError,
  TradeRepublicSchemaError,
} from '../src/index.js';

export type LiveDiagnosticLogger = (message: string) => void;

export async function withLiveDiagnostics<T>(
  label: string,
  run: () => T | Promise<T>,
  logger: LiveDiagnosticLogger = (message) => console.error(message),
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    logDiagnostic(label, error, logger);
    throw error;
  }
}

function logDiagnostic(
  label: string,
  error: unknown,
  logger: LiveDiagnosticLogger,
): void {
  logger(`[live-integration] ${label} failed\n${JSON.stringify(summarizeFailure(error), null, 2)}`);
}

function summarizeFailure(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { thrown: sanitizeValue(error) };
  }

  const details: Record<string, unknown> = {
    name: error.name,
    message: error.message,
  };
  const errorRecord = error as Error & Record<string, unknown>;

  for (const key of ['code', 'operator', 'actual', 'expected']) {
    if (errorRecord[key] !== undefined) details[key] = sanitizeValue(errorRecord[key]);
  }
  if (error instanceof TradeRepublicHttpError) {
    details.status = error.status;
    details.responseBody = sanitizeValue(error.responseBody);
  }
  if (error instanceof TradeRepublicSchemaError) {
    details.schemaName = error.schemaName;
    details.issues = sanitizeValue(error.issues);
    details.rawSummary = sanitizeValue(error.rawSummary);
  }
  if (error.cause !== undefined) details.cause = sanitizeValue(error.cause);

  return details;
}

function sanitizeValue(value: unknown, key = '', depth = 0, seen = new WeakSet<object>()): unknown {
  if (isSensitiveKey(key)) return '[REDACTED]';
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (typeof value !== 'object') return String(value);
  if (depth >= 5) return `[${Array.isArray(value) ? 'array' : 'object'}]`;
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }
  if (Array.isArray(value)) {
    return {
      length: value.length,
      items: value.slice(0, 10).map((item) => sanitizeValue(item, '', depth + 1, seen)),
      ...(value.length > 10 ? { truncated: true } : {}),
    };
  }

  const entries = Object.entries(value as Record<string, unknown>);
  return Object.fromEntries([
    ...entries.slice(0, 30).map(([childKey, childValue]) => [
      childKey,
      sanitizeValue(childValue, childKey, depth + 1, seen),
    ]),
    ...(entries.length > 30 ? [['truncated', true]] : []),
  ]);
}

function isSensitiveKey(key: string): boolean {
  return /authorization|cookie|token|secret|password|passcode|pin|phone|email|iban|accountnumber|firstname|lastname|address/i.test(key);
}
