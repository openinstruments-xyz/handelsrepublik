import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readDemoClientOptions, schemaValidationMode } from '../demo/client-options.mjs';

describe('demo client options', () => {
  it('defaults unset raw-schema validation to throw', () => {
    assert.deepEqual(readDemoClientOptions({}), {
      websocketMode: 'shared',
      websocketReconnectDelayMs: 250,
      rawSchemaValidation: 'throw',
    });
  });

  it('accepts only documented explicit raw-schema validation values', () => {
    assert.equal(schemaValidationMode('throw'), 'throw');
    assert.equal(schemaValidationMode(' Passthrough '), 'passthrough');
    assert.equal(schemaValidationMode('OFF'), 'off');
    assert.throws(() => schemaValidationMode('true'), /TR_RAW_SCHEMA_VALIDATION/);
    assert.throws(() => schemaValidationMode(''), /TR_RAW_SCHEMA_VALIDATION/);
  });
});
