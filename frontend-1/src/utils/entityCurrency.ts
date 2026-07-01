import type { Entity } from '@/contexts/EntityContext';

/** Row shape from `currency` / `currency_view` (ISO 4217 code on `currency.code`). */
export interface CurrencyRow {
  id: string;
  code: string;
  name?: string;
  is_active?: boolean;
}

export type CurrencyCodeById = ReadonlyMap<string, string>;

export function buildCurrencyCodeById(currencies: Iterable<CurrencyRow>): CurrencyCodeById {
  const map = new Map<string, string>();
  for (const row of currencies) {
    const id = row.id?.trim();
    const code = row.code?.trim().toUpperCase();
    if (id && code) map.set(id, code);
  }
  return map;
}

function lookupCurrencyCode(
  currencyId: string | null | undefined,
  currencyById?: CurrencyCodeById
): string | null {
  if (!currencyId?.trim() || !currencyById?.size) return null;
  const id = currencyId.trim();
  return currencyById.get(id) ?? currencyById.get(id.toLowerCase()) ?? null;
}

/** ISO code for an entity's reporting currency (matches report pages). */
export function resolveEntityCurrencyCode(
  entity: Pick<Entity, 'currency' | 'basecurrency_id'> | null | undefined,
  currencyById?: CurrencyCodeById
): string | null {
  const code = entity?.currency?.code?.trim().toUpperCase();
  if (code) return code;
  const currencyId = entity?.basecurrency_id ?? entity?.currency?.id;
  return lookupCurrencyCode(currencyId, currencyById);
}
