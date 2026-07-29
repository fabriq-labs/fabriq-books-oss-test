/**
 * Country tax pack catalogs — presentation + suggestion hints for UI.
 * Core data model stays generic; packs only change labels / allowed schemes.
 */
export type TaxCountryPack = 'IN' | 'CA' | 'GENERIC';

export type TaxPackCatalog = {
  id: TaxCountryPack;
  registrationSchemes: string[];
  registrationLabel: string;
  regionLabel: string;
  classificationSchemes: string[];
  classificationLabel: string;
  taxGroupLabel: string;
  /** Default / same-region group on item master */
  defaultTaxGroupLabel: string;
  /** Different-region group on item master (IN interstate / CA out-of-province) */
  interstateTaxGroupLabel: string;
  /**
   * Tax group codes used for export / overseas / zero-rated suggestion.
   * Looked up via metadata search (tenant may use GST0, CA_EXEMPT, …).
   */
  zeroRatedTaxGroupCodes: string[];
  showTaxResponsibility: boolean;
  showComponentBreakdown: boolean;
};

export const TAX_PACKS: Record<TaxCountryPack, TaxPackCatalog> = {
  IN: {
    id: 'IN',
    registrationSchemes: ['GSTIN'],
    registrationLabel: 'GSTIN',
    regionLabel: 'Place of Supply',
    classificationSchemes: ['HSN', 'SAC'],
    classificationLabel: 'HSN / SAC',
    taxGroupLabel: 'Tax',
    defaultTaxGroupLabel: 'Tax group (intra-state)',
    interstateTaxGroupLabel: 'Tax group (inter-state)',
    zeroRatedTaxGroupCodes: ['GST0'],
    showTaxResponsibility: true,
    showComponentBreakdown: true,
  },
  CA: {
    id: 'CA',
    registrationSchemes: ['GST_HST_BN', 'PST', 'QST'],
    registrationLabel: 'GST/HST BN',
    regionLabel: 'Place of supply (province)',
    classificationSchemes: [],
    classificationLabel: 'Classification code',
    taxGroupLabel: 'Tax group',
    defaultTaxGroupLabel: 'Tax group (in-province)',
    interstateTaxGroupLabel: 'Tax group (out-of-province)',
    zeroRatedTaxGroupCodes: ['CA_EXEMPT', 'GST0'],
    showTaxResponsibility: false,
    showComponentBreakdown: true,
  },
  GENERIC: {
    id: 'GENERIC',
    registrationSchemes: ['OTHER'],
    registrationLabel: 'Tax registration',
    regionLabel: 'Tax region',
    classificationSchemes: [],
    classificationLabel: 'Classification code',
    taxGroupLabel: 'Tax',
    defaultTaxGroupLabel: 'Tax group',
    interstateTaxGroupLabel: 'Tax group (other region)',
    zeroRatedTaxGroupCodes: [],
    showTaxResponsibility: false,
    showComponentBreakdown: false,
  },
};

export function resolveTaxPack(pack?: string | null): TaxPackCatalog {
  const key = (pack || 'GENERIC').toUpperCase() as TaxCountryPack;
  return TAX_PACKS[key] || TAX_PACKS.GENERIC;
}

/** Export / overseas customers should not get domestic intra/inter GST groups. */
export function isExportTaxTreatment(treatment?: string | null): boolean {
  return String(treatment || '').trim().toLowerCase() === 'export';
}

/**
 * UI suggestion for invoice / bill line tax group.
 * - export/overseas party treatment → zero-rated group when available
 * - else same region → default group; different region → interstate
 *
 * Party roles:
 * - Sales: sellerRegionId = LE region, placeOfSupplyId = customer/POS, taxTreatment = customer
 * - Purchase bills: sellerRegionId = supplier region, placeOfSupplyId = bill POS (usually LE),
 *   taxTreatment = supplier (e.g. export for overseas)
 */
export function suggestTaxGroupId(args: {
  sellerRegionId?: string | null;
  placeOfSupplyId?: string | null;
  defaultTaxGroupId?: string | null;
  interstateTaxGroupId?: string | null;
  taxTreatment?: string | null;
  zeroRatedTaxGroupId?: string | null;
}): string | null {
  const {
    sellerRegionId,
    placeOfSupplyId,
    defaultTaxGroupId,
    interstateTaxGroupId,
    taxTreatment,
    zeroRatedTaxGroupId,
  } = args;

  if (isExportTaxTreatment(taxTreatment)) {
    return zeroRatedTaxGroupId || null;
  }

  if (!placeOfSupplyId || !sellerRegionId) {
    return defaultTaxGroupId || null;
  }
  if (sellerRegionId === placeOfSupplyId) {
    return defaultTaxGroupId || null;
  }
  return interstateTaxGroupId || defaultTaxGroupId || null;
}
