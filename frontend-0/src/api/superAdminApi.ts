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

export interface SqlSeedCounts {
  rowsAffected: number;
  errors: number;
}

export type SyncMetadataTarget =
  | 'views'
  | 'promptTemplates'
  | 'agentTemplates'
  | 'currencies'
  | 'agentModelTools';

export interface DevOptionsSyncMetadataResponse {
  success: boolean;
  message: string;
  stats: {
    views: SyncMetadataCounts;
    promptTemplates: SyncMetadataCounts;
    agentTemplates: SqlSeedCounts;
    currencies: SqlSeedCounts;
    agentModelTools: SqlSeedCounts;
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

export interface IndianDemoReconStatus {
  orgExists: boolean;
  orgId: string;
  orgName: string | null;
  checkingAccountExists: boolean;
  reconPostingCount: number;
  matchedCount: number;
  unmatchedCount: number;
  aiCategorizedCount: number;
  confirmCreatedReceiptCount: number;
}

export interface IndianDemoReconStatusResponse {
  success: boolean;
  status: IndianDemoReconStatus;
}

export interface ResetIndianDemoReconciliationResult {
  orgId: string;
  deletedPostings: number;
  deletedConfirmReceipts: number;
  reloadedPostings: number;
}

export interface ResetIndianDemoReconciliationResponse {
  success: boolean;
  message: string;
  result: ResetIndianDemoReconciliationResult;
}

export interface NriTaxPackageDemoStatus {
  orgExists: boolean;
  orgId: string;
  orgName: string | null;
  unmatchedCount: number;
  taxPackageSessionCount: number;
  pendingActionCount: number;
}

export interface NriTaxPackageDemoStatusResponse {
  success: boolean;
  status: NriTaxPackageDemoStatus;
}

export interface ResetNriTaxPackageDemoResult {
  orgId: string;
  deletedSessions: number;
  deletedPendingActions: number;
  unmatchedAfter: number;
}

export interface ResetNriTaxPackageDemoResponse {
  success: boolean;
  message: string;
  result: ResetNriTaxPackageDemoResult;
}

export interface LegalEntitySummary {
  id: string;
  organizationName: string;
  orgId: string;
  isHeadquarters: boolean;
  country: string | null;
  invoiceCount: number;
  postingCount: number;
  accountCount: number;
}

export interface ListLegalEntitiesResponse {
  success: boolean;
  entities: LegalEntitySummary[];
}

export interface RemoveLegalEntityResult {
  entityId: string;
  entityName: string;
  orgId: string;
  dryRun: boolean;
  counts: Record<string, number>;
  total: number;
}

export interface RemoveLegalEntityResponse {
  success: boolean;
  message?: string;
  result: RemoveLegalEntityResult;
}

// ── Admin API ─────────────────────────────────────────────────────────────────

export const adminAPI = {
  devOptionsSyncMetadata: (targets: SyncMetadataTarget[]) =>
    adminFetch<DevOptionsSyncMetadataResponse>('/api/admin/dev-options/sync-metadata', {
      method: 'POST',
      body: JSON.stringify({ targets }),
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

  getIndianDemoReconStatus: () =>
    adminFetch<IndianDemoReconStatusResponse>('/api/admin/demo-data/indian-demo/status'),

  resetIndianDemoReconciliation: () =>
    adminFetch<ResetIndianDemoReconciliationResponse>(
      '/api/admin/demo-data/indian-demo/reset-reconciliation',
      { method: 'POST' }
    ),

  getNriTaxPackageDemoStatus: () =>
    adminFetch<NriTaxPackageDemoStatusResponse>('/api/admin/demo-data/nri-tax-package/status'),

  resetNriTaxPackageDemo: () =>
    adminFetch<ResetNriTaxPackageDemoResponse>(
      '/api/admin/demo-data/nri-tax-package/reset',
      { method: 'POST' }
    ),

  listLegalEntities: (orgId?: string) => {
    const q = orgId ? `?orgId=${encodeURIComponent(orgId)}` : '';
    return adminFetch<ListLegalEntitiesResponse>(`/api/admin/demo-data/legal-entities${q}`);
  },

  previewDropLegalEntity: (entityId: string) =>
    adminFetch<RemoveLegalEntityResponse>(
      `/api/admin/demo-data/legal-entities/${encodeURIComponent(entityId)}/preview`,
      { method: 'POST' }
    ),

  dropLegalEntity: (entityId: string) =>
    adminFetch<RemoveLegalEntityResponse>(
      `/api/admin/demo-data/legal-entities/${encodeURIComponent(entityId)}/drop`,
      {
        method: 'POST',
        body: JSON.stringify({ confirm: entityId }),
      }
    ),
};
