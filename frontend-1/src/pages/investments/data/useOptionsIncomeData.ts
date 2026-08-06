import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { reportAPI } from "@/api/postingApi";
import { fetchAPI } from "@/api/api";
import { toast } from "@/hooks/use-toast";
import {
  getCurrentFYOption,
  type FinancialYearOption,
  type FinancialYearType,
} from "@/components/Reports/FinancialYearSelector";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface OptionsIncomeTradeLeg {
  trade_id: string;
  type: "BUY" | "SELL";
  quantity: number;
  price: number;
  amount: number;
  value_date: string;
}

export interface OptionsIncomeTransactionRow {
  account_id: string;
  account_name: string;
  instrument_id: string;
  external_symbol_id?: number | null;
  symbol: string;
  instrument_name: string;
  underlying_symbol: string | null;
  quantity: number;
  position_qty: number;
  position_status: "open" | "closed";
  acquisition_cost: number;
  sale_cost: number;
  profit_loss: number;
  open_leg: OptionsIncomeTradeLeg | null;
  close_leg: OptionsIncomeTradeLeg | null;
  trade_date: string;
  underlying_current_price?: number | null;
  option_current_price?: number | null;
  strike_price?: number | null;
  option_type?: "C" | "P" | null;
  unrealized_pnl?: number | null;
}

export interface OptionsIncomeSection {
  transactions: OptionsIncomeTransactionRow[];
  total_acquisition_cost: number;
  total_sale_cost: number;
  total_profit_loss: number;
  total_income: number;
}

export interface OptionsIncomeData {
  report_currency: string;
  from_date: string;
  to_date: string;
  closed: OptionsIncomeSection;
  open: OptionsIncomeSection;
  total_income: number;
}

export type OpenPositionFilter = "all" | "short" | "long";
export type PriceStatus = "safe" | "warning" | "danger" | "neutral";

export interface TableTotals {
  acquisition_cost: number;
  sale_cost: number;
  profit_loss: number;
}

export const OPTION_CONTRACT_SIZE = 100;

/** Investment/brokerage accounts tagged with type "Equity" in chart of accounts. */
export function isEquityInvestmentAccount(account: { type?: string | string[] | null }): boolean {
  if (!account?.type) return false;
  const types = Array.isArray(account.type) ? account.type : [account.type];
  return types.some((t) => String(t).toLowerCase() === "equity");
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function resolveEntityFYType(
  entities: { id: string; is_it_headquartres?: boolean | string; financial_year_type?: string }[],
  currentId: string | null
): FinancialYearType {
  const current = entities.find((e) => e.id === currentId);
  if (current?.financial_year_type) return current.financial_year_type as FinancialYearType;
  const hq = entities.find((e) => e.is_it_headquartres);
  if (hq?.financial_year_type) return hq.financial_year_type as FinancialYearType;
  return "JAN_DEC";
}

export function sumRows(rows: OptionsIncomeTransactionRow[]): TableTotals {
  return rows.reduce(
    (acc, row) => ({
      acquisition_cost: acc.acquisition_cost + row.acquisition_cost,
      sale_cost: acc.sale_cost + row.sale_cost,
      profit_loss: acc.profit_loss + row.profit_loss,
    }),
    { acquisition_cost: 0, sale_cost: 0, profit_loss: 0 }
  );
}

export function computeLegMarketValue(row: OptionsIncomeTransactionRow): number | null {
  const leg = row.open_leg;
  const mark = row.option_current_price;
  if (!leg || mark == null) return null;
  return mark * leg.quantity * OPTION_CONTRACT_SIZE;
}

/** Unrealized P/L for this leg: current value vs premium paid/received. */
export function computeLegUnrealizedPnl(row: OptionsIncomeTransactionRow): number | null {
  const leg = row.open_leg;
  const marketValue = computeLegMarketValue(row);
  if (!leg || marketValue == null) return null;
  return leg.type === "BUY" ? marketValue - leg.amount : leg.amount - marketValue;
}

export function sumOpenValuation(rows: OptionsIncomeTransactionRow[]): {
  marketValue: number;
  unrealizedPnl: number;
} {
  return rows.reduce(
    (acc, row) => {
      const mv = computeLegMarketValue(row);
      const pnl = computeLegUnrealizedPnl(row);
      if (mv != null) acc.marketValue += mv;
      if (pnl != null) acc.unrealizedPnl += pnl;
      return acc;
    },
    { marketValue: 0, unrealizedPnl: 0 }
  );
}

export function sumOpenProceeds(rows: OptionsIncomeTransactionRow[]): { inflow: number; outflow: number; net: number } {
  return rows.reduce(
    (acc, row) => {
      const leg = row.open_leg;
      if (!leg) return acc;
      if (leg.type === "SELL") {
        acc.inflow += leg.amount;
        acc.net += leg.amount;
      } else {
        acc.outflow += leg.amount;
        acc.net -= leg.amount;
      }
      return acc;
    },
    { inflow: 0, outflow: 0, net: 0 }
  );
}

export function getUnderlyingPriceStatus(row: OptionsIncomeTransactionRow): PriceStatus {
  const isShort = row.position_qty < 0;

  if (isShort) {
    const { underlying_current_price: px, strike_price: strike, option_type: optType } = row;
    if (px == null || strike == null || !optType) return "neutral";

    if (optType === "C") {
      if (px >= strike) return "danger";
      if (px >= strike * 0.95) return "warning";
      return "safe";
    }
    if (px <= strike) return "danger";
    if (px <= strike * 1.05) return "warning";
    return "safe";
  }

  if (row.unrealized_pnl == null) return "neutral";
  if (row.unrealized_pnl > 0) return "safe";
  if (row.unrealized_pnl < 0) return "danger";
  return "neutral";
}

// ── Hook ───────────────────────────────────────────────────────────────────────

interface UseOptionsIncomeReportArgs {
  entities: { id: string; is_it_headquartres?: boolean | string; financial_year_type?: string }[];
  currentEntityId: string | null;
  entityLoading: boolean;
}

export function useOptionsIncomeReport({ entities, currentEntityId, entityLoading }: UseOptionsIncomeReportArgs) {
  const fyType = useMemo(
    () => resolveEntityFYType(entities, currentEntityId),
    [entities, currentEntityId]
  );

  const [selectedFY, setSelectedFY] = useState<FinancialYearOption>(() =>
    getCurrentFYOption("JAN_DEC")
  );
  const [reportCurrency, setReportCurrency] = useState("USD");
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [openPositionFilter, setOpenPositionFilter] = useState<OpenPositionFilter>("all");
  const [data, setData] = useState<OptionsIncomeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const fetchSeq = useRef(0);

  const accountAdditionalFilters = useMemo(
    () => (currentEntityId ? { legal_entity_id: currentEntityId } : undefined),
    [currentEntityId]
  );

  const accountFilterOptions = useCallback(
    (items: { type?: string | string[] | null }[]) =>
      items.filter((item) => isEquityInvestmentAccount(item)),
    []
  );

  useEffect(() => {
    setSelectedFY(getCurrentFYOption(fyType));
  }, [fyType]);

  useEffect(() => {
    setSelectedAccount(null);
    setOpenPositionFilter("all");
  }, [currentEntityId]);

  const fetchReport = useCallback(async () => {
    if (!selectedFY) return;
    const seq = ++fetchSeq.current;
    setLoading(true);
    try {
      const filters: Record<string, string> = {
        from_date: selectedFY.from_date,
        to_date: selectedFY.to_date,
        report_currency: reportCurrency,
      };
      if (currentEntityId) filters.legal_entity_id = currentEntityId;
      if (selectedAccount?.id) filters.account_id = selectedAccount.id;

      const result = (await reportAPI.getReport("options_income", filters)) as {
        data?: OptionsIncomeData;
      };
      if (seq !== fetchSeq.current) return;
      setData(result?.data ?? null);
    } catch {
      if (seq !== fetchSeq.current) return;
      toast({
        title: "Error",
        description: "Failed to load options income report",
        variant: "destructive",
      });
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [selectedFY, reportCurrency, currentEntityId, selectedAccount?.id]);

  const syncAndRefresh = useCallback(async () => {
    setSyncing(true);
    try {
      await fetchAPI("/api/broker-sync/run", { method: "POST" });
      toast({ title: "Sync complete", description: "Option income data updated from Questrade." });
      void fetchReport();
    } catch {
      toast({ title: "Sync failed", description: "Could not reach Questrade.", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }, [fetchReport]);

  useEffect(() => {
    if (!entityLoading) void fetchReport();
  }, [entityLoading, fetchReport]);

  const currency = data?.report_currency ?? reportCurrency;

  const closedRows = data?.closed.transactions ?? [];
  const openRows = useMemo(() => {
    const rows = data?.open.transactions ?? [];
    if (openPositionFilter === "short") {
      return rows.filter((row) => row.position_qty < 0);
    }
    if (openPositionFilter === "long") {
      return rows.filter((row) => row.position_qty > 0);
    }
    return rows;
  }, [data?.open.transactions, openPositionFilter]);

  const closedTotals = useMemo(() => sumRows(closedRows), [closedRows]);
  const openTotals = useMemo(() => sumRows(openRows), [openRows]);
  const openProceeds = useMemo(() => sumOpenProceeds(openRows), [openRows]);
  const openUnrealizedPnl = useMemo(
    () => sumOpenValuation(openRows).unrealizedPnl,
    [openRows]
  );
  const totalPnl = closedTotals.profit_loss + openProceeds.net;

  return {
    fyType,
    selectedFY,
    setSelectedFY,
    reportCurrency,
    setReportCurrency,
    selectedAccount,
    setSelectedAccount,
    accountAdditionalFilters,
    accountFilterOptions,
    openPositionFilter,
    setOpenPositionFilter,
    data,
    loading,
    syncing,
    fetchReport,
    syncAndRefresh,
    currency,
    closedRows,
    openRows,
    closedTotals,
    openTotals,
    openProceeds,
    openUnrealizedPnl,
    totalPnl,
  };
}
