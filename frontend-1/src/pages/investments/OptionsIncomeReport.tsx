"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { reportAPI } from "@/api/postingApi";
import { formatCurrency } from "@/lib/formatters";
import { Loader2, RefreshCw, TrendingUp, Lock, Unlock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useEntity } from "@/contexts/EntityContext";
import {
  FinancialYearSelector,
  getCurrentFYOption,
  type FinancialYearOption,
  type FinancialYearType,
} from "@/components/Reports/FinancialYearSelector";
import { ReportAccountFilter } from "@/components/Reports/ReportAccountFilter";
import { cn } from "@/lib/utils";

interface OptionsIncomeTradeLeg {
  trade_id: string;
  type: "BUY" | "SELL";
  quantity: number;
  price: number;
  amount: number;
  value_date: string;
}

interface OptionsIncomeTransactionRow {
  account_id: string;
  account_name: string;
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

interface OptionsIncomeSection {
  transactions: OptionsIncomeTransactionRow[];
  total_acquisition_cost: number;
  total_sale_cost: number;
  total_profit_loss: number;
  total_income: number;
}

interface OptionsIncomeData {
  report_currency: string;
  from_date: string;
  to_date: string;
  closed: OptionsIncomeSection;
  open: OptionsIncomeSection;
  total_income: number;
}

type OpenPositionFilter = "all" | "short" | "long";
type PriceStatus = "safe" | "warning" | "danger" | "neutral";

interface TableTotals {
  acquisition_cost: number;
  sale_cost: number;
  profit_loss: number;
}

function resolveEntityFYType(
  entities: { id: string; is_it_headquartres?: boolean; financial_year_type?: string }[],
  currentId: string | null
): FinancialYearType {
  const current = entities.find((e) => e.id === currentId);
  if (current?.financial_year_type) return current.financial_year_type as FinancialYearType;
  const hq = entities.find((e) => e.is_it_headquartres);
  if (hq?.financial_year_type) return hq.financial_year_type as FinancialYearType;
  return "JAN_DEC";
}

function sumRows(rows: OptionsIncomeTransactionRow[]): TableTotals {
  return rows.reduce(
    (acc, row) => ({
      acquisition_cost: acc.acquisition_cost + row.acquisition_cost,
      sale_cost: acc.sale_cost + row.sale_cost,
      profit_loss: acc.profit_loss + row.profit_loss,
    }),
    { acquisition_cost: 0, sale_cost: 0, profit_loss: 0 }
  );
}

function fmtQty(n: number) {
  return n % 1 === 0 ? n.toLocaleString() : n.toFixed(2);
}

function getUnderlyingPriceStatus(row: OptionsIncomeTransactionRow): PriceStatus {
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

const priceStatusClass: Record<PriceStatus, string> = {
  safe: "text-emerald-700",
  warning: "text-orange-600",
  danger: "text-red-600",
  neutral: "text-slate-700",
};

function LegCell({ leg, currency }: { leg: OptionsIncomeTradeLeg | null; currency: string }) {
  if (!leg) return <span className="text-slate-400">—</span>;
  return (
    <div className="text-sm leading-snug">
      <div className="font-medium text-slate-800">
        {leg.type} {fmtQty(leg.quantity)} @ {formatCurrency(leg.price, currency)}
      </div>
      <div className="text-slate-500">{leg.value_date}</div>
      <div className="tabular-nums text-slate-700">{formatCurrency(leg.amount, currency)}</div>
    </div>
  );
}

function PnlCell({ value, currency }: { value: number; currency: string }) {
  return (
    <span
      className={cn(
        "tabular-nums font-medium",
        value > 0 ? "text-emerald-700" : value < 0 ? "text-red-600" : "text-slate-700"
      )}
    >
      {formatCurrency(value, currency)}
    </span>
  );
}

function UnderlyingPriceCell({ row, currency }: { row: OptionsIncomeTransactionRow; currency: string }) {
  const status = getUnderlyingPriceStatus(row);
  const px = row.underlying_current_price;

  if (px == null) return <span className="text-slate-400">—</span>;

  return (
    <div className="text-sm leading-snug">
      <div className={cn("font-semibold tabular-nums", priceStatusClass[status])}>
        {formatCurrency(px, currency)}
      </div>
      {row.strike_price != null && (
        <div className="text-xs text-slate-500 tabular-nums">
          Strike {formatCurrency(row.strike_price, currency)}
          {row.option_type ? ` ${row.option_type}` : ""}
        </div>
      )}
      {row.position_qty > 0 && row.unrealized_pnl != null && (
        <div className={cn("text-xs tabular-nums", priceStatusClass[status])}>
          Unrealized {formatCurrency(row.unrealized_pnl, currency)}
        </div>
      )}
    </div>
  );
}

function TableTotalsFooter({
  rows,
  currency,
  labelColSpan,
}: {
  rows: OptionsIncomeTransactionRow[];
  currency: string;
  labelColSpan: number;
}) {
  const totals = sumRows(rows);
  return (
    <TableFooter>
      <TableRow className="bg-slate-50 font-semibold border-t-2 border-slate-200 hover:bg-slate-50">
        <TableCell colSpan={labelColSpan} className="text-slate-700">
          Total ({rows.length} {rows.length === 1 ? "row" : "rows"})
        </TableCell>
        <TableCell className="text-right tabular-nums text-red-700">
          {formatCurrency(totals.acquisition_cost, currency)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-emerald-700">
          {formatCurrency(totals.sale_cost, currency)}
        </TableCell>
        <TableCell className="text-right">
          <PnlCell value={totals.profit_loss} currency={currency} />
        </TableCell>
      </TableRow>
    </TableFooter>
  );
}

function OpenTransactionsTable({
  rows,
  currency,
}: {
  rows: OptionsIncomeTransactionRow[];
  currency: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500 py-6 text-center">No transactions in this section.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Symbol</TableHead>
          <TableHead className="text-right">Option Price</TableHead>
          <TableHead>Underlying</TableHead>
          <TableHead className="text-right">Underlying Price</TableHead>
          <TableHead>Account</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead>Transaction</TableHead>
          <TableHead className="text-right">Acquisition Cost</TableHead>
          <TableHead className="text-right">Sale Proceeds</TableHead>
          <TableHead className="text-right">P/L</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={`${row.account_id}:${row.symbol}:${row.trade_date}:${row.open_leg?.trade_id ?? ""}`}>
            <TableCell className="text-slate-600 text-sm whitespace-nowrap">{row.trade_date}</TableCell>
            <TableCell className="font-medium">{row.symbol}</TableCell>
            <TableCell className="text-right tabular-nums text-sm text-slate-700">
              {row.option_current_price != null
                ? formatCurrency(row.option_current_price, currency)
                : "—"}
            </TableCell>
            <TableCell>{row.underlying_symbol ?? "—"}</TableCell>
            <TableCell className="text-right">
              <UnderlyingPriceCell row={row} currency={currency} />
            </TableCell>
            <TableCell className="text-slate-600">{row.account_name}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtQty(row.quantity)}</TableCell>
            <TableCell><LegCell leg={row.open_leg} currency={currency} /></TableCell>
            <TableCell className="text-right tabular-nums text-red-600">
              {row.acquisition_cost > 0 ? formatCurrency(row.acquisition_cost, currency) : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums text-emerald-700">
              {row.sale_cost > 0 ? formatCurrency(row.sale_cost, currency) : "—"}
            </TableCell>
            <TableCell className="text-right">
              <PnlCell value={row.profit_loss} currency={currency} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableTotalsFooter rows={rows} currency={currency} labelColSpan={8} />
    </Table>
  );
}

function ClosedTransactionsTable({
  rows,
  currency,
}: {
  rows: OptionsIncomeTransactionRow[];
  currency: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500 py-6 text-center">No transactions in this section.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Symbol</TableHead>
          <TableHead>Underlying</TableHead>
          <TableHead>Account</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead>Open</TableHead>
          <TableHead>Close</TableHead>
          <TableHead className="text-right">Acquisition Cost</TableHead>
          <TableHead className="text-right">Sale Proceeds</TableHead>
          <TableHead className="text-right">P/L</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={`${row.account_id}:${row.symbol}:${row.trade_date}:${row.open_leg?.trade_id ?? ""}`}>
            <TableCell className="text-slate-600 text-sm whitespace-nowrap">{row.trade_date}</TableCell>
            <TableCell className="font-medium">{row.symbol}</TableCell>
            <TableCell>{row.underlying_symbol ?? "—"}</TableCell>
            <TableCell className="text-slate-600">{row.account_name}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtQty(row.quantity)}</TableCell>
            <TableCell><LegCell leg={row.open_leg} currency={currency} /></TableCell>
            <TableCell><LegCell leg={row.close_leg} currency={currency} /></TableCell>
            <TableCell className="text-right tabular-nums text-red-600">
              {row.acquisition_cost > 0 ? formatCurrency(row.acquisition_cost, currency) : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums text-emerald-700">
              {row.sale_cost > 0 ? formatCurrency(row.sale_cost, currency) : "—"}
            </TableCell>
            <TableCell className="text-right">
              <PnlCell value={row.profit_loss} currency={currency} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableTotalsFooter rows={rows} currency={currency} labelColSpan={7} />
    </Table>
  );
}

function SectionSummary({
  label,
  totals,
  rowCount,
  currency,
  icon: Icon,
  accent,
}: {
  label: string;
  totals: TableTotals;
  rowCount: number;
  currency: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <div className={cn("rounded-lg border p-4", accent)}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-slate-600" />
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span className="text-xs text-slate-500">({rowCount} rows)</span>
      </div>
      <p
        className={cn(
          "text-2xl font-bold tabular-nums",
          totals.profit_loss > 0 ? "text-emerald-700" : totals.profit_loss < 0 ? "text-red-600" : "text-slate-900"
        )}
      >
        {formatCurrency(totals.profit_loss, currency)}
      </p>
      <p className="text-xs text-slate-500 mt-1">
        Acquired {formatCurrency(totals.acquisition_cost, currency)} · Sold{" "}
        {formatCurrency(totals.sale_cost, currency)}
      </p>
    </div>
  );
}

function OpenPositionFilter({
  value,
  onChange,
}: {
  value: OpenPositionFilter;
  onChange: (value: OpenPositionFilter) => void;
}) {
  const options: { value: OpenPositionFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "short", label: "Short" },
    { value: "long", label: "Long" },
  ];

  return (
    <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-3 py-1.5 text-sm rounded transition-colors",
            value === opt.value
              ? "bg-slate-900 text-white font-medium"
              : "text-slate-600 hover:bg-slate-100"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function OptionsIncomeReport() {
  const { entities, currentEntityId, loading: entityLoading } = useEntity();
  const fyType = useMemo(
    () => resolveEntityFYType(entities, currentEntityId),
    [entities, currentEntityId]
  );

  const [selectedFY, setSelectedFY] = useState<FinancialYearOption>(() =>
    getCurrentFYOption("JAN_DEC")
  );
  const [reportCurrency, setReportCurrency] = useState("CAD");
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [openPositionFilter, setOpenPositionFilter] = useState<OpenPositionFilter>("all");
  const [data, setData] = useState<OptionsIncomeData | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchSeq = useRef(0);

  const accountAdditionalFilters = useMemo(
    () => (currentEntityId ? { legal_entity_id: currentEntityId } : undefined),
    [currentEntityId]
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
  const totalPnl = closedTotals.profit_loss + openTotals.profit_loss;

  return (
    <div className="p-4 space-y-4 max-w-[1600px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Options Income Report</h1>
          <p className="text-sm text-slate-500">
            Period transactions with acquisition cost, sale proceeds, and P/L. Closed round-trips on one row.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FinancialYearSelector
            fyType={fyType}
            value={selectedFY.value}
            onChange={setSelectedFY}
          />
          <select
            value={reportCurrency}
            onChange={(e) => setReportCurrency(e.target.value)}
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
          >
            {["CAD", "USD", "INR"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => void fetchReport()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>
      </div>

      <div className="max-w-sm">
        <label className="text-xs font-medium text-slate-600 mb-1 block">Account</label>
        <ReportAccountFilter
          selectedAccount={selectedAccount}
          onAccountChange={setSelectedAccount}
          onAccountClear={() => setSelectedAccount(null)}
          accountAdditionalFilters={accountAdditionalFilters}
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="shadow-sm border-slate-200">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-slate-600 text-sm mb-1">
                  <TrendingUp className="h-4 w-4" />
                  Total P/L (Period)
                </div>
                <p
                  className={cn(
                    "text-2xl font-bold tabular-nums",
                    totalPnl > 0 ? "text-emerald-700" : totalPnl < 0 ? "text-red-600" : "text-slate-900"
                  )}
                >
                  {formatCurrency(totalPnl, currency)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {data.from_date} → {data.to_date}
                </p>
              </CardContent>
            </Card>
            <SectionSummary
              label="Open Positions"
              totals={openTotals}
              rowCount={openRows.length}
              currency={currency}
              icon={Unlock}
              accent="bg-orange-50 border-orange-200"
            />
            <SectionSummary
              label="Closed Positions"
              totals={closedTotals}
              rowCount={closedRows.length}
              currency={currency}
              icon={Lock}
              accent="bg-slate-50 border-slate-200"
            />
          </div>

          <Card className="shadow-sm border-slate-200">
            <CardHeader className="py-3 px-4 border-b border-slate-100 flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Unlock className="h-4 w-4" />
                Open — period transactions
              </CardTitle>
              <OpenPositionFilter value={openPositionFilter} onChange={setOpenPositionFilter} />
            </CardHeader>
            <CardContent className="p-0">
              <OpenTransactionsTable rows={openRows} currency={currency} />
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardHeader className="py-3 px-4 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Closed — round-trip transactions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ClosedTransactionsTable rows={closedRows} currency={currency} />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
