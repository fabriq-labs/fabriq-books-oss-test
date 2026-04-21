"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { reportAPI, viewAPI } from "@/api/api";
import { formatCurrency } from "@/lib/formatters";
import { Loader2, DollarSign, FileDown, ChevronDown, FileSpreadsheet, Filter, RefreshCw, TrendingUp, Receipt } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import dayjs from "dayjs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import * as XLSX from "xlsx";
import { pdf } from "@react-pdf/renderer";
import "@/styles/reports.css";
import { ReportControls } from "@/components/Reports/ReportControls";
import { useEntity } from "@/contexts/EntityContext";
import { IncomeStatementPDFDocument, IncomeStatementPdfProps } from "@/components/pdf_generator/IncomePDFGenerator";
import {
  FinancialYearSelector,
  getPreviousFYOption,
  buildMonthOptions,
  type FinancialYearOption,
  type MonthOption,
  type FinancialYearType,
} from "@/components/Reports/FinancialYearSelector";

interface IncomeStatementRow {
  account_id?: string;
  account_path: string;
  account_name: string;
  classification: string;
  level: number;
  total_amount: number;
  account_type?: string[];
}

type CurrencyListRow = {
  id: string;
  code: string;
  name: string;
  is_active?: boolean;
};

function incomeStatementBucket(classification: string | null | undefined): "Income" | "Expense" | null {
  if (classification == null || !String(classification).trim()) return null;
  const n = String(classification).toLowerCase().trim();
  if (n.includes("income") || n.includes("revenue")) return "Income";
  if (n.includes("expense") || n.includes("expens")) return "Expense";
  return null;
}

const normalizeIncomeAmount = (amount: number) => (amount < 0 ? Math.abs(amount) : amount);

const getDisplayAmount = (amount: number, classification?: string) => {
  if (classification === "Income") return normalizeIncomeAmount(amount);
  return amount;
};

const displayPlAmount = (amount: number, classification?: string) => getDisplayAmount(amount, classification);

const useIncomeStatement = ({
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
  const [data, setData] = useState<IncomeStatementRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fetchSeq = useRef(0);

  const fetchIncomeStatement = useCallback(
    async (account?: any) => {
      const seq = ++fetchSeq.current;
      setLoading(true);
      try {
        let filters: any = {
          from_date: dateRange[0].format("YYYY-MM-DD"),
          to_date: dateRange[1].format("YYYY-MM-DD"),
        };

        if (account) filters.account_id = account?.id;
        if (currencyId.trim()) filters.currency_id = currencyId.trim();
        if (legalEntityIds.length > 0) filters.legal_entity_ids = legalEntityIds;

        const result = (await reportAPI.getReport("income_statement", filters)) as any;
        if (seq !== fetchSeq.current) return;
        const rows = Array.isArray(result?.data) ? result.data : [];
        setData(rows);
        setError(null);
      } catch (err) {
        if (seq !== fetchSeq.current) return;
        setError(err instanceof Error ? err.message : "An error occurred");
        toast({
          title: "Error",
          description: "Failed to load income statement data",
          variant: "destructive",
        });
      } finally {
        if (seq === fetchSeq.current) setLoading(false);
      }
    },
    [dateRange, currencyId, currencyCode, legalEntityIds]
  );

  useEffect(() => {
    return () => { fetchSeq.current += 1; };
  }, []);

  return { data, loading, error, fetchIncomeStatement };
};

export default function IncomeStatement() {
  const { currentEntity, currentEntityId, loading: entityLoading } = useEntity();

  const [fetchOnButtonClick, setFetchOnButtonClick] = useState(false);
  const [account, setAccount]: any = useState(null);
  const [view, setView] = useState("Summary");
  const [showOnlyNonZero, setShowOnlyNonZero] = useState(true);
  const [exportPdfLoading, setExportPdfLoading] = useState(false);
  const [selectedCurrencyId, setSelectedCurrencyId] = useState("");
  const [currencies, setCurrencies] = useState<CurrencyListRow[]>([]);
  const [currenciesLoading, setCurrenciesLoading] = useState(false);
  const [selectedFY, setSelectedFY] = useState<FinancialYearOption>(() => getPreviousFYOption("JAN_DEC"));
  const [selectedMonth, setSelectedMonth] = useState<MonthOption | null>(null);

  // When entity changes: reset FY to previous FY for that entity's type, clear month, default currency to entity's base currency
  useEffect(() => {
    const type: FinancialYearType = currentEntity?.financial_year_type ?? "JAN_DEC";
    setSelectedFY(getPreviousFYOption(type));
    setSelectedMonth(null);
    setSelectedCurrencyId(currentEntity?.currency?.id ?? "");
  }, [currentEntity?.id]);

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
    return currentEntity?.currency?.code?.trim().toUpperCase() ?? "INR";
  }, [selectedCurrencyId, currencies, currentEntity]);

  const displayCurrencyCode = reportCurrencyCode;

  const defaultReportingCurrencyId = useMemo(
    () => currentEntity?.currency?.id ?? "",
    [currentEntity]
  );

  const effectiveReportCurrencyId = useMemo(
    () => selectedCurrencyId.trim() || defaultReportingCurrencyId,
    [selectedCurrencyId, defaultReportingCurrencyId]
  );

  const legalEntityIds = useMemo(
    () => currentEntityId ? [currentEntityId] : [],
    [currentEntityId]
  );

  const { data, loading, error, fetchIncomeStatement } = useIncomeStatement({
    dateRange: effectiveDateRange,
    currencyId: effectiveReportCurrencyId,
    currencyCode: reportCurrencyCode,
    legalEntityIds,
  });

  const reportLoading = loading || entityLoading;

  const ADD_BACK_TYPES = ["D&A", "Interest & Tax", "EBITDA Adjustments"];
  const hasAddBackType = (row: IncomeStatementRow) =>
    (row.account_type || []).some((type) => ADD_BACK_TYPES.includes(type));

  const displayedData = showOnlyNonZero
    ? data.filter((row) => Number(row.total_amount || 0) !== 0)
    : data;
  const isSummaryView = view === "Summary";
  const viewFilteredData = isSummaryView
    ? displayedData.filter((row) => Number(row.level ?? 0) === 0)
    : displayedData;

  const topLevelPlRows = displayedData.filter(
    (row) => Number(row.level ?? 0) === 0 && incomeStatementBucket(row.classification) != null
  );
  const rowsForMainTotals =
    topLevelPlRows.length > 0
      ? topLevelPlRows
      : viewFilteredData.filter((row) => incomeStatementBucket(row.classification) != null);

  const incomeRows = rowsForMainTotals.filter((row) => incomeStatementBucket(row.classification) === "Income");
  const expenseRowsExcludingAddBacks = rowsForMainTotals.filter(
    (row) => incomeStatementBucket(row.classification) === "Expense" && !hasAddBackType(row)
  );
  const addBackRows = displayedData.filter(
    (row) => incomeStatementBucket(row.classification) === "Expense" && hasAddBackType(row)
  );

  const depreciationAndAmortizationTotal = addBackRows.reduce((sum, row) => {
    if ((row.account_type || []).includes("D&A")) {
      return sum + displayPlAmount(Number(row.total_amount || 0), row.classification);
    }
    return sum;
  }, 0);
  const interestAndTaxTotal = addBackRows.reduce((sum, row) => {
    if ((row.account_type || []).includes("Interest & Tax")) {
      return sum + displayPlAmount(Number(row.total_amount || 0), row.classification);
    }
    return sum;
  }, 0);
  const ebitdaAdjustmentsTotal = addBackRows.reduce((sum, row) => {
    if ((row.account_type || []).includes("EBITDA Adjustments")) {
      return sum + displayPlAmount(Number(row.total_amount || 0), row.classification);
    }
    return sum;
  }, 0);

  const incomeTotal = incomeRows.reduce(
    (sum, row) => sum + displayPlAmount(Number(row.total_amount || 0), row.classification),
    0
  );
  const expenseTotalExcludingAddBacks = expenseRowsExcludingAddBacks.reduce(
    (sum, row) => sum + displayPlAmount(Number(row.total_amount || 0), row.classification),
    0
  );
  const addBacksTotal = addBackRows.reduce(
    (sum, row) => sum + displayPlAmount(Number(row.total_amount || 0), row.classification),
    0
  );
  const ebitda = incomeTotal - expenseTotalExcludingAddBacks;
  const adjustedEbitda = ebitda + ebitdaAdjustmentsTotal;

  const groupedData = (data: IncomeStatementRow[]) => {
    const groups = data.reduce(
      (acc, item) => {
        const key = incomeStatementBucket(item.classification);
        if (!key) return acc;
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      },
      {} as Record<string, IncomeStatementRow[]>
    );
    const orderOfClassifications = ["Income", "Expense"];
    return orderOfClassifications.map((classification) => ({
      classification,
      items: groups[classification] || [],
    }));
  };

  const statementGroups = groupedData(viewFilteredData).map((group) => ({
    ...group,
    items: group.classification === "Expense" ? group.items.filter((row) => !hasAddBackType(row)) : group.items,
  }));
  const visibleStatementGroups = statementGroups.filter(
    (group) => !showOnlyNonZero || group.items.length > 0
  );
  const hasVisibleStatementRows = visibleStatementGroups.length > 0;

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

  useEffect(() => { void loadCurrencies(); }, [loadCurrencies]);

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

  const orgDefaultLabel = useMemo(() => {
    return currentEntity?.currency?.code?.trim().toUpperCase() ?? "INR";
  }, [currentEntity]);

  useEffect(() => {
    if (entityLoading) return;
    void fetchIncomeStatement(account);
  }, [entityLoading, fetchIncomeStatement, account]);

  useEffect(() => {
    if (!fetchOnButtonClick) return;
    if (entityLoading) return;
    void fetchIncomeStatement(account);
    setFetchOnButtonClick(false);
  }, [fetchOnButtonClick, entityLoading, fetchIncomeStatement, account]);

  const handleAccountChange = (value: any) => setAccount(value);
  const handleAccountClear = () => setAccount(null);
  const handleRefresh = () => setFetchOnButtonClick(true);

  const getClassificationIcon = (classification: string) => {
    const normalized = classification.toLowerCase();
    if (normalized.includes("income") || normalized.includes("revenue")) {
      return <TrendingUp className="h-4 w-4 text-emerald-600" />;
    }
    if (normalized.includes("expense")) return <Receipt className="h-4 w-4 text-orange-600" />;
    return <DollarSign className="h-4 w-4 text-slate-600" />;
  };

  const handleExportPdf = async () => {
    setExportPdfLoading(true);
    try {
      const groups = groupedData(viewFilteredData).map((group) => ({
        ...group,
        items: group.classification === "Expense" ? group.items.filter((row) => !hasAddBackType(row)) : group.items,
      }));
      const groupsWithData = groups.filter((group) => group.items.length > 0);

      if (groupsWithData.length === 0) {
        toast({ title: "No data to export", description: "Load the report first, then export.", variant: "destructive" });
        return;
      }

      const fromDate = effectiveDateRange[0].format("YYYY-MM-DD");
      const toDate = effectiveDateRange[1].format("YYYY-MM-DD");

      const blob = await pdf(
        <IncomeStatementPDFDocument
          groups={groupsWithData as IncomeStatementPdfProps["groups"]}
          fromDate={fromDate}
          toDate={toDate}
          currencyCode={displayCurrencyCode}
          accountName={account?.name ?? account?.account_name ?? undefined}
          view={view}
          ebitda={ebitda}
          depreciationAndAmortizationTotal={depreciationAndAmortizationTotal}
          interestAndTaxTotal={interestAndTaxTotal}
          ebitdaAdjustmentsTotal={ebitdaAdjustmentsTotal}
          addBacksTotal={addBacksTotal}
          adjustedEbitda={adjustedEbitda}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `income-statement-${fromDate}-to-${toDate}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF exported", description: "Income statement has been downloaded." });
    } catch (err) {
      console.error(err);
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Failed to generate PDF",
        variant: "destructive",
      });
    } finally {
      setExportPdfLoading(false);
    }
  };

  const handleExportExcel = () => {
    try {
      const groups = groupedData(viewFilteredData).map((group) => ({
        ...group,
        items: group.classification === "Expense" ? group.items.filter((row) => !hasAddBackType(row)) : group.items,
      }));
      const groupsWithData = groups.filter((group) => group.items.length > 0);

      if (groupsWithData.length === 0) {
        toast({ title: "No data to export", description: "Load the report first, then export.", variant: "destructive" });
        return;
      }

      const fromDate = effectiveDateRange[0].format("YYYY-MM-DD");
      const toDate = effectiveDateRange[1].format("YYYY-MM-DD");

      const rows: string[][] = [["Account", "Total Amount"]];
      for (const group of groupsWithData) {
        rows.push([group.classification, ""]);
        for (const row of group.items) {
          const indent = row.level > 0 ? "  ".repeat(row.level) : "";
          rows.push([
            `${indent}${row.account_name}`,
            formatCurrency(displayPlAmount(Number(row.total_amount || 0), group.classification), displayCurrencyCode),
          ]);
        }
        const groupTotal =
          group.classification === "Income"
            ? incomeTotal
            : group.classification === "Expense"
              ? expenseTotalExcludingAddBacks
              : group.items.reduce((acc, curr) => acc + Number(curr.total_amount || 0), 0);
        rows.push([`${group.classification} Total`, formatCurrency(groupTotal, displayCurrencyCode)]);
        if (group.classification === "Expense") {
          rows.push(["EBITDA", formatCurrency(ebitda, displayCurrencyCode)]);
        }
        rows.push([]);
      }
      rows.push(["Depreciation & Amortization", formatCurrency(depreciationAndAmortizationTotal, displayCurrencyCode)]);
      rows.push(["Interest & Tax", formatCurrency(interestAndTaxTotal, displayCurrencyCode)]);
      rows.push(["EBITDA Adjustments", formatCurrency(ebitdaAdjustmentsTotal, displayCurrencyCode)]);
      rows.push(["Total Add-backs and Adjustments", formatCurrency(addBacksTotal, displayCurrencyCode)]);
      rows.push(["Adjusted EBITDA", formatCurrency(adjustedEbitda, displayCurrencyCode)]);

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 40 }, { wch: 20 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Income Statement");
      XLSX.writeFile(wb, `income-statement-${fromDate}-to-${toDate}.xlsx`);
      toast({ title: "Excel exported", description: "Income statement has been downloaded." });
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
        <div className="absolute inset-0 rounded-full border-2 border-blue-200"></div>
      </div>
      <p className="text-slate-600 mt-3 font-medium text-sm">Loading income statement data...</p>
      <p className="text-xs text-slate-500 mt-1">Please wait while we fetch your financial data</p>
    </div>
  );

  const renderTableContent = (group: { classification: string; items: IncomeStatementRow[] }) => {
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
            <div className="flex flex-col items-center justify-center">
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center mb-2">
                <div className="w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">!</span>
                </div>
              </div>
              <p className="text-xs text-red-600 font-medium mb-2">Error loading data</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchIncomeStatement(account)}
                className="border-red-300 text-red-600 hover:bg-red-50 text-xs"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            </div>
          </TableCell>
        </TableRow>
      );
    }

    if (group.items.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={2} className="text-center py-4">
            <div className="flex flex-col items-center justify-center">
              <div className="w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center mb-1">
                <div className="w-2 h-2 bg-slate-300 rounded-full"></div>
              </div>
              <p className="text-xs text-slate-500 font-medium">No data found for {group.classification}</p>
            </div>
          </TableCell>
        </TableRow>
      );
    }

    return (
      <>
        {group.items.map((row, index) => (
          <TableRow
            key={row.account_id || `row-${index}`}
            className="hover:bg-slate-50 transition-colors duration-150 border-b border-slate-100"
          >
            <TableCell className="py-2 px-3">
              <div className="flex items-center">
                <div style={{ marginLeft: row.level * 12 }} className="flex items-center gap-1">
                  {row.level > 0 && <div className="w-1 h-1 rounded-full bg-slate-400"></div>}
                  <span className={`text-xs ${row.level === 0 ? "font-semibold text-slate-800" : "text-slate-700"}`}>
                    {row.account_name}
                  </span>
                </div>
              </div>
            </TableCell>
            <TableCell className="text-right py-2 px-3 font-mono text-xs">
              <span className="text-slate-900 font-bold">
                {formatCurrency(displayPlAmount(Number(row.total_amount || 0), group.classification), displayCurrencyCode)}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </>
    );
  };

  const summary = (pageData: readonly IncomeStatementRow[], classification?: string) => {
    const totals = pageData.reduce((acc, curr) => acc + Number(curr?.total_amount || 0), 0);
    const adjustedTotals =
      classification === "Income"
        ? incomeTotal
        : classification === "Expense"
          ? expenseTotalExcludingAddBacks
          : totals;

    return (
      <>
        <TableRow className="font-bold bg-gradient-to-r from-slate-100 to-blue-50 border-t-2 border-slate-300">
          <TableCell className="text-left py-2 px-3 text-slate-800">
            {classification ? `${classification} Total` : "Total"}
          </TableCell>
          <TableCell className="text-right py-2 px-3 font-mono text-xs">
            <span className="text-slate-900 font-bold">{formatCurrency(adjustedTotals, displayCurrencyCode)}</span>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell colSpan={2} className="h-5 p-0 bg-white"></TableCell>
        </TableRow>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="reports-header">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <h1 className="text-lg font-bold text-slate-900">Income Statement</h1>
            <p className="text-xs text-slate-600">Profitability overview</p>
          </div>
          <div className="flex items-center gap-2 flex-nowrap overflow-x-auto ml-auto">
            <ReportControls
              selectedAccount={account}
              onAccountChange={handleAccountChange}
              onAccountClear={handleAccountClear}
              onRefresh={handleRefresh}
              loading={reportLoading}
              showAccountFilter={true}
              showRefreshButton={true}
              className="!flex-row !items-center !gap-2 shrink-0"
              beforeRefresh={
                <>
                  {/* Financial year selector */}
                  <FinancialYearSelector
                    fyType={currentEntity?.financial_year_type}
                    value={selectedFY.value}
                    onChange={(opt) => { setSelectedFY(opt); setSelectedMonth(null); }}
                    className="w-[130px] h-9 border-slate-300 text-sm shrink-0"
                  />

                  {/* Month selector — null = All Months */}
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
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Currency — shows ISO code only */}
                  <Select
                    value={selectedCurrencyId ? selectedCurrencyId : "__default__"}
                    onValueChange={(v) => setSelectedCurrencyId(v === "__default__" ? "" : v)}
                    disabled={currenciesLoading && sortedActiveCurrencies.length === 0}
                  >
                    <SelectTrigger className="w-[110px] h-9 border-slate-300 text-sm shrink-0">
                      <DollarSign className="h-3.5 w-3.5 mr-1 text-slate-500 shrink-0" />
                      <SelectValue placeholder={currenciesLoading ? "…" : "Default"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">
                        {entityLoading ? "…" : orgDefaultLabel}
                      </SelectItem>
                      {sortedActiveCurrencies.map((row) => (
                        <SelectItem key={row.id || row.code} value={row.id}>
                          {row.code.toUpperCase()}
                        </SelectItem>
                      ))}
                      {selectedCurrencyId && !selectedCurrencyInMasterList && (
                        <SelectItem value={selectedCurrencyId}>{reportCurrencyCode}</SelectItem>
                      )}
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
                  disabled={reportLoading || exportPdfLoading || data.length === 0}
                  className="border-slate-300 hover:bg-slate-50 shrink-0"
                >
                  {exportPdfLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  ) : (
                    <FileDown className="h-4 w-4 mr-1.5" />
                  )}
                  Export
                  <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportPdf} disabled={exportPdfLoading}>
                  <FileDown className="h-4 w-4 mr-2" />
                  Export as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportExcel}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export as Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* View tabs + activity filter */}
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="flex border-b border-slate-200 w-fit">
            <button
              onClick={() => setView("Summary")}
              className={`px-4 py-1.5 text-sm font-medium transition-all duration-200 relative ${
                view === "Summary"
                  ? "text-slate-900 border-b-2 border-blue-600"
                  : "text-slate-600 hover:text-slate-900 hover:border-b-2 hover:border-slate-300"
              }`}
            >
              Summary View
            </button>
            <button
              onClick={() => setView("Details")}
              className={`px-4 py-1.5 text-sm font-medium transition-all duration-200 relative ${
                view === "Details"
                  ? "text-slate-900 border-b-2 border-blue-600"
                  : "text-slate-600 hover:text-slate-900 hover:border-b-2 hover:border-slate-300"
              }`}
            >
              Detailed View
            </button>
          </div>
          <div className="flex items-center gap-2 border border-slate-200 rounded-md px-3 py-1.5 bg-white">
            <Filter className="h-4 w-4 text-slate-500" />
            <Label htmlFor="show-nonzero" className="text-sm text-slate-700 cursor-pointer whitespace-nowrap">
              Show only rows with activity
            </Label>
            <Switch id="show-nonzero" checked={showOnlyNonZero} onCheckedChange={setShowOnlyNonZero} />
          </div>
        </div>
      </div>

      <div className="p-3 space-y-3">
        <div className="space-y-3">
          {reportLoading && data.length === 0 ? (
            <Card className="shadow-sm border-slate-200">
              <CardContent className="p-6">
                <LoadingContent />
              </CardContent>
            </Card>
          ) : error && data.length === 0 ? (
            <Card className="shadow-sm border-slate-200">
              <CardContent className="p-6">
                <div className="flex flex-col items-center justify-center">
                  <p className="text-destructive mb-3 font-medium text-sm">Error: {error}</p>
                  <Button variant="outline" size="sm" onClick={() => fetchIncomeStatement(account)}>
                    Retry
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (() => {
            if (visibleStatementGroups.length === 0) {
              return (
                <Card className="shadow-sm border-slate-200">
                  <CardContent className="p-6">
                    <div className="flex flex-col items-center justify-center py-6">
                      <Filter className="h-10 w-10 text-slate-300 mb-3" />
                      <p className="text-slate-600 font-medium text-sm">
                        {showOnlyNonZero && data.length > 0
                          ? "No rows with activity in the selected period"
                          : "No data available"}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {showOnlyNonZero && data.length > 0
                          ? "Try turning off \"Show only rows with activity\" to see all accounts."
                          : "No data found for the selected period and filters"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            }

            return visibleStatementGroups.map((group, index) => (
              <Card key={`${group.classification}-${index}`} className="shadow-sm border-slate-200 hover:shadow-md transition-shadow duration-200">
                <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50 border-b border-slate-200 py-2 px-3">
                  <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-1">
                    {getClassificationIcon(group.classification)}
                    {group.classification}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-100 border-b border-slate-300">
                          <TableHead className="font-semibold text-slate-700 py-2 px-3 text-xs">Account</TableHead>
                          <TableHead className="text-right font-semibold text-slate-800 py-2 px-3 text-xs">Total Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {renderTableContent(group)}
                        {summary(group.items, group.classification)}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ));
          })()}
          {!reportLoading && !error && hasVisibleStatementRows && (
            <Card className="w-full shadow-sm border-slate-200 hover:shadow-md transition-shadow duration-200">
              <CardHeader className="bg-slate-100 py-3 px-4">
                <CardTitle className="flex items-center justify-between text-sm font-semibold text-slate-800">
                  <span>EBITDA</span>
                  <span className="font-mono text-sm text-slate-900">{formatCurrency(ebitda, displayCurrencyCode)}</span>
                </CardTitle>
              </CardHeader>
            </Card>
          )}
          {!reportLoading && !error && hasVisibleStatementRows && (
            <Card className="shadow-sm border-slate-200 hover:shadow-md transition-shadow duration-200">
              <CardHeader className="bg-slate-50 border-b border-slate-200 py-2 px-3">
                <CardTitle className="text-base font-semibold text-slate-800">Add-backs and Adjustments</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-100 border-b border-slate-300">
                        <TableHead className="font-semibold text-slate-700 py-2 px-3 text-xs">Account</TableHead>
                        <TableHead className="text-right font-semibold text-slate-800 py-2 px-3 text-xs">Total Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow className="hover:bg-slate-50 transition-colors duration-150 border-b border-slate-100">
                        <TableCell className="py-2 px-3 text-xs text-slate-700">Depreciation & Amortization</TableCell>
                        <TableCell className="text-right py-2 px-3 font-mono text-xs">{formatCurrency(depreciationAndAmortizationTotal, displayCurrencyCode)}</TableCell>
                      </TableRow>
                      <TableRow className="hover:bg-slate-50 transition-colors duration-150 border-b border-slate-100">
                        <TableCell className="py-2 px-3 text-xs text-slate-700">Interest & Tax</TableCell>
                        <TableCell className="text-right py-2 px-3 font-mono text-xs">{formatCurrency(interestAndTaxTotal, displayCurrencyCode)}</TableCell>
                      </TableRow>
                      <TableRow className="hover:bg-slate-50 transition-colors duration-150 border-b border-slate-100">
                        <TableCell className="py-2 px-3 text-xs text-slate-700">EBITDA Adjustments</TableCell>
                        <TableCell className="text-right py-2 px-3 font-mono text-xs">{formatCurrency(ebitdaAdjustmentsTotal, displayCurrencyCode)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
          {!reportLoading && !error && hasVisibleStatementRows && (
            <Card className="w-full shadow-sm border-slate-200 hover:shadow-md transition-shadow duration-200">
              <CardHeader className="bg-slate-100 py-3 px-4">
                <CardTitle className="flex items-center justify-between text-sm font-semibold text-slate-800">
                  <span>Adjusted EBITDA</span>
                  <span className="font-mono text-sm text-slate-900">{formatCurrency(adjustedEbitda, displayCurrencyCode)}</span>
                </CardTitle>
              </CardHeader>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
