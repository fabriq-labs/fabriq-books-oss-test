"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { reportAPI } from "@/api/api";
import { formatCurrency } from "@/lib/formatters";
import { Loader2, FileDown, ChevronDown, FileSpreadsheet, TrendingUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { pdf } from "@react-pdf/renderer";
import * as XLSX from "xlsx";
import { useEntity } from "@/contexts/EntityContext";
import {
  FinancialYearSelector,
  getPreviousFYOption,
  type FinancialYearOption,
  type FinancialYearType,
} from "@/components/Reports/FinancialYearSelector";
import { PersonalIncomePDFDocument } from "@/components/pdf_generator/PersonalIncomePDFDocument";
import "@/styles/reports.css";

interface IncomeRow {
  account_id?: string;
  account_path: string;
  account_name: string;
  classification: string;
  level: number;
  total_amount: number;
}

function resolveEntityFYType(entities: { id: string; is_it_headquartres?: boolean; financial_year_type?: string }[], currentId: string | null): FinancialYearType {
  const current = entities.find((e) => e.id === currentId);
  if (current?.financial_year_type) return current.financial_year_type as FinancialYearType;
  const hq = entities.find((e) => e.is_it_headquartres);
  if (hq?.financial_year_type) return hq.financial_year_type as FinancialYearType;
  return "JAN_DEC";
}

export default function PersonalIncomeReport() {
  const { entities, currentEntity, currentEntityId, loading: entityLoading } = useEntity();

  const fyType = useMemo(
    () => resolveEntityFYType(entities, currentEntityId),
    [entities, currentEntityId]
  );

  const [selectedFY, setSelectedFY] = useState<FinancialYearOption>(() =>
    getPreviousFYOption("JAN_DEC")
  );

  // Re-compute default FY when fyType resolves
  useEffect(() => {
    setSelectedFY(getPreviousFYOption(fyType));
  }, [fyType]);

  const [rows, setRows] = useState<IncomeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportPdfLoading, setExportPdfLoading] = useState(false);
  const fetchSeq = useRef(0);

  const fetchReport = useCallback(async () => {
    if (!selectedFY) return;
    const seq = ++fetchSeq.current;
    setLoading(true);
    setError(null);
    try {
      const filters: Record<string, any> = {
        from_date: selectedFY.from_date,
        to_date: selectedFY.to_date,
      };
      if (currentEntityId) filters.legal_entity_id = currentEntityId;
      const entityCurrencyId = currentEntity?.currency?.id;
      if (entityCurrencyId) filters.currency_id = entityCurrencyId;

      const result = (await reportAPI.getReport("personal_income", filters)) as any;
      if (seq !== fetchSeq.current) return;
      const data: IncomeRow[] = Array.isArray(result?.data) ? result.data : [];
      setRows(data.filter((r) => r.classification === "Income"));
    } catch (err) {
      if (seq !== fetchSeq.current) return;
      const msg = err instanceof Error ? err.message : "Failed to load report";
      setError(msg);
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [selectedFY, currentEntityId]);

  useEffect(() => {
    if (!entityLoading) void fetchReport();
  }, [entityLoading, fetchReport]);

  const incomeTotal = useMemo(
    () => rows.filter((r) => r.level === 0).reduce((s, r) => s + Math.abs(Number(r.total_amount)), 0),
    [rows]
  );

  const currencyCode = currentEntity?.currency?.code?.trim().toUpperCase() || "INR";

  const handleExportPdf = async () => {
    if (rows.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }
    setExportPdfLoading(true);
    try {
      const blob = await pdf(
        <PersonalIncomePDFDocument
          rows={rows}
          fromDate={selectedFY.from_date}
          toDate={selectedFY.to_date}
          currencyCode={currencyCode}
          entityName={currentEntity?.legal_name ?? ""}
          fyLabel={selectedFY.label}
          incomeTotal={incomeTotal}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `personal-income-${selectedFY.from_date}-to-${selectedFY.to_date}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF exported" });
    } catch (err) {
      toast({ title: "Export failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setExportPdfLoading(false);
    }
  };

  const handleExportExcel = () => {
    if (rows.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }
    const data: string[][] = [["Account", "Level", "Amount"]];
    for (const row of rows) {
      const indent = "  ".repeat(row.level);
      data.push([`${indent}${row.account_name}`, String(row.level), formatCurrency(Math.abs(Number(row.total_amount)), currencyCode)]);
    }
    data.push(["Total Income", "", formatCurrency(incomeTotal, currencyCode)]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [{ wch: 42 }, { wch: 8 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Personal Income");
    XLSX.writeFile(wb, `personal-income-${selectedFY.from_date}-to-${selectedFY.to_date}.xlsx`);
    toast({ title: "Excel exported" });
  };

  const reportLoading = loading || entityLoading;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="reports-header">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <h1 className="text-lg font-bold text-slate-900">Personal Income Report</h1>
            <p className="text-xs text-slate-600">
              {currentEntity?.legal_name ?? "All entities"} · Income accounts
            </p>
          </div>

          <div className="flex items-center gap-2 flex-nowrap overflow-x-auto ml-auto">
            <FinancialYearSelector
              fyType={fyType}
              value={selectedFY.value}
              onChange={setSelectedFY}
            />

            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchReport()}
              disabled={reportLoading}
              className="h-9 border-slate-300 shrink-0"
            >
              {reportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={reportLoading || exportPdfLoading || rows.length === 0}
                  className="border-slate-300 shrink-0"
                >
                  {exportPdfLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <FileDown className="h-4 w-4 mr-1.5" />}
                  Export
                  <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportPdf} disabled={exportPdfLoading}>
                  <FileDown className="h-4 w-4 mr-2" /> Export as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportExcel}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" /> Export as Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <p className="text-xs text-slate-500 mt-2">
          {selectedFY.from_date} – {selectedFY.to_date}
        </p>
      </div>

      {/* Body */}
      <div className="p-3">
        {reportLoading && rows.length === 0 ? (
          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-8 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <p className="text-sm text-slate-600">Loading income data…</p>
            </CardContent>
          </Card>
        ) : error ? (
          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-8 flex flex-col items-center gap-3">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={() => void fetchReport()}>Retry</Button>
            </CardContent>
          </Card>
        ) : rows.length === 0 ? (
          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-8 flex flex-col items-center gap-3">
              <TrendingUp className="h-10 w-10 text-slate-300" />
              <p className="text-sm text-slate-500">No income recorded for {selectedFY.label}</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50 border-b border-slate-200 py-2 px-3">
              <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-1">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                Income
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-100 border-b border-slate-300">
                      <TableHead className="font-semibold text-slate-700 py-2 px-3 text-xs">Account</TableHead>
                      <TableHead className="text-right font-semibold text-slate-800 py-2 px-3 text-xs">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, i) => {
                      const canDrillDown = !!row.account_id;
                      const drillDownUrl = canDrillDown
                        ? `/accounting/transactions?account_id=${row.account_id}&from_date=${selectedFY.from_date}&to_date=${selectedFY.to_date}`
                        : null;
                      return (
                        <TableRow
                          key={row.account_id ?? i}
                          className={`border-b border-slate-100 transition-colors ${canDrillDown ? "hover:bg-blue-50 cursor-pointer" : "hover:bg-slate-50"}`}
                          onClick={canDrillDown ? () => window.open(drillDownUrl!, '_blank') : undefined}
                          title={canDrillDown ? "Click to view transactions" : undefined}
                        >
                          <TableCell className="py-2 px-3">
                            <div className="flex items-center" style={{ paddingLeft: row.level * 16 }}>
                              {row.level > 0 && <span className="w-1 h-1 rounded-full bg-slate-400 mr-1.5 shrink-0" />}
                              <span className={`text-xs ${row.level === 0 ? "font-semibold text-slate-800" : "text-slate-700"}`}>
                                {row.account_name}
                              </span>
                              {canDrillDown && (
                                <span className="ml-1.5 text-[10px] text-blue-400 opacity-0 group-hover:opacity-100">↗</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className={`text-right py-2 px-3 font-mono text-xs font-bold ${canDrillDown ? "text-blue-700" : "text-slate-900"}`}>
                            {formatCurrency(Math.abs(Number(row.total_amount)), currencyCode)}
                          </TableCell>
                        </TableRow>
                      );
                    })}

                    {/* Total row */}
                    <TableRow className="font-bold bg-gradient-to-r from-slate-100 to-blue-50 border-t-2 border-slate-300">
                      <TableCell className="py-2 px-3 text-slate-800 text-xs">Total Income</TableCell>
                      <TableCell className="text-right py-2 px-3 font-mono text-xs text-slate-900 font-bold">
                        {formatCurrency(incomeTotal, currencyCode)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
