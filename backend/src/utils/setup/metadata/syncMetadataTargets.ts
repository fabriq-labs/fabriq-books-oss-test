export const SYNC_METADATA_TARGETS = [
  'views',
  'promptTemplates',
  'agentTemplates',
  'currencies',
  'agentModelTools',
] as const;

export type SyncMetadataTarget = (typeof SYNC_METADATA_TARGETS)[number];

const ALLOWED = new Set<string>(SYNC_METADATA_TARGETS);

/**
 * Validate Super Admin / API `targets` body.
 * Requires a non-empty array of known types; preserves first-seen order.
 */
export function parseSyncTargets(raw: unknown): SyncMetadataTarget[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Select at least one metadata type to sync.');
  }

  const unique: SyncMetadataTarget[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !ALLOWED.has(item)) {
      throw new Error(`Unknown metadata type: ${String(item)}`);
    }
    const target = item as SyncMetadataTarget;
    if (!unique.includes(target)) {
      unique.push(target);
    }
  }
  return unique;
}

/** CLI `npm run sync-metadata` with no args: views + prompt templates (historic default). */
export function defaultCliSyncTargets(): SyncMetadataTarget[] {
  return ['views', 'promptTemplates'];
}

export function resolveSyncTargets(
  filterType?: 'view' | 'prompttemplate' | { targets?: unknown }
): SyncMetadataTarget[] {
  if (filterType && typeof filterType === 'object') {
    return parseSyncTargets(filterType.targets);
  }
  if (filterType === 'view') {
    return ['views'];
  }
  if (filterType === 'prompttemplate') {
    return ['promptTemplates'];
  }
  return defaultCliSyncTargets();
}
