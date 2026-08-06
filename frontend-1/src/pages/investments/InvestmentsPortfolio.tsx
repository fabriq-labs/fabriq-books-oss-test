"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import { Loader2, RefreshCw, TrendingUp, BarChart3 } from "lucide-react";
import dayjs from "dayjs";
import { cn } from "@/lib/utils";
import { useEntity } from "@/contexts/EntityContext";
import {
  usePortfolio,
  toNative,
  holdingKey,
  mergeHoldingsByInstrument,
  type HoldingRow,
  type AccountSummary,
} from "./data/usePortfolioData";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtQty(n: number) {
  return n % 1 === 0 ? n.toLocaleString() : n.toFixed(4);
}

// ── Account Cards ──────────────────────────────────────────────────────────────

function AccountCards({
  accounts,
  allTotal,
  selected,
  currency,
  loading,
  onSelect,
}: {
  accounts: AccountSummary[];
  allTotal: number;
  selected: string;
  currency: string;
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  const cards = [
    { id: "__all__", label: "All Accounts", value: allTotal, count: accounts.reduce((s, a) => s + a.holdings_count, 0) },
    ...accounts.map(a => ({ id: a.account_id, label: a.account_name, value: a.total_equity, count: a.holdings_count })),
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {cards.map(card => (
        <button
          key={card.id}
          disabled={loading}
          onClick={() => onSelect(card.id)}
          className={cn(
            "flex-shrink-0 rounded-lg border px-4 py-3 text-left transition-all",
            "min-w-[140px] focus:outline-none focus:ring-2 focus:ring-blue-400",
            selected === card.id
              ? "border-blue-500 bg-blue-50 shadow-sm"
              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
          )}
        >
          <p className={cn("text-xs font-semibold truncate", selected === card.id ? "text-blue-700" : "text-slate-700")}>
            {card.label}
          </p>
          <p className={cn("text-sm font-bold mt-0.5 font-mono", selected === card.id ? "text-blue-900" : "text-slate-900")}>
            {loading ? "—" : formatCurrency(card.value, currency)}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">{card.count} position{card.count !== 1 ? "s" : ""}</p>
        </button>
      ))}
    </div>
  );
}

// ── Cash Section ──────────────────────────────────────────────────────────────

function CashSection({ rows }: { rows: HoldingRow[] }) {
  if (rows.length === 0) return null;

  // Group by native currency code
  const byCurrency = new Map<string, HoldingRow[]>();
  for (const row of rows) {
    const key = row.native_currency_code ?? row.symbol;
    if (!byCurrency.has(key)) byCurrency.set(key, []);
    byCurrency.get(key)!.push(row);
  }

  return (
    <div className="p-3 flex flex-wrap gap-3">
      {Array.from(byCurrency.entries()).map(([currency, holdings]) => {
        const total = holdings.reduce((sum, h) => {
          return sum + ((h.market_value ?? 0) / (h.conversion_rate || 1));
        }, 0);

        return (
          <div
            key={currency}
            className="flex-1 min-w-[180px] rounded-lg border border-slate-200 bg-slate-50 overflow-hidden"
          >
            {/* Currency header */}
            <div className="px-3 py-2 border-b border-slate-200 bg-white flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">{currency}</span>
            </div>

            {/* Account rows */}
            <div className="px-3 py-2 space-y-2">
              {holdings.map((h, i) => {
                const amount = (h.market_value ?? 0) / (h.conversion_rate || 1);
                return (
                  <div key={i} className="flex items-baseline justify-between gap-3">
                    <span className="text-[11px] text-slate-500 truncate">{h.account_name}</span>
                    <span className={`text-xs font-mono font-semibold whitespace-nowrap ${amount < 0 ? "text-red-600" : "text-slate-800"}`}>
                      {formatCurrency(amount, currency)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Total */}
            {holdings.length > 1 && (
              <div className="px-3 py-2 border-t border-slate-200 flex justify-between items-center bg-white">
                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Total</span>
                <span className={`text-xs font-mono font-bold ${total < 0 ? "text-red-600" : "text-slate-700"}`}>
                  {formatCurrency(total, currency)}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Holdings Table ─────────────────────────────────────────────────────────────

function HoldingsTable({ rows }: { rows: HoldingRow[] }) {
  if (rows.length === 0) {
    return <div className="py-8 text-center text-sm text-slate-500">No positions found.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50 border-b border-slate-200">
            <TableHead className="py-2 px-3 text-xs font-semibold text-slate-700">Symbol</TableHead>
            <TableHead className="py-2 px-3 text-xs font-semibold text-slate-700 text-right">Qty</TableHead>
            <TableHead className="py-2 px-3 text-xs font-semibold text-slate-700 text-right">Avg Cost</TableHead>
            <TableHead className="py-2 px-3 text-xs font-semibold text-slate-700 text-right">Current Price</TableHead>
            <TableHead className="py-2 px-3 text-xs font-semibold text-slate-700 text-right">Market Value</TableHead>
            <TableHead className="py-2 px-3 text-xs font-semibold text-slate-700 text-right">Unrealized P&L</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const currency = row.native_currency_code ?? "USD";
            const rate = row.conversion_rate || 1;
            const avgCost    = toNative(row.average_cost, rate);
            const curPrice   = toNative(row.current_price, rate);
            const mktValue   = toNative(row.market_value, rate);
            const unrPnl     = toNative(row.unrealized_pnl, rate);
            const pnlPositive = (unrPnl ?? 0) >= 0;

            return (
              <TableRow key={holdingKey(row)} className="border-b border-slate-100 hover:bg-slate-50">
                {/* Symbol + currency + account stacked */}
                <TableCell className="py-2 px-3">
                  <span className="text-xs font-semibold text-slate-900">{row.symbol}</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-slate-400 font-medium">{currency}</span>
                    {row.account_name && (
                      <>
                        <span className="text-[10px] text-slate-300">·</span>
                        <span className="text-[10px] text-slate-400 truncate max-w-[120px]">{row.account_name}</span>
                      </>
                    )}
                  </div>
                </TableCell>
                <TableCell className="py-2 px-3 text-xs text-right font-mono text-slate-700">
                  {fmtQty(row.quantity)}
                </TableCell>
                <TableCell className="py-2 px-3 text-xs text-right font-mono text-slate-600">
                  {avgCost != null ? formatCurrency(avgCost, currency) : "—"}
                </TableCell>
                <TableCell className="py-2 px-3 text-xs text-right font-mono text-slate-600">
                  {curPrice != null ? formatCurrency(curPrice, currency) : "—"}
                </TableCell>
                <TableCell className={cn(
                  "py-2 px-3 text-xs text-right font-mono font-semibold",
                  (mktValue ?? 0) < 0 ? "text-red-600" : "text-slate-900"
                )}>
                  {mktValue != null ? formatCurrency(mktValue, currency) : "—"}
                </TableCell>
                <TableCell className={cn(
                  "py-2 px-3 text-xs text-right font-mono font-semibold",
                  unrPnl == null ? "text-slate-400" : pnlPositive ? "text-emerald-600" : "text-red-600"
                )}>
                  {unrPnl != null
                    ? `${pnlPositive ? "+" : ""}${formatCurrency(unrPnl, currency)}`
                    : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function InvestmentsPortfolio() {
  const { currentEntityId, loading: entityLoading } = useEntity();
  const [reportCurrency, setReportCurrency] = useState<string>("CAD");
  const [accountFilter, setAccountFilter] = useState<string>("__all__");

  const { data, loading, syncing, syncNow } = usePortfolio(
    reportCurrency,
    currentEntityId,
    entityLoading
  );

  useEffect(() => {
    setAccountFilter("__all__");
  }, [currentEntityId]);

  const handleCurrencyChange = (val: string) => {
    setReportCurrency(val);
    setAccountFilter("__all__");
  };

  const lastSynced = data?.last_sync_at
    ? dayjs(data.last_sync_at).format("MMM D, YYYY h:mm A")
    : null;

  const visibleEquity = mergeHoldingsByInstrument(
    (data?.equity ?? []).filter(
      h => accountFilter === "__all__" || h.account_id === accountFilter
    )
  );
  const visibleOptions = mergeHoldingsByInstrument(
    (data?.options ?? []).filter(
      h => accountFilter === "__all__" || h.account_id === accountFilter
    )
  );
  const visibleCash = (data?.cash ?? []).filter(
    h => accountFilter === "__all__" || h.account_id === accountFilter
  );
  const filteredMarketValue = visibleEquity.reduce((sum, h) => sum + (h.market_value ?? 0), 0);
  const filteredCash = visibleCash.reduce((sum, h) => sum + (h.market_value ?? 0), 0);
  const filteredTotalEquity = filteredMarketValue + filteredCash;

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
          <Button
            variant="outline"
            size="sm"
            onClick={syncNow}
            disabled={syncing || loading}
            className="border-slate-300 hover:bg-slate-50"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
            Sync Now
          </Button>
        </div>

        {/* ── Account card selector ── */}
        <div className="mt-3">
          {loading && !data ? (
            <div className="flex gap-2">
              {[1, 2, 3].map(n => (
                <div key={n} className="h-16 w-36 rounded-lg border border-slate-200 bg-white animate-pulse" />
              ))}
            </div>
          ) : (
            <AccountCards
              accounts={data?.accounts ?? []}
              allTotal={data?.total_equity ?? 0}
              selected={accountFilter}
              currency={reportCurrency}
              loading={loading}
              onSelect={setAccountFilter}
            />
          )}
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* ── Total card with inline currency toggle ── */}
        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-4">
            {loading && !data ? (
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading portfolio…</span>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">
                      {accountFilter === "__all__"
                        ? "Total Equity"
                        : (data?.accounts.find(a => a.account_id === accountFilter)?.account_name ?? "Account")}
                    </p>
                    {/* Inline currency toggle */}
                    <div className="flex rounded-md border border-slate-200 overflow-hidden text-[10px] font-semibold">
                      {["CAD", "USD"].map(c => (
                        <button
                          key={c}
                          onClick={() => handleCurrencyChange(c)}
                          className={cn(
                            "px-2 py-0.5 transition-colors",
                            reportCurrency === c
                              ? "bg-slate-700 text-white"
                              : "bg-white text-slate-500 hover:bg-slate-50"
                          )}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-slate-900 mt-1">
                    {formatCurrency(filteredTotalEquity, reportCurrency)}
                  </p>
                  {/* Market value + Cash breakdown, matching Questrade's display */}
                  <div className="mt-2 flex flex-col gap-0.5 border-t border-slate-100 pt-2">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Market value</span>
                      <span className="font-mono text-slate-700">{formatCurrency(filteredMarketValue, reportCurrency)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Cash</span>
                      <span className="font-mono text-slate-700">{formatCurrency(filteredCash, reportCurrency)}</span>
                    </div>
                  </div>
                </div>
                <TrendingUp className="h-10 w-10 text-blue-200 ml-4" />
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
              <HoldingsTable rows={visibleEquity} />
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
              <HoldingsTable rows={visibleOptions} />
            </CardContent>
          </Card>
        )}

        {/* ── Cash ── */}
        {visibleCash.length > 0 && (
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="bg-gradient-to-r from-slate-50 to-emerald-50 border-b border-slate-200 py-2 px-3">
              <CardTitle className="text-sm font-semibold text-slate-700">Cash</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <CashSection rows={visibleCash} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
