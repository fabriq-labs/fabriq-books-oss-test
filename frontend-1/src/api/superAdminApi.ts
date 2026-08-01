import Cookies from "js-cookie";
import { API_URL } from "./apiClient";

// ── Shared helper (raw fetch, no global toast — callers handle errors) ─────────

async function adminFetch<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
  const token = Cookies.get('__session');
  const response = await fetch(`${API_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...init,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = (data as any)?.error || (data as any)?.message || 'Admin API request failed';
    throw new Error(msg);
  }
  return data as T;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OnboardTenantPayload {
  tenant: { name: string; slug: string; settings?: string | Record<string, unknown> };
  adminUsers: { email: string; name?: string; password: string }[];
}

export interface OnboardTenantResponse {
  success: boolean;
  orgId: string;
  userIds: string[];
}

export type DemoDataOption = 'indian-demo' | 'us-ca-demo' | 'perfin-demo' | 'both' | 'nri';

/** Mirrors `setup-db.js` flags. `runTests` defaults false server-side. */
export interface DemoDatabaseResetPayload {
  demoData: DemoDataOption;
  demoDataOnly?: boolean;
  runTests?: boolean;
}

export interface DemoDatabaseResetResponse {
  success: boolean;
  message: string;
}

export interface SyncMetadataCounts {
  created: number;
  updated: number;
  errors: number;
}

export interface DevOptionsSyncMetadataResponse {
  success: boolean;
  message: string;
  stats: {
    views: SyncMetadataCounts;
    promptTemplates: SyncMetadataCounts;
  };
}

export type CoaTemplate = 'indian' | 'us-ca' | 'perfin' | 'nri-india' | 'nri-canada';

export interface SetupChartOfAccountsPayload {
  entityId: string;
  coaTemplate: CoaTemplate;
}

export interface SetupChartOfAccountsResponse {
  success: boolean;
  entityId: string;
  orgId: string;
  template: CoaTemplate;
  currency: string;
  counts: { created: number; existing: number; total: number };
}

export type SeedModelName = 'payment_terms';
export type SeedProfile = 'indian-demo';

export interface SeedModelDataPayload {
  entityId: string;
  model: SeedModelName;
  profile: SeedProfile;
}

export interface SeedModelDataResponse {
  success: boolean;
  entityId: string;
  orgId: string;
  model: SeedModelName;
  profile: SeedProfile;
  counts: { created: number; updated: number; total: number };
}

// ── Admin API ─────────────────────────────────────────────────────────────────

export const adminAPI = {
  devOptionsSyncMetadata: () =>
    adminFetch<DevOptionsSyncMetadataResponse>('/api/admin/dev-options/sync-metadata', {
      method: 'POST',
    }),

  demoDatabaseReset: (payload: DemoDatabaseResetPayload) =>
    adminFetch<DemoDatabaseResetResponse>('/api/admin/demo-database-reset', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  onboardTenant: (payload: OnboardTenantPayload) =>
    adminFetch<OnboardTenantResponse>('/api/admin/onboard-tenant', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  setupChartOfAccounts: (payload: SetupChartOfAccountsPayload) =>
    adminFetch<SetupChartOfAccountsResponse>('/api/admin/setup-chart-of-accounts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  seedModelData: (payload: SeedModelDataPayload) =>
    adminFetch<SeedModelDataResponse>('/api/admin/seed-model-data', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
