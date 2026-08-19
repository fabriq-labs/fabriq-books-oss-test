import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { SearchDropDown } from "@/components/search_dropdown/dropdown";
import { Play, RefreshCw } from "lucide-react";

interface ReportControlsProps {
    selectedAccount?: any;
    onAccountChange?: (account: any) => void;
    onAccountClear?: () => void;

    onRefresh?: () => void;
    loading?: boolean;
    /** When true, highlight the run button — filters changed since last run. */
    filtersDirty?: boolean;

    showAccountFilter?: boolean;
    showRefreshButton?: boolean;
    className?: string;
    accountAdditionalFilters?: Record<string, any>;
    accountFilterOptions?: (items: any[]) => any[];
    beforeRefresh?: React.ReactNode;
    skipInitialAccountSearch?: boolean;
    accountKey?: string;
    /** Button label. Financial reports use "Run report"; transaction lists use "Refresh". */
    runButtonLabel?: string;
}

export const ReportControls: React.FC<ReportControlsProps> = ({
    selectedAccount,
    onAccountChange,
    onAccountClear,
    onRefresh,
    loading = false,
    filtersDirty = false,
    showAccountFilter = true,
    showRefreshButton = true,
    className = "",
    accountAdditionalFilters,
    accountFilterOptions,
    beforeRefresh,
    skipInitialAccountSearch = false,
    accountKey,
    runButtonLabel = "Run report",
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

    const isRefreshLabel = runButtonLabel.toLowerCase() === "refresh";

    return (
        <div className={`flex flex-col sm:flex-row sm:justify-end gap-3 items-stretch sm:items-center ${className}`}>
            {showAccountFilter && accountDropdown}

            {beforeRefresh}

            {showRefreshButton && (
                <Button
                    onClick={onRefresh}
                    disabled={loading}
                    className={`flex items-center gap-2 shrink-0 ${
                        filtersDirty
                            ? "bg-primary hover:bg-primary/90 ring-2 ring-offset-1 ring-primary/40"
                            : "bg-primary hover:bg-primary/90"
                    }`}
                    title={filtersDirty ? "Filters changed — click to load updated results" : undefined}
                >
                    {loading ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : isRefreshLabel ? (
                        <RefreshCw className="h-4 w-4" />
                    ) : (
                        <Play className="h-4 w-4" />
                    )}
                    {runButtonLabel}
                </Button>
            )}
        </div>
    );
};

export default ReportControls;
