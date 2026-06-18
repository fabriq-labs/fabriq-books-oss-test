import prisma from '../prisma';

// Regex matches Questrade option symbols: e.g. NVDA10Jul26P175.00, GOOG10Jul26C405.00
const OPTION_SYMBOL_RE = /\d{1,2}[A-Z][a-z]{2}\d{2}[CP]\d+(\.\d+)?$/;

function isOption(symbol: string): boolean {
  return OPTION_SYMBOL_RE.test(symbol);
}

export interface PortfolioHoldingRow {
  account_id: string;
  account_name: string;
  questrade_account_id: string | null;
  instrument_id: string;
  symbol: string;
  instrument_name: string;
  instrument_type: string;
  quantity: number;
  average_cost: number;          // in report currency
  current_price: number | null;  // in report currency
  market_value: number | null;   // in report currency
  unrealized_pnl: number | null; // in report currency
  native_currency_code: string | null;
  conversion_rate: number;
  source_system_id: string | null;
}

export interface AccountSummaryRow {
  account_id: string;
  account_name: string;
  questrade_account_id: string | null;
  holdings_count: number;
  total_market_value: number;  // long positions only, in report currency
}

export interface PortfolioSummaryResult {
  report_currency: string;
  equity: PortfolioHoldingRow[];
  options: PortfolioHoldingRow[];
  accounts: AccountSummaryRow[];
  total_net_worth: number;     // long positions only, in report currency
  last_sync_at: string | null;
}

export interface InvestmentTradeRow {
  trade_id_internal: string;
  trade_id: string | null;
  type: string;
  symbol: string | null;
  instrument_name: string | null;
  account_id: string;
  account_name: string;
  quantity: number;
  price: number;
  net_amount: number | null;
  brokerage: number | null;
  value_date: string;
}

/** Resolve latest SPOT rate to convert fromCurrencyId → toCurrencyId. Falls back to inverse. */
async function getConversionRate(
  orgId: string,
  fromCurrencyId: string,
  toCurrencyId: string
): Promise<number> {
  if (fromCurrencyId === toCurrencyId) return 1;

  const direct = await prisma.exchange_rate.findFirst({
    where: { org_id: orgId, from_currency_id: fromCurrencyId, to_currency_id: toCurrencyId },
    orderBy: { effective_date: 'desc' },
    select: { rate: true },
  });
  if (direct) return Number(direct.rate);

  // Try inverse
  const inverse = await prisma.exchange_rate.findFirst({
    where: { org_id: orgId, from_currency_id: toCurrencyId, to_currency_id: fromCurrencyId },
    orderBy: { effective_date: 'desc' },
    select: { rate: true },
  });
  if (inverse) return 1 / Number(inverse.rate);

  return 1;
}

export async function getPortfolioSummary(
  orgId: string,
  reportCurrency = 'CAD',
  connectionId?: string
): Promise<PortfolioSummaryResult> {
  // Resolve report currency row (accept code or id)
  const reportCurrencyRow = await prisma.currency.findFirst({
    where: { OR: [{ id: reportCurrency }, { code: reportCurrency.toUpperCase() }] },
    select: { id: true, code: true },
  });
  const reportCurrencyId = reportCurrencyRow?.id ?? null;
  const reportCurrencyCode = reportCurrencyRow?.code ?? reportCurrency.toUpperCase();

  // Fetch all active holdings for this org/connection
  const holdingRows = await prisma.holding.findMany({
    where: {
      org_id: orgId,
      is_active: true,
      ...(connectionId
        ? { source_system_id: connectionId }
        : { source_system_id: { not: 'srcsys_fabriq' } }),
    },
    include: {
      account: { select: { id: true, name: true, inst_id: true } },
      instrument: { select: { id: true, symbol: true, name: true, type: true } },
      currency: { select: { id: true, code: true } },
    },
    orderBy: { market_value: 'desc' },
  });

  // Build per-currency conversion rate cache
  const rateCache = new Map<string, number>();
  const getRate = async (fromId: string | null): Promise<number> => {
    if (!fromId || !reportCurrencyId || fromId === reportCurrencyId) return 1;
    if (rateCache.has(fromId)) return rateCache.get(fromId)!;
    const rate = await getConversionRate(orgId, fromId, reportCurrencyId);
    rateCache.set(fromId, rate);
    return rate;
  };

  const equity: PortfolioHoldingRow[] = [];
  const options: PortfolioHoldingRow[] = [];

  for (const h of holdingRows) {
    const rate = await getRate(h.currency?.id ?? null);
    const row: PortfolioHoldingRow = {
      account_id: h.account_id,
      account_name: h.account?.name ?? h.account_id,
      questrade_account_id: h.account?.inst_id ?? null,
      instrument_id: h.instrument_id,
      symbol: h.instrument.symbol,
      instrument_name: h.instrument.name,
      instrument_type: h.instrument.type,
      quantity: Number(h.quantity),
      average_cost: Number(h.average_cost) * rate,
      current_price: h.current_price != null ? Number(h.current_price) * rate : null,
      market_value: h.market_value != null ? Number(h.market_value) * rate : null,
      unrealized_pnl: h.unrealized_pnl != null ? Number(h.unrealized_pnl) * rate : null,
      native_currency_code: h.currency?.code ?? null,
      conversion_rate: rate,
      source_system_id: h.source_system_id,
    };

    if (isOption(h.instrument.symbol)) {
      options.push(row);
    } else {
      equity.push(row);
    }
  }

  // Sort equity desc by market value; options by symbol
  equity.sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0));
  options.sort((a, b) => a.symbol.localeCompare(b.symbol));

  // Account summaries — long equity positions only
  const accountMap = new Map<string, AccountSummaryRow>();
  for (const h of equity) {
    if (!accountMap.has(h.account_id)) {
      accountMap.set(h.account_id, {
        account_id: h.account_id,
        account_name: h.account_name,
        questrade_account_id: h.questrade_account_id,
        holdings_count: 0,
        total_market_value: 0,
      });
    }
    const acct = accountMap.get(h.account_id)!;
    acct.holdings_count += 1;
    acct.total_market_value += h.market_value ?? 0;
  }

  const total_net_worth = equity.reduce((sum, h) => sum + (h.market_value ?? 0), 0);

  const connection = connectionId
    ? await prisma.source_system.findFirst({
        where: { id: connectionId },
        select: { last_sync_at: true },
      })
    : await prisma.source_system.findFirst({
        where: { org_id: orgId, system_type: 'questrade', is_active: true },
        orderBy: { last_sync_at: 'desc' },
        select: { last_sync_at: true },
      });

  return {
    report_currency: reportCurrencyCode,
    equity,
    options,
    accounts: Array.from(accountMap.values()).sort(
      (a, b) => b.total_market_value - a.total_market_value
    ),
    total_net_worth,
    last_sync_at: connection?.last_sync_at?.toISOString() ?? null,
  };
}

export async function getInvestmentTrades(
  orgId: string,
  startDate: string,
  endDate: string,
  connectionId?: string
): Promise<InvestmentTradeRow[]> {
  const trades = await prisma.trade.findMany({
    where: {
      org_id: orgId,
      value_date: {
        gte: new Date(startDate),
        lte: new Date(endDate + 'T23:59:59Z'),
      },
      ...(connectionId
        ? { source_system_id: connectionId }
        : { source_system_id: { not: 'srcsys_fabriq' } }),
    },
    include: {
      account: { select: { name: true } },
      instrument: { select: { symbol: true, name: true } },
    },
    orderBy: { value_date: 'desc' },
  });

  return trades.map(t => ({
    trade_id_internal: t.id,
    trade_id: t.trade_id,
    type: t.type,
    symbol: t.instrument?.symbol ?? null,
    instrument_name: t.instrument?.name ?? null,
    account_id: t.account_id ?? '',
    account_name: t.account?.name ?? t.account_id ?? '',
    quantity: Number(t.quantity),
    price: Number(t.price),
    net_amount: t.net_amount != null ? Number(t.net_amount) : null,
    brokerage: t.brokerage != null ? Number(t.brokerage) : null,
    value_date: t.value_date.toISOString().split('T')[0],
  }));
}
