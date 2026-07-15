import prisma from '../prisma';
import {
  isOptionSymbol,
  parseUnderlyingSymbolFromOption,
  parseStrikeFromOption,
  parseOptionTypeFromOption,
} from '../integrations/broker/option_symbol';

export interface PortfolioInstrumentSnapshot {
  id: string;
  symbol: string;
  name: string;
  type: string;
  current_price: number | null;
  price_updated_at: string | null;
  native_currency_code: string | null;
  underlying?: PortfolioInstrumentSnapshot;
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
  current_price: number | null;  // in report currency (holding-level)
  market_value: number | null;   // in report currency
  unrealized_pnl: number | null; // in report currency
  native_currency_code: string | null;
  conversion_rate: number;
  source_system_id: string | null;
  instrument: PortfolioInstrumentSnapshot;
}

export interface AccountSummaryRow {
  account_id: string;
  account_name: string;
  questrade_account_id: string | null;
  holdings_count: number;
  total_market_value: number;  // equity long positions only, in report currency
  total_cash: number;          // cash balance, in report currency
  total_equity: number;        // total_market_value + total_cash (matches Questrade "Total equity")
}

export interface PortfolioSummaryResult {
  report_currency: string;
  equity: PortfolioHoldingRow[];
  options: PortfolioHoldingRow[];
  cash: PortfolioHoldingRow[];
  accounts: AccountSummaryRow[];
  total_market_value: number;  // equity long positions, in report currency
  total_cash: number;          // cash, in report currency
  total_equity: number;        // total_market_value + total_cash
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

export interface OptionsIncomeTradeLeg {
  trade_id: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  /** Absolute premium cash amount in report currency. */
  amount: number;
  value_date: string;
}

export interface OptionsIncomeTransactionRow {
  account_id: string;
  account_name: string;
  instrument_id: string;
  /** Questrade integer symbolId — present on open rows when available. */
  external_symbol_id?: number | null;
  symbol: string;
  instrument_name: string;
  underlying_symbol: string | null;
  quantity: number;
  /** Signed open position qty as of period end (negative = short, positive = long). */
  position_qty: number;
  position_status: 'open' | 'closed';
  acquisition_cost: number;
  sale_cost: number;
  profit_loss: number;
  open_leg: OptionsIncomeTradeLeg | null;
  close_leg: OptionsIncomeTradeLeg | null;
  trade_date: string;
  /** Open rows only — underlying last price in report currency. */
  underlying_current_price?: number | null;
  /** Open rows only — option contract premium (per share) in report currency. */
  option_current_price?: number | null;
  strike_price?: number | null;
  option_type?: 'C' | 'P' | null;
  unrealized_pnl?: number | null;
}

export interface OptionsIncomePositionRow {
  account_id: string;
  account_name: string;
  instrument_id: string;
  symbol: string;
  instrument_name: string;
  underlying_symbol: string | null;
  position_status: 'open' | 'closed';
  position_qty: number;
  /** Net premium cash flow in the report period (SELL positive, BUY negative). */
  income_received: number;
  /** Net premium cash flow from inception through period end. */
  cumulative_income: number;
  premium_collected: number;
  premium_paid: number;
  opened_date: string | null;
  closed_date: string | null;
  last_trade_date: string | null;
}

export interface OptionsIncomeSection {
  transactions: OptionsIncomeTransactionRow[];
  total_acquisition_cost: number;
  total_sale_cost: number;
  total_profit_loss: number;
  /** @deprecated Use transactions — kept for backward compatibility */
  positions: OptionsIncomePositionRow[];
  total_income: number;
  total_premium_collected: number;
  total_premium_paid: number;
}

export interface OptionsIncomeResult {
  report_currency: string;
  from_date: string;
  to_date: string;
  closed: OptionsIncomeSection;
  open: OptionsIncomeSection;
  total_income: number;
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

/** When legalEntityIds is set, returns matching account ids (may be empty). Otherwise null = no filter. */
async function getAccountIdsForLegalEntities(
  orgId: string,
  legalEntityIds?: string[]
): Promise<string[] | null> {
  if (!legalEntityIds?.length) return null;
  const rows = await prisma.account.findMany({
    where: {
      org_id: orgId,
      legal_entity_id:
        legalEntityIds.length === 1
          ? legalEntityIds[0]
          : { in: legalEntityIds },
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function getLastSyncAt(orgId: string, connectionId?: string): Promise<string | null> {
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
  return connection?.last_sync_at?.toISOString() ?? null;
}

type InstrumentRow = {
  id: string;
  symbol: string;
  name: string;
  type: string;
  current_price: { toString(): string } | null;
  price_updated_at: Date | null;
  price_currency: { code: string } | null;
  underlying_instrument_id?: string | null;
  underlying?: InstrumentRow | null;
};

function buildInstrumentSnapshot(instrument: InstrumentRow): PortfolioInstrumentSnapshot {
  const snapshot: PortfolioInstrumentSnapshot = {
    id: instrument.id,
    symbol: instrument.symbol,
    name: instrument.name,
    type: instrument.type,
    current_price:
      instrument.current_price != null ? Number(instrument.current_price) : null,
    price_updated_at: instrument.price_updated_at?.toISOString() ?? null,
    native_currency_code: instrument.price_currency?.code ?? null,
  };

  if (instrument.underlying) {
    snapshot.underlying = buildInstrumentSnapshot(instrument.underlying);
  }

  return snapshot;
}

export async function getPortfolioSummary(
  orgId: string,
  reportCurrency = 'CAD',
  connectionId?: string,
  legalEntityIds?: string[]
): Promise<PortfolioSummaryResult> {
  // Resolve report currency row (accept code or id)
  const reportCurrencyRow = await prisma.currency.findFirst({
    where: { OR: [{ id: reportCurrency }, { code: reportCurrency.toUpperCase() }] },
    select: { id: true, code: true },
  });
  const reportCurrencyId = reportCurrencyRow?.id ?? null;
  const reportCurrencyCode = reportCurrencyRow?.code ?? reportCurrency.toUpperCase();

  const accountIds = await getAccountIdsForLegalEntities(orgId, legalEntityIds);
  if (accountIds !== null && accountIds.length === 0) {
    return {
      report_currency: reportCurrencyCode,
      equity: [],
      options: [],
      cash: [],
      accounts: [],
      total_market_value: 0,
      total_cash: 0,
      total_equity: 0,
      last_sync_at: await getLastSyncAt(orgId, connectionId),
    };
  }

  // Fetch all active holdings for this org/connection
  const holdingRows = await prisma.holding.findMany({
    where: {
      org_id: orgId,
      is_active: true,
      ...(connectionId
        ? { source_system_id: connectionId }
        : { source_system_id: { not: 'srcsys_fabriq' } }),
      ...(accountIds !== null ? { account_id: { in: accountIds } } : {}),
    },
    include: {
      account: { select: { id: true, name: true, inst_id: true } },
      instrument: {
        select: {
          id: true,
          symbol: true,
          name: true,
          type: true,
          current_price: true,
          price_updated_at: true,
          underlying_instrument_id: true,
          price_currency: { select: { code: true } },
          underlying: {
            select: {
              id: true,
              symbol: true,
              name: true,
              type: true,
              current_price: true,
              price_updated_at: true,
              price_currency: { select: { code: true } },
            },
          },
        },
      },
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
  const cash: PortfolioHoldingRow[] = [];

  for (const h of holdingRows) {
    const rate = await getRate(h.currency?.id ?? null);
    const instrumentSnapshot = buildInstrumentSnapshot(h.instrument as InstrumentRow);
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
      instrument: instrumentSnapshot,
    };

    if (h.instrument.type === 'CASH') {
      cash.push(row);
    } else if (h.instrument.type === 'OPTION' || isOptionSymbol(h.instrument.symbol)) {
      options.push(row);
    } else {
      equity.push(row);
    }
  }

  equity.sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0));
  options.sort((a, b) => a.symbol.localeCompare(b.symbol));
  cash.sort((a, b) => a.symbol.localeCompare(b.symbol));

  // Account summaries: equity + cash per account
  const accountMap = new Map<string, AccountSummaryRow>();
  const ensureAccount = (h: PortfolioHoldingRow) => {
    if (!accountMap.has(h.account_id)) {
      accountMap.set(h.account_id, {
        account_id: h.account_id,
        account_name: h.account_name,
        questrade_account_id: h.questrade_account_id,
        holdings_count: 0,
        total_market_value: 0,
        total_cash: 0,
        total_equity: 0,
      });
    }
    return accountMap.get(h.account_id)!;
  };

  for (const h of equity) {
    const acct = ensureAccount(h);
    acct.holdings_count += 1;
    acct.total_market_value += h.market_value ?? 0;
  }
  for (const h of cash) {
    const acct = ensureAccount(h);
    acct.total_cash += h.market_value ?? 0;
  }
  for (const acct of accountMap.values()) {
    acct.total_equity = acct.total_market_value + acct.total_cash;
  }

  const total_market_value = equity.reduce((sum, h) => sum + (h.market_value ?? 0), 0);
  const total_cash = cash.reduce((sum, h) => sum + (h.market_value ?? 0), 0);

  return {
    report_currency: reportCurrencyCode,
    equity,
    options,
    cash,
    accounts: Array.from(accountMap.values()).sort(
      (a, b) => b.total_equity - a.total_equity
    ),
    total_market_value,
    total_cash,
    total_equity: total_market_value + total_cash,
    last_sync_at: await getLastSyncAt(orgId, connectionId),
  };
}

export async function getInvestmentTrades(
  orgId: string,
  startDate: string,
  endDate: string,
  connectionId?: string,
  legalEntityIds?: string[]
): Promise<InvestmentTradeRow[]> {
  const accountIds = await getAccountIdsForLegalEntities(orgId, legalEntityIds);
  if (accountIds !== null && accountIds.length === 0) {
    return [];
  }

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
      ...(accountIds !== null ? { account_id: { in: accountIds } } : {}),
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

function isOptionInstrument(type: string, symbol: string): boolean {
  return type === 'OPTION' || isOptionSymbol(symbol);
}

function tradeCashFlow(type: string, quantity: number, price: number, netAmount: number | null): number {
  if (netAmount != null) return netAmount;
  const gross = quantity * price * 100;
  return type === 'SELL' ? gross : -gross;
}

function signedQuantity(type: string, quantity: number): number {
  return type === 'BUY' ? quantity : -quantity;
}

function emptyOptionsIncomeSection(): OptionsIncomeSection {
  return {
    transactions: [],
    total_acquisition_cost: 0,
    total_sale_cost: 0,
    total_profit_loss: 0,
    positions: [],
    total_income: 0,
    total_premium_collected: 0,
    total_premium_paid: 0,
  };
}

type ConvertedTrade = {
  trade_id: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  amount: number;
  value_date: string;
  inPeriod: boolean;
};

function legFromTrade(trade: ConvertedTrade): OptionsIncomeTradeLeg {
  return {
    trade_id: trade.trade_id,
    type: trade.type,
    quantity: trade.quantity,
    price: trade.price,
    amount: trade.amount,
    value_date: trade.value_date,
  };
}

function costsFromLegs(legs: ConvertedTrade[]): {
  acquisition_cost: number;
  sale_cost: number;
  profit_loss: number;
} {
  let acquisition_cost = 0;
  let sale_cost = 0;
  for (const leg of legs) {
    if (leg.type === 'BUY') acquisition_cost += leg.amount;
    else sale_cost += leg.amount;
  }
  return { acquisition_cost, sale_cost, profit_loss: sale_cost - acquisition_cost };
}

function splitRoundTrips(trades: ConvertedTrade[]): ConvertedTrade[][] {
  const rounds: ConvertedTrade[][] = [];
  let current: ConvertedTrade[] = [];
  let positionQty = 0;

  for (const trade of trades) {
    current.push(trade);
    positionQty += signedQuantity(trade.type, trade.quantity);
    if (Math.abs(positionQty) < 0.0001) {
      rounds.push(current);
      current = [];
      positionQty = 0;
    }
  }

  return rounds;
}

function openCloseLegs(round: ConvertedTrade[]): {
  open_leg: OptionsIncomeTradeLeg;
  close_leg: OptionsIncomeTradeLeg;
  quantity: number;
} {
  const open = round[0];
  const close = round[round.length - 1];
  return {
    open_leg: legFromTrade(open),
    close_leg: legFromTrade(close),
    quantity: open.quantity,
  };
}

/** Build account_id → currency_id map from holdings (broker accounts). */
async function getAccountCurrencyMap(orgId: string): Promise<Map<string, string>> {
  const rows = await prisma.holding.findMany({
    where: { org_id: orgId, currency_id: { not: null } },
    select: { account_id: true, currency_id: true },
    distinct: ['account_id', 'currency_id'],
  });
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.currency_id && !map.has(row.account_id)) {
      map.set(row.account_id, row.currency_id);
    }
  }
  return map;
}

export async function getOptionsIncome(
  orgId: string,
  startDate: string,
  endDate: string,
  reportCurrency?: string,
  connectionId?: string,
  legalEntityIds?: string[],
  accountId?: string
): Promise<OptionsIncomeResult> {
  const reportCurrencyRow = await prisma.currency.findFirst({
    where: {
      OR: [
        { id: reportCurrency ?? '' },
        { code: (reportCurrency ?? 'CAD').toUpperCase() },
      ],
    },
    select: { id: true, code: true },
  });
  const reportCurrencyId = reportCurrencyRow?.id ?? null;
  const reportCurrencyCode = reportCurrencyRow?.code ?? (reportCurrency ?? 'CAD').toUpperCase();

  const accountIds = await getAccountIdsForLegalEntities(orgId, legalEntityIds);
  if (accountIds !== null && accountIds.length === 0) {
    return {
      report_currency: reportCurrencyCode,
      from_date: startDate,
      to_date: endDate,
      closed: emptyOptionsIncomeSection(),
      open: emptyOptionsIncomeSection(),
      total_income: 0,
    };
  }

  const effectiveAccountIds =
    accountId != null
      ? accountIds !== null
        ? accountIds.filter((id) => id === accountId)
        : [accountId]
      : accountIds;

  if (effectiveAccountIds !== null && effectiveAccountIds.length === 0) {
    return {
      report_currency: reportCurrencyCode,
      from_date: startDate,
      to_date: endDate,
      closed: emptyOptionsIncomeSection(),
      open: emptyOptionsIncomeSection(),
      total_income: 0,
    };
  }

  const trades = await prisma.trade.findMany({
    where: {
      org_id: orgId,
      type: { in: ['BUY', 'SELL'] },
      value_date: { lte: new Date(endDate + 'T23:59:59Z') },
      ...(connectionId
        ? { source_system_id: connectionId }
        : { source_system_id: { not: 'srcsys_fabriq' } }),
      ...(effectiveAccountIds !== null ? { account_id: { in: effectiveAccountIds } } : {}),
      instrument: { isNot: null },
    },
    include: {
      account: { select: { name: true } },
      instrument: {
        select: {
          id: true,
          symbol: true,
          name: true,
          type: true,
          current_price: true,
          price_currency_id: true,
          external_symbol_id: true,
          underlying: {
            select: {
              symbol: true,
              current_price: true,
              price_currency_id: true,
            },
          },
        },
      },
    },
    orderBy: { value_date: 'asc' },
  });

  const optionTrades = trades.filter(
    (t) =>
      t.instrument &&
      t.account_id &&
      isOptionInstrument(t.instrument.type, t.instrument.symbol)
  );

  const accountCurrencyMap = await getAccountCurrencyMap(orgId);
  const holdingRows = await prisma.holding.findMany({
    where: {
      org_id: orgId,
      is_active: true,
      ...(effectiveAccountIds !== null ? { account_id: { in: effectiveAccountIds } } : {}),
    },
    select: {
      account_id: true,
      instrument_id: true,
      unrealized_pnl: true,
      current_price: true,
      currency_id: true,
    },
  });
  const holdingMap = new Map(
    holdingRows.map((h) => [`${h.account_id}:${h.instrument_id}`, h])
  );

  const rateCache = new Map<string, number>();
  const getRate = async (fromId: string | null | undefined): Promise<number> => {
    if (!fromId || !reportCurrencyId || fromId === reportCurrencyId) return 1;
    if (rateCache.has(fromId)) return rateCache.get(fromId)!;
    const rate = await getConversionRate(orgId, fromId, reportCurrencyId);
    rateCache.set(fromId, rate);
    return rate;
  };

  type PositionBucket = {
    account_id: string;
    account_name: string;
    instrument_id: string;
    external_symbol_id: number | null;
    symbol: string;
    instrument_name: string;
    underlying_symbol: string | null;
    underlying_current_price: number | null;
    option_current_price: number | null;
    strike_price: number | null;
    option_type: 'C' | 'P' | null;
    position_qty: number;
    period_income: number;
    cumulative_income: number;
    premium_collected: number;
    premium_paid: number;
    opened_date: string | null;
    closed_date: string | null;
    last_trade_date: string | null;
    has_period_activity: boolean;
    trades: ConvertedTrade[];
  };

  const positions = new Map<string, PositionBucket>();
  const periodStart = new Date(startDate);
  const periodEnd = new Date(endDate + 'T23:59:59Z');

  for (const trade of optionTrades) {
    const account_id = trade.account_id!;
    const instrument = trade.instrument!;
    const key = `${account_id}:${instrument.id}`;
    const tradeDate = trade.value_date.toISOString().split('T')[0];
    const inPeriod = trade.value_date >= periodStart && trade.value_date <= periodEnd;
    const qty = Number(trade.quantity);
    const price = Number(trade.price);
    const netAmount = trade.net_amount != null ? Number(trade.net_amount) : null;
    const cashFlow = tradeCashFlow(trade.type, qty, price, netAmount);
    const currencyId = accountCurrencyMap.get(account_id);
    const rate = await getRate(currencyId);
    const convertedCashFlow = cashFlow * rate;
    const qtyDelta = signedQuantity(trade.type, qty);
    const convertedAmount = Math.abs(convertedCashFlow);
    const convertedTrade: ConvertedTrade = {
      trade_id: trade.id,
      type: trade.type as 'BUY' | 'SELL',
      quantity: qty,
      price: price * rate,
      amount: convertedAmount,
      value_date: tradeDate,
      inPeriod,
    };

    let bucket = positions.get(key);
    const underlying = instrument.underlying as {
      symbol?: string;
      current_price?: { toString(): string } | null;
      price_currency_id?: string | null;
    } | null;
    const underlyingRate = await getRate(underlying?.price_currency_id ?? currencyId);
    const underlyingPrice =
      underlying?.current_price != null ? Number(underlying.current_price) * underlyingRate : null;
    const optionRate = await getRate(
      (instrument as { price_currency_id?: string | null }).price_currency_id ?? currencyId
    );
    const optionPrice =
      instrument.current_price != null ? Number(instrument.current_price) * optionRate : null;

    if (!bucket) {
      bucket = {
        account_id,
        account_name: trade.account?.name ?? account_id,
        instrument_id: instrument.id,
        external_symbol_id: (instrument as { external_symbol_id?: number | null }).external_symbol_id ?? null,
        symbol: instrument.symbol,
        instrument_name: instrument.name,
        underlying_symbol:
          underlying?.symbol ?? parseUnderlyingSymbolFromOption(instrument.symbol),
        underlying_current_price: underlyingPrice,
        option_current_price: optionPrice,
        strike_price: parseStrikeFromOption(instrument.symbol),
        option_type: parseOptionTypeFromOption(instrument.symbol),
        position_qty: 0,
        period_income: 0,
        cumulative_income: 0,
        premium_collected: 0,
        premium_paid: 0,
        opened_date: tradeDate,
        closed_date: null,
        last_trade_date: tradeDate,
        has_period_activity: false,
        trades: [],
      };
      positions.set(key, bucket);
    } else {
      if (underlyingPrice != null) bucket.underlying_current_price = underlyingPrice;
      if (optionPrice != null) bucket.option_current_price = optionPrice;
    }

    bucket.trades.push(convertedTrade);

    bucket.position_qty += qtyDelta;
    bucket.cumulative_income += convertedCashFlow;
    bucket.last_trade_date = tradeDate;
    if (!bucket.opened_date) bucket.opened_date = tradeDate;
    if (Math.abs(bucket.position_qty) < 0.0001) {
      bucket.closed_date = tradeDate;
    }

    if (inPeriod) {
      bucket.has_period_activity = true;
      bucket.period_income += convertedCashFlow;
      if (convertedCashFlow >= 0) {
        bucket.premium_collected += convertedCashFlow;
      } else {
        bucket.premium_paid += Math.abs(convertedCashFlow);
      }
    }
  }

  const closedTransactions: OptionsIncomeTransactionRow[] = [];
  const openTransactions: OptionsIncomeTransactionRow[] = [];
  const closedPositions: OptionsIncomePositionRow[] = [];
  const openPositions: OptionsIncomePositionRow[] = [];

  for (const bucket of positions.values()) {
    const isClosed = Math.abs(bucket.position_qty) < 0.0001;
    const include =
      bucket.has_period_activity ||
      (isClosed && bucket.closed_date != null && bucket.closed_date >= startDate) ||
      (!isClosed && bucket.cumulative_income !== 0);

    if (!include) continue;

    const positionRow: OptionsIncomePositionRow = {
      account_id: bucket.account_id,
      account_name: bucket.account_name,
      instrument_id: bucket.instrument_id,
      symbol: bucket.symbol,
      instrument_name: bucket.instrument_name,
      underlying_symbol: bucket.underlying_symbol,
      position_status: isClosed ? 'closed' : 'open',
      position_qty: bucket.position_qty,
      income_received: bucket.period_income,
      cumulative_income: bucket.cumulative_income,
      premium_collected: bucket.premium_collected,
      premium_paid: bucket.premium_paid,
      opened_date: bucket.opened_date,
      closed_date: bucket.closed_date,
      last_trade_date: bucket.last_trade_date,
    };

    if (isClosed) closedPositions.push(positionRow);
    else openPositions.push(positionRow);

    const rounds = splitRoundTrips(bucket.trades);
    const closedTradeIds = new Set(
      rounds.flatMap((round) => round.map((t) => t.trade_id))
    );

    for (const round of rounds) {
      const inScope = round.some((t) => t.inPeriod);
      if (!inScope) continue;

      const { open_leg, close_leg, quantity } = openCloseLegs(round);
      const costs = costsFromLegs(round);
      closedTransactions.push({
        account_id: bucket.account_id,
        account_name: bucket.account_name,
        instrument_id: bucket.instrument_id,
        symbol: bucket.symbol,
        instrument_name: bucket.instrument_name,
        underlying_symbol: bucket.underlying_symbol,
        quantity,
        position_qty: 0,
        position_status: 'closed',
        acquisition_cost: costs.acquisition_cost,
        sale_cost: costs.sale_cost,
        profit_loss: costs.profit_loss,
        open_leg,
        close_leg,
        trade_date: close_leg.value_date,
      });
    }

    if (!isClosed) {
      for (const trade of bucket.trades) {
        if (!trade.inPeriod || closedTradeIds.has(trade.trade_id)) continue;
        const costs = costsFromLegs([trade]);
        const holding = holdingMap.get(`${bucket.account_id}:${bucket.instrument_id}`);
        const bucketCurrencyId = accountCurrencyMap.get(bucket.account_id);
        const holdingRate = await getRate(holding?.currency_id ?? bucketCurrencyId);
        const unrealizedPnl =
          holding?.unrealized_pnl != null ? Number(holding.unrealized_pnl) * holdingRate : null;
        const optionCurrentPrice =
          holding?.current_price != null
            ? Number(holding.current_price) * holdingRate
            : bucket.option_current_price;
        openTransactions.push({
          account_id: bucket.account_id,
          account_name: bucket.account_name,
          instrument_id: bucket.instrument_id,
          external_symbol_id: bucket.external_symbol_id,
          symbol: bucket.symbol,
          instrument_name: bucket.instrument_name,
          underlying_symbol: bucket.underlying_symbol,
          quantity: trade.quantity,
          position_qty: bucket.position_qty,
          position_status: 'open',
          acquisition_cost: costs.acquisition_cost,
          sale_cost: costs.sale_cost,
          profit_loss: costs.profit_loss,
          open_leg: legFromTrade(trade),
          close_leg: null,
          trade_date: trade.value_date,
          underlying_current_price: bucket.underlying_current_price,
          option_current_price: optionCurrentPrice,
          strike_price: bucket.strike_price,
          option_type: bucket.option_type,
          unrealized_pnl: unrealizedPnl,
        });
      }
    }
  }

  const sortTransactions = (a: OptionsIncomeTransactionRow, b: OptionsIncomeTransactionRow) =>
    b.trade_date.localeCompare(a.trade_date) || a.symbol.localeCompare(b.symbol);

  closedTransactions.sort(sortTransactions);
  openTransactions.sort(sortTransactions);

  const sortRows = (a: OptionsIncomePositionRow, b: OptionsIncomePositionRow) =>
    Math.abs(b.income_received) - Math.abs(a.income_received) ||
    a.symbol.localeCompare(b.symbol);

  closedPositions.sort(sortRows);
  openPositions.sort(sortRows);

  const sumTransactions = (rows: OptionsIncomeTransactionRow[]): OptionsIncomeSection => ({
    transactions: rows,
    total_acquisition_cost: rows.reduce((sum, r) => sum + r.acquisition_cost, 0),
    total_sale_cost: rows.reduce((sum, r) => sum + r.sale_cost, 0),
    total_profit_loss: rows.reduce((sum, r) => sum + r.profit_loss, 0),
    positions: [],
    total_income: rows.reduce((sum, r) => sum + r.profit_loss, 0),
    total_premium_collected: rows.reduce((sum, r) => sum + r.sale_cost, 0),
    total_premium_paid: rows.reduce((sum, r) => sum + r.acquisition_cost, 0),
  });

  const closed = {
    ...sumTransactions(closedTransactions),
    positions: closedPositions,
    total_income: closedPositions.reduce((sum, r) => sum + r.income_received, 0),
    total_premium_collected: closedPositions.reduce((sum, r) => sum + r.premium_collected, 0),
    total_premium_paid: closedPositions.reduce((sum, r) => sum + r.premium_paid, 0),
  };
  const open = {
    ...sumTransactions(openTransactions),
    positions: openPositions,
    total_income: openPositions.reduce((sum, r) => sum + r.income_received, 0),
    total_premium_collected: openPositions.reduce((sum, r) => sum + r.premium_collected, 0),
    total_premium_paid: openPositions.reduce((sum, r) => sum + r.premium_paid, 0),
  };

  return {
    report_currency: reportCurrencyCode,
    from_date: startDate,
    to_date: endDate,
    closed,
    open,
    total_income: closed.total_income + open.total_income,
  };
}