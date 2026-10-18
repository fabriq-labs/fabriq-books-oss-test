import { useEffect, useState, type ReactNode } from 'react';
import { fetchAPI } from '@/api/apiClient';
import { viewAPI } from '@/api/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type EntityOption = { id: string; name?: string };
type CurrencyOption = { id: string; code?: string };

export type ReportEnvelope = {
  report_currency: string | null;
  report_currency_id: string;
  from: string;
  to: string;
  entity_ids: string[];
  rows: Array<Record<string, unknown>>;
  totals?: Record<string, number>;
  summary?: Record<string, unknown>;
};

function yearBounds() {
  const year = new Date().getFullYear();
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function rowsOf(payload: unknown): any[] {
  if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: any[] }).data;
  }
  return [];
}

export function money(value: unknown): string {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return '';
  return parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function rateCell(row: Record<string, unknown>): string {
  if (row.rate_missing) return 'rate_missing';
  if (row.rate == null || row.rate === '') return '';
  return String(row.rate);
}

export function ReportFrame({
  title,
  path,
  children,
}: {
  title: string;
  path: string;
  children: (report: ReportEnvelope | null) => ReactNode;
}) {
  const bounds = yearBounds();
  const [from, setFrom] = useState(bounds.from);
  const [to, setTo] = useState(bounds.to);
  const [entityIds, setEntityIds] = useState<string[]>([]);
  const [currencyId, setCurrencyId] = useState('');
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);
  const [report, setReport] = useState<ReportEnvelope | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    viewAPI.getAll('entity', 'entity_view', 1, 200).then((res) => setEntities(rowsOf(res))).catch(() => setEntities([]));
    viewAPI.getAll('currency', 'currency_view', 1, 200).then((res) => setCurrencies(rowsOf(res))).catch(() => setCurrencies([]));
  }, []);

  const load = async (nextFrom = from, nextTo = to, nextEntities = entityIds, nextCurrency = currencyId) => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    params.set('from', nextFrom);
    params.set('to', nextTo);
    if (nextCurrency) params.set('currency_id', nextCurrency);
    for (const id of nextEntities) params.append('entity_id', id);
    try {
      const result = await fetchAPI<{ success: boolean; data: ReportEnvelope }>(`/api/gl/reports/${path}?${params}`);
      setReport(result.data);
    } catch (err: any) {
      setReport(null);
      setError(err.message || 'Report failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // Load once on open. Filter changes wait for Run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const missing = (report?.rows ?? []).filter((row) => row.rate_missing).length
    + (report?.summary && (report.summary as { rate_missing?: boolean }).rate_missing ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Report currency: {report?.report_currency || '…'}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">From</span>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="w-44" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">To</span>
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="w-44" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">Entities</span>
          <select
            multiple
            className="h-24 min-w-56 rounded-md border bg-background px-2 py-1"
            value={entityIds}
            onChange={(event) => setEntityIds(Array.from(event.target.selectedOptions).map((option) => option.value))}
          >
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name || entity.id}
              </option>
            ))}
          </select>
          <span className="block text-xs text-muted-foreground">None selected includes every posting, including those with no entity.</span>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">Currency</span>
          <select
            className="h-10 min-w-40 rounded-md border bg-background px-2"
            value={currencyId}
            onChange={(event) => setCurrencyId(event.target.value)}
          >
            <option value="">Organization currency</option>
            {currencies.map((currency) => (
              <option key={currency.id} value={currency.id}>
                {currency.code || currency.id}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" onClick={() => load()} disabled={loading}>
          {loading ? 'Loading...' : 'Run'}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {missing > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          rate_missing: an exchange rate was not found, so the amount stayed in the account currency.
        </p>
      )}
      {children(report)}
    </div>
  );
}
