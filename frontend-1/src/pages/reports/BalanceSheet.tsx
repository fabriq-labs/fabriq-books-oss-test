"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { reportAPI, viewAPI } from "@/api/api";
import { formatCurrency } from "@/lib/formatters";
import { Calendar, RefreshCw, Loader2, Building2, CreditCard, TrendingUp, DollarSign, Receipt, Filter, FileDown, ChevronDown, FileSpreadsheet } from "lucide-react";
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

const CURRENCY_OPTIONS = [
  { value: "", label: "Org Default" },
  { value: "INR", label: "INR — Indian Rupee" },
  { value: "USD", label: "USD — US Dollar" },
  { value: "PHP", label: "PHP — Philippine Peso" },
];

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

  const fetchTrialBalance = async (account?: any) => {
    setLoading(true);
    try {
      let filters: any = {
        from_date: dateRange?.[0]?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'),
        to_date: dateRange?.[1]?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'),
      };

      if (account) {
        filters.account_id = account?.id;
      }

      if (currency) {
        filters.currency = currency;
      }

      if (legalEntityIds.length > 0) {
        filters.legal_entity_ids = legalEntityIds;
      }

      const result = await reportAPI.getReport("trial_balance", filters) as any;
      const filteredData = Array.isArray(result.data)
        ? result.data.filter((row: any) => {
          if (view === "Summary") {
            return row.level === 0;
          }
          return (
            row.level === 0 ||
            row.total_debits !== "0" ||
            row.total_credits !== "0"
          );
        })
        : [];
      setData(filteredData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      toast({
        title: "Error",
        description: "Failed to load trial balance data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

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
  const [fetchOnButtonClick, setFetchOnButtonClick] = useState(false);
  const [account, setAccount]: any = useState(null);
  const [view, setView] = useState("Summary");
  const [showOnlyNonZero, setShowOnlyNonZero] = useState(true);
  const [exportPdfLoading, setExportPdfLoading] = useState(false);
  const [currency, setCurrency] = useState("");
  const [legalEntityOptions, setLegalEntityOptions] = useState<{ id: string; legal_name: string }[]>([]);
  const [selectedLegalEntityIds, setSelectedLegalEntityIds] = useState<string[]>([]);

  // Use report controller context
  const { dateRange } = useReportController();

  const { data, loading, error, fetchTrialBalance } = useTrialBalance({
    dateRange,
    view,
    currency,
    legalEntityIds: selectedLegalEntityIds,
  });

  // Load legal entities (organizations) for the filter
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res: any = await viewAPI.search("entity", "entity_view", 1, 200, undefined, {}, {});
        const list = Array.isArray(res?.data) ? res.data : [];
        if (!cancelled) setLegalEntityOptions(list);
      } catch {
        if (!cancelled) setLegalEntityOptions([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
      "Income",
      "Expense",
    ];

    // Also include any classifications that exist in data but aren't in our predefined list
    const existingClassifications = Object.keys(groups);
    const missingClassifications = existingClassifications.filter(
      classification => !orderOfClassifications.includes(classification)
    );
    // Combine predefined classifications with any missing ones from the data
    const allClassifications = [...orderOfClassifications, ...missingClassifications];

    const result = allClassifications.map((classification) => ({
      classification,
      items: groups[classification] || [],
    }));

    return result;
  };

  useEffect(() => {
    fetchTrialBalance();
  }, [view]);

  useEffect(() => {
    if (fetchOnButtonClick) {
      fetchTrialBalance(account);
      setFetchOnButtonClick(false);
    }
  }, [fetchOnButtonClick, dateRange, view, account]);

  // Watch for date range, currency, or legal entity changes and refresh data
  useEffect(() => {
    fetchTrialBalance(account);
  }, [dateRange, currency, selectedLegalEntityIds]);


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

      const rows: (string | number)[][] = [
        ["Account", "Opening", "Debits", "Credits", "Current", "Total"],
      ];

      for (const group of groups) {
        rows.push([group.classification, "", "", "", "", ""]);

        for (const row of group.items) {
          const indent = row.level > 0 ? "  ".repeat(row.level) : "";
          rows.push([
            `${indent}${row.account_name}`,
            Number(row.opening_balance || 0),
            Number(row.total_debits),
            Number(row.total_credits),
            Number(row.balance),
            Number(row.total_balance || 0),
          ]);
        }

        const totals = group.items.reduce(
          (acc, curr) => {
            if (curr.level === 0) {
              return {
                opening: acc.opening + Number(curr.opening_balance || 0),
                debits: acc.debits + Number(curr.total_debits),
                credits: acc.credits + Number(curr.total_credits),
                balance: acc.balance + Number(curr.balance),
                total: acc.total + Number(curr.total_balance || 0),
              };
            }
            return acc;
          },
          { opening: 0, debits: 0, credits: 0, balance: 0, total: 0 }
        );
        rows.push([
          `${group.classification} Total`,
          totals.opening,
          totals.debits,
          totals.credits,
          totals.balance,
          totals.total,
        ]);
        rows.push([]);
      }

      const ws = XLSX.utils.aoa_to_sheet(rows);

      ws["!cols"] = [
        { wch: 40 },
        { wch: 15 },
        { wch: 15 },
        { wch: 15 },
        { wch: 15 },
        { wch: 15 },
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

  const NoDataContent = () => (
    <div className="flex flex-col items-center justify-center py-6">
      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
        <Calendar className="h-6 w-6 text-slate-400" />
      </div>
      <p className="text-slate-600 font-medium mb-1 text-sm">No data available</p>
      <p className="text-xs text-slate-500 mb-4 text-center">No data found for the selected period and filters</p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          fetchTrialBalance(account);
        }}
        className="border-slate-300 hover:bg-slate-50 text-xs"
      >
        <RefreshCw className="h-3 w-3 mr-1" />
        Retry
      </Button>
    </div>
  );

  const renderTableContent = (group: { classification: string; items: TrialBalanceRow[] }) => {
    if (loading) {
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
          <TableCell colSpan={6} className="text-center py-4">
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
          const openingBalance = Number(row.opening_balance || 0);
          const debits = Number(row.total_debits);
          const credits = Number(row.total_credits);
          const balance = Number(row.balance);
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
              <TableCell className="text-right py-2 px-3 font-mono text-xs">
                <span className={`${openingBalance >= 0 ? 'text-blue-700' : 'text-slate-600'}`}>
                  {openingBalance.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </TableCell>
              <TableCell className="text-right py-2 px-3 font-mono text-xs">
                <span className="text-slate-600">
                  {debits.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </TableCell>
              <TableCell className="text-right py-2 px-3 font-mono text-xs">
                <span className="text-slate-600">
                  {credits.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </TableCell>
              <TableCell className="text-right py-2 px-3 font-mono text-xs">
                <span className={`${balance >= 0 ? 'text-green-700 font-semibold' : 'text-slate-600 font-semibold'}`}>
                  {balance.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </TableCell>
              <TableCell className="text-right py-2 px-3 font-mono text-xs">
                <span className="text-slate-900 font-bold">
                  {totalBalance.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
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
    // Only include level 0 items (parent accounts) in totals
    const totals = pageData.reduce(
      (acc, curr) => {
        if (curr.level === 0) {
          return {
            total_debits: acc.total_debits + Number(curr.total_debits),
            total_credits: acc.total_credits + Number(curr.total_credits),
            balance: acc.balance + Number(curr.balance),
            opening_balance: acc.opening_balance + Number(curr.opening_balance || 0),
            total_balance: acc.total_balance + Number(curr.total_balance || 0),
          };
        }
        return acc;
      },
      { total_debits: 0, total_credits: 0, balance: 0, opening_balance: 0, total_balance: 0 }
    );

    return (
      <TableRow className="font-bold bg-gradient-to-r from-slate-100 to-blue-50 border-t-2 border-slate-300">
        <TableCell className="text-right py-2 px-3 text-slate-800">
          <div className="flex items-center justify-end gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>
            <span className="text-xs font-bold">Total</span>
          </div>
        </TableCell>
        <TableCell className="text-right py-2 px-3 font-mono text-xs">
          <span className="text-blue-800 font-bold">
            {formatCurrency(totals.opening_balance)}
          </span>
        </TableCell>
        <TableCell className="text-right py-2 px-3 font-mono text-xs">
          <span className="text-slate-700 font-bold">
            {formatCurrency(totals.total_debits)}
          </span>
        </TableCell>
        <TableCell className="text-right py-2 px-3 font-mono text-xs">
          <span className="text-slate-700 font-bold">
            {formatCurrency(totals.total_credits)}
          </span>
        </TableCell>
        <TableCell className="text-right py-2 px-3 font-mono text-xs">
          <span className="text-green-800 font-bold">
            {formatCurrency(totals.balance)}
          </span>
        </TableCell>
        <TableCell className="text-right py-2 px-3 font-mono text-xs">
          <span className="text-slate-900 font-bold">
            {formatCurrency(totals.total_balance)}
          </span>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Sticky Top Header */}
      <div className="reports-header">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Balance Sheet</h1>
            <p className="text-xs text-slate-600">Financial position overview</p>
          </div>

          {/* Controls Section */}
          <div className="flex flex-wrap items-center gap-2">
            <ReportControls
              selectedAccount={account}
              onAccountChange={handleAccountChange}
              onAccountClear={handleAccountClear}
              onRefresh={handleRefresh}
              loading={loading}
              showAccountFilter={true}
              showRefreshButton={true}
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 border-slate-300 justify-between min-w-[180px]">
                  <span className="text-slate-600 truncate">
                    {selectedLegalEntityIds.length === 0
                      ? "Organization (legal entity)"
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
            <Select value={currency} onValueChange={(v) => { setCurrency(v === "__default__" ? "" : v); }}>
              <SelectTrigger className="w-[170px] h-9 border-slate-300 text-sm">
                <DollarSign className="h-4 w-4 mr-1 text-slate-500" />
                <SelectValue placeholder="Org Default" />
              </SelectTrigger>
              <SelectContent>
                {CURRENCY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value || "__default__"} value={opt.value || "__default__"}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading || exportPdfLoading || data.length === 0}
                  className="border-slate-300 hover:bg-slate-50"
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
          {loading && data.length === 0 ? (
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
          ) : groupedData(displayedData).length === 0 ? (
            <Card className="shadow-sm border-slate-200">
              <CardContent className="p-6">
                <NoDataContent />
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
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-100 border-b border-slate-300">
                              <TableHead className="font-semibold text-slate-700 py-2 px-3 text-xs">Account</TableHead>
                              <TableHead className="text-right font-semibold text-blue-700 py-2 px-3 text-xs">Opening</TableHead>
                              <TableHead className="text-right font-semibold text-slate-700 py-2 px-3 text-xs">Debits</TableHead>
                              <TableHead className="text-right font-semibold text-slate-700 py-2 px-3 text-xs">Credits</TableHead>
                              <TableHead className="text-right font-semibold text-green-700 py-2 px-3 text-xs">Current</TableHead>
                              <TableHead className="text-right font-semibold text-slate-800 py-2 px-3 text-xs">Total</TableHead>
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

