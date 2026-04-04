"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { reportAPI } from "@/api/api";
import { formatCurrency } from "@/lib/formatters";
import { RefreshCw, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import dayjs from "dayjs";
import { ReportControls } from "@/components/Reports/ReportControls";
import { useReportController } from "@/contexts/ReportControllerContext";

interface IncomeStatementRow {
  account_id: string;
  account_path: string;
  account_name: string;
  classification: "Income" | "Expense";
  level: number;
  total_amount: number;
}

const useIncomeStatement = ({
  dateRange,
  view,
}: {
  dateRange?: [dayjs.Dayjs, dayjs.Dayjs];
  view: string;
}) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<IncomeStatementRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchIncomeStatement = async (account?: any) => {
    setLoading(true);
    try {
      let filters: any = {
        from_date: dateRange?.[0]?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'),
        to_date: dateRange?.[1]?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'),
      };

      if (account) {
        filters.account_id = account?.id;
      }
      const result = await reportAPI.getReport("income_statement", filters) as any;
      const filteredData = Array.isArray(result.data)
        ? result.data.filter((row: any) => {
          if (view === "Summary") {
            return row.level === 0 && row.total_amount !== 0;
          }
          return row.total_amount !== 0;
        })
        : [];
      setData(filteredData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      toast({
        title: "Error",
        description: "Failed to load income statement data",
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
    fetchIncomeStatement,
  };
};

export default function IncomeStatement() {
  const [fetchOnButtonClick, setFetchOnButtonClick] = useState(false);
  const [account, setAccount]: any = useState(null);
  const [view, setView] = useState("Summary");

  const { dateRange } = useReportController();

  const { data, loading, error, fetchIncomeStatement } = useIncomeStatement({
    dateRange,
    view,
  });

  const groupedData = (data: IncomeStatementRow[]) => {
    const groups = data.reduce(
      (acc, item) => {
        if (!acc[item.classification]) {
          acc[item.classification] = [];
        }
        acc[item.classification].push(item);
        return acc;
      },
      {} as Record<string, IncomeStatementRow[]>
    );

    // Define the preferred order of classifications
    const orderOfClassifications = ["Income", "Expense"];

    return orderOfClassifications.map((classification) => ({
      classification,
      items: groups[classification] || [],
    }));
  };

  useEffect(() => {
    fetchIncomeStatement();
  }, [view]);

  useEffect(() => {
    if (fetchOnButtonClick) {
      fetchIncomeStatement(account);
      setFetchOnButtonClick(false);
    }
  }, [fetchOnButtonClick, dateRange, view, account]);

  useEffect(() => {
    fetchIncomeStatement(account);
  }, [dateRange]);

  const handleAccountChange = (value: any) => {
    setAccount(value);
  };

  const handleAccountClear = () => {
    setAccount(null);
  };

  const handleRefresh = () => {
    setFetchOnButtonClick(true);
  };

  const renderTableContent = (group: { classification: string; items: IncomeStatementRow[] }) => {
    if (loading) {
      return (
        <TableRow>
          <TableCell colSpan={2} className="text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
          </TableCell>
        </TableRow>
      );
    }

    if (error) {
      return (
        <TableRow>
          <TableCell colSpan={2} className="text-center">
            <div className="flex flex-col items-center justify-center py-4">
              <p className="text-sm text-destructive mb-2">Error loading data</p>
              <Button variant="outline" size="sm" onClick={() => {
                fetchIncomeStatement(account);
              }}>
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
          <TableCell colSpan={2} className="text-center text-gray-400">
            No data found for {group.classification}
          </TableCell>
        </TableRow>
      );
    }

    return (
      <>
        {group.items.map((row, index) => (
          <TableRow key={row.account_id || `row-${index}`}>
            <TableCell>
              <span style={{ marginLeft: row.level * 20 }}>
                {row.account_name}
              </span>
            </TableCell>
            <TableCell className="text-right">
              {Number(row.total_amount).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </TableCell>
          </TableRow>
        ))}
        {summary(group.items)}
      </>
    );
  };

  const summary = (pageData: readonly IncomeStatementRow[]) => {
    const totals = pageData.reduce(
      (acc, curr) => ({
        total_amount: acc.total_amount + Number(curr?.total_amount || 0),
      }),
      { total_amount: 0 }
    );

    return (
      <TableRow className="font-semibold bg-muted/50">
        <TableCell className="text-right">Total</TableCell>
        <TableCell className="text-right">{formatCurrency(totals.total_amount)}</TableCell>
      </TableRow>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Income Statement</h2>
        </div>
        <ReportControls
          selectedAccount={account}
          onAccountChange={handleAccountChange}
          onAccountClear={handleAccountClear}
          onRefresh={handleRefresh}
          loading={loading}
          showAccountFilter={true}
          showRefreshButton={true}
        />
      </div>

      {/* View Toggle */}
      <Tabs value={view} onValueChange={setView} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="Summary">Summary</TabsTrigger>
          <TabsTrigger value="Details">Details</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Data Tables */}
      <div className="space-y-6">
        {loading && data.length === 0 ? (
          <Card>
            <CardContent className="p-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
            </CardContent>
          </Card>
        ) : error && data.length === 0 ? (
          <Card>
            <CardContent className="p-8">
              <div className="flex flex-col items-center justify-center">
                <p className="text-destructive mb-4">Error: {error}</p>
                <Button variant="outline" size="sm" onClick={() => {
                  fetchIncomeStatement(account);
                }}>
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : groupedData(data).length === 0 ? (
          <Card>
            <CardContent className="p-8">
              <p className="text-sm text-muted-foreground text-center">No data available for the selected period</p>
            </CardContent>
          </Card>
        ) : (
          groupedData(data).map((group, index) => (
            <Card key={`${group.classification}-${index}`}>
              <CardHeader className="bg-muted/30">
                <CardTitle className="text-lg">{group.classification}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {renderTableContent(group)}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}



