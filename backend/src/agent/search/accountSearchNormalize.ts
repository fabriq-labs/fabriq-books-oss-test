import type { SearchFilterEntry } from './searchFilterTypes';

/** Scope account lookup to header legal entity when set (same as posting create/search). */
export function normalizeAccountSearchFilters(
  filters: SearchFilterEntry[],
  headerLegalEntityId?: string | null
): SearchFilterEntry[] {
  const headerEntity = headerLegalEntityId?.trim() || null;
  if (!headerEntity) {
    return filters.filter((f) => f.field !== 'legal_entity_id');
  }
  const withoutEntity = filters.filter((f) => f.field !== 'legal_entity_id');
  return [
    ...withoutEntity,
    { field: 'legal_entity_id', operator: 'eq', value: headerEntity },
  ];
}
