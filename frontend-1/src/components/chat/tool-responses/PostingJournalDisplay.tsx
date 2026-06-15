import React, { useMemo } from 'react';
import {
  PostingTransactionList,
  type PostingTransactionListRow,
} from './PostingTransactionList';

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

function buildPartySubtitle(row: PostingJournalRow): string | undefined {
  const debit = row.debit_account_name;
  const credit = row.credit_account_name;
  if (debit && credit) {
    return `${debit} → ${credit}`;
  }
  if (row.notes && row.notes !== row.description) {
    return row.notes;
  }
  if (row.legal_entity_name) {
    return row.legal_entity_name;
  }
  return undefined;
}

export const PostingJournalDisplay: React.FC<PostingJournalDisplayProps> = ({
  rows,
  title,
  highlightSide,
  highlightAccountName,
  currencyCode = 'INR',
  sidebarMode,
}) => {
  const listRows: PostingTransactionListRow[] = useMemo(
    () =>
      rows.map((row) => {
        const hasSigned = row.signed_amount != null || row.is_received != null;
        let isReceived: boolean | undefined;
        if (hasSigned) {
          isReceived =
            row.is_received ?? (row.signed_amount != null ? row.signed_amount >= 0 : undefined);
        } else if (highlightSide && highlightAccountName) {
          const highlightDebit =
            highlightSide === 'debit' && row.debit_account_name === highlightAccountName;
          const highlightCredit =
            highlightSide === 'credit' && row.credit_account_name === highlightAccountName;
          if (highlightDebit) isReceived = true;
          if (highlightCredit) isReceived = false;
        }

        return {
          id: row.id,
          value_date: row.value_date,
          partyName: row.description || row.notes || 'Transaction',
          partySubtitle: buildPartySubtitle(row),
          amount: Math.abs(Number(row.signed_amount ?? row.amount ?? 0)),
          isReceived,
          currency: row.currency ?? currencyCode,
        };
      }),
    [rows, currencyCode, highlightSide, highlightAccountName]
  );

  return (
    <PostingTransactionList
      rows={listRows}
      currencyCode={currencyCode}
      sidebarMode={sidebarMode}
      title={title}
    />
  );
};
