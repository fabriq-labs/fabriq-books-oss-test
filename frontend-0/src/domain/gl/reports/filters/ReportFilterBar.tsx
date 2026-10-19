import { Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Entity } from '@/contexts/EntityContext';
import { entityLabel } from '@/contexts/EntityContext';
import {
  buildFYOptions,
  buildMonthOptions,
  type FinancialYearOption,
  type MonthOption,
} from './financialYear';
import {
  ReportActivityFilterField,
  ReportAdvancedField,
  ReportAdvancedFilters,
  ReportAdvancedSummaryChip,
} from './ReportAdvancedFilters';
import { LegalEntityMultiSelect } from './LegalEntityMultiSelect';
import { ReportAccountFilter, type ReportAccountOption } from './ReportAccountFilter';
import { ReportCurrencySelect, type CurrencyRow } from './ReportCurrencySelect';

export type ReportCurrency = CurrencyRow;

function fieldHints(path: string): { currency: string; account: string } {
  if (path === 'balance-sheet') {
    return {
      currency: "Reporting currency for balances. Default uses the entity's base currency.",
      account: 'Optional. Limit the balance sheet to a single account and its roll-up.',
    };
  }
  if (path === 'cash-flow') {
    return {
      currency: "Reporting currency for cash balances. Default uses the entity's base currency.",
      account: 'Optional. Limit to movements involving a specific cash or contra account.',
    };
  }
  if (path === 'income-statement') {
    return {
      currency: "Reporting currency for amounts. Default uses the entity's base currency.",
      account: 'Optional. Limit the income statement to a single account subtree.',
    };
  }
  return {
    currency: "Reporting currency for balances. Default uses the entity's base currency.",
    account: 'Optional. Limit the report to a single account and its roll-up.',
  };
}

export function ReportFilterBar({
  title,
  path,
  reportCurrency,
  financialYear,
  onFinancialYearChange,
  month,
  onMonthChange,
  entities,
  entityLoading,
  selectedEntityIds,
  onSelectedEntityIdsChange,
  currencies,
  currenciesLoading,
  currencyId,
  onCurrencyIdChange,
  account,
  onAccountChange,
  onAccountClear,
  showOnlyActivity,
  onShowOnlyActivityChange,
  loading,
  dirty,
  onRun,
}: {
  title: string;
  path: string;
  reportCurrency: string | null;
  financialYear: FinancialYearOption;
  onFinancialYearChange: (option: FinancialYearOption) => void;
  month: MonthOption | null;
  onMonthChange: (month: MonthOption | null) => void;
  entities: Entity[];
  entityLoading: boolean;
  selectedEntityIds: string[];
  onSelectedEntityIdsChange: (ids: string[]) => void;
  currencies: ReportCurrency[];
  currenciesLoading: boolean;
  currencyId: string;
  onCurrencyIdChange: (id: string) => void;
  account: ReportAccountOption | null;
  onAccountChange: (account: ReportAccountOption) => void;
  onAccountClear: () => void;
  showOnlyActivity: boolean;
  onShowOnlyActivityChange: (checked: boolean) => void;
  loading: boolean;
  dirty: boolean;
  onRun: () => void;
}) {
  const years = buildFYOptions('JAN_DEC', 5);
  const months = buildMonthOptions(financialYear);
  const hints = fieldHints(path);
  const sortedCurrencies = [...currencies].sort((left, right) =>
    (left.code || left.id).localeCompare(right.code || right.id)
  );
  const selectedCurrency = currencies.find((currency) => currency.id === currencyId);
  const reportCurrencyCode = (selectedCurrency?.code || reportCurrency || 'USD').toUpperCase();
  const orgDefaultLabel = (reportCurrency || 'USD').toUpperCase();
  const selectedCurrencyInMasterList = !currencyId || sortedCurrencies.some((currency) => currency.id === currencyId);
  const entitySummary =
    selectedEntityIds.length === 0
      ? 'All entities'
      : selectedEntityIds.length === 1
        ? entityLabel(entities.find((entity) => entity.id === selectedEntityIds[0]) ?? { name: '1 entity' })
        : `${selectedEntityIds.length} entities`;
  const accountSummary = account?.name || account?.account_name || 'All accounts';
  const showActivityField = path !== 'posting-list';

  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-slate-200 bg-white px-4 py-2 shadow-sm md:-mx-6 md:px-6">
      <div className="flex items-center gap-3">
        <div className="min-w-0 shrink-0">
          <h1 className="text-lg font-bold text-slate-900">{title}</h1>
          <p className="text-xs text-slate-600">Report currency: {reportCurrency || '…'}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 overflow-x-auto">
          <Select
            value={financialYear.value}
            onValueChange={(value) => {
              const next = years.find((option) => option.value === value);
              if (next) onFinancialYearChange(next);
            }}
          >
            <SelectTrigger className="h-9 w-[130px] shrink-0 border-slate-300 text-sm">
              <SelectValue placeholder="Select FY" />
            </SelectTrigger>
            <SelectContent>
              {years.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={month?.value ?? '__all__'}
            onValueChange={(value) => {
              if (value === '__all__') {
                onMonthChange(null);
                return;
              }
              onMonthChange(months.find((option) => option.value === value) ?? null);
            }}
          >
            <SelectTrigger className="h-9 w-[150px] shrink-0 border-slate-300 text-sm">
              <SelectValue placeholder="All Months" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Months</SelectItem>
              {months.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            onClick={onRun}
            disabled={loading}
            title={dirty ? 'Filters changed — click to load updated results' : undefined}
            className={cn('h-9 shrink-0 gap-2', dirty && 'ring-2 ring-primary/40 ring-offset-1')}
          >
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run report
          </Button>
        </div>
      </div>
      <ReportAdvancedFilters
        summary={
          <>
            <ReportAdvancedSummaryChip>{entitySummary}</ReportAdvancedSummaryChip>
            <ReportAdvancedSummaryChip>{reportCurrencyCode}</ReportAdvancedSummaryChip>
            <ReportAdvancedSummaryChip>{accountSummary}</ReportAdvancedSummaryChip>
            {showActivityField && !showOnlyActivity ? (
              <ReportAdvancedSummaryChip>Including zero rows</ReportAdvancedSummaryChip>
            ) : null}
          </>
        }
      >
        <ReportAdvancedField
          label="Legal entity"
          hint="None selected includes all entities. Choose one or more to scope the report."
        >
          <LegalEntityMultiSelect
            entities={entities}
            selectedIds={selectedEntityIds}
            onChange={onSelectedEntityIdsChange}
            disabled={entityLoading}
            className="w-full justify-between"
          />
        </ReportAdvancedField>
        <ReportAdvancedField label="Currency" hint={hints.currency}>
          <ReportCurrencySelect
            selectedCurrencyId={currencyId}
            onSelectedCurrencyIdChange={onCurrencyIdChange}
            sortedActiveCurrencies={sortedCurrencies}
            orgDefaultLabel={orgDefaultLabel}
            reportCurrencyCode={reportCurrencyCode}
            selectedCurrencyInMasterList={selectedCurrencyInMasterList}
            currenciesLoading={currenciesLoading}
            entityLoading={entityLoading}
          />
        </ReportAdvancedField>
        <ReportAdvancedField label="Account" hint={hints.account}>
          <ReportAccountFilter
            selectedAccount={account}
            onAccountChange={onAccountChange}
            onAccountClear={onAccountClear}
          />
        </ReportAdvancedField>
        {showActivityField ? (
          <ReportActivityFilterField
            id={`show-nonzero-${path}`}
            checked={showOnlyActivity}
            onCheckedChange={onShowOnlyActivityChange}
          />
        ) : null}
      </ReportAdvancedFilters>
    </div>
  );
}
