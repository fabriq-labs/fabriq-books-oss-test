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
  /** Top-level COA parent (e.g. Current Assets). */
  fabriq_parent_account_id?: string | null;
  fabriq_coa_parent_name?: string | null;
  fabriq_coa_parent_code?: string | null;
}

export interface PlaidItemSummary {
  id: string;
  item_id: string;
  institution_id: string | null;
  institution_name: string | null;
  legal_entity_id: string | null;
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

export interface PlaidImportAccountsResult {
  created: number;
  skipped: number;
  account_ids: string[];
}
