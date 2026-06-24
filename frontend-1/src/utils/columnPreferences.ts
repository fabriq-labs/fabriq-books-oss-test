export const COLUMN_PREFS_VERSION = 2 as const;
export const COLUMN_PREFS_STORAGE_PREFIX = "fabriq:column-prefs:";

export interface ColumnSortPreference {
  field: string;
  direction: "asc" | "desc";
}

export interface ColumnPreferences {
  v: typeof COLUMN_PREFS_VERSION;
  fingerprint: string;
  visibility: Record<string, boolean>;
  columnOrder: string[];
  sort: ColumnSortPreference | null;
}

/** Column keys eligible for the list (same pool as generateColumns / ExportModal). */
export function getEligibleColumnKeys(metaData: Record<string, any>): string[] {
  return Object.entries(metaData)
    .filter(([, meta]) => meta?.displayName)
    .map(([key]) => key)
    .sort();
}

/** Schema fingerprint — any change to eligible columns invalidates stored prefs. */
export function computeColumnFingerprint(metaData: Record<string, any>): string {
  return getEligibleColumnKeys(metaData).join("|");
}

export function getColumnPrefsStorageKey(
  userId: string,
  model: string,
  view: string,
): string {
  return `${COLUMN_PREFS_STORAGE_PREFIX}${userId}:${model}:${view}`;
}

/** View default column order (matches generateColumns sort). */
export function getDefaultColumnOrder(metaData: Record<string, any>): string[] {
  return Object.entries(metaData)
    .filter(([, meta]) => meta?.displayName)
    .sort(([, a], [, b]) => (a.orderNo ?? Infinity) - (b.orderNo ?? Infinity))
    .map(([key]) => key);
}

/** View defaults for column visibility (matches ExportModal). */
export function getDefaultVisibility(
  metaData: Record<string, any>,
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const key of getEligibleColumnKeys(metaData)) {
    result[key] = metaData[key].isColumnShow !== false;
  }
  return result;
}

export function resolveVisibility(
  metaData: Record<string, any>,
  saved?: Record<string, boolean> | null,
): Record<string, boolean> {
  const defaults = getDefaultVisibility(metaData);
  if (!saved) return defaults;
  const result = { ...defaults };
  for (const key of getEligibleColumnKeys(metaData)) {
    if (key in saved) {
      result[key] = saved[key];
    }
  }
  return result;
}

export function resolveColumnOrder(
  metaData: Record<string, any>,
  saved?: string[] | null,
): string[] {
  const defaults = getDefaultColumnOrder(metaData);
  if (!saved?.length) return defaults;

  const eligible = new Set(getEligibleColumnKeys(metaData));
  if (
    saved.length !== eligible.size ||
    saved.some((key) => !eligible.has(key))
  ) {
    return defaults;
  }
  return saved;
}

function isValidColumnOrder(
  metaData: Record<string, any>,
  columnOrder: string[] | undefined,
): boolean {
  if (!columnOrder?.length) return false;
  const eligible = getEligibleColumnKeys(metaData);
  if (columnOrder.length !== eligible.length) return false;
  const eligibleSet = new Set(eligible);
  return columnOrder.every((key) => eligibleSet.has(key));
}

export function applyColumnPreferencesToMetaData(
  metaData: Record<string, any>,
  visibility: Record<string, boolean>,
  columnOrder: string[],
): Record<string, any> {
  const result: Record<string, any> = { ...metaData };

  for (const key of getEligibleColumnKeys(metaData)) {
    if (!(key in visibility)) continue;
    result[key] = { ...metaData[key], isColumnShow: visibility[key] };
  }

  columnOrder.forEach((key, index) => {
    if (result[key]) {
      result[key] = { ...result[key], orderNo: index + 1 };
    }
  });

  return result;
}

export function loadColumnPreferences(
  storageKey: string,
  metaData: Record<string, any>,
): ColumnPreferences | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ColumnPreferences;
    if (parsed.v !== COLUMN_PREFS_VERSION) {
      localStorage.removeItem(storageKey);
      return null;
    }

    if (parsed.fingerprint !== computeColumnFingerprint(metaData)) {
      localStorage.removeItem(storageKey);
      return null;
    }

    if (!isValidColumnOrder(metaData, parsed.columnOrder)) {
      localStorage.removeItem(storageKey);
      return null;
    }

    if (
      parsed.sort?.field &&
      !metaData[parsed.sort.field]?.displayName
    ) {
      localStorage.removeItem(storageKey);
      return null;
    }

    return parsed;
  } catch {
    localStorage.removeItem(storageKey);
    return null;
  }
}

export function saveColumnPreferences(
  storageKey: string,
  metaData: Record<string, any>,
  visibility: Record<string, boolean>,
  columnOrder: string[],
  sort: ColumnSortPreference | null,
): void {
  const payload: ColumnPreferences = {
    v: COLUMN_PREFS_VERSION,
    fingerprint: computeColumnFingerprint(metaData),
    visibility,
    columnOrder,
    sort,
  };
  localStorage.setItem(storageKey, JSON.stringify(payload));
}

export function clearColumnPreferences(storageKey: string): void {
  localStorage.removeItem(storageKey);
}

export function countVisibleColumns(visibility: Record<string, boolean>): number {
  return Object.values(visibility).filter(Boolean).length;
}
