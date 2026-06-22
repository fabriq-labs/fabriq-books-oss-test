import { fetchAPI } from './apiClient';

export interface PlaidAccount {
  plaid_account_id: string;
  name: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  fabriq_account_id: string | null;
}

export interface PlaidItem {
  id: string;
  item_id: string;
  institution_id: string | null;
  institution_name: string | null;
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

export const plaidAPI = {
  createLinkToken: () =>
    fetchAPI<{ link_token: string }>('/api/plaid/link-token', { method: 'POST' }),

  exchangeToken: (publicToken: string, metadata?: Record<string, unknown>) =>
    fetchAPI<{ data: PlaidItem }>('/api/plaid/exchange-token', {
      method: 'POST',
      body: JSON.stringify({ public_token: publicToken, metadata }),
    }),

  listItems: () => fetchAPI<{ data: PlaidItem[] }>('/api/plaid/items'),

  deleteItem: (id: string) =>
    fetchAPI<{ success: boolean }>(`/api/plaid/items/${id}`, { method: 'DELETE' }),

  syncItem: (itemId: string) =>
    fetchAPI<{ data: PlaidSyncResult }>(`/api/plaid/sync/${itemId}`, { method: 'POST' }),

  updateAccountMapping: (itemId: string, plaidAccountId: string, fabriqAccountId: string | null) =>
    fetchAPI<{ success: boolean }>(`/api/plaid/items/${itemId}/accounts/${plaidAccountId}`, {
      method: 'PUT',
      body: JSON.stringify({ fabriq_account_id: fabriqAccountId }),
    }),
};
