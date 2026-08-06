import { useState, useEffect, useCallback, useRef } from "react";
import { reportAPI } from "@/api/postingApi";
import { fetchAPI } from "@/api/api";
import { toast } from "@/hooks/use-toast";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface HoldingRow {
  account_id: string;
  account_name: string;
  questrade_account_id: string | null;
  symbol: string;
  instrument_name: string;
  quantity: number;
  average_cost: number;          // in report currency
  current_price: number | null;  // in report currency
  market_value: number | null;   // in report currency
  unrealized_pnl: number | null; // in report currency
  native_currency_code: string | null;
  conversion_rate: number;
}

export interface AccountSummary {
  account_id: string;
  account_name: string;
  questrade_account_id: string | null;
  holdings_count: number;
  total_market_value: number; // equity only, in report currency
  total_cash: number;         // cash, in report currency
  total_equity: number;       // total_market_value + total_cash
}

export interface PortfolioData {
  report_currency: string;
  equity: HoldingRow[];
  options: HoldingRow[];
  cash: HoldingRow[];
  accounts: AccountSummary[];
  total_market_value: number;
  total_cash: number;
  total_equity: number;
  last_sync_at: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Convert a value from report currency back to native using the stored rate. */
export function toNative(converted: number | null, rate: number): number | null {
  if (converted == null || rate === 0) return null;
  return converted / rate;
}

/** Group key for merging holdings at instrument level (symbol + native currency). */
export function holdingKey(row: HoldingRow): string {
  return `${row.symbol}::${row.native_currency_code ?? "USD"}`;
}

/** Merge rows that share the same symbol and native currency (quantity-weighted avg cost). */
export function mergeHoldingsByInstrument(rows: HoldingRow[]): HoldingRow[] {
  const order: string[] = [];
  const groups = new Map<string, HoldingRow[]>();

  for (const row of rows) {
    const key = holdingKey(row);
    if (!groups.has(key)) order.push(key);
    groups.get(key)?.push(row) ?? groups.set(key, [row]);
  }

  return order.map((key) => {
    const group = groups.get(key)!;
    if (group.length === 1) return group[0];

    const totalQty = group.reduce((sum, r) => sum + r.quantity, 0);
    const totalCostBasis = group.reduce((sum, r) => sum + r.quantity * r.average_cost, 0);
    const accountIds = new Set(group.map((r) => r.account_id));
    const first = group[0];

    return {
      ...first,
      account_id: accountIds.size === 1 ? first.account_id : "",
      account_name: accountIds.size === 1 ? first.account_name : "",
      quantity: totalQty,
      average_cost: totalQty > 0 ? totalCostBasis / totalQty : 0,
      market_value: group.reduce((sum, r) => sum + (r.market_value ?? 0), 0),
      unrealized_pnl: group.reduce((sum, r) => sum + (r.unrealized_pnl ?? 0), 0),
    };
  });
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function usePortfolio(
  reportCurrency: string,
  currentEntityId: string | null,
  entityLoading: boolean
) {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [data, setData] = useState<PortfolioData | null>(null);
  const fetchSeq = useRef(0);

  const fetchPortfolio = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    try {
      const filters: Record<string, string> = { report_currency: reportCurrency };
      if (currentEntityId) filters.legal_entity_id = currentEntityId;

      const result = (await reportAPI.getReport("portfolio_summary", filters)) as any;
      if (seq !== fetchSeq.current) return;
      setData(result?.data ?? null);
    } catch {
      if (seq !== fetchSeq.current) return;
      toast({ title: "Error", description: "Failed to load portfolio", variant: "destructive" });
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [reportCurrency, currentEntityId]);

  useEffect(() => {
    if (!entityLoading) void fetchPortfolio();
  }, [entityLoading, fetchPortfolio]);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await fetchAPI("/api/broker-sync/run", { method: "POST" });
      toast({ title: "Sync complete", description: "Portfolio updated from Questrade." });
      void fetchPortfolio();
    } catch {
      toast({ title: "Sync failed", description: "Could not reach Questrade.", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }, [fetchPortfolio]);

  return { data, loading, syncing, fetchPortfolio, syncNow };
}
