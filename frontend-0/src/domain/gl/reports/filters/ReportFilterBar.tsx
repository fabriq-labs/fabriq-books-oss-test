import { Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  buildFYOptions,
  buildMonthOptions,
  type FinancialYearOption,
  type MonthOption,
} from './financialYear';
import { ReportAdvancedField, ReportAdvancedFilters, ReportAdvancedSummaryChip } from './ReportAdvancedFilters';

export type ReportCurrency = {
  id: string;
  code?: string;
  name?: string;
};

export function ReportFilterBar({
  title,
  reportCurrency,
  financialYear,
  onFinancialYearChange,
  month,
  onMonthChange,
  entityLabel,
  currencies,
  currencyId,
  onCurrencyIdChange,
  loading,
  dirty,
  onRun,
}: {
  title: string;
  reportCurrency: string | null;
  financialYear: FinancialYearOption;
  onFinancialYearChange: (option: FinancialYearOption) => void;
  month: MonthOption | null;
  onMonthChange: (month: MonthOption | null) => void;
  entityLabel: string;
  currencies: ReportCurrency[];
  currencyId: string;
  onCurrencyIdChange: (id: string) => void;
  loading: boolean;
  dirty: boolean;
  onRun: () => void;
}) {
  const years = buildFYOptions('JAN_DEC', 5);
  const months = buildMonthOptions(financialYear);
  const selectedCurrency = currencies.find((currency) => currency.id === currencyId);
  const currencyChip = selectedCurrency?.code || (currencyId ? currencyId : reportCurrency || 'Organization currency');

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
            <SelectTrigger className="h-9 w-[168px] shrink-0 border-slate-300 text-sm">
              <SelectValue placeholder="All months" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All months</SelectItem>
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
            title={dirty ? 'Filters changed. Run the report to load them.' : undefined}
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
            <ReportAdvancedSummaryChip>{entityLabel}</ReportAdvancedSummaryChip>
            <ReportAdvancedSummaryChip>{currencyChip}</ReportAdvancedSummaryChip>
          </>
        }
      >
        <ReportAdvancedField
          label="Legal entity"
          hint="Chosen in the top bar. All Entities includes every posting, including those with no entity."
        >
          <div className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-700">
            {entityLabel}
          </div>
        </ReportAdvancedField>
        <ReportAdvancedField
          label="Currency"
          hint="Reporting currency. The organization currency is used when this stays on the default."
        >
          <Select
            value={currencyId || '__default__'}
            onValueChange={(value) => onCurrencyIdChange(value === '__default__' ? '' : value)}
          >
            <SelectTrigger className="h-9 w-full border-slate-300 text-sm">
              <SelectValue placeholder="Organization currency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">Organization currency</SelectItem>
              {currencies.map((currency) => (
                <SelectItem key={currency.id} value={currency.id}>
                  {(currency.code || currency.id).toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ReportAdvancedField>
      </ReportAdvancedFilters>
    </div>
  );
}
