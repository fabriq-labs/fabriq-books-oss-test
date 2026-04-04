import React, { useMemo } from "react";
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
        tempEndYear,
        setTempEndYear,
    } = useReportController();

    // Handle custom date input changes (temporary values)
    const handleCustomDateInputChange = (field: 'start' | 'end', value: string) => {
        if (field === 'start') {
            setTempStartYear(value);
            // Auto-calculate end year as start year + 1
            const startYear = parseInt(value);
            if (!isNaN(startYear) && startYear >= 2000 && startYear <= 2100) {
                setTempEndYear((startYear + 1).toString());
            }
        }
    };

    // Handle Enter key press to apply custom date changes
    const handleEnterKeyPress = (field: 'start' | 'end', value: string) => {
        const year = parseInt(value);
        if (isNaN(year) || year < 2000 || year > 2100) return;

        // Just store the year value, don't update dateRange yet
        // The dateRange will be updated when "Fetch Data" is clicked
        if (field === 'start') {
            setTempStartYear(value);
            // Auto-calculate end year as start year + 1
            setTempEndYear((year + 1).toString());
        }
    };

    // Handle select change for predefined ranges
    const handleSelectChange = (value: string) => {
        setSelectedOption(value);
        setIsCustomDate(value === "custom");

        if (value === "custom") {
            // Initialize temporary year values with current date range
            setTempStartYear(dateRange[0].year().toString());
            setTempEndYear(dateRange[1].year().toString());
            return; // Don't update dateRange for custom option
        }

        let startDate: dayjs.Dayjs, endDate: dayjs.Dayjs;

        switch (value) {
            case "currentCalendarYear":
                startDate = dayjs().startOf('year');
                endDate = dayjs().endOf('year');
                break;
            case "previousCalendarYear":
                startDate = dayjs().subtract(1, 'year').startOf('year');
                endDate = dayjs().subtract(1, 'year').endOf('year');
                break;
            case "currentFinancialYear":
                startDate = dayjs();
                if (startDate.month() < 3) {
                    startDate = startDate.subtract(1, 'year');
                }
                startDate = startDate.month(3).startOf('month');
                endDate = startDate.add(1, 'year').subtract(1, 'day').endOf('month');
                break;
            case "previousFinancialYear":
                startDate = dayjs();
                if (startDate.month() < 3) {
                    startDate = startDate.subtract(2, 'year');
                } else {
                    startDate = startDate.subtract(1, 'year');
                }
                startDate = startDate.month(3).startOf('month');
                endDate = startDate.add(1, 'year').subtract(1, 'day').endOf('month');
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
            let newStartDate = dateRange[0];
            let newEndDate = dateRange[1];

            const startYear = parseInt(tempStartYear);
            if (!isNaN(startYear) && startYear >= 2000 && startYear <= 2100) {
                newStartDate = dayjs().year(startYear).month(3).date(1); // April 1st
                // Auto-calculate end year as start year + 1
                const endYear = startYear + 1;
                newEndDate = dayjs().year(endYear).month(2).endOf('month'); // March 31st
            }

            // Update the dateRange with the new values
            setDateRange([newStartDate, newEndDate]);
        }
        if (onRefresh) {
            onRefresh();
        }
    };

    // Account dropdown component
    const accountDropdown = useMemo(
        () => (
            <div className="w-full sm:w-48">
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
        <div className={`flex flex-col sm:flex-row sm:justify-end gap-4 ${className}`}>
            {/* Account Filter */}
            {showAccountFilter && accountDropdown}

            {/* Date Range Selection */}
            <Select value={selectedOption} onValueChange={handleSelectChange}>
                <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Select Time Frame" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="currentFinancialYear">Current Financial Year</SelectItem>
                    <SelectItem value="previousFinancialYear">Previous Financial Year</SelectItem>
                    <SelectItem value="currentCalendarYear">Current Calendar Year</SelectItem>
                    <SelectItem value="previousCalendarYear">Previous Calendar Year</SelectItem>
                    <SelectItem value="custom">Custom Date</SelectItem>
                </SelectContent>
            </Select>

            {/* Custom Date Inputs */}
            {isCustomDate && (
                <div className="flex gap-4">
                    <Input
                        type="number"
                        placeholder="Start Year"
                        value={tempStartYear}
                        onChange={(e) => handleCustomDateInputChange('start', e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleEnterKeyPress('start', tempStartYear);
                            }
                        }}
                        className="w-24"
                        min="2000"
                        max="2100"
                    />
                    <Input
                        type="number"
                        placeholder="End Year"
                        value={tempEndYear}
                        disabled
                        className="w-24 bg-gray-100"
                        min="2000"
                        max="2100"
                    />
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



