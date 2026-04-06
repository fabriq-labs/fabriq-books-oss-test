import {
  normalizeItemKey,
  matchExtractedLineItemsToPO,
} from '../../agent/invoiceMatching';

describe('invoiceMatching', () => {
  describe('normalizeItemKey', () => {
    it('returns empty string for null or undefined', () => {
      expect(normalizeItemKey(null)).toBe('');
      expect(normalizeItemKey(undefined)).toBe('');
    });

    it('trims and lowercases non-empty strings', () => {
      expect(normalizeItemKey('  Item A  ')).toBe('item a');
      expect(normalizeItemKey('SKU-123')).toBe('sku-123');
    });

    it('returns empty string for non-string values', () => {
      expect(normalizeItemKey(123 as any)).toBe('');
    });
  });

  describe('matchExtractedLineItemsToPO', () => {
    const poLineItems = [
      { id: 'po_item_1', item_name: 'Widget A', item_code: 'WDG-001' },
      { id: 'po_item_2', item_name: 'Widget B', item_code: 'WDG-002' },
      { id: 'po_item_3', item_name: 'Gadget', item_code: null },
    ];

    it('returns allMatched true and mapping when all extracted lines match by item code', () => {
      const extracted = [
        { item_number: 'WDG-001', item_name: 'Widget A' },
        { item_number: 'WDG-002', item_name: 'Widget B' },
      ];
      const result = matchExtractedLineItemsToPO(extracted, poLineItems);
      expect(result.allMatched).toBe(true);
      expect(result.mapping).toHaveLength(2);
      expect(result.mapping[0].poLineItemId).toBe('po_item_1');
      expect(result.mapping[1].poLineItemId).toBe('po_item_2');
    });

    it('returns allMatched true when matching by item name only (case-insensitive)', () => {
      const extracted = [
        { item_name: '  widget a  ', item_number: null },
        { item_name: 'GADGET', item_number: null },
      ];
      const result = matchExtractedLineItemsToPO(extracted, poLineItems);
      expect(result.allMatched).toBe(true);
      expect(result.mapping).toHaveLength(2);
      expect(result.mapping[0].poLineItemId).toBe('po_item_1');
      expect(result.mapping[1].poLineItemId).toBe('po_item_3');
    });

    it('returns allMatched true when extracted item_number matches PO item_name', () => {
      const extracted = [{ item_number: 'Gadget', item_name: null }];
      const result = matchExtractedLineItemsToPO(extracted, poLineItems);
      expect(result.allMatched).toBe(true);
      expect(result.mapping[0].poLineItemId).toBe('po_item_3');
    });

    it('returns allMatched false when an extracted line has no match', () => {
      const extracted = [
        { item_number: 'WDG-001', item_name: 'Widget A' },
        { item_number: 'UNKNOWN-SKU', item_name: 'Unknown Item' },
      ];
      const result = matchExtractedLineItemsToPO(extracted, poLineItems);
      expect(result.allMatched).toBe(false);
      expect(result.mapping).toHaveLength(0);
    });

    it('returns allMatched false when extracted has more lines than PO', () => {
      const extracted = [
        { item_number: 'WDG-001', item_name: 'Widget A' },
        { item_number: 'WDG-002', item_name: 'Widget B' },
        { item_number: 'WDG-001', item_name: 'Widget A' },
      ];
      const result = matchExtractedLineItemsToPO(extracted, poLineItems);
      expect(result.allMatched).toBe(false);
      expect(result.mapping).toHaveLength(0);
    });

    it('uses each PO line at most once', () => {
      const extracted = [
        { item_number: 'WDG-001', item_name: 'Widget A' },
        { item_number: 'WDG-001', item_name: 'Widget A' },
      ];
      const result = matchExtractedLineItemsToPO(extracted, poLineItems);
      expect(result.allMatched).toBe(false);
      expect(result.mapping).toHaveLength(0);
    });

    it('returns allMatched true and empty mapping when extracted is empty', () => {
      const result = matchExtractedLineItemsToPO([], poLineItems);
      expect(result.allMatched).toBe(true);
      expect(result.mapping).toHaveLength(0);
    });

    it('returns allMatched false when extracted has lines but PO is empty', () => {
      const result = matchExtractedLineItemsToPO(
        [{ item_number: 'WDG-001', item_name: 'Widget A' }],
        []
      );
      expect(result.allMatched).toBe(false);
      expect(result.mapping).toHaveLength(0);
    });
  });
});
