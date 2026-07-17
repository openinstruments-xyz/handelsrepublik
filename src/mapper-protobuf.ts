import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { boot, messageDesc } from '@bufbuild/protobuf/codegenv2';

export type MapperProtobufTopic = 'orderUpdates' | 'priceAlarmNotifications';

export interface MapperProtobufCodec {
  encode(subscriptionId: number): Uint8Array;
  decode(payload: Uint8Array): unknown;
}

export interface MapperProtobufEnvelope {
  subscriptionId: number;
  payload?: Uint8Array | undefined;
  status?: { code: number; message: string } | undefined;
}

export interface MapperProtobufRequest {
  subscriptionId: number;
  topic: MapperProtobufTopic;
  accountNumber?: string | undefined;
}

export interface MapperProtobufRequest {
  subscriptionId: number;
  topic: MapperProtobufTopic;
  accountNumber?: string | undefined;
}

const file = boot({
  name: 'handelsrepublik/mapper.proto',
  package: 'handelsrepublik.mapper',
  syntax: 'proto3',
  enumType: [],
  messageType: [
    message('SecAccNoSelector', [field('account_number', 1, 9)]),
    message('SubscribeRequest', [
      field('sub_id', 1, 5),
      field('topic_id', 2, 9),
      field('by_sec_acc_no', 4, 11, '.handelsrepublik.mapper.SecAccNoSelector'),
    ]),
    message('Request', [field('sub', 1, 11, '.handelsrepublik.mapper.SubscribeRequest')]),
    message('DataResponse', [field('data', 1, 12), field('completed', 2, 8)]),
    message('Status', [field('code', 1, 5), field('message', 2, 9)]),
    message('Response', [
      field('sub_id', 1, 5),
      field('data', 2, 11, '.handelsrepublik.mapper.DataResponse'),
      field('status', 3, 11, '.handelsrepublik.mapper.Status'),
    ]),
    message('Uuid', [field('id', 1, 12)]),
    message('Decimal', [field('unscaled', 1, 12), field('scale', 2, 5)]),
    message('Money', [
      field('value', 1, 11, '.handelsrepublik.mapper.Decimal'),
      field('currency', 2, 5),
    ]),
    message('UnitValue', [
      field('value', 1, 11, '.handelsrepublik.mapper.Decimal'),
      field('unit', 2, 9),
    ]),
    message('Trade', [
      field('id', 1, 11, '.handelsrepublik.mapper.Uuid'),
      field('group_id', 2, 11, '.handelsrepublik.mapper.Uuid'),
      field('trade_type', 3, 5),
      field('execution_size', 4, 11, '.handelsrepublik.mapper.Decimal'),
      field('execution_price', 5, 11, '.handelsrepublik.mapper.Money'),
      field('execution_fees', 6, 11, '.handelsrepublik.mapper.Money'),
      field('executed_at', 7, 3),
      field('gross_profit', 8, 11, '.handelsrepublik.mapper.Money'),
      field('net_profit', 9, 11, '.handelsrepublik.mapper.Money'),
    ]),
    message('OrderTrade', [
      field('id', 1, 11, '.handelsrepublik.mapper.Uuid'),
      field('sec_acc_no', 2, 9),
      field('user_id', 3, 11, '.handelsrepublik.mapper.Uuid'),
      field('exchange_id', 4, 9),
      field('instrument_id', 5, 9),
      field('type', 6, 5),
      field('side', 7, 5),
      field('order_usecase', 8, 5),
      field('expiry', 9, 5),
      field('group_id', 10, 9),
      field('size', 11, 11, '.handelsrepublik.mapper.Decimal'),
      field('amount', 12, 11, '.handelsrepublik.mapper.UnitValue'),
      field('stop', 13, 11, '.handelsrepublik.mapper.UnitValue'),
      field('limit', 14, 11, '.handelsrepublik.mapper.UnitValue'),
      field('created_at', 15, 3),
      field('updated_at', 16, 3),
      field('received_at', 17, 3),
      field('submitted_at', 18, 3),
      field('opened_at', 19, 3),
      field('executed_at', 20, 3),
      field('expired_at', 21, 3),
      field('canceled_at', 22, 3),
      field('rejected_at', 23, 3),
      field('trades', 24, 11, '.handelsrepublik.mapper.Trade', 3),
    ]),
    message('Timestamp', [field('seconds', 1, 3), field('nanos', 2, 5)]),
    message('PriceAlarm', [
      field('alarm_id', 1, 11, '.handelsrepublik.mapper.Uuid'),
      field('isin', 2, 9),
      field('name', 3, 9),
      field('price', 4, 11, '.handelsrepublik.mapper.Money'),
      field('triggered_at', 5, 11, '.handelsrepublik.mapper.Timestamp'),
    ]),
    message('PriceAlarmNotification', [
      field('price_alarms', 1, 11, '.handelsrepublik.mapper.PriceAlarm', 3),
    ]),
  ],
} as never);

const RequestSchema = messageDesc(file, 2);
const ResponseSchema = messageDesc(file, 5);
const OrderTradeSchema = messageDesc(file, 11);
const PriceAlarmNotificationSchema = messageDesc(file, 14);

export function mapperProtobufCodec(
  topic: MapperProtobufTopic,
  request: { accountNumber?: string | undefined } = {},
): MapperProtobufCodec {
  return {
    encode(subscriptionId) {
      const sub = {
        subId: subscriptionId,
        topicId: topic,
        ...(request.accountNumber ? { bySecAccNo: { accountNumber: request.accountNumber } } : {}),
      };
      return toBinary(RequestSchema, create(RequestSchema, { sub } as never));
    },
    decode(payload) {
      if (topic === 'orderUpdates') return normalizeOrderTrade(fromBinary(OrderTradeSchema, payload));
      return normalizePriceAlarmNotification(fromBinary(PriceAlarmNotificationSchema, payload));
    },
  };
}

export function decodeMapperProtobufEnvelope(bytes: Uint8Array): MapperProtobufEnvelope {
  const response = fromBinary(ResponseSchema, bytes) as Record<string, unknown>;
  const subscriptionId = Number(response.subId);
  const data = record(response.data);
  if (data.data instanceof Uint8Array) return { subscriptionId, payload: data.data };
  const status = record(response.status);
  if (Object.keys(status).length) {
    return {
      subscriptionId,
      status: { code: Number(status.code ?? 0), message: String(status.message ?? 'Mapper protobuf request failed') },
    };
  }
  return { subscriptionId };
}

export function decodeMapperProtobufRequest(bytes: Uint8Array): MapperProtobufRequest {
  const request = record(fromBinary(RequestSchema, bytes));
  const sub = record(request.sub);
  const selector = record(sub.bySecAccNo);
  return {
    subscriptionId: Number(sub.subId),
    topic: String(sub.topicId) as MapperProtobufTopic,
    ...(typeof selector.accountNumber === 'string' ? { accountNumber: selector.accountNumber } : {}),
  };
}

export function encodeMapperProtobufTopicPayload(topic: MapperProtobufTopic, value: unknown): Uint8Array {
  const schema = topic === 'orderUpdates' ? OrderTradeSchema : PriceAlarmNotificationSchema;
  return toBinary(schema, create(schema, value as never));
}

export function encodeMapperProtobufDataEnvelope(subscriptionId: number, payload: Uint8Array): Uint8Array {
  return toBinary(ResponseSchema, create(ResponseSchema, {
    subId: subscriptionId,
    data: { data: payload },
  } as never));
}

function normalizeOrderTrade(value: unknown): Record<string, unknown> {
  const source = record(value);
  return compact({
    id: uuid(source.id),
    secAccNo: source.secAccNo,
    userId: uuid(source.userId),
    exchangeId: source.exchangeId,
    instrumentId: source.instrumentId,
    type: enumName(source.type, ['unspecified', 'market', 'limit', 'stop', 'trailingStop']),
    side: enumName(source.side, ['unspecified', 'buy', 'sell']),
    orderUsecase: enumName(source.orderUsecase, [
      'unspecified', 'blockOrder', 'regularOrder', 'savingsPlan', 'tradingPerk', 'proprietary',
      'spareChange', 'saveback', 'switch', 'externalSwitch', 'kindergeld', 'onePercentBonus',
    ]),
    expiry: enumName(source.expiry, ['unspecified', 'day', 'gtc', 'gtd', 'eom']),
    groupId: source.groupId,
    size: decimal(source.size),
    amount: unitValue(source.amount),
    stop: unitValue(source.stop),
    limit: unitValue(source.limit),
    createdAt: epochMillis(source.createdAt),
    updatedAt: epochMillis(source.updatedAt),
    receivedAt: epochMillis(source.receivedAt),
    submittedAt: epochMillis(source.submittedAt),
    openedAt: epochMillis(source.openedAt),
    executedAt: epochMillis(source.executedAt),
    expiredAt: epochMillis(source.expiredAt),
    cancelledAt: epochMillis(source.canceledAt),
    rejectedAt: epochMillis(source.rejectedAt),
    trades: Array.isArray(source.trades) ? source.trades.map(normalizeTrade) : [],
  });
}

function normalizeTrade(value: unknown): Record<string, unknown> {
  const source = record(value);
  return compact({
    id: uuid(source.id),
    groupId: uuid(source.groupId),
    tradeType: enumName(source.tradeType, ['unspecified', 'sell', 'buy']),
    executionSize: decimal(source.executionSize),
    executionPrice: money(source.executionPrice),
    executionFees: money(source.executionFees),
    executedAt: epochMillis(source.executedAt),
    grossProfit: money(source.grossProfit),
    netProfit: money(source.netProfit),
  });
}

function normalizePriceAlarmNotification(value: unknown): Record<string, unknown> {
  const source = record(value);
  const priceAlarms = Array.isArray(source.priceAlarms) ? source.priceAlarms.map((item) => {
    const alarm = record(item);
    return compact({
      alarmId: uuid(alarm.alarmId),
      isin: alarm.isin,
      name: alarm.name,
      price: money(alarm.price),
      triggeredAt: timestamp(alarm.triggeredAt),
    });
  }) : [];
  return { priceAlarms };
}

function message(name: string, fields: ReturnType<typeof field>[]) {
  return { name, field: fields };
}

function field(name: string, number: number, type: number, typeName = '', label = 1) {
  return { name, number, type, typeName, label };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function uuid(value: unknown): string | undefined {
  const bytes = record(value).id;
  if (!(bytes instanceof Uint8Array) || bytes.length !== 16) return undefined;
  const hex = Buffer.from(bytes).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function decimal(value: unknown): string | undefined {
  const source = record(value);
  const bytes = source.unscaled;
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) return undefined;
  let unscaled = 0n;
  for (const byte of bytes) unscaled = (unscaled << 8n) | BigInt(byte);
  if ((bytes[0] ?? 0) & 0x80) unscaled -= 1n << BigInt(bytes.length * 8);
  const scale = Number(source.scale ?? 0);
  const negative = unscaled < 0n;
  const digits = (negative ? -unscaled : unscaled).toString().padStart(scale + 1, '0');
  const text = scale > 0 ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
  return negative ? `-${text}` : text;
}

function money(value: unknown): Record<string, unknown> | undefined {
  const source = record(value);
  if (!Object.keys(source).length) return undefined;
  return compact({ value: decimal(source.value), currency: currencyName(source.currency) });
}

function unitValue(value: unknown): Record<string, unknown> | undefined {
  const source = record(value);
  if (!Object.keys(source).length) return undefined;
  return compact({ value: decimal(source.value), unit: source.unit });
}

function currencyName(value: unknown): string | undefined {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return number === 1 ? 'EUR' : number === 2 ? 'PLN' : number === 5 ? 'USD' : String(number);
}

function enumName(value: unknown, names: string[]): string | undefined {
  const number = Number(value);
  return Number.isInteger(number) ? names[number] ?? String(number) : undefined;
}

function epochMillis(value: unknown): string | undefined {
  if (typeof value !== 'bigint' && typeof value !== 'number') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return undefined;
  const date = new Date(number);
  return Number.isNaN(date.getTime()) ? String(number) : date.toISOString();
}

function timestamp(value: unknown): string | undefined {
  const source = record(value);
  const seconds = source.seconds;
  if (typeof seconds !== 'bigint' && typeof seconds !== 'number') return undefined;
  const milliseconds = Number(seconds) * 1000 + Math.floor(Number(source.nanos ?? 0) / 1_000_000);
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
