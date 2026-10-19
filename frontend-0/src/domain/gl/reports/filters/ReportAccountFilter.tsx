import { useMemo } from 'react';
import { SearchDropDown } from '@/components/search_dropdown/dropdown';
import { cn } from '@/lib/utils';

export type ReportAccountOption = {
  id?: string;
  name?: string;
  account_name?: string;
};

export function ReportAccountFilter({
  selectedAccount,
  onAccountChange,
  onAccountClear,
  className,
}: {
  selectedAccount?: ReportAccountOption | null;
  onAccountChange?: (account: ReportAccountOption) => void;
  onAccountClear?: () => void;
  className?: string;
}) {
  const instanceValue = useMemo(
    () =>
      selectedAccount?.id
        ? { id: selectedAccount.id, name: selectedAccount.name ?? selectedAccount.account_name }
        : undefined,
    [selectedAccount]
  );

  return (
    <div className={cn('min-w-0', className)}>
      <SearchDropDown
        instanceType="account"
        instanceSourceKey="account_id"
        instanceKey="id"
        instanceLabel="name"
        instanceValue={instanceValue}
        onSelectItem={(_sourceKey: string, _key: string, value: ReportAccountOption) => {
          onAccountChange?.(value);
        }}
        onClear={onAccountClear}
        defaultValue={undefined}
        limit="100"
        searchParams="name"
        placeholder="All accounts"
        style={{ width: '100%' }}
      />
    </div>
  );
}
