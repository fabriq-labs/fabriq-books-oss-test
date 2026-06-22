import type { Transaction } from 'plaid';

export type PlaidTransaction = Transaction;

/** Sub-account metadata stored in plaid_item.accounts JSON. */
export interface StoredPlaidAccount {
  plaid_account_id: string;
  name: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  fabriq_account_id: string | null;
}

export interface PlaidItemSummary {
  id: string;
  item_id: string;
  institution_id: string | null;
  institution_name: string | null;
  last_synced_at: string | null;
  created_at: string;
  accounts: StoredPlaidAccount[];
}

export interface PlaidSyncResult {
  added: number;
  modified: number;
  removed: number;
  skipped: number;
}

export function parseStoredAccounts(raw: unknown): StoredPlaidAccount[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is StoredPlaidAccount =>
      typeof a === 'object' &&
      a !== null &&
      typeof (a as StoredPlaidAccount).plaid_account_id === 'string',
  );
}
