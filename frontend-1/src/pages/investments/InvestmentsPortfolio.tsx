"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { reportAPI } from "@/api/postingApi";
import { fetchAPI } from "@/api/api";
import { formatCurrency } from "@/lib/formatters";
import { Loader2, RefreshCw, TrendingUp, BarChart3 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import dayjs from "dayjs";

// ── Types ──────────────────────────────────────────────────────────────────────

interface HoldingRow {
  account_id: string;
  account_name: string;
  questrade_account_id: string | null;
  symbol: string;
  instrument_name: string;
  quantity: number;
  average_cost: number;
  current_price: number | null;
  market_value: number | null;
  native_currency_code: string | null;
  conversion_rate: number;
}

interface AccountSummary {
  account_id: string;
  account_name: string;
  questrade_account_id: string | null;
  holdings_count: number;
  total_market_value: number;
}

interface PortfolioData {
  report_currency: string;
  equity: HoldingRow[];
  options: HoldingRow[];
  accounts: AccountSummary[];
  total_net_worth: number;
  last_sync_at: string | null;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

function usePortfolio(reportCurrency: string) {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [data, setData] = useState<PortfolioData | null>(null);
  const fetchSeq = useRef(0);

  const fetchPortfolio = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    try {
      const result = await reportAPI.getReport("portfolio_summary", {
        report_currency: reportCurrency,
      }) as any;
      if (seq !== fetchSeq.current) return;
      setData(result?.data ?? null);
    } catch (err) {
      if (seq !== fetchSeq.current) return;
      toast({ title: "Error", description: "Failed to load portfolio", variant: "destructive" });
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [reportCurrency]);

  useEffect(() => { void fetchPortfolio(); }, [fetchPortfolio]);

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

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtQty(n: number) {
  return n % 1 === 0 ? n.toLocaleString() : n.toFixed(4);
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function HoldingsTable({
  rows,
  currency,
}: {
  rows: HoldingRow[];
  currency: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-slate-500">No positions found.</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50 border-b border-slate-200">
            <TableHead className="py-2 px-3 text-xs font-semibold text-slate-700">Symbol</TableHead>
            <TableHead className="py-2 px-3 text-xs font-semibold text-slate-700">Account</TableHead>
            <TableHead className="py-2 px-3 text-xs font-semibold text-slate-700 text-right">Qty</TableHead>
            <TableHead className="py-2 px-3 text-xs font-semibold text-slate-700 text-right">Avg Cost</TableHead>
            <TableHead className="py-2 px-3 text-xs font-semibold text-slate-700 text-right">Current Price</TableHead>
            <TableHead className="py-2 px-3 text-xs font-semibold text-slate-700 text-right">Market Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={`${row.account_id}-${row.symbol}-${i}`} className="border-b border-slate-100 hover:bg-slate-50">
              <TableCell className="py-2 px-3">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-slate-900">{row.symbol}</span>
                  {row.native_currency_code && row.native_currency_code !== currency && (
                    <span className="text-[10px] text-slate-400">{row.native_currency_code} × {row.conversion_rate.toFixed(4)}</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="py-2 px-3 text-xs text-slate-600">{row.account_name}</TableCell>
              <TableCell className="py-2 px-3 text-xs text-right font-mono text-slate-700">{fmtQty(row.quantity)}</TableCell>
              <TableCell className="py-2 px-3 text-xs text-right font-mono text-slate-700">
                {formatCurrency(row.average_cost, currency)}
              </TableCell>
              <TableCell className="py-2 px-3 text-xs text-right font-mono text-slate-700">
                {row.current_price != null ? formatCurrency(row.current_price, currency) : "—"}
              </TableCell>
              <TableCell className={`py-2 px-3 text-xs text-right font-mono font-semibold ${(row.market_value ?? 0) < 0 ? "text-red-600" : "text-slate-900"}`}>
                {row.market_value != null ? formatCurrency(row.market_value, currency) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function InvestmentsPortfolio() {
  const [reportCurrency, setReportCurrency] = useState<string>("CAD");
  const [accountFilter, setAccountFilter] = useState<string>("__all__");

  const { data, loading, syncing, syncNow } = usePortfolio(reportCurrency);

  // Reset account filter when currency changes (data refreshes)
  const handleCurrencyChange = (val: string) => {
    setReportCurrency(val);
    setAccountFilter("__all__");
  };

  const lastSynced = data?.last_sync_at
    ? dayjs(data.last_sync_at).format("MMM D, YYYY h:mm A")
    : null;

  // Total reflects the current account filter (long equity positions only)
  const visibleEquity = (data?.equity ?? []).filter(
    h => accountFilter === "__all__" || h.account_id === accountFilter
  );
  const visibleOptions = (data?.options ?? []).filter(
    h => accountFilter === "__all__" || h.account_id === accountFilter
  );
  const filteredTotal = visibleEquity.reduce((sum, h) => sum + (h.market_value ?? 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* ── Header ── */}
      <div className="reports-header">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              Portfolio
            </h1>
            {lastSynced && (
              <p className="text-xs text-slate-500 mt-0.5">Last synced: {lastSynced}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Account filter */}
            <Select value={accountFilter} onValueChange={setAccountFilter} disabled={loading}>
              <SelectTrigger className="w-[180px] h-9 border-slate-300 text-sm">
                <SelectValue placeholder="All Accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Accounts</SelectItem>
                {(data?.accounts ?? []).map(a => (
                  <SelectItem key={a.account_id} value={a.account_id}>
                    {a.account_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Currency selector */}
            <Select value={reportCurrency} onValueChange={handleCurrencyChange} disabled={loading}>
              <SelectTrigger className="w-[90px] h-9 border-slate-300 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CAD">CAD</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>

            {/* Sync Now */}
            <Button
              variant="outline"
              size="sm"
              onClick={syncNow}
              disabled={syncing || loading}
              className="border-slate-300 hover:bg-slate-50"
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1.5" />
              )}
              Sync Now
            </Button>
          </div>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* ── Total card ── */}
        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-4">
            {loading && !data ? (
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading portfolio…</span>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">
                    {accountFilter === "__all__" ? "Total Portfolio Value" : (data?.accounts.find(a => a.account_id === accountFilter)?.account_name ?? "Account Value")}
                  </p>
                  <p className="text-3xl font-bold text-slate-900 mt-1">
                    {formatCurrency(filteredTotal, reportCurrency)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {visibleEquity.length} equity position{visibleEquity.length !== 1 ? "s" : ""}
                    {visibleOptions.length > 0 && ` · ${visibleOptions.length} option contract${visibleOptions.length !== 1 ? "s" : ""}`}
                    &nbsp;· Long positions only
                  </p>
                </div>
                <TrendingUp className="h-10 w-10 text-blue-200" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Equity holdings ── */}
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50 border-b border-slate-200 py-2 px-3">
            <CardTitle className="text-sm font-semibold text-slate-800">Holdings</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading && !data ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              </div>
            ) : (
              <HoldingsTable rows={visibleEquity} currency={reportCurrency} />
            )}
          </CardContent>
        </Card>

        {/* ── Options ── */}
        {visibleOptions.length > 0 && (
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="bg-gradient-to-r from-slate-50 to-orange-50 border-b border-slate-200 py-2 px-3">
              <CardTitle className="text-sm font-semibold text-slate-700">Options</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <HoldingsTable rows={visibleOptions} currency={reportCurrency} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
