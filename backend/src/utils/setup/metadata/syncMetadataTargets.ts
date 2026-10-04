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

/**
 * Split comma-separated view names, trim, and drop duplicates.
 * Empty input is an error so a selective sync cannot silently sync nothing.
 */
export function parseViewNames(parts: string[]): string[] {
  if (!Array.isArray(parts)) {
    throw new Error('viewNames must be a list of view names.');
  }

  const unique: string[] = [];
  for (const part of parts) {
    if (typeof part !== 'string') {
      throw new Error('viewNames must be a list of view names.');
    }
    for (const piece of part.split(',')) {
      const name = piece.trim();
      if (!name) continue;
      if (!unique.includes(name)) unique.push(name);
    }
  }

  if (unique.length === 0) {
    throw new Error(
      'Pass at least one view name. Usage: npm run sync-metadata -- --views account_view,invoice_view'
    );
  }
  return unique;
}

/**
 * CLI args for `npm run sync-metadata`.
 * No args keeps the historic default. `--views` selects view names and syncs only those views.
 */
export function parseSyncMetadataCliArgs(argv: string[]): { viewNames?: string[] } {
  const parts: string[] = [];
  let sawViews = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') continue;

    if (arg === '--views' || arg === '--view') {
      sawViews = true;
      const next = argv[i + 1];
      if (next == null || next.startsWith('--')) {
        throw new Error(
          'Missing view names. Usage: npm run sync-metadata -- --views account_view,invoice_view'
        );
      }
      parts.push(next);
      i++;
      continue;
    }

    if (arg.startsWith('--views=')) {
      sawViews = true;
      parts.push(arg.slice('--views='.length));
      continue;
    }

    throw new Error(
      `Unknown argument: ${arg}. Usage: npm run sync-metadata -- --views account_view,invoice_view`
    );
  }

  if (!sawViews) return {};
  return { viewNames: parseViewNames(parts) };
}

/** Keep views whose `name` is requested. Throws before any write if a name is missing. */
export function selectViewsByName<T extends { name?: string }>(views: T[], viewNames: string[]): T[] {
  const byName = new Map<string, T[]>();
  for (const view of views) {
    if (!view.name) continue;
    const list = byName.get(view.name) ?? [];
    list.push(view);
    byName.set(view.name, list);
  }

  const missing = viewNames.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    throw new Error(`Views not found in metadata JSON: ${missing.join(', ')}`);
  }

  return viewNames.flatMap((name) => byName.get(name)!);
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
