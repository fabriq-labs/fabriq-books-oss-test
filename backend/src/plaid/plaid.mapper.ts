import type { Transaction } from 'plaid';

const PLAID_TX_NOTE_PREFIX = 'plaid_tx:';

/** Stable note value used for deduplication when syncing Plaid transactions. */
export function plaidTransactionNote(transactionId: string): string {
  return `${PLAID_TX_NOTE_PREFIX}${transactionId}`;
}

export function isPlaidTransactionNote(notes: string | null | undefined): boolean {
  return typeof notes === 'string' && notes.startsWith(PLAID_TX_NOTE_PREFIX);
}

export function mapPlaidTransactionToPosting(
  tx: Transaction,
  bankAccountId: string,
  orgId: string,
  legalEntityId?: string | null,
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
    ...(legalEntityId ? { legal_entity_id: legalEntityId } : {}),
  };
}

export function mapPlaidAccountToCoa(
  type: string | null | undefined,
  subtype: string | null | undefined,
): { classification: 'Assets' | 'Liabilities'; types: string[] } {
  const normalizedType = type?.toLowerCase() ?? '';
  const normalizedSubtype = subtype?.toLowerCase() ?? '';

  if (normalizedType === 'credit') {
    return { classification: 'Liabilities', types: ['CREDIT_CARD', 'BANK'] };
  }
  if (normalizedSubtype === 'savings') {
    return { classification: 'Assets', types: ['BANK', 'SAVINGS'] };
  }
  if (normalizedSubtype === 'checking') {
    return { classification: 'Assets', types: ['BANK', 'CHECKING'] };
  }
  return { classification: 'Assets', types: ['BANK'] };
}

export function formatPlaidAccountName(name: string | null, mask: string | null): string {
  const label = name?.trim() || 'Bank account';
  return mask ? `${label} · ${mask}` : label;
}
