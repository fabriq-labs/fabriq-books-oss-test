import { DollarSign } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type CurrencyRow = {
  id: string;
  code?: string;
  name?: string;
};

export function ReportCurrencySelect({
  selectedCurrencyId,
  onSelectedCurrencyIdChange,
  sortedActiveCurrencies,
  orgDefaultLabel,
  reportCurrencyCode,
  selectedCurrencyInMasterList,
  currenciesLoading,
  entityLoading,
  className,
}: {
  selectedCurrencyId: string;
  onSelectedCurrencyIdChange: (id: string) => void;
  sortedActiveCurrencies: CurrencyRow[];
  orgDefaultLabel: string;
  reportCurrencyCode: string;
  selectedCurrencyInMasterList: boolean;
  currenciesLoading: boolean;
  entityLoading: boolean;
  className?: string;
}) {
  return (
    <Select
      value={selectedCurrencyId ? selectedCurrencyId : '__default__'}
      onValueChange={(value) => onSelectedCurrencyIdChange(value === '__default__' ? '' : value)}
      disabled={currenciesLoading && sortedActiveCurrencies.length === 0}
    >
      <SelectTrigger className={cn('h-9 w-full border-slate-300 text-sm', className)}>
        <DollarSign className="mr-1.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
        <SelectValue placeholder={currenciesLoading ? '…' : 'Default'} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__default__">{entityLoading ? '…' : orgDefaultLabel}</SelectItem>
        {sortedActiveCurrencies.map((row) => (
          <SelectItem key={row.id || row.code} value={row.id}>
            {(row.code || row.id).toUpperCase()}
          </SelectItem>
        ))}
        {selectedCurrencyId && !selectedCurrencyInMasterList ? (
          <SelectItem value={selectedCurrencyId}>{reportCurrencyCode}</SelectItem>
        ) : null}
      </SelectContent>
    </Select>
  );
}
