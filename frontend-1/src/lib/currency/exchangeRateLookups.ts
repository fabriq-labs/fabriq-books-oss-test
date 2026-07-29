import { viewAPI } from '@/api/api';

export type LatestExchangeRate = {
  id: string;
  rate: number;
  effective_date?: string | null;
  from_currency_id: string;
  to_currency_id: string;
  inverted?: boolean;
};

/**
 * Latest SPOT (or any) rate converting fromCurrency → toCurrency.
 * Tries direct pair first, then inverse (1/rate).
 * Returns 1 when currencies match.
 */
export async function fetchLatestExchangeRate(
  fromCurrencyId?: string | null,
  toCurrencyId?: string | null,
  asOfDate?: string | Date | null,
): Promise<LatestExchangeRate | null> {
  if (!fromCurrencyId || !toCurrencyId) return null;
  if (fromCurrencyId === toCurrencyId) {
    return {
      id: 'same_currency',
      rate: 1,
      from_currency_id: fromCurrencyId,
      to_currency_id: toCurrencyId,
      inverted: false,
    };
  }

  // Prisma DateTime filters need full ISO-8601, not YYYY-MM-DD alone.
  const normalizeDate = (value: unknown): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    // dayjs / moment-like
    if (typeof (value as any)?.toDate === 'function') {
      const d = (value as any).toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    }
    if (typeof (value as any)?.toISOString === 'function' && typeof value !== 'string') {
      try {
        const d = new Date((value as any).toISOString());
        return Number.isNaN(d.getTime()) ? null : d;
      } catch {
        return null;
      }
    }
    const d = new Date(value as string);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const toIsoEndOfDay = (value: unknown): string | null => {
    const d = normalizeDate(value);
    if (!d) return null;
    // End of that calendar day UTC so SPOT rates on the invoice date still match.
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}T23:59:59.999Z`;
  };

  const asOf = asOfDate ? toIsoEndOfDay(asOfDate) : null;

  const searchPair = async (fromId: string, toId: string) => {
    const filters: Record<string, any> = {
      from_currency_id: { eq: fromId },
      to_currency_id: { eq: toId },
    };
    if (asOf) {
      filters.effective_date = { lte: asOf };
    }
    const res: any = await viewAPI.search(
      'exchange_rate',
      'exchange_rate_view',
      1,
      1,
      undefined,
      filters,
      { effective_date: 'desc' },
    );
    const row = (res?.data || [])[0];
    if (!row?.id || row.rate == null) return null;
    return {
      id: row.id as string,
      rate: Number(row.rate),
      effective_date: row.effective_date || null,
      from_currency_id: fromId,
      to_currency_id: toId,
    };
  };

  try {
    const direct = await searchPair(fromCurrencyId, toCurrencyId);
    if (direct && Number.isFinite(direct.rate) && direct.rate > 0) {
      return { ...direct, inverted: false };
    }

    const inverse = await searchPair(toCurrencyId, fromCurrencyId);
    if (inverse && Number.isFinite(inverse.rate) && inverse.rate > 0) {
      return {
        id: inverse.id,
        rate: 1 / Number(inverse.rate),
        effective_date: inverse.effective_date,
        from_currency_id: fromCurrencyId,
        to_currency_id: toCurrencyId,
        inverted: true,
      };
    }
  } catch {
    return null;
  }

  return null;
}
