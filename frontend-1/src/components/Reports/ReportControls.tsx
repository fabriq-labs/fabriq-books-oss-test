import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { SearchDropDown } from "@/components/search_dropdown/dropdown";
import { RefreshCw } from "lucide-react";
import dayjs from "dayjs";
import { useReportController } from "@/contexts/ReportControllerContext";

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
}) => {
    const {
        dateRange,
        setDateRange,
        selectedOption,
        setSelectedOption,
        isCustomDate,
        setIsCustomDate,
        tempStartYear,
        setTempStartYear,
        setTempEndYear,
    } = useReportController();

    // For "Custom" month selection (temp until user hits Refresh / Fetch)
    const [tempCustomMonthIndex, setTempCustomMonthIndex] = useState<number>(() => {
        // Default to currently selected start month (or current month)
        const m = dateRange?.[0]?.month?.();
        return typeof m === "number" ? m : dayjs().month();
    });

    // Handle select change for predefined ranges
    const handleSelectChange = (value: string) => {
        setSelectedOption(value);
        setIsCustomDate(value === "custom");

        if (value === "custom") {
            // Initialize temporary year values with current date range
            setTempStartYear(dateRange[0].year().toString());
            setTempEndYear(dateRange[0].year().toString());
            setTempCustomMonthIndex(dateRange[0].month());
            return; // Don't update dateRange for custom option
        }

        let startDate: dayjs.Dayjs, endDate: dayjs.Dayjs;

        switch (value) {
            case "currentMonth":
                startDate = dayjs().startOf("month");
                endDate = dayjs().endOf("month");
                break;
            case "previousMonth":
                startDate = dayjs().subtract(1, "month").startOf("month");
                endDate = dayjs().subtract(1, "month").endOf("month");
                break;

            default:
                return;
        }
        setDateRange([startDate, endDate]);
    };

    // Handle refresh button click
    const handleRefresh = () => {
        // Apply custom year inputs if they exist and custom date is selected
        if (isCustomDate && tempStartYear) {
            const year = parseInt(tempStartYear);
            if (!isNaN(year) && year >= 2000 && year <= 2100) {
                const newStartDate = dayjs().year(year).month(tempCustomMonthIndex).date(1).startOf("day");
                const newEndDate = newStartDate.endOf("month").endOf("day");
                setDateRange([newStartDate, newEndDate]);
            }
        }
        if (onRefresh) {
            onRefresh();
        }
    };

    // Account dropdown component
    const accountDropdown = useMemo(
        () => (
            <div className="w-full sm:w-44">
                <SearchDropDown
                    instanceType={"account"}
                    instanceSourceKey={"account_id"}
                    instanceKey="id"
                    instanceLabel={"name"}
                    instanceValue={selectedAccount && selectedAccount.id ? {
                        id: selectedAccount.id,
                        name: selectedAccount.name,
                    } : undefined}
                    onSelectItem={(sourceKey: any, key: any, value: any, fields: any) => {
                        if (onAccountChange) {
                            onAccountChange(value);
                        }
                    }}
                    onClear={onAccountClear}
                    defaultValue={undefined}
                    limit="100"
                    searchParams={"name"}
                    placeholder="Select Account"
                    style={{ width: "100%" }}
                    additionalFilters={accountAdditionalFilters}
                    filterOptions={accountFilterOptions}
                />
            </div>
        ),
        [selectedAccount, onAccountChange, onAccountClear, accountAdditionalFilters, accountFilterOptions]
    );

    return (
        <div className={`flex flex-col sm:flex-row sm:justify-end gap-3 items-stretch sm:items-center ${className}`}>
            {/* Account Filter */}
            {showAccountFilter && accountDropdown}

            {/* Date Range Selection */}
            <Select value={selectedOption} onValueChange={handleSelectChange}>
                <SelectTrigger className="h-10 w-full sm:w-44">
                    <SelectValue placeholder="Select Time Frame" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="currentMonth">Current Month</SelectItem>
                    <SelectItem value="previousMonth">Previous Month</SelectItem>

                    <SelectItem value="custom">Custom Date</SelectItem>
                </SelectContent>
            </Select>

            {/* Custom Date Inputs */}
            {isCustomDate && (
                <div className="flex flex-col sm:flex-row items-start gap-3">
                    <Input
                        type="number"
                        placeholder="Year"
                        value={tempStartYear}
                        onChange={(e) => setTempStartYear(e.target.value)}
                        className="h-10 w-28"
                        min="2000"
                        max="2100"
                    />

                    <Select
                        value={String(tempCustomMonthIndex)}
                        onValueChange={(v) => setTempCustomMonthIndex(parseInt(v))}
                    >
                        <SelectTrigger className="h-10 w-full sm:w-44">
                            <SelectValue placeholder="Select Month" />
                        </SelectTrigger>
                        <SelectContent className="max-h-40 overflow-y-auto">
                            {[
                                "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
                            ].map((label, idx) => (
                                <SelectItem key={label} value={String(idx)} className="py-1 text-sm">
                                    {label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            {/* Refresh Button */}
            {showRefreshButton && (
                <Button
                    onClick={handleRefresh}
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



