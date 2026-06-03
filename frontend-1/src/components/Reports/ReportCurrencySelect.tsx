import { DollarSign } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type CurrencyRow = {
  id: string;
  code: string;
  name: string;
  is_active?: boolean;
};

interface ReportCurrencySelectProps {
  selectedCurrencyId: string;
  onSelectedCurrencyIdChange: (id: string) => void;
  sortedActiveCurrencies: CurrencyRow[];
  orgDefaultLabel: string;
  reportCurrencyCode: string;
  selectedCurrencyInMasterList: boolean;
  currenciesLoading: boolean;
  entityLoading: boolean;
  className?: string;
}

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
}: ReportCurrencySelectProps) {
  return (
    <Select
      value={selectedCurrencyId ? selectedCurrencyId : "__default__"}
      onValueChange={(v) => onSelectedCurrencyIdChange(v === "__default__" ? "" : v)}
      disabled={currenciesLoading && sortedActiveCurrencies.length === 0}
    >
      <SelectTrigger className={cn("h-9 w-full border-slate-300 text-sm", className)}>
        <DollarSign className="h-3.5 w-3.5 mr-1.5 text-slate-500 shrink-0" />
        <SelectValue placeholder={currenciesLoading ? "…" : "Default"} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__default__">{entityLoading ? "…" : orgDefaultLabel}</SelectItem>
        {sortedActiveCurrencies.map((row) => (
          <SelectItem key={row.id || row.code} value={row.id}>
            {row.code.toUpperCase()}
          </SelectItem>
        ))}
        {selectedCurrencyId && !selectedCurrencyInMasterList && (
          <SelectItem value={selectedCurrencyId}>{reportCurrencyCode}</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
