import React, { useMemo } from 'react';
import {
  PostingTransactionList,
  type PostingTransactionListRow,
} from './PostingTransactionList';

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
  const listRows: PostingTransactionListRow[] = useMemo(
    () =>
      rows.map((row) => {
        const isReceived =
          row.is_received ??
          row.is_money_in ??
          (row.signed_amount != null ? row.signed_amount >= 0 : true);
        const amount = Math.abs(Number(row.signed_amount ?? row.amount ?? 0));

        return {
          id: row.id,
          value_date: row.value_date,
          partyName: row.description || 'Transaction',
          partySubtitle: row.category_name || undefined,
          amount,
          isReceived,
          currency: row.currency ?? currencyCode,
        };
      }),
    [rows, currencyCode]
  );

  const balanceByRowId = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach((row, index) => {
      if (row.running_balance != null && Number.isFinite(row.running_balance)) {
        map[String(row.id ?? index)] = Number(row.running_balance);
      }
    });
    return map;
  }, [rows]);

  const hasBalances = Object.keys(balanceByRowId).length > 0;

  return (
    <PostingTransactionList
      rows={listRows}
      currencyCode={currencyCode}
      sidebarMode={sidebarMode}
      title={focusAccountName ?? undefined}
      showBalanceColumn={hasBalances}
      balanceByRowId={balanceByRowId}
    />
  );
};
