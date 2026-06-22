import type { Transaction } from 'plaid';

const PLAID_TX_NOTE_PREFIX = 'plaid_tx:';

/** Stable note value used for deduplication when syncing Plaid transactions. */
export function plaidTransactionNote(transactionId: string): string {
  return `${PLAID_TX_NOTE_PREFIX}${transactionId}`;
}

export function isPlaidTransactionNote(notes: string | null | undefined): boolean {
  return typeof notes === 'string' && notes.startsWith(PLAID_TX_NOTE_PREFIX);
}

/**
 * Map a Plaid transaction to a Fabriq posting row.
 *
 * Uses the same double-entry convention as PostingImportService:
 *   Plaid positive amount = money leaving the bank (withdrawal)
 *   Plaid negative amount = money entering the bank (deposit)
 */
export function mapPlaidTransactionToPosting(
  tx: Transaction,
  bankAccountId: string,
  orgId: string,
): Record<string, unknown> {
  const isDebit = tx.amount > 0;
  const amount = Math.abs(tx.amount);
  const txDate = tx.authorized_date ?? tx.date;

  return {
    org_id: orgId,
    value_date: new Date(txDate),
    posting_date: new Date(txDate),
    description: tx.merchant_name ?? tx.name,
    amount,
    account_id: isDebit ? null : bankAccountId,
    credit_account_id: isDebit ? bankAccountId : null,
    notes: plaidTransactionNote(tx.transaction_id),
    status: tx.pending ? 'PENDING' : 'ACTIVE',
    posting_type: 'bank_feed',
    reconciliation_status: 'UNMATCHED',
  };
}
