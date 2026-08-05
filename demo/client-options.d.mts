export interface DemoClientEnvironment {
  TR_WEBSOCKET_MODE?: string | undefined;
  TR_WEBSOCKET_RECONNECT_MS?: string | undefined;
  TR_RAW_SCHEMA_VALIDATION?: string | undefined;
}

export interface DemoClientOptions {
  websocketMode: 'shared' | 'isolated';
  websocketReconnectDelayMs: number;
  rawSchemaValidation: 'throw' | 'passthrough' | 'off';
}

export function readDemoClientOptions(environment?: DemoClientEnvironment): DemoClientOptions;
export function schemaValidationMode(value: unknown): DemoClientOptions['rawSchemaValidation'];
