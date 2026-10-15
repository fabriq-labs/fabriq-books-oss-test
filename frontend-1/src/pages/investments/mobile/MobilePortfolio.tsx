"use client";

import { useState, useEffect } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import dayjs from "dayjs";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { useEntity } from "@/contexts/EntityContext";
import {
  usePortfolio,
  toNative,
  holdingKey,
  mergeHoldingsByInstrument,
  type HoldingRow,
  type AccountSummary,
} from "../data/usePortfolioData";

function fmtQty(n: number) {
  return n % 1 === 0 ? n.toLocaleString() : n.toFixed(4);
}

// ── Account chips ────────────────────────────────────────────────────────────

function AccountChips({
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
  const chips = [
    { id: "__all__", label: "All", value: allTotal },
    ...accounts.map((a) => ({ id: a.account_id, label: a.account_name, value: a.total_equity })),
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {chips.map((chip) => (
        <button
          key={chip.id}
          disabled={loading}
          onClick={() => onSelect(chip.id)}
          className={cn(
            "flex-shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap",
            selected === chip.id
              ? "border-blue-500 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-white text-slate-600"
          )}
        >
          {chip.label}
          {!loading && (
            <span className="ml-1.5 text-slate-400 font-mono">
              {formatCurrency(chip.value, currency)}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Holding card ─────────────────────────────────────────────────────────────

function HoldingCard({ row }: { row: HoldingRow }) {
  const currency = row.native_currency_code ?? "USD";
  const rate = row.conversion_rate || 1;
  const avgCost = toNative(row.average_cost, rate);
  const curPrice = toNative(row.current_price, rate);
  const mktValue = toNative(row.market_value, rate);
  const unrPnl = toNative(row.unrealized_pnl, rate);
  const pnlPositive = (unrPnl ?? 0) >= 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{row.symbol}</p>
          <p className="text-[11px] text-slate-400 truncate">
            {currency}
            {row.account_name ? ` · ${row.account_name}` : ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={cn("text-sm font-mono font-semibold", (mktValue ?? 0) < 0 ? "text-red-600" : "text-slate-900")}>
            {mktValue != null ? formatCurrency(mktValue, currency) : "—"}
          </p>
          <p className={cn("text-xs font-mono", unrPnl == null ? "text-slate-400" : pnlPositive ? "text-emerald-600" : "text-red-600")}>
            {unrPnl != null ? `${pnlPositive ? "+" : ""}${formatCurrency(unrPnl, currency)}` : "—"}
          </p>
        </div>
      </div>
      <div className="mt-1.5 flex justify-between gap-2 text-[11px] text-slate-500">
        <span>{fmtQty(row.quantity)} shares</span>
        <span>Avg {avgCost != null ? formatCurrency(avgCost, currency) : "—"}</span>
        <span>Price {curPrice != null ? formatCurrency(curPrice, currency) : "—"}</span>
      </div>
    </div>
  );
}

function HoldingsList({ rows }: { rows: HoldingRow[] }) {
  if (rows.length === 0) {
    return <div className="py-6 text-center text-sm text-slate-500">No positions found.</div>;
  }
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <HoldingCard key={holdingKey(row)} row={row} />
      ))}
    </div>
  );
}

// ── Cash card ────────────────────────────────────────────────────────────────

function CashList({ rows }: { rows: HoldingRow[] }) {
  if (rows.length === 0) return null;

  const byCurrency = new Map<string, HoldingRow[]>();
  for (const row of rows) {
    const key = row.native_currency_code ?? row.symbol;
    if (!byCurrency.has(key)) byCurrency.set(key, []);
    byCurrency.get(key)!.push(row);
  }

  return (
    <div className="space-y-2">
      {Array.from(byCurrency.entries()).map(([currency, holdings]) => (
        <div key={currency} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="px-3 py-1.5 border-b border-slate-100 bg-slate-50">
            <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">{currency}</span>
          </div>
          <div className="px-3 py-2 space-y-1.5">
            {holdings.map((h, i) => {
              const amount = (h.market_value ?? 0) / (h.conversion_rate || 1);
              return (
                <div key={i} className="flex items-baseline justify-between gap-3">
                  <span className="text-xs text-slate-500 truncate">{h.account_name}</span>
                  <span className={cn("text-xs font-mono font-semibold whitespace-nowrap", amount < 0 ? "text-red-600" : "text-slate-800")}>
                    {formatCurrency(amount, currency)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function MobilePortfolio() {
  const { currentEntityId, loading: entityLoading } = useEntity();
  const [reportCurrency, setReportCurrency] = useState<string>("CAD");
  const [accountFilter, setAccountFilter] = useState<string>("__all__");

  const { data, loading, syncing, syncNow } = usePortfolio(reportCurrency, currentEntityId, entityLoading);

  useEffect(() => {
    setAccountFilter("__all__");
  }, [currentEntityId]);

  const lastSynced = data?.last_sync_at ? dayjs(data.last_sync_at).format("MMM D, h:mm A") : null;

  const visibleEquity = mergeHoldingsByInstrument(
    (data?.equity ?? []).filter((h) => accountFilter === "__all__" || h.account_id === accountFilter)
  );
  const visibleOptions = mergeHoldingsByInstrument(
    (data?.options ?? []).filter((h) => accountFilter === "__all__" || h.account_id === accountFilter)
  );
  const visibleCash = (data?.cash ?? []).filter((h) => accountFilter === "__all__" || h.account_id === accountFilter);
  const filteredMarketValue = visibleEquity.reduce((sum, h) => sum + (h.market_value ?? 0), 0);
  const filteredCash = visibleCash.reduce((sum, h) => sum + (h.market_value ?? 0), 0);
  const filteredTotalEquity = filteredMarketValue + filteredCash;

  return (
    <div className="space-y-3 px-4 pt-2">
      {/* Sync row */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-slate-400">{lastSynced ? `Synced ${lastSynced}` : ""}</p>
        <button
          onClick={syncNow}
          disabled={syncing || loading}
          className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 active:bg-slate-50"
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Sync
        </button>
      </div>

      {/* Account chips */}
      {loading && !data ? (
        <div className="flex gap-2 overflow-x-auto">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-8 w-24 rounded-full border border-slate-200 bg-white animate-pulse" />
          ))}
        </div>
      ) : (
        <AccountChips
          accounts={data?.accounts ?? []}
          allTotal={data?.total_equity ?? 0}
          selected={accountFilter}
          currency={reportCurrency}
          loading={loading}
          onSelect={setAccountFilter}
        />
      )}

      {/* Total card */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        {loading && !data ? (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading portfolio…</span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">
                {accountFilter === "__all__"
                  ? "Total Equity"
                  : data?.accounts.find((a) => a.account_id === accountFilter)?.account_name ?? "Account"}
              </p>
              <div className="flex rounded-md border border-slate-200 overflow-hidden text-[10px] font-semibold">
                {["CAD", "USD"].map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setReportCurrency(c);
                      setAccountFilter("__all__");
                    }}
                    className={cn("px-2 py-1", reportCurrency === c ? "bg-slate-700 text-white" : "bg-white text-slate-500")}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(filteredTotalEquity, reportCurrency)}</p>
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
          </>
        )}
      </div>

      {/* Holdings */}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 px-0.5">Holdings</h2>
        {loading && !data ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          </div>
        ) : (
          <HoldingsList rows={visibleEquity} />
        )}
      </div>

      {/* Options */}
      {visibleOptions.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 px-0.5">Options</h2>
          <HoldingsList rows={visibleOptions} />
        </div>
      )}

      {/* Cash */}
      {visibleCash.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 px-0.5">Cash</h2>
          <CashList rows={visibleCash} />
        </div>
      )}
    </div>
  );
}
