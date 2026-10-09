import type { Transaction } from 'plaid';

export type PlaidTransaction = Transaction;

/** Plaid sub-account returned by the API, with optional Fabriq COA mapping. */
export interface StoredPlaidAccount {
  plaid_account_id: string;
  name: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  balance?: number | null;
  fabriq_account_id: string | null;
  fabriq_account_name?: string | null;
  fabriq_account_code?: string | null;
  fabriq_classification?: string | null;
  /** When the Fabriq account row was created (new Plaid import). For linked existing CoA accounts, this is the account creation date. */
  fabriq_connected_at?: string | null;
  /** Last transaction sync for this mapped account (`account.last_sync_at`). */
  fabriq_last_sync_at?: string | null;
}

export interface PlaidItemSummary {
  id: string;
  item_id: string;
  institution_id: string | null;
  institution_name: string | null;
  legal_entity_id: string | null;
  last_synced_at: string | null;
  created_at: string;
  /** `healthy` when Plaid item.error is empty. Any Plaid item error is `error`. */
  status: 'healthy' | 'error';
  error_code: string | null;
  error_message: string | null;
  consent_expires_at: string | null;
  status_checked_at: string | null;
  accounts: StoredPlaidAccount[];
}

export interface PlaidSyncResult {
  added: number;
  modified: number;
  removed: number;
  skipped: number;
}

export interface PlaidImportAccountsResult {
  created: number;
  skipped: number;
  account_ids: string[];
  accounts: Array<{ plaid_account_id: string; fabriq_account_id: string }>;
}

export interface PlaidLinkAccountResult {
  plaid_account_id: string;
  fabriq_account_id: string;
}
