import type { SearchFilterEntry } from './searchFilterTypes';

/** Drop filters with missing values; skip unresolved prompt placeholders. */
export function sanitizeSearchFilters(filters: unknown[]): unknown[] {
  return filters.filter((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const f = entry as Record<string, unknown>;
    const value = f.value;
    if (value === undefined || value === null || value === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    if (typeof value === 'string' && /^\{\{.+\}\}$/.test(value.trim())) return false;
    return typeof f.field === 'string' && typeof f.operator === 'string';
  });
}

/** Flatten legacy search object `{ account_id: { eq: "X" }, filters: {…} }` into filter array. */
export function legacySearchObjectToFilters(
  obj: Record<string, unknown>
): SearchFilterEntry[] {
  const target =
    obj.filters && typeof obj.filters === 'object' && !Array.isArray(obj.filters)
      ? (obj.filters as Record<string, unknown>)
      : obj;
  const filters: SearchFilterEntry[] = [];
  for (const [field, conditions] of Object.entries(target)) {
    if (field === 'filters') continue;
    if (conditions === null) {
      filters.push({ field, operator: 'is_null', value: true });
    } else if (typeof conditions === 'object' && !Array.isArray(conditions)) {
      for (const [operator, value] of Object.entries(conditions as Record<string, unknown>)) {
        filters.push({ field, operator, value });
      }
    } else {
      filters.push({ field, operator: 'eq', value: conditions });
    }
  }
  return filters;
}

export function coerceSearchFilters(search: unknown): SearchFilterEntry[] | undefined {
  if (search == null) return undefined;
  if (Array.isArray(search)) {
    return sanitizeSearchFilters(search) as SearchFilterEntry[];
  }
  if (typeof search !== 'object') return undefined;
  const obj = search as Record<string, unknown>;
  if (Array.isArray(obj.filters)) {
    return sanitizeSearchFilters(obj.filters) as SearchFilterEntry[];
  }
  if (typeof obj.field === 'string' && typeof obj.operator === 'string') {
    return sanitizeSearchFilters([obj]) as SearchFilterEntry[];
  }
  if (typeof obj.filters === 'object' || !obj.field) {
    const legacy = legacySearchObjectToFilters(obj);
    if (legacy.length > 0) return sanitizeSearchFilters(legacy) as SearchFilterEntry[];
  }
  return undefined;
}
