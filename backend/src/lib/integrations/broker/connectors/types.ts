export type BrokerSyncStatus = 'success' | 'partial' | 'failed' | 'reauth_required';

export class ReauthRequiredError extends Error {
  code = 'REAUTH_REQUIRED' as const;
  constructor(message = 'Broker connection requires re-authentication') {
    super(message);
    this.name = 'ReauthRequiredError';
  }
}

export interface BrokerOAuthConfig {
  refresh_token: string;
  api_server?: string;
  token_endpoint?: string;
  /** Cached Questrade access token — encrypted in connection_config like refresh_token. */
  access_token?: string;
  /** ISO-8601 expiry for access_token; refresh only when now >= this minus buffer. */
  access_token_expires_at?: string;
}

export interface BrokerConnectionConfig {
  oauth: BrokerOAuthConfig;
}

export interface BrokerAccountDTO {
  externalId: string;
  name: string;
  type?: string;
  status?: string;
  currencyCode?: string;
}

export interface BrokerBalanceDTO {
  currencyCode: string;
  cash: number;
  marketValue: number;
  totalEquity: number;
}

export interface BrokerInstrumentDTO {
  symbol: string;
  name: string;
  type: 'STOCK' | 'BOND' | 'MUTUAL_FUND' | 'ETF' | 'FOREX' | 'CASH' | 'OPTION';
  isin?: string;
  currencyCode?: string;
  externalSymbolId?: number;
}

export interface BrokerPositionDTO {
  instrument: BrokerInstrumentDTO;
  quantity: number;
  averageCost: number;
  currentPrice?: number;
  marketValue?: number;
  unrealizedPnl?: number;
  realizedPnl?: number;
  currencyCode?: string;
  externalSymbolId?: number;
}

export interface BrokerSymbolDTO {
  symbolId: number;
  symbol: string;
  name?: string;
  securityType?: string;
  currencyCode?: string;
  underlyingSymbol?: string;
  underlyingSymbolId?: number;
}

export interface BrokerQuoteDTO {
  symbolId: number;
  lastTradePrice?: number;
  currencyCode?: string;
}

export interface BrokerOptionStrikeDTO {
  strikePrice: number;
  callSymbolId: number;
  putSymbolId: number;
}

export interface BrokerOptionRootDTO {
  root: string;
  multiplier: number;
  strikes: BrokerOptionStrikeDTO[];
}

export interface BrokerOptionExpiryDTO {
  expiryDate: string;
  description?: string;
  listingExchange?: string;
  optionExerciseType?: string;
  chainPerRoot: BrokerOptionRootDTO[];
}

export interface BrokerOptionChainDTO {
  underlyingSymbolId: number;
  underlyingSymbol?: string;
  options: BrokerOptionExpiryDTO[];
}

export interface BrokerOptionQuoteFilter {
  underlyingId: number;
  expiryDate?: string;
  optionType?: 'Call' | 'Put';
  minstrikePrice?: number;
  maxstrikePrice?: number;
}

export interface BrokerOptionQuoteRequest {
  filters?: BrokerOptionQuoteFilter[];
  optionIds?: number[];
}

export interface BrokerOptionQuoteDTO {
  symbolId: number;
  symbol?: string;
  underlying?: string;
  underlyingId?: number;
  bidPrice?: number;
  askPrice?: number;
  lastTradePrice?: number;
  lastTradePriceTrHrs?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  rho?: number;
  volatility?: number;
  openInterest?: number;
  volume?: number;
  lastTradeSize?: number;
  isHalted?: boolean;
}

export interface BrokerTradeDTO {
  tradeId: string;
  instrument?: BrokerInstrumentDTO;
  type: 'BUY' | 'SELL' | 'DIVIDEND' | 'INTEREST' | 'SPLIT' | 'TRANSFER';
  quantity: number;
  price: number;
  brokerage?: number;
  tax?: number;
  netAmount?: number;
  totalAmount?: number;
  currencyCode?: string;
  valueDate: Date;
  description?: string;
}

export interface BrokerConnector {
  getSystemType(): string;
  ensureAuth(): Promise<void>;
  getAccounts(): Promise<BrokerAccountDTO[]>;
  getBalances(accountExternalId: string): Promise<BrokerBalanceDTO[]>;
  getPositions(accountExternalId: string): Promise<BrokerPositionDTO[]>;
  getActivities(accountExternalId: string, startTime: Date, endTime: Date): Promise<BrokerTradeDTO[]>;
  getSymbol?(symbolId: number): Promise<BrokerSymbolDTO | null>;
  searchSymbol?(symbol: string): Promise<BrokerSymbolDTO | null>;
  getQuotes?(symbolIds: number[]): Promise<BrokerQuoteDTO[]>;
  getOptionChain?(underlyingSymbolId: number, underlyingSymbol?: string): Promise<BrokerOptionChainDTO>;
  getOptionQuotes?(request: BrokerOptionQuoteRequest): Promise<BrokerOptionQuoteDTO[]>;
}
