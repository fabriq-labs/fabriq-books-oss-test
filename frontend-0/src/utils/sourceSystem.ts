/** Default source for records created inside Fabriq (not synced from an external ERP). */
export const FABRIQ_SOURCE_SYSTEM_ID = "srcsys_fabriq";

/** True when the record is native Fabriq (or has no source set — treated as editable). */
export function isFabriqSource(sourceSystemId?: string | null): boolean {
  return !sourceSystemId || sourceSystemId === FABRIQ_SOURCE_SYSTEM_ID;
}

/** True when the record was synced from an external system and should be view-only. */
export function isExternalSource(sourceSystemId?: string | null): boolean {
  return Boolean(sourceSystemId && sourceSystemId !== FABRIQ_SOURCE_SYSTEM_ID);
}
