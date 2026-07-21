export const VENUE_DISPLAY_NAMES = {
  TIB: 'Best Price',
  LUS: 'Lang & Schwarz',
  LSX: 'Lang & Schwarz Exchange',
  LSXCS: 'Lang & Schwarz Exchange',
  TDG: 'Tradegate Exchange',
  XFRA: 'Borse Frankfurt',
  XSWX: 'SIX Swiss Exchange',
  SLT: 'Société Générale',
  XETR: 'Xetra',
  XPAR: 'Euronext Paris',
  XBRU: 'Euronext Brussels',
  XAMS: 'Euronext Amsterdam',
  XLIS: 'Euronext Lisbon',
  XOSL: 'Euronext Oslo Børs',
  XNYS: 'New York Stock Exchange',
  XNAS: 'Nasdaq',
  XCSE: 'Nasdaq Copenhagen',
  XHEL: 'Nasdaq Helsinki',
  XSTO: 'Nasdaq Stockholm',
  XMIL: 'Borsa Italiana',
  XMAD: 'Bolsa de Madrid',
  XWAR: 'Warsaw Stock Exchange',
  XLON: 'London Stock Exchange',
  XWBO: 'Wiener Börse',
  XTSE: 'Toronto Stock Exchange',
  XTSX: 'TSX Venture Exchange',
  XSES: 'Singapore (SGX)',
  XJPX: 'Tokyo Stock Exchange',
  XASX: 'Australian Securities Exchange',
  TUB: 'HSBC Trinkaus & Burkhardt',
  BHS: 'Tradias',
  B2C: 'B2C2',
} as const;

export type KnownVenueId = keyof typeof VENUE_DISPLAY_NAMES;

export const MARKET_DATA_STREAM_TOPICS = {
  bidAsk: 'tickerV3',
  orderBook: 'L2',
} as const;

export type MarketDataStream = keyof typeof MARKET_DATA_STREAM_TOPICS;

export function venueDisplayName(exchangeId: string): string {
  const normalized = exchangeId.trim().toUpperCase();
  return VENUE_DISPLAY_NAMES[normalized as KnownVenueId] ?? exchangeId;
}
