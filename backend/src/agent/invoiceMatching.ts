/**
 * Normalize a string for item matching: trim and lowercase.
 */
export function normalizeItemKey(s: string | null | undefined): string {
  if (s == null || typeof s !== 'string') return '';
  return s.trim().toLowerCase();
}

/**
 * Match extracted invoice line items to PO line items by item name or item code only.
 * Quantity, rate, and totals are not used for matching (they may vary).
 * Each PO line is used at most once.
 * @returns { allMatched: boolean, mapping: Array<{ poLineItemId: string }> } - one entry per extracted line with matched PO line id, or empty if not all matched.
 */
export function matchExtractedLineItemsToPO(
  extractedLineItems: any[],
  poLineItems: any[]
): { allMatched: boolean; mapping: Array<{ poLineItemId: string }> } {
  if (!extractedLineItems?.length || !poLineItems?.length) {
    return { allMatched: extractedLineItems?.length === 0, mapping: [] };
  }
  const usedPoIndices = new Set<number>();
  const mapping: Array<{ poLineItemId: string }> = [];

  for (const extracted of extractedLineItems) {
    const extCode = normalizeItemKey(extracted.item_number ?? extracted.item_code);
    const extName = normalizeItemKey(extracted.item_name);
    const matchIndex = poLineItems.findIndex((po: any, idx: number) => {
      if (usedPoIndices.has(idx)) return false;
      const poCode = normalizeItemKey(po.item_code ?? po.item_number);
      const poName = normalizeItemKey(po.item_name);
      if (extCode && poCode && extCode === poCode) return true;
      if (extName && poName && extName === poName) return true;
      if (extCode && poName && extCode === poName) return true;
      if (extName && poCode && extName === poCode) return true;
      return false;
    });
    if (matchIndex === -1) {
      return { allMatched: false, mapping: [] };
    }
    usedPoIndices.add(matchIndex);
    mapping.push({ poLineItemId: poLineItems[matchIndex].id });
  }
  return { allMatched: true, mapping };
}
