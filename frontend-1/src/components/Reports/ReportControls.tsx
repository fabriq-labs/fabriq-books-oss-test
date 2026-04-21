import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { SearchDropDown } from "@/components/search_dropdown/dropdown";
import { RefreshCw } from "lucide-react";

interface ReportControlsProps {
    // Account filter props
    selectedAccount?: any;
    onAccountChange?: (account: any) => void;
    onAccountClear?: () => void;

    // Refresh props
    onRefresh?: () => void;
    loading?: boolean;

    // Optional props
    showAccountFilter?: boolean;
    showRefreshButton?: boolean;
    className?: string;
    /** Extra filters for account search (e.g. legal_entity_id). Passed to SearchDropDown additionalFilters. */
    accountAdditionalFilters?: Record<string, any>;
    /** Client-side filter for account options after fetch (e.g. bank/credit_card only). */
    accountFilterOptions?: (items: any[]) => any[];
    /** Rendered before the refresh button (e.g. FY selector, month dropdown, currency). */
    beforeRefresh?: React.ReactNode;
    /** If true, do not fetch accounts on initial render — wait for user to type. */
    skipInitialAccountSearch?: boolean;
    /** Key for the account dropdown — change to remount/reset it (e.g. when entity switches). */
    accountKey?: string;
}

export const ReportControls: React.FC<ReportControlsProps> = ({
    selectedAccount,
    onAccountChange,
    onAccountClear,
    onRefresh,
    loading = false,
    showAccountFilter = true,
    showRefreshButton = true,
    className = "",
    accountAdditionalFilters,
    accountFilterOptions,
    beforeRefresh,
    skipInitialAccountSearch = false,
    accountKey,
}) => {
    const accountDropdown = useMemo(
        () => (
            <div className="w-full sm:w-44">
                <SearchDropDown
                    key={accountKey}
                    instanceType={"account"}
                    instanceSourceKey={"account_id"}
                    instanceKey="id"
                    instanceLabel={"name"}
                    instanceValue={selectedAccount && selectedAccount.id ? {
                        id: selectedAccount.id,
                        name: selectedAccount.name,
                    } : undefined}
                    onSelectItem={(_sourceKey: any, _key: any, value: any, _fields: any) => {
                        if (onAccountChange) onAccountChange(value);
                    }}
                    onClear={onAccountClear}
                    defaultValue={undefined}
                    limit="100"
                    searchParams={"name"}
                    placeholder="All Accounts"
                    style={{ width: "100%" }}
                    additionalFilters={accountAdditionalFilters}
                    filterOptions={accountFilterOptions}
                    skipApiCall={skipInitialAccountSearch}
                />
            </div>
        ),
        [selectedAccount, onAccountChange, onAccountClear, accountAdditionalFilters, accountFilterOptions, skipInitialAccountSearch, accountKey]
    );

    return (
        <div className={`flex flex-col sm:flex-row sm:justify-end gap-3 items-stretch sm:items-center ${className}`}>
            {showAccountFilter && accountDropdown}

            {beforeRefresh}

            {showRefreshButton && (
                <Button
                    onClick={onRefresh}
                    disabled={loading}
                    className="flex items-center gap-2 bg-primary hover:bg-primary/90"
                >
                    {loading ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                        <RefreshCw className="h-4 w-4" />
                    )}
                </Button>
            )}
        </div>
    );
};

export default ReportControls;
