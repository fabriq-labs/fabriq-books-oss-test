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

export type PostingJournalRow = {
  id?: string;
  value_date?: string;
  description?: string;
  notes?: string;
  debit_account_name?: string;
  debit_account_code?: string | null;
  credit_account_name?: string;
  credit_account_code?: string | null;
  amount?: number;
  signed_amount?: number;
  is_received?: boolean;
  currency?: string;
  legal_entity_name?: string | null;
};

interface PostingJournalDisplayProps {
  rows: PostingJournalRow[];
  title?: string;
  highlightSide?: 'debit' | 'credit';
  highlightAccountName?: string;
  currencyCode?: string;
  sidebarMode?: boolean;
}

export const PostingJournalDisplay: React.FC<PostingJournalDisplayProps> = ({
  rows,
  title,
  highlightSide,
  highlightAccountName,
  currencyCode = 'INR',
  sidebarMode,
}) => {
  if (!rows.length) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground bg-slate-50 rounded-lg border">
        No postings found.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {title && <p className="text-sm font-medium text-slate-700">{title}</p>}
      <div
        className={cn(
          'border border-slate-200 rounded-lg overflow-auto bg-white',
          sidebarMode ? 'max-h-[50vh]' : 'max-h-[60vh]'
        )}
      >
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-xs font-semibold">Transaction</TableHead>
              <TableHead className="text-xs font-semibold">Debit Account</TableHead>
              <TableHead className="text-xs font-semibold">Credit Account</TableHead>
              <TableHead className="text-xs font-semibold text-right w-[140px]">Amount</TableHead>
              <TableHead className="text-xs font-semibold w-[110px]">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => {
              const currency = row.currency ?? currencyCode;
              const highlightDebit =
                highlightSide === 'debit' &&
                highlightAccountName &&
                row.debit_account_name === highlightAccountName;
              const highlightCredit =
                highlightSide === 'credit' &&
                highlightAccountName &&
                row.credit_account_name === highlightAccountName;

              return (
                <TableRow key={String(row.id ?? index)} className="hover:bg-slate-50">
                  <TableCell className="text-xs py-2">
                    <div className="font-medium text-slate-800 leading-tight">
                      {row.description || row.notes || '—'}
                    </div>
                    {row.description && row.notes && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">{row.notes}</div>
                    )}
                    {row.legal_entity_name && (
                      <div className="mt-1">
                        <Badge
                          variant="outline"
                          className="text-[10px] py-0 h-5 font-normal text-muted-foreground"
                        >
                          {row.legal_entity_name}
                        </Badge>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs py-2">
                    <span
                      className={cn({ 'bg-primary/10 rounded px-1': highlightDebit })}
                    >
                      {row.debit_account_name || '—'}
                    </span>
                    {row.debit_account_code && (
                      <div className="mt-0.5">
                        <Badge variant="outline" className="text-[10px] py-0 h-4 font-normal">
                          {row.debit_account_code}
                        </Badge>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs py-2">
                    <span
                      className={cn({ 'bg-primary/10 rounded px-1': highlightCredit })}
                    >
                      {row.credit_account_name || '—'}
                    </span>
                    {row.credit_account_code && (
                      <div className="mt-0.5">
                        <Badge variant="outline" className="text-[10px] py-0 h-4 font-normal">
                          {row.credit_account_code}
                        </Badge>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs py-2">
                    {row.signed_amount != null || row.is_received != null ? (
                      <span
                        className={cn('font-mono font-medium', {
                          'text-green-700': row.is_received ?? (row.signed_amount ?? 0) >= 0,
                          'text-red-600': !(row.is_received ?? (row.signed_amount ?? 0) >= 0),
                        })}
                      >
                        <span className="text-[10px] font-normal opacity-70 mr-0.5">
                          {currency}
                        </span>
                        {(row.is_received ?? (row.signed_amount ?? 0) >= 0) ? '+' : '−'}
                        {Math.abs(row.signed_amount ?? row.amount ?? 0).toLocaleString('en-IN', {
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    ) : (
                      <>
                        <span className="text-[10px] text-muted-foreground mr-1">{currency}</span>
                        <span className="font-mono">
                          {(row.amount ?? 0).toLocaleString('en-IN', {
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap py-2">
                    {row.value_date ? moment(row.value_date).format('DD MMM YYYY') : '—'}
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
