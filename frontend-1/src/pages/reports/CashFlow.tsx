"use client";

import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { reportAPI, viewAPI } from "@/api/api";
import { formatCurrency } from "@/lib/formatters";
import {
  Loader2,
  FileDown,
  ChevronDown,
  FileSpreadsheet,
  Filter,
  RefreshCw,
  ArrowDownUp,
  Landmark,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import dayjs from "dayjs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import * as XLSX from "xlsx";
import "@/styles/reports.css";
import { ReportControls } from "@/components/Reports/ReportControls";
import { LegalEntityMultiSelect } from "@/components/Reports/LegalEntityMultiSelect";
import {
  ReportAdvancedField,
  ReportAdvancedFilters,
  ReportAdvancedSummaryChip,
} from "@/components/Reports/ReportAdvancedFilters";
import { ReportAccountFilter } from "@/components/Reports/ReportAccountFilter";
import { ReportCurrencySelect } from "@/components/Reports/ReportCurrencySelect";
import { useReportLegalEntitySelection } from "@/components/Reports/useReportLegalEntitySelection";
import { isEntityHeadquarters, useEntity, CURRENT_ENTITY_STORAGE_KEY } from "@/contexts/EntityContext";
import {
  FinancialYearSelector,
  getPreviousFYOption,
  buildMonthOptions,
  type FinancialYearOption,
  type MonthOption,
  type FinancialYearType,
} from "@/components/Reports/FinancialYearSelector";

type CashFlowActivity = "Operating" | "Investing" | "Financing";

interface CashFlowRow {
  activity: CashFlowActivity;
  account_id: string;
  account_name: string;
  account_path: string;
  level: number;
  net_cash: number;
}

interface CashFlowSummary {
  opening_cash: number;
  closing_cash: number;
  net_change: number;
  operating_total: number;
  investing_total: number;
  financing_total: number;
}

type CurrencyListRow = {
  id: string;
  code: string;
  name: string;
  is_active?: boolean;
};

const ACTIVITY_ORDER: CashFlowActivity[] = ["Operating", "Investing", "Financing"];

const ACTIVITY_META: Record<
  CashFlowActivity,
  { label: string; icon: ReactNode; description: string }
> = {
  Operating: {
    label: "Operating Activities",
    icon: <ArrowDownUp className="h-4 w-4 text-blue-600" />,
    description: "Day-to-day income, expenses, and working capital",
  },
  Investing: {
    label: "Investing Activities",
    icon: <TrendingUp className="h-4 w-4 text-violet-600" />,
    description: "Fixed assets, investments, and long-term asset changes",
  },
  Financing: {
    label: "Financing Activities",
    icon: <Landmark className="h-4 w-4 text-amber-600" />,
    description: "Equity, loans, and other funding movements",
  },
};

const useCashFlow = ({
  dateRange,
  currencyId,
  currencyCode,
  legalEntityIds,
}: {
  dateRange: [dayjs.Dayjs, dayjs.Dayjs];
  currencyId: string;
  currencyCode: string;
  legalEntityIds: string[];
}) => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CashFlowRow[]>([]);
  const [summary, setSummary] = useState<CashFlowSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchSeq = useRef(0);

  const fetchCashFlow = useCallback(
    async (account?: any) => {
      const seq = ++fetchSeq.current;
      setLoading(true);
      try {
        const filters: Record<string, unknown> = {
          from_date: dateRange[0].format("YYYY-MM-DD"),
          to_date: dateRange[1].format("YYYY-MM-DD"),
        };
        if (account?.id) filters.account_id = account.id;
        if (currencyId.trim()) filters.currency_id = currencyId.trim();
        if (legalEntityIds.length > 0) filters.legal_entity_ids = legalEntityIds;

        const result = (await reportAPI.getReport("cash_flow", filters)) as {
          data?: { summary?: CashFlowSummary; data?: CashFlowRow[] };
        };
        if (seq !== fetchSeq.current) return;

        const payload = result?.data;
        const rawRows = Array.isArray(payload?.data) ? payload.data : [];
        setRows(
          rawRows.map((row) => ({
            ...row,
            net_cash: Number(row.net_cash ?? 0),
          }))
        );
        setSummary(
          payload?.summary
            ? {
                opening_cash: Number(payload.summary.opening_cash ?? 0),
                closing_cash: Number(payload.summary.closing_cash ?? 0),
                net_change: Number(payload.summary.net_change ?? 0),
                operating_total: Number(payload.summary.operating_total ?? 0),
                investing_total: Number(payload.summary.investing_total ?? 0),
                financing_total: Number(payload.summary.financing_total ?? 0),
              }
            : null
        );
        setError(null);
      } catch (err) {
        if (seq !== fetchSeq.current) return;
        setError(err instanceof Error ? err.message : "An error occurred");
        toast({
          title: "Error",
          description: "Failed to load cash flow data",
          variant: "destructive",
        });
      } finally {
        if (seq === fetchSeq.current) setLoading(false);
      }
    },
    [dateRange, currencyId, currencyCode, legalEntityIds]
  );

  useEffect(() => {
    return () => {
      fetchSeq.current += 1;
    };
  }, []);

  return { rows, summary, loading, error, fetchCashFlow };
};

function groupByActivity(data: CashFlowRow[]) {
  return ACTIVITY_ORDER.map((activity) => ({
    activity,
    items: data.filter((row) => row.activity === activity),
  }));
}

export default function CashFlow() {
  const { entities, currentEntity, currentEntityId, loading: entityLoading } = useEntity();

  const [fetchOnButtonClick, setFetchOnButtonClick] = useState(false);
  const [account, setAccount]: any = useState(null);
  const [showOnlyNonZero, setShowOnlyNonZero] = useState(true);
  const [selectedCurrencyId, setSelectedCurrencyId] = useState("");
  const [currencies, setCurrencies] = useState<CurrencyListRow[]>([]);
  const [currenciesLoading, setCurrenciesLoading] = useState(false);
  const [selectedFY, setSelectedFY] = useState<FinancialYearOption>(() => getPreviousFYOption("JAN_DEC"));
  const [selectedMonth, setSelectedMonth] = useState<MonthOption | null>(null);

  const headquartersEntity = useMemo(
    () => entities.find((entity) => isEntityHeadquarters(entity)) ?? null,
    [entities]
  );

  const defaultCurrency = useMemo(
    () => currentEntity?.currency ?? headquartersEntity?.currency ?? null,
    [currentEntity, headquartersEntity]
  );

  useEffect(() => {
    const type: FinancialYearType = currentEntity?.financial_year_type ?? "JAN_DEC";
    setSelectedFY(getPreviousFYOption(type));
    setSelectedMonth(null);
    setSelectedCurrencyId(defaultCurrency?.id ?? "");
  }, [currentEntity?.id, defaultCurrency?.id]);

  const effectiveDateRange = useMemo((): [dayjs.Dayjs, dayjs.Dayjs] => {
    const from = selectedMonth?.from_date ?? selectedFY.from_date;
    const to = selectedMonth?.to_date ?? selectedFY.to_date;
    return [dayjs(from), dayjs(to)];
  }, [selectedFY, selectedMonth]);

  const monthOptions = useMemo(() => buildMonthOptions(selectedFY), [selectedFY]);

  const reportCurrencyCode = useMemo(() => {
    if (selectedCurrencyId.trim()) {
      const row = currencies.find((c) => c.id === selectedCurrencyId.trim());
      const code = row?.code?.trim().toUpperCase();
      if (code) return code;
    }
    return defaultCurrency?.code?.trim().toUpperCase() ?? "INR";
  }, [selectedCurrencyId, currencies, defaultCurrency]);

  const defaultReportingCurrencyId = useMemo(() => defaultCurrency?.id ?? "", [defaultCurrency]);

  const effectiveReportCurrencyId = useMemo(
    () => selectedCurrencyId.trim() || defaultReportingCurrencyId,
    [selectedCurrencyId, defaultReportingCurrencyId]
  );

  const {
    selectedLegalEntityIds,
    setSelectedLegalEntityIds,
    selectionReady,
  } = useReportLegalEntitySelection(currentEntityId, entityLoading);

  const { rows, summary, loading, error, fetchCashFlow } = useCashFlow({
    dateRange: effectiveDateRange,
    currencyId: effectiveReportCurrencyId,
    currencyCode: reportCurrencyCode,
    legalEntityIds: selectedLegalEntityIds,
  });

  const reportLoading = loading || entityLoading || !selectionReady;

  const displayedRows = showOnlyNonZero
    ? rows.filter((row) => Number(row.net_cash ?? 0) !== 0)
    : rows;

  const groupedData = useMemo(() => groupByActivity(displayedRows), [displayedRows]);
  const visibleGroups = groupedData.filter((group) => !showOnlyNonZero || group.items.length > 0);

  const loadCurrencies = useCallback(async () => {
    setCurrenciesLoading(true);
    try {
      const res: any = await viewAPI.search("currency", "currency_view", 1, 500, undefined, {}, {});
      const list = Array.isArray(res?.data) ? res.data : [];
      setCurrencies(
        list.map((row: any) => ({
          id: String(row.id ?? ""),
          code: String(row.code ?? "").trim(),
          name: String(row.name ?? "").trim(),
          is_active: row.is_active !== false && row.is_active !== "false",
        }))
      );
    } catch {
      setCurrencies([]);
    } finally {
      setCurrenciesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCurrencies();
  }, [loadCurrencies]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadCurrencies();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadCurrencies]);

  const sortedActiveCurrencies = useMemo(
    () => [...currencies].filter((c) => c.code && c.is_active !== false).sort((a, b) => a.code.localeCompare(b.code)),
    [currencies]
  );

  const selectedCurrencyInMasterList = useMemo(() => {
    if (!selectedCurrencyId.trim()) return true;
    return sortedActiveCurrencies.some((c) => c.id === selectedCurrencyId.trim());
  }, [sortedActiveCurrencies, selectedCurrencyId]);

  const orgDefaultLabel = useMemo(
    () => defaultCurrency?.code?.trim().toUpperCase() ?? "INR",
    [defaultCurrency]
  );

  const legalEntitySummaryLabel = useMemo(() => {
    if (selectedLegalEntityIds.length === 0) return "All entities";
    if (selectedLegalEntityIds.length === 1) {
      return entities.find((entity) => entity.id === selectedLegalEntityIds[0])?.legal_name ?? "1 entity";
    }
    return `${selectedLegalEntityIds.length} entities`;
  }, [entities, selectedLegalEntityIds]);

  const accountSummaryLabel = useMemo(
    () => account?.name ?? account?.account_name ?? "All accounts",
    [account]
  );

  useEffect(() => {
    if (entityLoading || !selectionReady) return;
    void fetchCashFlow(account);
  }, [entityLoading, selectionReady, fetchCashFlow, account]);

  useEffect(() => {
    if (!fetchOnButtonClick) return;
    if (entityLoading || !selectionReady) return;
    void fetchCashFlow(account);
    setFetchOnButtonClick(false);
  }, [fetchOnButtonClick, entityLoading, selectionReady, fetchCashFlow, account]);

  const handleAccountChange = (value: any) => setAccount(value);
  const handleAccountClear = () => setAccount(null);
  const handleRefresh = () => setFetchOnButtonClick(true);

  const activityTotal = (activity: CashFlowActivity) => {
    if (!summary) {
      return displayedRows
        .filter((row) => row.activity === activity)
        .reduce((sum, row) => sum + Number(row.net_cash ?? 0), 0);
    }
    if (activity === "Operating") return Number(summary.operating_total ?? 0);
    if (activity === "Investing") return Number(summary.investing_total ?? 0);
    return Number(summary.financing_total ?? 0);
  };

  const handleExportExcel = () => {
    try {
      if (visibleGroups.length === 0) {
        toast({
          title: "No data to export",
          description: "Load the report first, then export.",
          variant: "destructive",
        });
        return;
      }

      const fromDate = effectiveDateRange[0].format("YYYY-MM-DD");
      const toDate = effectiveDateRange[1].format("YYYY-MM-DD");
      const sheetRows: string[][] = [["Section", "Account", "Net Cash Flow"]];

      if (summary) {
        sheetRows.push(["Summary", "Opening cash", formatCurrency(Number(summary.opening_cash ?? 0), reportCurrencyCode)]);
        sheetRows.push(["Summary", "Net change in cash", formatCurrency(Number(summary.net_change ?? 0), reportCurrencyCode)]);
        sheetRows.push(["Summary", "Closing cash", formatCurrency(Number(summary.closing_cash ?? 0), reportCurrencyCode)]);
        sheetRows.push([]);
      }

      for (const group of visibleGroups) {
        sheetRows.push([ACTIVITY_META[group.activity].label, "", ""]);
        for (const row of group.items) {
          sheetRows.push([
            ACTIVITY_META[group.activity].label,
            row.account_name,
            formatCurrency(Number(row.net_cash ?? 0), reportCurrencyCode),
          ]);
        }
        sheetRows.push([
          `${ACTIVITY_META[group.activity].label} Total`,
          "",
          formatCurrency(activityTotal(group.activity), reportCurrencyCode),
        ]);
        sheetRows.push([]);
      }

      const ws = XLSX.utils.aoa_to_sheet(sheetRows);
      ws["!cols"] = [{ wch: 28 }, { wch: 40 }, { wch: 20 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Cash Flow");
      XLSX.writeFile(wb, `cash-flow-${fromDate}-to-${toDate}.xlsx`);
      toast({ title: "Excel exported", description: "Cash flow statement has been downloaded." });
    } catch (err) {
      console.error(err);
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Failed to generate Excel",
        variant: "destructive",
      });
    }
  };

  const LoadingContent = () => (
    <div className="flex flex-col items-center justify-center py-6">
      <div className="relative">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        <div className="absolute inset-0 rounded-full border-2 border-blue-200" />
      </div>
      <p className="text-slate-600 mt-3 font-medium text-sm">Loading cash flow data...</p>
      <p className="text-xs text-slate-500 mt-1">Please wait while we fetch your cash movements</p>
    </div>
  );

  const renderTableContent = (group: { activity: CashFlowActivity; items: CashFlowRow[] }) => {
    if (reportLoading) {
      return (
        <TableRow>
          <TableCell colSpan={2} className="text-center">
            <LoadingContent />
          </TableCell>
        </TableRow>
      );
    }

    if (error) {
      return (
        <TableRow>
          <TableCell colSpan={2} className="text-center py-4">
            <Button variant="outline" size="sm" onClick={() => fetchCashFlow(account)}>
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          </TableCell>
        </TableRow>
      );
    }

    if (group.items.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={2} className="text-center py-4 text-xs text-slate-500">
            No cash movements in this section
          </TableCell>
        </TableRow>
      );
    }

    const fromDate = effectiveDateRange[0].format("YYYY-MM-DD");
    const toDate = effectiveDateRange[1].format("YYYY-MM-DD");

    return (
      <>
        {group.items.map((row, index) => {
          const amount = Number(row.net_cash ?? 0);
          const canDrillDown = !!row.account_id;
          const drillDownUrl = canDrillDown
            ? `/accounting/transactions?account_id=${encodeURIComponent(row.account_id)}&from_date=${fromDate}&to_date=${toDate}`
            : null;

          return (
            <TableRow
              key={row.account_id || `row-${index}`}
              className={`transition-colors duration-150 border-b border-slate-100 ${canDrillDown ? "hover:bg-blue-50 cursor-pointer" : "hover:bg-slate-50"}`}
              onClick={
                canDrillDown
                  ? () => {
                      if (currentEntityId) {
                        localStorage.setItem(CURRENT_ENTITY_STORAGE_KEY, currentEntityId);
                      }
                      window.open(drillDownUrl!, "_blank");
                    }
                  : undefined
              }
              title={canDrillDown ? "Click to view transactions" : undefined}
            >
              <TableCell className="py-2 px-3">
                <span className={`text-xs ${row.level === 0 ? "font-semibold text-slate-800" : "text-slate-700"}`}>
                  {row.account_name}
                </span>
              </TableCell>
              <TableCell
                className={`text-right py-2 px-3 font-mono text-xs font-bold ${
                  canDrillDown
                    ? "text-blue-700"
                    : amount >= 0
                      ? "text-emerald-700"
                      : "text-red-700"
                }`}
              >
                {formatCurrency(amount, reportCurrencyCode)}
              </TableCell>
            </TableRow>
          );
        })}
      </>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="reports-header">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <h1 className="text-lg font-bold text-slate-900">Cash Flow Statement</h1>
            <p className="text-xs text-slate-600">Cash movements by operating, investing, and financing activity</p>
          </div>

          <div className="flex items-center gap-2 flex-nowrap overflow-x-auto ml-auto">
            <ReportControls
              onRefresh={handleRefresh}
              loading={reportLoading}
              showAccountFilter={false}
              showRefreshButton={true}
              className="!flex-row !items-center !gap-2 shrink-0"
              beforeRefresh={
                <>
                  <FinancialYearSelector
                    fyType={currentEntity?.financial_year_type}
                    value={selectedFY.value}
                    onChange={(opt) => {
                      setSelectedFY(opt);
                      setSelectedMonth(null);
                    }}
                    className="w-[130px] h-9 border-slate-300 text-sm shrink-0"
                  />

                  <Select
                    value={selectedMonth?.value ?? "__all__"}
                    onValueChange={(v) => {
                      if (v === "__all__") {
                        setSelectedMonth(null);
                      } else {
                        setSelectedMonth(monthOptions.find((m) => m.value === v) ?? null);
                      }
                    }}
                  >
                    <SelectTrigger className="w-[150px] h-9 border-slate-300 text-sm shrink-0">
                      <SelectValue placeholder="All Months" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Months</SelectItem>
                      {monthOptions.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              }
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={reportLoading || rows.length === 0}
                  className="border-slate-300 hover:bg-slate-50 shrink-0"
                >
                  <FileDown className="h-4 w-4 mr-1.5" />
                  Export
                  <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportExcel}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export as Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <ReportAdvancedFilters
          summary={
            <>
              <ReportAdvancedSummaryChip>{legalEntitySummaryLabel}</ReportAdvancedSummaryChip>
              <ReportAdvancedSummaryChip>{reportCurrencyCode}</ReportAdvancedSummaryChip>
              <ReportAdvancedSummaryChip>{accountSummaryLabel}</ReportAdvancedSummaryChip>
            </>
          }
        >
          <ReportAdvancedField
            label="Legal entity"
            hint="None selected includes all entities. Choose one or more to scope the report."
          >
            <LegalEntityMultiSelect
              entities={entities}
              selectedIds={selectedLegalEntityIds}
              onChange={setSelectedLegalEntityIds}
              disabled={entityLoading}
              className="w-full justify-between"
            />
          </ReportAdvancedField>

          <ReportAdvancedField
            label="Currency"
            hint="Reporting currency for cash balances. Default uses the entity's base currency."
          >
            <ReportCurrencySelect
              selectedCurrencyId={selectedCurrencyId}
              onSelectedCurrencyIdChange={setSelectedCurrencyId}
              sortedActiveCurrencies={sortedActiveCurrencies}
              orgDefaultLabel={orgDefaultLabel}
              reportCurrencyCode={reportCurrencyCode}
              selectedCurrencyInMasterList={selectedCurrencyInMasterList}
              currenciesLoading={currenciesLoading}
              entityLoading={entityLoading}
            />
          </ReportAdvancedField>

          <ReportAdvancedField
            label="Account"
            hint="Optional. Limit to movements involving a specific cash or contra account."
          >
            <ReportAccountFilter
              selectedAccount={account}
              onAccountChange={handleAccountChange}
              onAccountClear={handleAccountClear}
            />
          </ReportAdvancedField>
        </ReportAdvancedFilters>

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 border border-slate-200 rounded-md px-3 py-1.5 bg-white">
            <Filter className="h-4 w-4 text-slate-500" />
            <Label htmlFor="show-nonzero-cf" className="text-sm text-slate-700 cursor-pointer whitespace-nowrap">
              Show only rows with activity
            </Label>
            <Switch id="show-nonzero-cf" checked={showOnlyNonZero} onCheckedChange={setShowOnlyNonZero} />
          </div>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {reportLoading && rows.length === 0 ? (
          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-6">
              <LoadingContent />
            </CardContent>
          </Card>
        ) : error && rows.length === 0 ? (
          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-6 text-center">
              <p className="text-destructive mb-3 font-medium text-sm">Error: {error}</p>
              <Button variant="outline" size="sm" onClick={() => fetchCashFlow(account)}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {summary ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Card className="shadow-sm border-slate-200">
                  <CardHeader className="py-3 px-4 bg-slate-50 border-b border-slate-200">
                    <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-slate-500" />
                      Opening Cash
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="py-4 px-4">
                    <p className="font-mono text-lg font-bold text-slate-900">
                      {formatCurrency(Number(summary.opening_cash ?? 0), reportCurrencyCode)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-200">
                  <CardHeader className="py-3 px-4 bg-slate-50 border-b border-slate-200">
                    <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <ArrowDownUp className="h-4 w-4 text-blue-600" />
                      Net Change in Cash
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="py-4 px-4">
                    <p
                      className={`font-mono text-lg font-bold ${Number(summary.net_change ?? 0) >= 0 ? "text-emerald-700" : "text-red-700"}`}
                    >
                      {formatCurrency(Number(summary.net_change ?? 0), reportCurrencyCode)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="shadow-sm border-slate-200">
                  <CardHeader className="py-3 px-4 bg-slate-50 border-b border-slate-200">
                    <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-slate-500" />
                      Closing Cash
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="py-4 px-4">
                    <p className="font-mono text-lg font-bold text-slate-900">
                      {formatCurrency(Number(summary.closing_cash ?? 0), reportCurrencyCode)}
                    </p>
                  </CardContent>
                </Card>
              </div>
            ) : null}

            {visibleGroups.length === 0 ? (
              <Card className="shadow-sm border-slate-200">
                <CardContent className="p-6 text-center">
                  <Filter className="h-10 w-10 text-slate-300 mb-3 mx-auto" />
                  <p className="text-slate-600 font-medium text-sm">
                    {showOnlyNonZero && rows.length > 0
                      ? "No rows with activity in the selected period"
                      : "No cash flow data available"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              visibleGroups.map((group) => (
                <Card key={group.activity} className="shadow-sm border-slate-200 hover:shadow-md transition-shadow duration-200">
                  <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50 border-b border-slate-200 py-2 px-3">
                    <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
                      {ACTIVITY_META[group.activity].icon}
                      <span>{ACTIVITY_META[group.activity].label}</span>
                    </CardTitle>
                    <p className="text-xs text-slate-500 mt-0.5">{ACTIVITY_META[group.activity].description}</p>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-100 border-b border-slate-300">
                            <TableHead className="font-semibold text-slate-700 py-2 px-3 text-xs">Counterparty Account</TableHead>
                            <TableHead className="text-right font-semibold text-slate-800 py-2 px-3 text-xs">Net Cash Flow</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {renderTableContent(group)}
                          <TableRow className="font-bold bg-gradient-to-r from-slate-100 to-blue-50 border-t-2 border-slate-300">
                            <TableCell className="py-2 px-3 text-xs text-slate-800">Section Total</TableCell>
                            <TableCell className="text-right py-2 px-3 font-mono text-xs font-bold text-slate-900">
                              {formatCurrency(activityTotal(group.activity), reportCurrencyCode)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
