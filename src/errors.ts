export class TradeRepublicError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'TradeRepublicError';
  }
}

export class TradeRepublicHttpError extends TradeRepublicError {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody: unknown,
  ) {
    super(message);
    this.name = 'TradeRepublicHttpError';
  }
}

export class TradeRepublicProtocolError extends TradeRepublicError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'TradeRepublicProtocolError';
  }
}

export class TradeRepublicSchemaError extends TradeRepublicError {
  constructor(
    message: string,
    public readonly schemaName: string,
    public readonly issues: unknown,
    public readonly rawSummary: unknown,
    cause?: unknown,
  ) {
    super(message, cause);
    this.name = 'TradeRepublicSchemaError';
  }
}
