"use client";

import { Loader2, RefreshCw, ChevronDown, Lock, Unlock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { useEntity } from "@/contexts/EntityContext";
import { FinancialYearSelector } from "@/components/Reports/FinancialYearSelector";
import { ReportAccountFilter } from "@/components/Reports/ReportAccountFilter";
import {
  useOptionsIncomeReport,
  computeLegMarketValue,
  computeLegUnrealizedPnl,
  getUnderlyingPriceStatus,
  type OpenPositionFilter,
  type OptionsIncomeTransactionRow,
  type PriceStatus,
} from "../data/useOptionsIncomeData";

const priceStatusClass: Record<PriceStatus, string> = {
  safe: "text-emerald-700",
  warning: "text-orange-600",
  danger: "text-red-600",
  neutral: "text-slate-700",
};

function fmtQty(n: number) {
  return n % 1 === 0 ? n.toLocaleString() : n.toFixed(2);
}

function PnlText({ value, currency }: { value: number; currency: string }) {
  return (
    <span className={cn("font-mono font-semibold", value > 0 ? "text-emerald-600" : value < 0 ? "text-red-600" : "text-slate-700")}>
      {value >= 0 ? "+" : "−"}
      {formatCurrency(Math.abs(value), currency)}
    </span>
  );
}

// ── Stat tile ────────────────────────────────────────────────────────────────

function StatTile({ label, value, currency, sub }: { label: string; value: number; currency: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={cn("text-lg font-bold font-mono mt-0.5", value > 0 ? "text-emerald-600" : value < 0 ? "text-red-600" : "text-slate-900")}>
        {formatCurrency(value, currency)}
      </p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Position filter chips ────────────────────────────────────────────────────

function PositionFilterChips({ value, onChange }: { value: OpenPositionFilter; onChange: (v: OpenPositionFilter) => void }) {
  const options: { value: OpenPositionFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "short", label: "Short" },
    { value: "long", label: "Long" },
  ];
  return (
    <div className="flex gap-1 rounded-md border border-slate-200 bg-white p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex-1 px-2 py-1 text-xs rounded transition-colors",
            value === opt.value ? "bg-slate-900 text-white font-medium" : "text-slate-600"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Open position card ───────────────────────────────────────────────────────

function OpenPositionCard({ row, currency }: { row: OptionsIncomeTransactionRow; currency: string }) {
  const leg = row.open_leg;
  const marketValue = computeLegMarketValue(row);
  const unrealizedPnl = computeLegUnrealizedPnl(row);
  const underlyingStatus = getUnderlyingPriceStatus(row);
  const underlyingPx = row.underlying_current_price;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">
            {row.symbol}
            {row.underlying_symbol && <span className="ml-1 text-[10px] text-slate-400">{row.underlying_symbol}</span>}
          </p>
          <p className="text-[11px] text-slate-400">{row.trade_date} · {fmtQty(row.position_qty)} qty</p>
        </div>
        {marketValue != null && (
          <p className="text-sm font-mono font-medium text-slate-800 shrink-0">{formatCurrency(marketValue, currency)}</p>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs">
        <span className="text-slate-600">
          {leg ? `${leg.type} @ ${formatCurrency(leg.price, currency)}` : "—"}
        </span>
        {unrealizedPnl != null ? (
          <PnlText value={unrealizedPnl} currency={currency} />
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
        <span className={cn("font-mono", underlyingPx != null ? priceStatusClass[underlyingStatus] : "text-slate-400")}>
          Underlying {underlyingPx != null ? formatCurrency(underlyingPx, currency) : "—"}
        </span>
        <span>
          Mark {row.option_current_price != null ? formatCurrency(row.option_current_price, currency) : "—"}
        </span>
      </div>
    </div>
  );
}

function OpenPositionsList({ rows, currency }: { rows: OptionsIncomeTransactionRow[]; currency: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500 py-4 text-center">No open positions.</p>;
  }
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <OpenPositionCard key={`${row.account_id}:${row.symbol}:${row.trade_date}:${row.open_leg?.trade_id ?? ""}`} row={row} currency={currency} />
      ))}
    </div>
  );
}

// ── Closed position card ─────────────────────────────────────────────────────

function ClosedPositionCard({ row, currency }: { row: OptionsIncomeTransactionRow; currency: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{row.symbol}</p>
          <p className="text-[11px] text-slate-400">{row.trade_date} · {row.account_name}</p>
        </div>
        <PnlText value={row.profit_loss} currency={currency} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-slate-500">
        <span>Cost {row.acquisition_cost > 0 ? formatCurrency(row.acquisition_cost, currency) : "—"}</span>
        <span>Sold {row.sale_cost > 0 ? formatCurrency(row.sale_cost, currency) : "—"}</span>
      </div>
    </div>
  );
}

function ClosedPositionsList({ rows, currency }: { rows: OptionsIncomeTransactionRow[]; currency: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500 py-4 text-center">No closed positions.</p>;
  }
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <ClosedPositionCard key={`${row.account_id}:${row.symbol}:${row.trade_date}:${row.open_leg?.trade_id ?? ""}`} row={row} currency={currency} />
      ))}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function MobileOptionsIncome() {
  const { entities, currentEntityId, loading: entityLoading } = useEntity();

  const {
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
    openProceeds,
    openUnrealizedPnl,
    totalPnl,
  } = useOptionsIncomeReport({ entities, currentEntityId, entityLoading });

  return (
    <div className="space-y-3 px-4 pt-2">
      {/* Filters */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <FinancialYearSelector fyType={fyType} value={selectedFY.value} onChange={setSelectedFY} className="flex-1 h-9 border-slate-300 text-sm" />
          <select
            value={reportCurrency}
            onChange={(e) => setReportCurrency(e.target.value)}
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
          >
            {["CAD", "USD", "INR"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div className="flex shrink-0">
            <button
              onClick={() => void fetchReport()}
              disabled={loading || syncing}
              className="flex items-center justify-center h-9 w-9 rounded-l-md border border-slate-300 bg-white active:bg-slate-50"
              aria-label="Refresh"
            >
              {loading || syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={loading || syncing}
                  className="flex items-center justify-center h-9 w-6 rounded-r-md border border-l-0 border-slate-300 bg-white active:bg-slate-50"
                  aria-label="More refresh options"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void syncAndRefresh()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync &amp; Refresh
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <ReportAccountFilter
          selectedAccount={selectedAccount}
          onAccountChange={setSelectedAccount}
          onAccountClear={() => setSelectedAccount(null)}
          accountAdditionalFilters={accountAdditionalFilters}
          accountFilterOptions={accountFilterOptions}
          accountKey={currentEntityId ?? "all-entities"}
          className="w-full"
        />
      </div>

      {loading && !data ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      ) : data ? (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Total P/L (Period)" value={totalPnl} currency={currency} sub={`${data.from_date} → ${data.to_date}`} />
            <StatTile label="Unrealized P/L" value={openUnrealizedPnl} currency={currency} sub="Open positions" />
            <StatTile label="Open Net Proceeds" value={openProceeds.net} currency={currency} sub={`${openRows.length} rows`} />
            <StatTile label="Closed P/L" value={closedRows.reduce((s, r) => s + r.profit_loss, 0)} currency={currency} sub={`${closedRows.length} rows`} />
          </div>

          {/* Open positions */}
          <div>
            <div className="flex items-center justify-between mb-1.5 px-0.5">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <Unlock className="h-3.5 w-3.5" /> Open
              </h2>
              <div className="w-32">
                <PositionFilterChips value={openPositionFilter} onChange={setOpenPositionFilter} />
              </div>
            </div>
            <OpenPositionsList rows={openRows} currency={currency} />
          </div>

          {/* Closed positions */}
          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 px-0.5 flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" /> Closed
            </h2>
            <ClosedPositionsList rows={closedRows} currency={currency} />
          </div>
        </>
      ) : null}
    </div>
  );
}
