import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchAPI } from '@/api/apiClient';
import { viewAPI } from '@/api/api';
import { useEntity } from '@/contexts/EntityContext';
import { ReportFilterBar, type ReportCurrency } from './filters/ReportFilterBar';
import { applyReportFilters, type ChartAccount } from './filters/applyReportFilters';
import type { ReportAccountOption } from './filters/ReportAccountFilter';
import { getCurrentFYOption, type FinancialYearOption, type MonthOption } from './filters/financialYear';

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
  const { entities, currentEntityId, loading: entityLoading } = useEntity();
  const initialYear = getCurrentFYOption();
  const [financialYear, setFinancialYear] = useState<FinancialYearOption>(initialYear);
  const [month, setMonth] = useState<MonthOption | null>(null);
  const [currencyId, setCurrencyId] = useState('');
  const [currencies, setCurrencies] = useState<ReportCurrency[]>([]);
  const [currenciesLoading, setCurrenciesLoading] = useState(true);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [account, setAccount] = useState<ReportAccountOption | null>(null);
  const [showOnlyActivity, setShowOnlyActivity] = useState(true);
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [report, setReport] = useState<ReportEnvelope | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [appliedKey, setAppliedKey] = useState('');

  const from = month?.from_date ?? financialYear.from_date;
  const to = month?.to_date ?? financialYear.to_date;
  const entityPart = selectedEntityIds.join(',');
  const filterKey = useMemo(
    () => `${from}|${to}|${entityPart}|${currencyId}`,
    [from, to, entityPart, currencyId]
  );
  const rangeRef = useRef({ from, to, currencyId });
  rangeRef.current = { from, to, currencyId };

  useEffect(() => {
    setCurrenciesLoading(true);
    viewAPI
      .getAll('currency', 'currency_view', 1, 200)
      .then((res) => setCurrencies(rowsOf(res)))
      .catch(() => setCurrencies([]))
      .finally(() => setCurrenciesLoading(false));
    viewAPI
      .search('account', 'account_view', 1, 500, undefined, {}, { code: 'asc' })
      .then((res) => setAccounts(rowsOf(res) as ChartAccount[]))
      .catch(() => setAccounts([]));
  }, []);

  const load = async (key = filterKey) => {
    const [nextFrom, nextTo, entityPart, nextCurrency] = key.split('|');
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    params.set('from', nextFrom);
    params.set('to', nextTo);
    if (nextCurrency) params.set('currency_id', nextCurrency);
    for (const id of entityPart.split(',').filter(Boolean)) params.append('entity_id', id);
    try {
      const result = await fetchAPI<{ success: boolean; data: ReportEnvelope }>(`/api/gl/reports/${path}?${params}`);
      setReport(result.data);
      setAppliedKey(key);
    } catch (err: any) {
      setReport(null);
      setError(err.message || 'Report failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (entityLoading) return;
    const ids = currentEntityId ? [currentEntityId] : [];
    setSelectedEntityIds(ids);
    const range = rangeRef.current;
    void load(`${range.from}|${range.to}|${ids.join(',')}|${range.currencyId}`);
    // The nav entity seeds this panel and reloads the report. Year, currency, and
    // further entity edits wait for Run report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, currentEntityId, entityLoading]);

  const visibleReport = useMemo(() => {
    if (!report) return null;
    return applyReportFilters(report, {
      path,
      showOnlyActivity,
      accountId: account?.id ?? null,
      accounts,
      entityIds: selectedEntityIds,
    });
  }, [report, path, showOnlyActivity, account, accounts, selectedEntityIds]);

  const missing = (visibleReport?.rows ?? []).filter((row) => row.rate_missing).length
    + (visibleReport?.summary && (visibleReport.summary as { rate_missing?: boolean }).rate_missing ? 1 : 0);

  return (
    <div className="space-y-4">
      <ReportFilterBar
        title={title}
        path={path}
        reportCurrency={report?.report_currency ?? null}
        financialYear={financialYear}
        onFinancialYearChange={(option) => {
          setFinancialYear(option);
          setMonth(null);
        }}
        month={month}
        onMonthChange={setMonth}
        entities={entities}
        entityLoading={entityLoading}
        selectedEntityIds={selectedEntityIds}
        onSelectedEntityIdsChange={setSelectedEntityIds}
        currencies={currencies}
        currenciesLoading={currenciesLoading}
        currencyId={currencyId}
        onCurrencyIdChange={setCurrencyId}
        account={account}
        onAccountChange={setAccount}
        onAccountClear={() => setAccount(null)}
        showOnlyActivity={showOnlyActivity}
        onShowOnlyActivityChange={setShowOnlyActivity}
        loading={loading}
        dirty={appliedKey !== '' && appliedKey !== filterKey}
        onRun={() => void load()}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {missing > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          rate_missing: an exchange rate was not found, so the amount stayed in the account currency.
        </p>
      )}
      {children(visibleReport)}
    </div>
  );
}
