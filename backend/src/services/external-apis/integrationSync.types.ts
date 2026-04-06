/** Sync modes accepted by the Python integration sync service and backend route. */
export const SYNC_MODES = ['full_sync', 'transform_only', 'extract_only'] as const;
export type SyncMode = (typeof SYNC_MODES)[number];

const SYNC_MODE_SET = new Set<string>(SYNC_MODES);

/** ERP connections that support Airbyte + dbt sync. */
export const SYNCABLE_SYSTEM_TYPES = ['zoho_books', 'quickbooks'] as const;
export type SyncableSystemType = (typeof SYNCABLE_SYSTEM_TYPES)[number];

const SYNCABLE_SET = new Set<string>(SYNCABLE_SYSTEM_TYPES);

export function parseSyncMode(raw: unknown): SyncMode | null {
  const v = raw === undefined || raw === null ? 'full_sync' : String(raw).trim();
  return SYNC_MODE_SET.has(v) ? (v as SyncMode) : null;
}

export function isSyncableSystemType(systemType: string): systemType is SyncableSystemType {
  return SYNCABLE_SET.has(systemType);
}
