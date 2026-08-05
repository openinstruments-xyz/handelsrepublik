export function readDemoClientOptions(environment = process.env) {
  return {
    websocketMode: environment.TR_WEBSOCKET_MODE === 'isolated' ? 'isolated' : 'shared',
    websocketReconnectDelayMs: positiveInteger(environment.TR_WEBSOCKET_RECONNECT_MS, 250),
    rawSchemaValidation: schemaValidationMode(environment.TR_RAW_SCHEMA_VALIDATION),
  };
}

export function schemaValidationMode(value) {
  if (value === undefined) return 'throw';
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'throw' || normalized === 'passthrough' || normalized === 'off') return normalized;
  throw new TypeError('TR_RAW_SCHEMA_VALIDATION must be "throw", "passthrough", or "off".');
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
