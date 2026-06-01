import { useMemo } from "react";
import { SearchDropDown } from "@/components/search_dropdown/dropdown";
import { cn } from "@/lib/utils";

interface ReportAccountFilterProps {
  selectedAccount?: any;
  onAccountChange?: (account: any) => void;
  onAccountClear?: () => void;
  accountAdditionalFilters?: Record<string, any>;
  accountFilterOptions?: (items: any[]) => any[];
  skipInitialAccountSearch?: boolean;
  accountKey?: string;
  className?: string;
}

export function ReportAccountFilter({
  selectedAccount,
  onAccountChange,
  onAccountClear,
  accountAdditionalFilters,
  accountFilterOptions,
  skipInitialAccountSearch = false,
  accountKey,
  className,
}: ReportAccountFilterProps) {
  const instanceValue = useMemo(
    () =>
      selectedAccount?.id
        ? { id: selectedAccount.id, name: selectedAccount.name ?? selectedAccount.account_name }
        : undefined,
    [selectedAccount]
  );

  return (
    <div className={cn("min-w-0", className)}>
      <SearchDropDown
        key={accountKey}
        instanceType="account"
        instanceSourceKey="account_id"
        instanceKey="id"
        instanceLabel="name"
        instanceValue={instanceValue}
        onSelectItem={(_sourceKey: any, _key: any, value: any, _fields: any) => {
          onAccountChange?.(value);
        }}
        onClear={onAccountClear}
        defaultValue={undefined}
        limit="100"
        searchParams="name"
        placeholder="All accounts"
        style={{ width: "100%" }}
        additionalFilters={accountAdditionalFilters}
        filterOptions={accountFilterOptions}
        skipApiCall={skipInitialAccountSearch}
      />
    </div>
  );
}
