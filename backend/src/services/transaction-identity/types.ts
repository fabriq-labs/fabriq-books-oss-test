/**
 * Geo-aware transaction identity enrichment for categorization.
 * Adapters produce a stable merchantKey used by historical matching.
 */

/** Who produced posting.merchant_key (persisted as merchant_key_provider). */
export type MerchantKeyProvider = 'plaid_enrich' | 'legacy_normalize' | 'llm';

/** @deprecated Prefer MerchantKeyProvider — kept as alias for adapter ids. */
export type IdentityProvider = MerchantKeyProvider;

export interface EnrichContext {
  orgId: string;
  userId?: string;
  legalEntityId?: string | null;
  /** Raw country from entity.country (e.g. USA, US, CA, IN). */
  country: string;
  accountType?: 'depository' | 'credit';
}

export interface EnrichBatchItem {
  id: string;
  description: string | null;
  amount?: number;
  direction?: 'INFLOW' | 'OUTFLOW';
  currency?: string;
}

export interface EnrichedIdentity {
  /** Stable lowercase key for historical matching. */
  merchantKey: string;
  displayName?: string;
  provider: MerchantKeyProvider;
  confidence: number;
}

export interface TransactionIdentityEnricher {
  readonly id: MerchantKeyProvider;
  supports(ctx: EnrichContext): boolean;
  enrichBatch(
    items: EnrichBatchItem[],
    ctx: EnrichContext
  ): Promise<Map<string, EnrichedIdentity>>;
}

export type IdentityRegion = 'US_CA' | 'OTHER';

export function normalizeCountryToRegion(country: string | null | undefined): IdentityRegion {
  const c = (country ?? '').trim().toUpperCase();
  if (
    c === 'US' ||
    c === 'USA' ||
    c === 'UNITED STATES' ||
    c === 'CA' ||
    c === 'CAN' ||
    c === 'CANADA'
  ) {
    return 'US_CA';
  }
  return 'OTHER';
}

/** Canonical form for storage and exact SQL match. */
export function toMerchantKey(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
