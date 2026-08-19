"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { reportAPI } from "@/api/api";
import { formatCurrency } from "@/lib/formatters";
import {
  Loader2, Building2, CreditCard, TrendingUp, DollarSign,
  Receipt, FileSpreadsheet, Play,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import "@/styles/reports.css";
import { ReportIdleState } from "@/components/Reports/ReportIdleState";
import { isEntityHeadquarters, useEntity } from "@/contexts/EntityContext";
import {
  FinancialYearSelector,
  getPreviousFYOption,
  buildMonthOptions,
  type FinancialYearOption,
  type MonthOption,
  type FinancialYearType,
} from "@/components/Reports/FinancialYearSelector";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MonthlyTrialBalanceRow {
  account_id: string;
  account_name: string;
  account_path: string;
  classification: string;
  account_type: string;
  level: number;
  parent_account_id: string;
  fy_opening: number;
  period_month: string;   // 'YYYY-MM-DD' (first day of month)
  period_debits: number;
  period_credits: number;
  net_movement: number;
  cumulative_balance: number;
}

// Group flat rows by account, then collect per-month data
interface AccountMonthlyData {
  account_id: string;
  account_name: string;
  account_path: string;
  classification: string;
  level: number;
  parent_account_id: string;
  fy_opening: number;
  months: {
    period_month: string;
    period_debits: number;
    period_credits: number;
    net_movement: number;
    cumulative_balance: number;
  }[];
  closing_balance: number; // cumulative of last month
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CLASSIFICATION_ORDER = ["Assets", "Liabilities", "Equity", "Income", "Expense"];

function getClassificationIcon(c: string) {
  const n = c.toLowerCase();
  if (n.includes("asset"))   return <Building2 className="h-4 w-4 text-blue-600" />;
  if (n.includes("liabil"))  return <CreditCard className="h-4 w-4 text-red-600" />;
  if (n.includes("equit"))   return <TrendingUp className="h-4 w-4 text-green-600" />;
  if (n.includes("income") || n.includes("revenue")) return <DollarSign className="h-4 w-4 text-emerald-600" />;
  if (n.includes("expense")) return <Receipt className="h-4 w-4 text-orange-600" />;
  return <Building2 className="h-4 w-4 text-slate-600" />;
}

function monthLabel(isoDate: string) {
  return dayjs(isoDate).format("MMM YY"); // e.g. "Apr 25"
}

function groupRows(flat: MonthlyTrialBalanceRow[]): AccountMonthlyData[] {
  const map = new Map<string, AccountMonthlyData>();
  for (const r of flat) {
    if (!map.has(r.account_id)) {
      map.set(r.account_id, {
        account_id: r.account_id,
        account_name: r.account_name,
        account_path: r.account_path,
        classification: r.classification,
        level: r.level,
        parent_account_id: r.parent_account_id,
        fy_opening: r.fy_opening,
        months: [],
        closing_balance: 0,
      });
    }
    const acc = map.get(r.account_id)!;
    acc.months.push({
      period_month: r.period_month,
      period_debits: r.period_debits,
      period_credits: r.period_credits,
      net_movement: r.net_movement,
      cumulative_balance: r.cumulative_balance,
    });
    acc.closing_balance = r.cumulative_balance; // last month wins
  }
  // sort months within each account
  for (const acc of map.values()) {
    acc.months.sort((a, b) => a.period_month.localeCompare(b.period_month));
  }
  return [...map.values()];
}

function hasActivity(acc: AccountMonthlyData) {
  return (
    acc.fy_opening !== 0 ||
    acc.closing_balance !== 0 ||
    acc.months.some((m) => m.period_debits !== 0 || m.period_credits !== 0)
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MonthlyTrialBalance() {
  const { entities, currentEntity, currentEntityId, loading: entityLoading } = useEntity();

  const headquartersEntity = useMemo(
    () => entities.find((e) => isEntityHeadquarters(e)) ?? null,
    [entities]
  );
  const defaultCurrency = useMemo(
    () => currentEntity?.currency ?? headquartersEntity?.currency ?? null,
    [currentEntity, headquartersEntity]
  );

  const [selectedFY, setSelectedFY] = useState<FinancialYearOption>(() => getPreviousFYOption("JAN_DEC"));
  const [selectedMonth, setSelectedMonth] = useState<MonthOption | null>(null);
  const [showOnlyActive, setShowOnlyActive] = useState(true);

  const [rows, setRows] = useState<MonthlyTrialBalanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const fetchSeq = useRef(0);

  const monthOptions = useMemo(() => buildMonthOptions(selectedFY), [selectedFY]);

  // Reset FY when entity changes
  useEffect(() => {
    const type: FinancialYearType = currentEntity?.financial_year_type ?? "JAN_DEC";
    setSelectedFY(getPreviousFYOption(type));
    setSelectedMonth(null);
  }, [currentEntity?.id]);

  // from_date = FY start; to_date = end of selected month (or FY end if no month)
  const fromDate = selectedFY.from_date;
  const toDate = selectedMonth?.to_date ?? selectedFY.to_date;

  const legalEntityIds = useMemo(
    () => (currentEntityId ? [currentEntityId] : []),
    [currentEntityId]
  );

  const fetchData = useCallback(async () => {
    if (entityLoading) return;
    const seq = ++fetchSeq.current;
    setHasRun(true);
    setLoading(true);
    try {
      const result = (await reportAPI.getReport("monthly_trial_balance", {
        from_date: fromDate,
        to_date: toDate,
        legal_entity_ids: legalEntityIds.length > 0 ? legalEntityIds : undefined,
      })) as any;
      if (seq !== fetchSeq.current) return;
      setRows(Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : []);
    } catch (err) {
      if (seq !== fetchSeq.current) return;
      toast({ title: "Error", description: "Failed to load monthly trial balance", variant: "destructive" });
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [fromDate, toDate, legalEntityIds, entityLoading]);

  // ── Derived state ──────────────────────────────────────────────────────────

  const grouped = useMemo(() => groupRows(rows), [rows]);

  const displayedAccounts = useMemo(
    () => (showOnlyActive ? grouped.filter(hasActivity) : grouped),
    [grouped, showOnlyActive]
  );

  // All distinct months in sort order
  const allMonths = useMemo(() => {
    const set = new Set<string>();
    for (const acc of grouped) for (const m of acc.months) set.add(m.period_month);
    return [...set].sort();
  }, [grouped]);

  // The selected (last) month — gets DR + CR columns; preceding months get net only
  const selectedMonthKey = allMonths[allMonths.length - 1] ?? null;
  const precedingMonths = allMonths.slice(0, -1);

  const byClassification = useMemo(() => {
    const map = new Map<string, AccountMonthlyData[]>();
    for (const acc of displayedAccounts) {
      const key = acc.classification || "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(acc);
    }
    return CLASSIFICATION_ORDER
      .filter((c) => map.has(c))
      .map((c) => ({ classification: c, accounts: map.get(c)! }));
  }, [displayedAccounts]);

  const currencyCode = defaultCurrency?.code?.trim().toUpperCase() ?? "INR";

  // ── Excel export ───────────────────────────────────────────────────────────

  const handleExportExcel = () => {
    const headers = [
      "Account",
      "FY Opening",
      ...precedingMonths.map(monthLabel),
      ...(selectedMonthKey ? [`${monthLabel(selectedMonthKey)} Debits`, `${monthLabel(selectedMonthKey)} Credits`] : []),
      "Closing Balance",
    ];
    const dataRows: (string | number)[][] = [headers];

    for (const { classification, accounts } of byClassification) {
      dataRows.push([classification]);
      for (const acc of accounts) {
        const monthMap = new Map(acc.months.map((m) => [m.period_month, m]));
        dataRows.push([
          "  ".repeat(acc.level) + acc.account_name,
          acc.fy_opening,
          ...precedingMonths.map((m) => monthMap.get(m)?.net_movement ?? 0),
          ...(selectedMonthKey
            ? [monthMap.get(selectedMonthKey)?.period_debits ?? 0, monthMap.get(selectedMonthKey)?.period_credits ?? 0]
            : []),
          acc.closing_balance,
        ]);
      }
      dataRows.push([]);
    }

    const ws = XLSX.utils.aoa_to_sheet(dataRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Monthly Trial Balance");
    XLSX.writeFile(wb, `monthly-tb-${fromDate}-to-${toDate}.xlsx`);
    toast({ title: "Excel exported" });
  };

  // ── Column span calculation ────────────────────────────────────────────────
  // Account | FY Opening | [preceding months — net] | [selected — DR | CR] | Closing
  const totalCols =
    1 +                          // Account
    1 +                          // FY Opening
    precedingMonths.length +     // one net column per preceding month
    (selectedMonthKey ? 2 : 0) + // DR + CR for selected month
    1;                           // Closing Balance

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="reports-header">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="shrink-0">
            <h1 className="text-lg font-bold text-slate-900">Monthly Trial Balance</h1>
            <p className="text-xs text-slate-600">Month-by-month activity with opening &amp; closing balances</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap ml-auto">
            {/* FY selector */}
            <FinancialYearSelector
              fyType={currentEntity?.financial_year_type}
              value={selectedFY.value}
              onChange={(opt) => { setSelectedFY(opt); setSelectedMonth(null); }}
              className="w-[130px] h-9 border-slate-300 text-sm shrink-0"
            />

            {/* Month selector — "All Months" = full FY */}
            <Select
              value={selectedMonth?.value ?? "__all__"}
              onValueChange={(v) => setSelectedMonth(v === "__all__" ? null : (monthOptions.find((m) => m.value === v) ?? null))}
            >
              <SelectTrigger className="w-[160px] h-9 border-slate-300 text-sm shrink-0">
                <SelectValue placeholder="Through month…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Months (Full FY)</SelectItem>
                {monthOptions.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Hide zero rows toggle */}
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={showOnlyActive}
                onChange={(e) => setShowOnlyActive(e.target.checked)}
                className="rounded"
              />
              Hide zero rows
            </label>

            <Button
              size="sm"
              onClick={() => void fetchData()}
              disabled={loading || entityLoading}
              className="shrink-0"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Play className="h-4 w-4 mr-1.5" />}
              Run report
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              disabled={loading || rows.length === 0}
              className="shrink-0"
            >
              <FileSpreadsheet className="h-4 w-4 mr-1.5" />
              Export
            </Button>
          </div>
        </div>

        {/* Period label */}
        <p className="text-xs text-slate-500 mt-2">
          FY opening as of <span className="font-medium">{dayjs(fromDate).subtract(1, 'day').format("DD MMM YYYY")}</span>
          {" · "}
          Period <span className="font-medium">{dayjs(fromDate).format("DD MMM YYYY")}</span> → <span className="font-medium">{dayjs(toDate).format("DD MMM YYYY")}</span>
          {selectedMonthKey && (
            <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
              {monthLabel(selectedMonthKey)} shown with DR / CR detail
            </span>
          )}
        </p>
      </div>

      {/* Content */}
      <div className="p-3 space-y-3">
        {!hasRun && !loading ? (
          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-6">
              <ReportIdleState onRun={() => void fetchData()} disabled={entityLoading} />
            </CardContent>
          </Card>
        ) : loading && rows.length === 0 ? (
          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-8 flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <p className="text-sm text-slate-500">Loading monthly data…</p>
            </CardContent>
          </Card>
        ) : byClassification.length === 0 ? (
          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-8 text-center text-sm text-slate-500">
              No activity found for the selected period.
            </CardContent>
          </Card>
        ) : (
          byClassification.map(({ classification, accounts }) => (
            <Card key={classification} className="shadow-sm border-slate-200 overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50 border-b border-slate-200 py-2 px-3">
                <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-1.5">
                  {getClassificationIcon(classification)}
                  {classification}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-300">
                        <th className="text-left py-2 px-3 font-semibold text-slate-700 sticky left-0 bg-slate-100 min-w-[200px]">
                          Account
                        </th>
                        <th className="text-right py-2 px-3 font-semibold text-slate-700 whitespace-nowrap min-w-[110px]">
                          FY Opening
                        </th>
                        {precedingMonths.map((m) => (
                          <th key={m} className="text-right py-2 px-3 font-semibold text-slate-600 whitespace-nowrap min-w-[90px]">
                            {monthLabel(m)}
                            <span className="block text-[10px] font-normal text-slate-400">Net</span>
                          </th>
                        ))}
                        {selectedMonthKey && (
                          <>
                            <th className="text-right py-2 px-3 font-semibold text-blue-700 whitespace-nowrap min-w-[90px] bg-blue-50">
                              {monthLabel(selectedMonthKey)}
                              <span className="block text-[10px] font-normal text-blue-400">Debits</span>
                            </th>
                            <th className="text-right py-2 px-3 font-semibold text-blue-700 whitespace-nowrap min-w-[90px] bg-blue-50">
                              {monthLabel(selectedMonthKey)}
                              <span className="block text-[10px] font-normal text-blue-400">Credits</span>
                            </th>
                          </>
                        )}
                        <th className="text-right py-2 px-3 font-semibold text-slate-800 whitespace-nowrap min-w-[110px]">
                          Closing Balance
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map((acc) => {
                        const monthMap = new Map(acc.months.map((m) => [m.period_month, m]));
                        return (
                          <tr
                            key={acc.account_id}
                            className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                          >
                            <td className="py-2 px-3 sticky left-0 bg-white hover:bg-slate-50">
                              <div
                                className="flex items-center gap-1"
                                style={{ marginLeft: acc.level * 12 }}
                              >
                                {acc.level > 0 && <div className="w-1 h-1 rounded-full bg-slate-300 shrink-0" />}
                                <span className={acc.level === 0 ? "font-semibold text-slate-800" : "text-slate-700"}>
                                  {acc.account_name}
                                </span>
                              </div>
                            </td>
                            <td className="text-right py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                              {formatCurrency(acc.fy_opening, currencyCode)}
                            </td>
                            {precedingMonths.map((m) => {
                              const md = monthMap.get(m);
                              return (
                                <td key={m} className="text-right py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                                  {formatCurrency(md?.net_movement ?? 0, currencyCode)}
                                </td>
                              );
                            })}
                            {selectedMonthKey && (() => {
                              const sm = monthMap.get(selectedMonthKey);
                              return (
                                <>
                                  <td className="text-right py-2 px-3 font-mono text-slate-600 whitespace-nowrap bg-blue-50/40">
                                    {formatCurrency(sm?.period_debits ?? 0, currencyCode)}
                                  </td>
                                  <td className="text-right py-2 px-3 font-mono text-slate-600 whitespace-nowrap bg-blue-50/40">
                                    {formatCurrency(sm?.period_credits ?? 0, currencyCode)}
                                  </td>
                                </>
                              );
                            })()}
                            <td className="text-right py-2 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                              {formatCurrency(acc.closing_balance, currencyCode)}
                            </td>
                          </tr>
                        );
                      })}

                      {/* Section total row */}
                      {(() => {
                        const totOpening = accounts.reduce((s, a) => s + (a.level === 0 || !accounts.some(b => b.account_id === a.parent_account_id) ? a.fy_opening : 0), 0);
                        // sum leaf-level or top-of-section accounts only
                        const leafAccounts = accounts.filter(
                          (a) => !accounts.some((b) => b.parent_account_id === a.account_id)
                        );
                        const totFyOpening = leafAccounts.reduce((s, a) => s + a.fy_opening, 0);
                        const totClosing   = leafAccounts.reduce((s, a) => s + a.closing_balance, 0);
                        const totPreceding = precedingMonths.map((m) =>
                          leafAccounts.reduce((s, a) => s + (a.months.find((x) => x.period_month === m)?.net_movement ?? 0), 0)
                        );
                        const totSelDr = selectedMonthKey
                          ? leafAccounts.reduce((s, a) => s + (a.months.find((x) => x.period_month === selectedMonthKey)?.period_debits ?? 0), 0)
                          : 0;
                        const totSelCr = selectedMonthKey
                          ? leafAccounts.reduce((s, a) => s + (a.months.find((x) => x.period_month === selectedMonthKey)?.period_credits ?? 0), 0)
                          : 0;

                        return (
                          <tr className="border-t-2 border-slate-300 bg-gradient-to-r from-slate-100 to-blue-50 font-bold">
                            <td className="py-2 px-3 sticky left-0 bg-slate-100">
                              <span className="text-xs font-bold text-slate-700">Total</span>
                            </td>
                            <td className="text-right py-2 px-3 font-mono text-slate-700 whitespace-nowrap">
                              {formatCurrency(totFyOpening, currencyCode)}
                            </td>
                            {totPreceding.map((v, i) => (
                              <td key={precedingMonths[i]} className="text-right py-2 px-3 font-mono text-slate-700 whitespace-nowrap">
                                {formatCurrency(v, currencyCode)}
                              </td>
                            ))}
                            {selectedMonthKey && (
                              <>
                                <td className="text-right py-2 px-3 font-mono text-slate-700 whitespace-nowrap bg-blue-50">
                                  {formatCurrency(totSelDr, currencyCode)}
                                </td>
                                <td className="text-right py-2 px-3 font-mono text-slate-700 whitespace-nowrap bg-blue-50">
                                  {formatCurrency(totSelCr, currencyCode)}
                                </td>
                              </>
                            )}
                            <td className="text-right py-2 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                              {formatCurrency(totClosing, currencyCode)}
                            </td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
