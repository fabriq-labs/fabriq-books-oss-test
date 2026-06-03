import { useEffect, useRef, useState } from "react";

/**
 * Initializes legal-entity checkboxes once when entities finish loading:
 * - global single entity → that id selected
 * - global "All Entities" → nothing selected (API omits legal_entity_ids → org-wide)
 *
 * Does not re-sync when the global entity selector changes afterward.
 */
export function useReportLegalEntitySelection(
  currentEntityId: string | null,
  entityLoading: boolean
) {
  const [selectedLegalEntityIds, setSelectedLegalEntityIds] = useState<string[]>([]);
  const [selectionReady, setSelectionReady] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (entityLoading || initializedRef.current) return;
    initializedRef.current = true;
    setSelectedLegalEntityIds(currentEntityId ? [currentEntityId] : []);
    setSelectionReady(true);
  }, [entityLoading, currentEntityId]);

  return {
    selectedLegalEntityIds,
    setSelectedLegalEntityIds,
    selectionReady,
  };
}
