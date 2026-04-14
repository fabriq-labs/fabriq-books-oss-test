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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import { pdf } from "@react-pdf/renderer";
import { TrialBalancePDFDocument } from "@/components/pdf_generator/TrialBalancePdf";
import "@/styles/reports.css";
import { ReportControls } from "@/components/Reports/ReportControls";
import { useReportController } from "@/contexts/ReportControllerContext";
import { useAuth } from "@/contexts/AuthContext";
import { aggregateTrialBalanceSectionRows } from "@/lib/aggregateTrialBalanceSectionRows";



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

/** View name for `viewAPI.search` on the currency model. */
type CurrencyListRow = {
  id: string;
  code: string;
  name: string;
  is_active?: boolean;
};

type LegalEntityOption = {
  id: string;
  organization_name?: string;
  legal_name?: string;
  name?: string | null;
  is_it_headquartres?: string | null;
  /** From `entity.basecurrency_id` → `currency` (see `entity_view` data graph). */
  currency?: { code?: string | null } | null;
};

/** ISO 4217 code from the entity’s linked `currency` row (`basecurrency_id`). */
function resolveEntityBaseCurrencyCode(org: LegalEntityOption | undefined): string | null {
  if (!org) return null;
  const raw = org.currency?.code?.trim();
  return raw ? raw.toUpperCase() : null;
}

/** HQ flag is stored as text; backend uses `yes`, some UIs use `Yes`. */
function isHeadquartersEntity(org: Pick<LegalEntityOption, "is_it_headquartres">): boolean {
  const v = String(org?.is_it_headquartres ?? "").trim().toLowerCase();
  return v === "yes" || v === "true" || v === "1";
}

/** Reporting currency for the org: HQ entity’s base currency, else first entity, else INR. */
function resolveHeadquartersBaseCurrency(list: LegalEntityOption[]): string {
  const hq = list.find(isHeadquartersEntity) ?? list[0];
  return resolveEntityBaseCurrencyCode(hq) ?? "INR";
}

const useTrialBalance = ({
  dateRange,
  view,
  currency,
  legalEntityIds,
}: {
  dateRange?: [dayjs.Dayjs, dayjs.Dayjs];
  view: string;
  currency: string;
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
          from_date: dateRange?.[0]?.format("YYYY-MM-DD") || dayjs().format("YYYY-MM-DD"),
          to_date: dateRange?.[1]?.format("YYYY-MM-DD") || dayjs().format("YYYY-MM-DD"),
        };

        if (account) {
          filters.account_id = account?.id;
        }

        filters.currency = currency || "INR";

        if (legalEntityIds.length > 0) {
          filters.legal_entity_ids = legalEntityIds;
        }

        const result = (await reportAPI.getReport("trial_balance", filters)) as any;
        if (seq !== fetchSeq.current) return;
        const rawRows = Array.isArray(result?.data) ? result.data : [];
        // Summary always matches “top of chart” (level 0), with or without legal_entity_ids — same UI shape
        // as unscoped summary. Detail expands to child accounts with activity (and keeps level-0 headers).
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
          description: "Failed to load trial balance data",
          variant: "destructive",
        });
      } finally {
        if (seq === fetchSeq.current) {
          setLoading(false);
        }
      }
    },
    [dateRange, view, currency, legalEntityIds]
  );

  useEffect(() => {
    return () => {
      fetchSeq.current += 1;
    };
  }, []);

  return {
    data,
    loading,
    error,
    fetchTrialBalance,
  };
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
  const { user } = useAuth();
  const [fetchOnButtonClick, setFetchOnButtonClick] = useState(false);
  const [account, setAccount]: any = useState(null);
  const [view, setView] = useState("Summary");
  const [showOnlyNonZero, setShowOnlyNonZero] = useState(true);
  const [exportPdfLoading, setExportPdfLoading] = useState(false);
  const [currency, setCurrency] = useState("");
  const [currencies, setCurrencies] = useState<CurrencyListRow[]>([]);
  const [currenciesLoading, setCurrenciesLoading] = useState(false);
  const [legalEntityOptions, setLegalEntityOptions] = useState<LegalEntityOption[]>([]);
  const [legalEntitiesLoading, setLegalEntitiesLoading] = useState(true);
  const [selectedLegalEntityIds, setSelectedLegalEntityIds] = useState<string[]>([]);

  // Use report controller context
  const { dateRange } = useReportController();

  /** ISO code sent to trial_balance report and used for formatting. */
  const reportCurrencyCode = useMemo(() => {
    if (currency.trim()) return currency.trim().toUpperCase();
    return resolveHeadquartersBaseCurrency(legalEntityOptions);
  }, [currency, legalEntityOptions]);

  const displayCurrencyCode = reportCurrencyCode;

  const { data, loading, error, fetchTrialBalance } = useTrialBalance({
    dateRange,
    view,
    currency: reportCurrencyCode,
    legalEntityIds: selectedLegalEntityIds,
  });

  const reportLoading = loading || legalEntitiesLoading;

  // Load legal entities (HQ flag + `currency.code` from basecurrency_id) for filters and org-default reporting currency
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLegalEntitiesLoading(true);
      try {
        const filters = user?.org_id ? { org_id: { eq: user.org_id } } : {};
        const res: any = await viewAPI.search(
          "entity",
          "entity_view",
          1,
          500,
          undefined,
          filters,
          {}
        );
        const list = Array.isArray(res?.data) ? res.data : [];
        if (!cancelled) setLegalEntityOptions(list);
      } catch {
        if (!cancelled) setLegalEntityOptions([]);
      } finally {
        if (!cancelled) setLegalEntitiesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.org_id]);

  const loadCurrencies = useCallback(async () => {
    if (!user?.org_id) {
      setCurrencies([]);
      return;
    }
    setCurrenciesLoading(true);
    try {
      const res: any = await viewAPI.search(
        "currency",
        "currency_view",
        1,
        500,
        undefined,
        { org_id: { eq: user.org_id } },
        {}
      );
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
  }, [user?.org_id]);

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

  const sortedActiveCurrencies = useMemo(() => {
    return [...currencies]
      .filter((c) => c.code && c.is_active !== false)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [currencies]);

  const currencyCodeInList = useMemo(() => {
    if (!currency.trim()) return true;
    const u = currency.trim().toUpperCase();
    return sortedActiveCurrencies.some((c) => c.code.toUpperCase() === u);
  }, [sortedActiveCurrencies, currency]);

  const orgDefaultLabel = useMemo(() => {
    const code = resolveHeadquartersBaseCurrency(legalEntityOptions);
    return `Org Default (${code})`;
  }, [legalEntityOptions]);

  const displayedData = showOnlyNonZero ? data.filter(hasNonZeroAmount) : data;

  const groupedData = (data: TrialBalanceRow[]) => {
    // Normalize classification names to handle case variations and typos
    const normalizeClassification = (classification: string | null | undefined) => {
      // Handle null or undefined classification
      if (!classification) return 'Unclassified';

      const normalized = classification.toLowerCase().trim();
      // Handle common variations and typos
      if (normalized.includes('asset')) return 'Assets';
      if (normalized.includes('liabilit')) return 'Liabilities';
      if (normalized.includes('equit')) return 'Equity';
      if (normalized.includes('income') || normalized.includes('revenue')) return 'Income';
      if (normalized.includes('expense') || normalized.includes('expens')) return 'Expense';

      // Return original if no match found
      return classification;
    };

    const groups = data.reduce(
      (acc, item) => {
        const normalizedClassification = normalizeClassification(item.classification);
        if (!acc[normalizedClassification]) {
          acc[normalizedClassification] = [];
        }
        acc[normalizedClassification].push(item);
        return acc;
      },
      {} as Record<string, TrialBalanceRow[]>
    );
    // Define the preferred order of classifications
    const orderOfClassifications = [
      "Assets",
      "Liabilities",
      "Equity",
    ];

    // Balance sheet only: Assets, Liabilities, Equity in both Summary and Detailed view.
    // Summary uses level-0 rows from the API filter; Detailed shows the full hierarchy within each section.
    return orderOfClassifications.map((classification) => ({
      classification,
      items: groups[classification] || [],
    }));
  };

  useEffect(() => {
    if (legalEntitiesLoading) return;
    void fetchTrialBalance(account);
  }, [legalEntitiesLoading, fetchTrialBalance, account]);

  useEffect(() => {
    if (!fetchOnButtonClick) return;
    if (legalEntitiesLoading) return;
    void fetchTrialBalance(account);
    setFetchOnButtonClick(false);
  }, [fetchOnButtonClick, legalEntitiesLoading, fetchTrialBalance, account]);


  const getClassificationIcon = (classification: string) => {
    const normalized = classification.toLowerCase();
    if (normalized.includes('asset')) return <Building2 className="h-4 w-4 text-blue-600" />;
    if (normalized.includes('liabilit')) return <CreditCard className="h-4 w-4 text-red-600" />;
    if (normalized.includes('equit')) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (normalized.includes('income') || normalized.includes('revenue')) return <DollarSign className="h-4 w-4 text-emerald-600" />;
    if (normalized.includes('expense') || normalized.includes('expens')) return <Receipt className="h-4 w-4 text-orange-600" />;
    return <Building2 className="h-4 w-4 text-slate-600" />;
  };


  const handleAccountChange = (value: any) => {
    setAccount(value);
  };

  const handleAccountClear = () => {
    setAccount(null);
  };

  const handleRefresh = () => {
    setFetchOnButtonClick(true);
  };

  const handleExportPdf = async () => {
    setExportPdfLoading(true);
    try {
      const groups = groupedData(displayedData).filter(
        (group) => !showOnlyNonZero || group.items.length > 0
      );
      if (groups.length === 0) {
        toast({
          title: "No data to export",
          description: showOnlyNonZero && data.length > 0
            ? "No rows with activity. Try turning off “Show only rows with activity” to export all accounts."
            : "Load the report first, then export.",
          variant: "destructive",
        });
        return;
      }
      const fromDate = dateRange?.[0]?.format("YYYY-MM-DD") ?? dayjs().format("YYYY-MM-DD");
      const toDate = dateRange?.[1]?.format("YYYY-MM-DD") ?? dayjs().format("YYYY-MM-DD");
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
      link.download = `trial-balance-${fromDate}-to-${toDate}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF exported", description: "Trial balance has been downloaded." });
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
      const groups = groupedData(displayedData).filter(
        (group) => !showOnlyNonZero || group.items.length > 0
      );
      if (groups.length === 0) {
        toast({
          title: "No data to export",
          description: showOnlyNonZero && data.length > 0
            ? "No rows with activity. Try turning off \u201cShow only rows with activity\u201d to export all accounts."
            : "Load the report first, then export.",
          variant: "destructive",
        });
        return;
      }

      const fromDate = dateRange?.[0]?.format("YYYY-MM-DD") ?? dayjs().format("YYYY-MM-DD");
      const toDate = dateRange?.[1]?.format("YYYY-MM-DD") ?? dayjs().format("YYYY-MM-DD");

      const rows: string[][] = [
        ["Account", "Debits", "Credits", "Total"],
      ];

      for (const group of groups) {
        rows.push([group.classification, "", "", ""]);

        for (const row of group.items) {
          const indent = row.level > 0 ? "  ".repeat(row.level) : "";
          rows.push([
            `${indent}${row.account_name}`,
            formatCurrency(Number(row.total_debits || 0), displayCurrencyCode),
            formatCurrency(Number(row.total_credits || 0), displayCurrencyCode),
            formatCurrency(Number(row.total_balance || 0), displayCurrencyCode),
          ]);
        }

        const totals = aggregateTrialBalanceSectionRows(group.items);
        rows.push([
          `${group.classification} Total`,
          formatCurrency(totals.total_debits, displayCurrencyCode),
          formatCurrency(totals.total_credits, displayCurrencyCode),
          formatCurrency(totals.total_balance, displayCurrencyCode),
        ]);
        rows.push([]);
      }

      const ws = XLSX.utils.aoa_to_sheet(rows);

      ws["!cols"] = [
        { wch: 40 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 },
      ];

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

  // Loading and No Data Components
  const LoadingContent = () => (
    <div className="flex flex-col items-center justify-center py-6">
      <div className="relative">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        <div className="absolute inset-0 rounded-full border-2 border-blue-200"></div>
      </div>
      <p className="text-slate-600 mt-3 font-medium text-sm">Loading trial balance data...</p>
      <p className="text-xs text-slate-500 mt-1">Please wait while we fetch your financial data</p>
    </div>
  );

  const renderTableContent = (group: { classification: string; items: TrialBalanceRow[] }) => {
    if (reportLoading) {
      return (
        <TableRow>
          <TableCell colSpan={6} className="text-center">
            <LoadingContent />
          </TableCell>
        </TableRow>
      );
    }

    if (error) {
      return (
        <TableRow>
          <TableCell colSpan={4} className="text-center py-4">
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
                onClick={() => {
                  fetchTrialBalance(account);
                }}
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
          <TableCell colSpan={6} className="text-center py-4">
            <div className="flex flex-col items-center justify-center">
              <div className="w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center mb-1">
                <div className="w-2 h-2 bg-slate-300 rounded-full"></div>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                No data found for {group.classification}
              </p>
            </div>
          </TableCell>
        </TableRow>
      );
    }

    return (
      <>
        {group.items.map((row) => {
          const debits = Number(row.total_debits);
          const credits = Number(row.total_credits);
          const totalBalance = Number(row.total_balance || 0);

          return (
            <TableRow key={row.account_id} className="hover:bg-slate-50 transition-colors duration-150 border-b border-slate-100">
              <TableCell className="py-2 px-3">
                <div className="flex items-center">
                  <div style={{ marginLeft: row.level * 12 }} className="flex items-center gap-1">
                    {row.level > 0 && (
                      <div className="w-1 h-1 rounded-full bg-slate-400"></div>
                    )}
                    <span className={`text-xs ${row.level === 0 ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>
                      {row.account_name}
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-right w-[140px] py-2 px-3 font-mono text-xs">
                <span className="text-slate-600">
                  {formatCurrency(debits, displayCurrencyCode)}
                </span>
              </TableCell>
              <TableCell className="text-right w-[140px] py-2 px-3 font-mono text-xs">
                <span className="text-slate-600">
                  {formatCurrency(credits, displayCurrencyCode)}
                </span>
              </TableCell>
              <TableCell className="text-right w-[140px] py-2 px-3 font-mono text-xs">
                <span className="text-slate-900 font-bold">
                  {formatCurrency(totalBalance, displayCurrencyCode)}
                </span>
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
        <TableCell className="text-left w-[140px] py-2 px-3 text-slate-800">
          <div className="flex items-center justify-start gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>
            <span className="text-xs font-bold">Total</span>
          </div>
        </TableCell>
        <TableCell className="text-right w-[140px] py-2 px-3 font-mono text-xs">
          <span className="text-slate-700 font-bold">
            {formatCurrency(totals.total_debits, displayCurrencyCode)}
          </span>
        </TableCell>
        <TableCell className="text-right w-[140px] py-2 px-3 font-mono text-xs">
          <span className="text-slate-700 font-bold">
            {formatCurrency(totals.total_credits, displayCurrencyCode)}
          </span>
        </TableCell>
        <TableCell className="text-right w-[140px] py-2 px-3 font-mono text-xs">
          <span className="text-slate-900 font-bold">
            {formatCurrency(totals.total_balance, displayCurrencyCode)}
          </span>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Sticky Top Header */}
      <div className="reports-header">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <h1 className="text-lg font-bold text-slate-900">Balance Sheet</h1>
            <p className="text-xs text-slate-600">Financial position overview</p>
          </div>

          {/* Controls Section */}
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
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 border-slate-300 justify-between min-w-[120px] shrink-0">
                        <span className="text-slate-600 truncate text-xs">
                          {selectedLegalEntityIds.length === 0
                            ? "Legal Entity"
                            : `${selectedLegalEntityIds.length} selected`}
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-2" align="start">
                      <div className="max-h-[240px] overflow-y-auto space-y-1">
                        {legalEntityOptions.length === 0 ? (
                          <p className="text-xs text-slate-500 py-2">No organizations loaded</p>
                        ) : (
                          legalEntityOptions.map((org) => (
                            <label
                              key={org.id}
                              className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-slate-100 cursor-pointer text-sm"
                            >
                              <Checkbox
                                checked={selectedLegalEntityIds.includes(org.id)}
                                onCheckedChange={(checked) => {
                                  setSelectedLegalEntityIds((prev) =>
                                    checked ? [...prev, org.id] : prev.filter((id) => id !== org.id)
                                  );
                                }}
                              />
                              <span className="truncate">{org.legal_name ?? org.id}</span>
                            </label>
                          ))
                        )}
                      </div>
                      {selectedLegalEntityIds.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 w-full text-xs"
                          onClick={() => setSelectedLegalEntityIds([])}
                        >
                          Clear selection
                        </Button>
                      )}
                    </PopoverContent>
                  </Popover>
                  <Select
                    value={currency ? currency : "__default__"}
                    onValueChange={(v) => {
                      setCurrency(v === "__default__" ? "" : v);
                    }}
                    disabled={currenciesLoading && sortedActiveCurrencies.length === 0}
                  >
                    <SelectTrigger className="w-[min(100vw-8rem,220px)] min-w-[150px] max-w-[220px] h-9 border-slate-300 text-sm shrink-0">
                      <DollarSign className="h-4 w-4 mr-1 text-slate-500 shrink-0" />
                      <SelectValue placeholder={currenciesLoading ? "Loading…" : "Org Default"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">
                        {legalEntitiesLoading ? "Org Default (…)" : orgDefaultLabel}
                      </SelectItem>
                      {sortedActiveCurrencies.map((row) => {
                        const code = row.code.toUpperCase();
                        const label = row.name ? `${code} — ${row.name}` : code;
                        return (
                          <SelectItem key={row.id || code} value={code}>
                            {label}
                          </SelectItem>
                        );
                      })}
                      {currency && !currencyCodeInList && (
                        <SelectItem value={currency.trim().toUpperCase()}>
                          {currency.trim().toUpperCase()} (not in master list)
                        </SelectItem>
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

        {/* Professional Tabs */}
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
            <Switch
              id="show-nonzero"
              checked={showOnlyNonZero}
              onCheckedChange={setShowOnlyNonZero}
            />
          </div>
        </div>
      </div>

      {/* Full Width Content */}
      <div className="p-3 space-y-3">

        {/* Data Tables Section */}
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
                  <Button variant="outline" size="sm" onClick={() => {
                    fetchTrialBalance(account);
                  }}>
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
                          ? "Try turning off “Show only rows with activity” to see all accounts."
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
                              <TableHead className="text-right w-[140px] font-semibold text-slate-700 py-2 px-3 text-xs">Debits</TableHead>
                              <TableHead className="text-right w-[140px] font-semibold text-slate-700 py-2 px-3 text-xs">Credits</TableHead>
                              <TableHead className="text-right w-[140px] font-semibold text-slate-800 py-2 px-3 text-xs">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {renderTableContent(group)}
                          </TableBody>
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