import { viewAPI } from '@/api/api';
import { resolveTaxPack } from '@/lib/tax/taxPack';

export type PartyTaxRegistration = {
  id: string;
  party_type: string;
  party_id: string;
  scheme: string;
  registration_number: string;
  is_primary?: boolean;
  tax_region_id?: string | null;
};

export type ZeroRatedTaxGroup = {
  id: string;
  code?: string;
  name?: string;
  country_code?: string | null;
};

/** Load primary (or first) tax registration for a party via metadata search. */
export async function fetchPrimaryPartyTaxRegistration(
  partyType: 'entity' | 'customer' | 'supplier',
  partyId: string
): Promise<PartyTaxRegistration | null> {
  if (!partyId) return null;
  try {
    const res = await viewAPI.search(
      'party_tax_registration',
      'party_tax_registration_view',
      1,
      5,
      undefined,
      {
        party_type: { eq: partyType },
        party_id: { eq: partyId },
      }
    );
    const rows = res?.data || res?.items || [];
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const primary = rows.find((r: any) => r.is_primary) || rows[0];
    return primary as PartyTaxRegistration;
  } catch {
    return null;
  }
}

/**
 * Country pack for a legal entity (IN | CA | GENERIC).
 * Multi-entity tenants resolve pack from the active LE, not tenant org_id.
 */
export async function fetchEntityTaxPack(legalEntityId?: string | null): Promise<string> {
  if (!legalEntityId) return 'GENERIC';
  try {
    const res = await viewAPI.search(
      'entity_tax_settings',
      'entity_tax_settings_view',
      1,
      1,
      undefined,
      { legal_entity_id: { eq: legalEntityId } }
    );
    const rows = res?.data || res?.items || [];
    return rows?.[0]?.tax_country_pack || 'GENERIC';
  } catch {
    return 'GENERIC';
  }
}

/** @deprecated Use fetchEntityTaxPack(legalEntityId) — pack is per LE, not tenant. */
export async function fetchOrgTaxPack(orgOrEntityId?: string | null): Promise<string> {
  return fetchEntityTaxPack(orgOrEntityId);
}

/**
 * Resolve the tenant's zero-rated / export tax group for a country pack
 * (IN → GST0, CA → CA_EXEMPT, …).
 */
export async function fetchZeroRatedTaxGroup(
  pack?: string | null,
): Promise<ZeroRatedTaxGroup | null> {
  const catalog = resolveTaxPack(pack);
  const codes = catalog.zeroRatedTaxGroupCodes;
  if (!codes.length) return null;

  try {
    const filters: Record<string, any> = {
      code: codes.length === 1 ? { eq: codes[0] } : { in: codes },
      status: { eq: 'Active' },
    };
    if (catalog.id === 'IN' || catalog.id === 'CA') {
      filters.country_code = { eq: catalog.id };
    }

    const res: any = await viewAPI.search(
      'tax_group',
      'tax_group_view',
      1,
      10,
      undefined,
      filters,
    );
    const rows = res?.data || res?.items || [];
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const preferred =
      codes
        .map((code) => rows.find((r: any) => String(r.code || '').toUpperCase() === code.toUpperCase()))
        .find(Boolean) || rows[0];

    return preferred
      ? {
          id: preferred.id,
          code: preferred.code,
          name: preferred.name,
          country_code: preferred.country_code,
        }
      : null;
  } catch {
    return null;
  }
}
