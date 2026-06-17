import { createHash } from 'crypto';
import {
  BrokerAccountDTO,
  BrokerBalanceDTO,
  BrokerInstrumentDTO,
  BrokerPositionDTO,
  BrokerTradeDTO,
} from '../types';

interface QtAccount {
  number: string;
  type?: string;
  status?: string;
  clientAccountType?: string;
}

interface QtBalance {
  currency: string;
  cash: number;
  marketValue: number;
  totalEquity: number;
}

interface QtPosition {
  symbol: string;
  symbolId?: number;
  openQuantity: number;
  currentPrice?: number;
  currentMarketValue?: number;
  averageEntryPrice?: number;
  openPnl?: number;
  closedPnl?: number;
  totalCost?: number;
}

interface QtActivity {
  tradeDate: string;
  transactionDate?: string;
  settlementDate?: string;
  action?: string;
  symbol?: string;
  symbolId?: number;
  quantity?: number;
  price?: number;
  grossAmount?: number;
  commission?: number;
  netAmount?: number;
  currency?: string;
  type?: string;
  description?: string;
}

function mapInstrumentType(securityType?: string): BrokerInstrumentDTO['type'] {
  switch ((securityType || '').toLowerCase()) {
    case 'bond':
      return 'BOND';
    case 'mutualfund':
      return 'MUTUAL_FUND';
    case 'etf':
      return 'ETF';
    case 'currency':
      return 'FOREX';
    default:
      return 'STOCK';
  }
}

export function mapAccount(account: QtAccount): BrokerAccountDTO {
  return {
    externalId: account.number,
    name: account.type ? `${account.type} ${account.number}` : account.number,
    type: account.type,
    status: account.status,
  };
}

export function mapBalance(balance: QtBalance): BrokerBalanceDTO {
  return {
    currencyCode: balance.currency,
    cash: balance.cash ?? 0,
    marketValue: balance.marketValue ?? 0,
    totalEquity: balance.totalEquity ?? 0,
  };
}

export function mapPosition(position: QtPosition, currencyCode?: string): BrokerPositionDTO {
  const quantity = position.openQuantity ?? 0;
  const averageCost =
    position.averageEntryPrice ??
    (position.totalCost && quantity ? position.totalCost / quantity : 0);
  return {
    instrument: {
      symbol: position.symbol,
      name: position.symbol,
      type: 'STOCK',
      currencyCode,
    },
    quantity,
    averageCost,
    currentPrice: position.currentPrice,
    marketValue: position.currentMarketValue,
    unrealizedPnl: position.openPnl,
    realizedPnl: position.closedPnl,
    currencyCode,
  };
}

const ACTION_TO_TRADE_TYPE: Record<string, BrokerTradeDTO['type']> = {
  Buy: 'BUY',
  Sell: 'SELL',
  DIV: 'DIVIDEND',
  INT: 'INTEREST',
};

function resolveTradeType(activity: QtActivity): BrokerTradeDTO['type'] {
  if (activity.action && ACTION_TO_TRADE_TYPE[activity.action]) {
    return ACTION_TO_TRADE_TYPE[activity.action];
  }
  const t = (activity.type || '').toLowerCase();
  if (t.includes('dividend')) return 'DIVIDEND';
  if (t.includes('interest')) return 'INTEREST';
  if (t.includes('transfer')) return 'TRANSFER';
  return (activity.quantity ?? 0) < 0 ? 'SELL' : 'BUY';
}

/**
 * Questrade activities have no stable id, so derive a deterministic one from the
 * stable economic fields. Re-syncing the same window yields the same id (idempotent).
 */
export function buildTradeId(accountExternalId: string, activity: QtActivity): string {
  const tradeDate = activity.tradeDate || activity.transactionDate || '';
  const parts = [
    accountExternalId,
    tradeDate,
    activity.symbol ?? '',
    activity.action ?? activity.type ?? '',
    String(activity.quantity ?? 0),
    String(activity.netAmount ?? activity.grossAmount ?? 0),
  ].join('|');
  const hash = createHash('sha256').update(parts).digest('hex').slice(0, 32);
  return `qt_${hash}`;
}

export function mapActivity(accountExternalId: string, activity: QtActivity): BrokerTradeDTO | null {
  const tradeDateStr = activity.tradeDate || activity.transactionDate;
  if (!tradeDateStr) {
    return null;
  }
  const type = resolveTradeType(activity);
  const instrument: BrokerInstrumentDTO | undefined = activity.symbol
    ? { symbol: activity.symbol, name: activity.symbol, type: 'STOCK', currencyCode: activity.currency }
    : undefined;

  return {
    tradeId: buildTradeId(accountExternalId, activity),
    instrument,
    type,
    quantity: Math.abs(activity.quantity ?? 0),
    price: Math.abs(activity.price ?? 0),
    brokerage: activity.commission != null ? Math.abs(activity.commission) : undefined,
    netAmount: activity.netAmount,
    totalAmount: activity.grossAmount,
    currencyCode: activity.currency,
    valueDate: new Date(tradeDateStr),
    description: activity.description,
  };
}

export { mapInstrumentType };
