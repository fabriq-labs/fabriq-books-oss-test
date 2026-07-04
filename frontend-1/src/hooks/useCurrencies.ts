import { useCallback, useEffect, useMemo, useState } from 'react';
import { viewAPI } from '@/api/metadataApi';
import {
  buildCurrencyCodeById,
  type CurrencyCodeById,
  type CurrencyRow,
} from '@/utils/entityCurrency';

export function useCurrencies() {
  const [currencies, setCurrencies] = useState<CurrencyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCurrencies = useCallback(async () => {
    setLoading(true);
    try {
      const res: { data?: unknown[] } = await viewAPI.search(
        'currency',
        'currency_view',
        1,
        500,
        undefined,
        {},
        {}
      );
      const list = Array.isArray(res?.data) ? res.data : [];
      setCurrencies(
        list.map((row: Record<string, unknown>) => ({
          id: String(row.id ?? ''),
          code: String(row.code ?? '').trim(),
          name: String(row.name ?? '').trim(),
          is_active: row.is_active !== false && row.is_active !== 'false',
        }))
      );
    } catch {
      setCurrencies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCurrencies();
  }, [loadCurrencies]);

  const currencyById: CurrencyCodeById = useMemo(
    () => buildCurrencyCodeById(currencies),
    [currencies]
  );

  return { currencies, currencyById, loading, reload: loadCurrencies };
}
