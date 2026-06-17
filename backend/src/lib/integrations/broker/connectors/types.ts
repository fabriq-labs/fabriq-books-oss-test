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
  type: 'STOCK' | 'BOND' | 'MUTUAL_FUND' | 'ETF' | 'FOREX';
  isin?: string;
  currencyCode?: string;
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
}
