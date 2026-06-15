import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/formatters';
import { aggregateTrialBalanceSectionRows } from '@/lib/aggregateTrialBalanceSectionRows';

export type FinancialReportRow = Record<string, unknown>;

export type FinancialReportFilters = {
  from_date?: string;
  to_date?: string;
  account_id?: string;
  currency_id?: string;
  legal_entity_ids?: string[];
};

interface FinancialReportDisplayProps {
  reportId: string;
  data: FinancialReportRow[];
  filters?: FinancialReportFilters;
  description?: string;
  currencyCode?: string;
  sidebarMode?: boolean;
}

const REPORT_TITLES: Record<string, string> = {
  trial_balance: 'Trial Balance',
  monthly_trial_balance: 'Monthly Trial Balance',
  income_statement: 'Income Statement',
};

function formatReportValue(
  reportId: string,
  field: string,
  value: unknown,
  currencyCode: string
): string {
  if (value === null || value === undefined) return '—';
  if (field === 'period_month' && typeof value === 'string') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
  }
  if (
    field.includes('balance') ||
    field.includes('debit') ||
    field.includes('credit') ||
    field === 'total_amount' ||
    field === 'net_movement'
  ) {
    return formatCurrency(Number(value), currencyCode);
  }
  return String(value);
}

export const FinancialReportDisplay: React.FC<FinancialReportDisplayProps> = ({
  reportId,
  data,
  filters,
  description,
  currencyCode = 'INR',
  sidebarMode,
}) => {
  const navigate = useNavigate();

  const columns = useMemo(() => {
    if (reportId === 'monthly_trial_balance') {
      return [
        { key: 'account_name', label: 'Account', align: 'left' as const },
        { key: 'period_month', label: 'Month', align: 'left' as const },
        { key: 'period_debits', label: 'Debits', align: 'right' as const },
        { key: 'period_credits', label: 'Credits', align: 'right' as const },
        { key: 'cumulative_balance', label: 'Balance', align: 'right' as const },
      ];
    }
    if (reportId === 'income_statement') {
      return [
        { key: 'account_name', label: 'Account', align: 'left' as const },
        { key: 'classification', label: 'Type', align: 'left' as const },
        { key: 'total_amount', label: 'Amount', align: 'right' as const },
      ];
    }
    return [
      { key: 'account_name', label: 'Account', align: 'left' as const },
      { key: 'opening_balance', label: 'Opening', align: 'right' as const },
      { key: 'total_debits', label: 'Debits', align: 'right' as const },
      { key: 'total_credits', label: 'Credits', align: 'right' as const },
      { key: 'total_balance', label: 'Closing', align: 'right' as const },
    ];
  }, [reportId]);

  const totals =
    reportId === 'trial_balance' && data.length > 0
      ? aggregateTrialBalanceSectionRows(data)
      : null;

  const periodLabel =
    filters?.from_date && filters?.to_date
      ? `${filters.from_date} → ${filters.to_date}`
      : null;

  const reportPath =
    reportId === 'monthly_trial_balance'
      ? '/reports/monthly-trial-balance'
      : reportId === 'income_statement'
        ? '/reports/income-statement'
        : '/reports/balance-sheet';

  if (!data.length) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
        <p className="font-medium">No trial balance rows for this period.</p>
        {periodLabel && <p className="mt-1 text-amber-800">Period: {periodLabel}</p>}
        <p className="mt-2 text-xs text-amber-700">
          Try a different date range or check that postings exist for the selected legal entity.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">
            {REPORT_TITLES[reportId] ?? 'Financial Report'}
          </p>
          {description && <p className="text-xs text-slate-600 mt-0.5">{description}</p>}
          {periodLabel && <p className="text-xs text-slate-500 mt-0.5">{periodLabel}</p>}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs shrink-0"
          onClick={() => navigate(reportPath)}
        >
          <ExternalLink className="h-3.5 w-3.5 mr-1" />
          Open full report
        </Button>
      </div>

      <div
        className={`border border-slate-200 rounded-lg overflow-auto bg-white ${
          sidebarMode ? 'max-h-[50vh]' : 'max-h-[60vh]'
        }`}
      >
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={`text-xs font-semibold ${col.align === 'right' ? 'text-right' : ''}`}
                >
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, index) => {
              const level = Number(row.level ?? 0);
              return (
                <TableRow key={String(row.account_id ?? index)} className="hover:bg-slate-50">
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={`text-xs py-2 ${
                        col.align === 'right' ? 'text-right font-mono' : ''
                      }`}
                    >
                      {col.key === 'account_name' ? (
                        <span
                          style={{ paddingLeft: level * 12 }}
                          className={level === 0 ? 'font-semibold text-slate-800' : 'text-slate-700'}
                        >
                          {String(row.account_name ?? '—')}
                        </span>
                      ) : (
                        formatReportValue(reportId, col.key, row[col.key], currencyCode)
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
            {totals && (
              <TableRow className="bg-slate-100 font-semibold border-t-2 border-slate-300">
                <TableCell className="text-xs py-2">Total</TableCell>
                <TableCell className="text-right text-xs font-mono py-2">
                  {formatCurrency(totals.opening_balance, currencyCode)}
                </TableCell>
                <TableCell className="text-right text-xs font-mono py-2">
                  {formatCurrency(totals.total_debits, currencyCode)}
                </TableCell>
                <TableCell className="text-right text-xs font-mono py-2">
                  {formatCurrency(totals.total_credits, currencyCode)}
                </TableCell>
                <TableCell className="text-right text-xs font-mono py-2">
                  {formatCurrency(totals.total_balance, currencyCode)}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-slate-500">
        Showing {data.length} account{data.length === 1 ? '' : 's'}
        {filters?.account_id ? ' (filtered)' : ''}.
      </p>
    </div>
  );
};
