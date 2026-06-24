import { fetchAPI } from './apiClient';

export interface PlaidAccount {
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
  /** Fabriq `account.created_at` for this mapped account. */
  fabriq_connected_at?: string | null;
  /** Fabriq `account.last_sync_at` — per-account sync time. */
  fabriq_last_sync_at?: string | null;
}

export interface PlaidItem {
  id: string;
  item_id: string;
  institution_id: string | null;
  institution_name: string | null;
  legal_entity_id: string | null;
  last_synced_at: string | null;
  created_at: string;
  accounts: PlaidAccount[];
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

export interface PlaidInstitution {
  institution_id: string;
  name: string;
  logo: string | null;
}

export interface PlaidConfig {
  env: string;
  skip_link_ui: boolean;
}

export const plaidAPI = {
  getConfig: () => fetchAPI<PlaidConfig>('/api/plaid/config'),

  searchInstitutions: (query = '') =>
    fetchAPI<{ data: PlaidInstitution[] }>(
      `/api/plaid/institutions/search?q=${encodeURIComponent(query)}`,
    ),

  sandboxConnect: (institutionId: string, institutionName?: string, legalEntityId?: string) =>
    fetchAPI<{ data: PlaidItem }>('/api/plaid/sandbox/connect', {
      method: 'POST',
      body: JSON.stringify({
        institution_id: institutionId,
        institution_name: institutionName,
        ...(legalEntityId ? { legal_entity_id: legalEntityId } : {}),
      }),
    }),

  createLinkToken: (institutionId?: string) =>
    fetchAPI<{ link_token: string }>('/api/plaid/link-token', {
      method: 'POST',
      body: JSON.stringify(institutionId ? { institution_id: institutionId } : {}),
    }),

  exchangeToken: (publicToken: string, metadata?: Record<string, unknown>, legalEntityId?: string) =>
    fetchAPI<{ data: PlaidItem }>('/api/plaid/exchange-token', {
      method: 'POST',
      body: JSON.stringify({
        public_token: publicToken,
        metadata,
        ...(legalEntityId ? { legal_entity_id: legalEntityId } : {}),
      }),
    }),

  listItems: () => fetchAPI<{ data: PlaidItem[] }>('/api/plaid/items'),

  getItem: (id: string) => fetchAPI<{ data: PlaidItem }>(`/api/plaid/items/${id}`),

  deleteItem: (id: string) =>
    fetchAPI<{ success: boolean }>(`/api/plaid/items/${id}`, { method: 'DELETE' }),

  syncItem: (itemId: string) =>
    fetchAPI<{ data: PlaidSyncResult }>(`/api/plaid/sync/${itemId}`, { method: 'POST' }),

  syncAccount: (itemId: string, plaidAccountId: string) =>
    fetchAPI<{ data: PlaidSyncResult }>(
      `/api/plaid/items/${itemId}/accounts/${plaidAccountId}/sync`,
      { method: 'POST' },
    ),

  importAccounts: (itemId: string, plaidAccountIds: string[]) =>
    fetchAPI<{ data: PlaidImportAccountsResult }>(`/api/plaid/items/${itemId}/import-accounts`, {
      method: 'POST',
      body: JSON.stringify({ plaid_account_ids: plaidAccountIds }),
    }),

  linkAccount: (itemId: string, plaidAccountId: string, fabriqAccountId: string) =>
    fetchAPI<{ data: PlaidLinkAccountResult }>(
      `/api/plaid/items/${itemId}/accounts/${plaidAccountId}/link`,
      {
        method: 'PUT',
        body: JSON.stringify({ fabriq_account_id: fabriqAccountId }),
      },
    ),
};
