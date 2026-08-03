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
