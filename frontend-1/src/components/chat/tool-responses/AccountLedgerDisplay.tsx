import React from 'react';
import moment from 'moment';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatters';

export type AccountLedgerRow = {
  id?: string;
  value_date?: string;
  description?: string;
  category_name?: string;
  amount?: number;
  signed_amount?: number;
  /** Money received into the focus account (+). */
  is_received?: boolean;
  is_money_in?: boolean;
  currency?: string;
  running_balance?: number;
};

interface AccountLedgerDisplayProps {
  rows: AccountLedgerRow[];
  focusAccountName?: string | null;
  currencyCode?: string;
  sidebarMode?: boolean;
}

export const AccountLedgerDisplay: React.FC<AccountLedgerDisplayProps> = ({
  rows,
  focusAccountName,
  currencyCode = 'INR',
  sidebarMode,
}) => {
  if (!rows.length) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground bg-slate-50 rounded-lg border">
        No transactions found for this account.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {focusAccountName && (
        <p className="text-sm font-medium text-slate-700">{focusAccountName}</p>
      )}
      <div
        className={cn(
          'border border-slate-200 rounded-lg overflow-auto bg-white',
          sidebarMode ? 'max-h-[50vh]' : 'max-h-[60vh]'
        )}
      >
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-xs font-semibold w-[110px]">Date</TableHead>
              <TableHead className="text-xs font-semibold">Description</TableHead>
              <TableHead className="text-xs font-semibold w-[160px]">Category</TableHead>
              <TableHead className="text-xs font-semibold text-right w-[160px]">Amount</TableHead>
              <TableHead className="text-xs font-semibold text-right w-[160px]">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => {
              const isReceived =
                row.is_received ??
                row.is_money_in ??
                (row.signed_amount != null ? row.signed_amount >= 0 : true);
              const amount = Math.abs(Number(row.signed_amount ?? row.amount ?? 0));
              const currency = row.currency ?? currencyCode;

              return (
                <TableRow
                  key={String(row.id ?? index)}
                  className={cn(
                    'hover:bg-slate-50',
                    isReceived ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-red-400'
                  )}
                >
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap py-2">
                    {row.value_date ? moment(row.value_date).format('DD MMM YYYY') : '—'}
                  </TableCell>
                  <TableCell className="text-xs py-2">
                    <div className="font-medium text-slate-800 leading-tight">
                      {row.description || '—'}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs py-2">
                    {row.category_name ? (
                      <Badge
                        variant="secondary"
                        className="text-xs font-normal max-w-[180px] truncate"
                      >
                        {row.category_name}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-right py-2">
                    <span
                      className={cn('font-mono text-xs font-medium', {
                        'text-green-700': isReceived,
                        'text-red-600': !isReceived,
                      })}
                    >
                      <span className="mr-0.5 font-normal opacity-70">{currency}</span>
                      {isReceived ? '+' : '−'}
                      {amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </span>
                  </TableCell>
                  <TableCell className="text-right py-2">
                    {row.running_balance != null && Number.isFinite(row.running_balance) ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatCurrency(Number(row.running_balance), currency)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
