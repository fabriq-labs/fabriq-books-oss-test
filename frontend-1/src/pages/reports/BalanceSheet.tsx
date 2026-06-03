"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { reportAPI, viewAPI } from "@/api/api";
import { formatCurrency } from "@/lib/formatters";
import { RefreshCw, Loader2, Building2, CreditCard, TrendingUp, DollarSign, Receipt, Filter, FileDown, ChevronDown, FileSpreadsheet } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import { pdf } from "@react-pdf/renderer";
import { TrialBalancePDFDocument } from "@/components/pdf_generator/TrialBalancePdf";
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
import { aggregateTrialBalanceSectionRows } from "@/lib/aggregateTrialBalanceSectionRows";
import {
  FinancialYearSelector,
  getPreviousFYOption,
  buildMonthOptions,
  type FinancialYearOption,
  type MonthOption,
  type FinancialYearType,
} from "@/components/Reports/FinancialYearSelector";


export interface TrialBalanceRow {
  account_id: string;
  account_path: string;
  account_name: string;
  account_type: string;
  classification: string | null;
  level: number;
  parent_account_id: string;
  total_debits: number;
  total_credits: number;
  balance: number;
  opening_balance: number;
  total_balance: number;
}

type CurrencyListRow = {
  id: string;
  code: string;
  name: string;
  is_active?: boolean;
};

const useTrialBalance = ({
  dateRange,
  view,
  currencyId,
  currencyCode,
  legalEntityIds,
}: {
  dateRange: [dayjs.Dayjs, dayjs.Dayjs];
  view: string;
  currencyId: string;
  currencyCode: string;
  legalEntityIds: string[];
}) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TrialBalanceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fetchSeq = useRef(0);

  const fetchTrialBalance = useCallback(
    async (account?: any) => {
      const seq = ++fetchSeq.current;
      setLoading(true);
      try {
        let filters: any = {
          from_date: dateRange[0].format("YYYY-MM-DD"),
          to_date: dateRange[1].format("YYYY-MM-DD"),
        };

        if (account) {
          filters.account_id = account?.id;
        }
        if (currencyId.trim()) {
          filters.currency_id = currencyId.trim();
        }

        if (legalEntityIds.length > 0) {
          filters.legal_entity_ids = legalEntityIds;
        }

        const result = (await reportAPI.getReport("trial_balance", filters)) as any;
        if (seq !== fetchSeq.current) return;
        const rawRows = Array.isArray(result?.data) ? result.data : [];
        const filteredData = rawRows.filter((row: any) => {
          const lev = Number(row?.level ?? 0);
          if (view === "Summary") {
            return lev === 0;
          }
          return (
            lev === 0 ||
            Number(row.total_debits ?? 0) !== 0 ||
            Number(row.total_credits ?? 0) !== 0 ||
            Number(row.opening_balance ?? 0) !== 0 ||
            Number(row.balance ?? 0) !== 0 ||
            Number(row.total_balance ?? 0) !== 0
          );
        });
        setData(filteredData);
        setError(null);
      } catch (err) {
        if (seq !== fetchSeq.current) return;
        setError(err instanceof Error ? err.message : "An error occurred");
        toast({
          title: "Error",
          description: "Failed to load balance sheet data",
          variant: "destructive",
        });
      } finally {
        if (seq === fetchSeq.current) {
          setLoading(false);
        }
      }
    },
    [dateRange, view, currencyId, currencyCode, legalEntityIds]
  );

  useEffect(() => {
    return () => {
      fetchSeq.current += 1;
    };
  }, []);

  return { data, loading, error, fetchTrialBalance };
};

function hasNonZeroAmount(row: TrialBalanceRow): boolean {
  const opening = Number(row.opening_balance ?? 0);
  const current = Number(row.balance ?? 0);
  const debits = Number(row.total_debits ?? 0);
  const credits = Number(row.total_credits ?? 0);
  const total = Number(row.total_balance ?? 0);
  return opening !== 0 || current !== 0 || debits !== 0 || credits !== 0 || total !== 0;
}

export default function BalanceSheet() {
  const { entities, currentEntity, currentEntityId, loading: entityLoading } = useEntity();

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

  const headquartersEntity = useMemo(
    () => entities.find((entity) => isEntityHeadquarters(entity)) ?? null,
    [entities]
  );

  const defaultCurrency = useMemo(
    () => currentEntity?.currency ?? headquartersEntity?.currency ?? null,
    [currentEntity, headquartersEntity]
  );

  // When entity changes: reset FY to previous FY for that entity's type, clear month, default currency
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

  const displayCurrencyCode = reportCurrencyCode;

  const defaultReportingCurrencyId = useMemo(
    () => defaultCurrency?.id ?? "",
    [defaultCurrency]
  );

  const effectiveReportCurrencyId = useMemo(
    () => selectedCurrencyId.trim() || defaultReportingCurrencyId,
    [selectedCurrencyId, defaultReportingCurrencyId]
  );

  const {
    selectedLegalEntityIds,
    setSelectedLegalEntityIds,
    selectionReady,
  } = useReportLegalEntitySelection(currentEntityId, entityLoading);

  const { data, loading, error, fetchTrialBalance } = useTrialBalance({
    dateRange: effectiveDateRange,
    view,
    currencyId: effectiveReportCurrencyId,
    currencyCode: reportCurrencyCode,
    legalEntityIds: selectedLegalEntityIds,
  });

  const reportLoading = loading || entityLoading || !selectionReady;

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

  const orgDefaultLabel = useMemo(() => {
    return defaultCurrency?.code?.trim().toUpperCase() ?? "INR";
  }, [defaultCurrency]);

  const legalEntitySummaryLabel = useMemo(() => {
    if (selectedLegalEntityIds.length === 0) return "All entities";
    if (selectedLegalEntityIds.length === 1) {
      return entities.find((entity) => entity.id === selectedLegalEntityIds[0])?.legal_name ?? "1 entity";
    }
    return `${selectedLegalEntityIds.length} entities`;
  }, [entities, selectedLegalEntityIds]);

  const accountSummaryLabel = useMemo(() => {
    return account?.name ?? account?.account_name ?? "All accounts";
  }, [account]);

  const displayedData = showOnlyNonZero ? data.filter(hasNonZeroAmount) : data;

  const groupedData = (data: TrialBalanceRow[]) => {
    const normalizeClassification = (classification: string | null | undefined) => {
      if (!classification) return "Unclassified";
      const normalized = classification.toLowerCase().trim();
      if (normalized.includes("asset")) return "Assets";
      if (normalized.includes("liabilit")) return "Liabilities";
      if (normalized.includes("equit")) return "Equity";
      if (normalized.includes("income") || normalized.includes("revenue")) return "Income";
      if (normalized.includes("expense") || normalized.includes("expens")) return "Expense";
      return classification;
    };

    const groups = data.reduce(
      (acc, item) => {
        const key = normalizeClassification(item.classification);
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      },
      {} as Record<string, TrialBalanceRow[]>
    );

    const orderOfClassifications = ["Assets", "Liabilities", "Equity"];
    return orderOfClassifications.map((classification) => ({
      classification,
      items: groups[classification] || [],
    }));
  };

  useEffect(() => {
    if (entityLoading || !selectionReady) return;
    void fetchTrialBalance(account);
  }, [entityLoading, selectionReady, fetchTrialBalance, account]);

  useEffect(() => {
    if (!fetchOnButtonClick) return;
    if (entityLoading || !selectionReady) return;
    void fetchTrialBalance(account);
    setFetchOnButtonClick(false);
  }, [fetchOnButtonClick, entityLoading, selectionReady, fetchTrialBalance, account]);

  const getClassificationIcon = (classification: string) => {
    const normalized = classification.toLowerCase();
    if (normalized.includes("asset")) return <Building2 className="h-4 w-4 text-blue-600" />;
    if (normalized.includes("liabilit")) return <CreditCard className="h-4 w-4 text-red-600" />;
    if (normalized.includes("equit")) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (normalized.includes("income") || normalized.includes("revenue")) return <DollarSign className="h-4 w-4 text-emerald-600" />;
    if (normalized.includes("expense") || normalized.includes("expens")) return <Receipt className="h-4 w-4 text-orange-600" />;
    return <Building2 className="h-4 w-4 text-slate-600" />;
  };

  const handleAccountChange = (value: any) => setAccount(value);
  const handleAccountClear = () => setAccount(null);
  const handleRefresh = () => setFetchOnButtonClick(true);

  const handleExportPdf = async () => {
    setExportPdfLoading(true);
    try {
      const groups = groupedData(displayedData).filter((group) => !showOnlyNonZero || group.items.length > 0);
      if (groups.length === 0) {
        toast({
          title: "No data to export",
          description: showOnlyNonZero && data.length > 0
            ? "No rows with activity. Try turning off 'Show only rows with activity' to export all accounts."
            : "Load the report first, then export.",
          variant: "destructive",
        });
        return;
      }
      const fromDate = effectiveDateRange[0].format("YYYY-MM-DD");
      const toDate = effectiveDateRange[1].format("YYYY-MM-DD");
      const accountName = account?.name ?? account?.account_name ?? (account ? "Selected account" : undefined);

      const blob = await pdf(
        <TrialBalancePDFDocument
          groups={groups}
          fromDate={fromDate}
          toDate={toDate}
          currencyCode={displayCurrencyCode}
          accountName={accountName}
          showOnlyNonZero={showOnlyNonZero}
          view={view}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `balance-sheet-${fromDate}-to-${toDate}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF exported", description: "Balance sheet has been downloaded." });
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
      const groups = groupedData(displayedData).filter((group) => !showOnlyNonZero || group.items.length > 0);
      if (groups.length === 0) {
        toast({
          title: "No data to export",
          description: showOnlyNonZero && data.length > 0
            ? "No rows with activity. Try turning off 'Show only rows with activity' to export all accounts."
            : "Load the report first, then export.",
          variant: "destructive",
        });
        return;
      }

      const fromDate = effectiveDateRange[0].format("YYYY-MM-DD");
      const toDate = effectiveDateRange[1].format("YYYY-MM-DD");

      const rows: string[][] = [["Account", "Opening Balance", "Debits", "Credits", "Closing Balance"]];

      for (const group of groups) {
        rows.push([group.classification, "", "", "", ""]);
        for (const row of group.items) {
          const indent = row.level > 0 ? "  ".repeat(row.level) : "";
          rows.push([
            `${indent}${row.account_name}`,
            formatCurrency(Number(row.opening_balance || 0), displayCurrencyCode),
            formatCurrency(Number(row.total_debits || 0), displayCurrencyCode),
            formatCurrency(Number(row.total_credits || 0), displayCurrencyCode),
            formatCurrency(Number(row.total_balance || 0), displayCurrencyCode),
          ]);
        }
        const totals = aggregateTrialBalanceSectionRows(group.items);
        rows.push([
          `${group.classification} Total`,
          formatCurrency(totals.opening_balance, displayCurrencyCode),
          formatCurrency(totals.total_debits, displayCurrencyCode),
          formatCurrency(totals.total_credits, displayCurrencyCode),
          formatCurrency(totals.total_balance, displayCurrencyCode),
        ]);
        rows.push([]);
      }

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 40 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Balance Sheet");
      XLSX.writeFile(wb, `balance-sheet-${fromDate}-to-${toDate}.xlsx`);
      toast({ title: "Excel exported", description: "Balance sheet has been downloaded." });
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
      <p className="text-slate-600 mt-3 font-medium text-sm">Loading balance sheet data...</p>
      <p className="text-xs text-slate-500 mt-1">Please wait while we fetch your financial data</p>
    </div>
  );

  const renderTableContent = (group: { classification: string; items: TrialBalanceRow[] }) => {
    if (reportLoading) {
      return (
        <TableRow>
          <TableCell colSpan={5} className="text-center">
            <LoadingContent />
          </TableCell>
        </TableRow>
      );
    }

    if (error) {
      return (
        <TableRow>
          <TableCell colSpan={5} className="text-center py-4">
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
                onClick={() => fetchTrialBalance(account)}
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
          <TableCell colSpan={5} className="text-center py-4">
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

    const fromDate = effectiveDateRange[0].format("YYYY-MM-DD");
    const toDate = effectiveDateRange[1].format("YYYY-MM-DD");

    return (
      <>
        {group.items.map((row, index) => {
          const openingBalance = Number(row.opening_balance || 0);
          const debits = Number(row.total_debits);
          const credits = Number(row.total_credits);
          const totalBalance = Number(row.total_balance || 0);
          const accountId = String(row.account_id ?? "").trim();
          const canDrillDown = !!accountId;
          const drillDownUrl = canDrillDown
            ? `/accounting/transactions?account_id=${encodeURIComponent(accountId)}&from_date=${fromDate}&to_date=${toDate}`
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
                <div className="flex items-center">
                  <div style={{ marginLeft: row.level * 12 }} className="flex items-center gap-1">
                    {row.level > 0 && <div className="w-1 h-1 rounded-full bg-slate-400"></div>}
                    <span className={`text-xs ${row.level === 0 ? "font-semibold text-slate-800" : "text-slate-700"}`}>
                      {row.account_name}
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-right w-[140px] py-2 px-3 font-mono text-xs">
                <span className="text-slate-600">{formatCurrency(openingBalance, displayCurrencyCode)}</span>
              </TableCell>
              <TableCell className="text-right w-[140px] py-2 px-3 font-mono text-xs">
                <span className="text-slate-600">{formatCurrency(debits, displayCurrencyCode)}</span>
              </TableCell>
              <TableCell className="text-right w-[140px] py-2 px-3 font-mono text-xs">
                <span className="text-slate-600">{formatCurrency(credits, displayCurrencyCode)}</span>
              </TableCell>
              <TableCell
                className={`text-right w-[140px] py-2 px-3 font-mono text-xs font-bold ${canDrillDown ? "text-blue-700" : "text-slate-900"}`}
              >
                {formatCurrency(totalBalance, displayCurrencyCode)}
              </TableCell>
            </TableRow>
          );
        })}
        {summary(group.items)}
      </>
    );
  };

  const summary = (pageData: readonly TrialBalanceRow[]) => {
    const totals = aggregateTrialBalanceSectionRows(pageData);
    return (
      <TableRow className="font-bold bg-gradient-to-r from-slate-100 to-blue-50 border-t-2 border-slate-300">
        <TableCell className="text-left py-2 px-3 text-slate-800">
          <div className="flex items-center justify-start gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>
            <span className="text-xs font-bold">Total</span>
          </div>
        </TableCell>
        <TableCell className="text-right w-[140px] py-2 px-3 font-mono text-xs">
          <span className="text-slate-700 font-bold">{formatCurrency(totals.opening_balance, displayCurrencyCode)}</span>
        </TableCell>
        <TableCell className="text-right w-[140px] py-2 px-3 font-mono text-xs">
          <span className="text-slate-700 font-bold">{formatCurrency(totals.total_debits, displayCurrencyCode)}</span>
        </TableCell>
        <TableCell className="text-right w-[140px] py-2 px-3 font-mono text-xs">
          <span className="text-slate-700 font-bold">{formatCurrency(totals.total_credits, displayCurrencyCode)}</span>
        </TableCell>
        <TableCell className="text-right w-[140px] py-2 px-3 font-mono text-xs">
          <span className="text-slate-900 font-bold">{formatCurrency(totals.total_balance, displayCurrencyCode)}</span>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="reports-header">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <h1 className="text-lg font-bold text-slate-900">Balance Sheet</h1>
            <p className="text-xs text-slate-600">Financial position overview</p>
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
                    onChange={(opt) => { setSelectedFY(opt); setSelectedMonth(null); }}
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
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
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
            hint="Reporting currency for balances. Default uses the entity's base currency."
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
            hint="Optional. Limit the balance sheet to a single account and its roll-up."
          >
            <ReportAccountFilter
              selectedAccount={account}
              onAccountChange={handleAccountChange}
              onAccountClear={handleAccountClear}
            />
          </ReportAdvancedField>
        </ReportAdvancedFilters>

        {/* View tabs + activity filter */}
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="flex border-b border-slate-200 w-fit">
            <button
              onClick={() => setView("Summary")}
              className={`px-4 py-2 text-sm font-medium transition-all duration-200 relative ${view === "Summary"
                ? "text-slate-900 border-b-2 border-blue-600"
                : "text-slate-600 hover:text-slate-900 hover:border-b-2 hover:border-slate-300"
                }`}
            >
              Summary View
            </button>
            <button
              onClick={() => setView("Details")}
              className={`px-4 py-2 text-sm font-medium transition-all duration-200 relative ${view === "Details"
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

      {/* Content */}
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
                  <Button variant="outline" size="sm" onClick={() => fetchTrialBalance(account)}>
                    Retry
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (() => {
            const groups = groupedData(displayedData).filter(
              (group) => !showOnlyNonZero || group.items.length > 0
            );
            if (groups.length === 0) {
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
                          ? "Try turning off 'Show only rows with activity' to see all accounts."
                          : "No data found for the selected period and filters"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            }
            return (
              <div className="space-y-3">
                {groups.map((group) => (
                  <Card key={group.classification} className="shadow-sm border-slate-200 hover:shadow-md transition-shadow duration-200">
                    <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50 border-b border-slate-200 py-2 px-3">
                      <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-1">
                        {getClassificationIcon(group.classification)}
                        {group.classification}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table className="w-full table-fixed">
                          <TableHeader>
                            <TableRow className="bg-slate-100 border-b border-slate-300">
                              <TableHead className="font-semibold text-slate-700 py-2 px-3 text-xs">Account</TableHead>
                              <TableHead className="text-right w-[140px] font-semibold text-slate-700 py-2 px-3 text-xs">Opening Balance</TableHead>
                              <TableHead className="text-right w-[140px] font-semibold text-slate-700 py-2 px-3 text-xs">Debits</TableHead>
                              <TableHead className="text-right w-[140px] font-semibold text-slate-700 py-2 px-3 text-xs">Credits</TableHead>
                              <TableHead className="text-right w-[140px] font-semibold text-slate-800 py-2 px-3 text-xs">Closing Balance</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>{renderTableContent(group)}</TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}