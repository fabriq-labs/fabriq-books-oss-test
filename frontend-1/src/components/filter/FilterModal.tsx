import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { CalendarIcon, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterInputs } from "./FilterInputs";
import { FilterOperators } from "./FilterOperators";

interface FilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApplyFilters: (filters: Record<string, any>) => void;
    initialFilters: Record<string, any>;
    metaData: Record<string, any>;
    dateRangeFilter?: {
        key: string;
        label: string;
        dateRange: {
            from: Date | null;
            to: Date | null;
        }
        setDateRange: React.Dispatch<React.SetStateAction<{ from: Date | null; to: Date | null }>>;
    };
}

type FilterType = {
    field: string;
    operator: string;
    value: string | Date | null;
};



export function FilterModal({ isOpen, onClose, onApplyFilters, initialFilters, metaData, dateRangeFilter }: FilterModalProps) {
    const [filters, setFilters] = useState<FilterType[]>([]);
    const [selectFilterValues, setSelectFilterValues] = useState<Record<string, any>>([]);

    const { dateRange, setDateRange } = dateRangeFilter

    useEffect(() => {
        const initFilters: FilterType[] = [];

        // Convert initial filters to array format
        if (Object.keys(initialFilters).length > 0) {
            Object.entries(initialFilters).forEach(([field, conditions]) => {
                if (dateRangeFilter.key !== field) {
                    // Check if the conditions have an OR property (multiple conditions)
                    if (conditions.OR && Array.isArray(conditions.OR)) {
                        // Handle multiple conditions for the same field
                        conditions.OR.forEach((condition: Record<string, any>) => {
                            const [operator, value] = Object.entries(condition)[0];
                            initFilters.push({ field, operator, value });
                        });
                    } else {
                        // Handle single condition
                        const [operator, value] = Object.entries(conditions as Record<string, any>)[0];
                        initFilters.push({ field, operator, value });
                    }
                }
            });
        } else {
            initFilters.push({ field: "", operator: "eq", value: "" });
        }

        setFilters(initFilters);
    }, [initialFilters, isOpen]);

    const addFilter = () => {
        setFilters([...filters, { field: "", operator: "eq", value: "" }]);
    };

    const removeFilter = (index: number) => {
        setFilters(filters.filter((_, i) => i !== index));
    };

    const updateFilter = (index: number, field: string, value: any) => {

        const newFilters = [...filters];
        newFilters[index] = { ...newFilters[index], [field]: value };

        setFilters(newFilters);
    };

    const handleApplyFilters = () => {
        // Create an object to group filters by field
        const groupedFilters: Record<string, any[]> = {};

        // Group filters by field name
        // filters.forEach(filter => {
        //     if (filter.field && filter.value) {
        //         if (!groupedFilters[filter.field]) {
        //             groupedFilters[filter.field] = [];
        //         }
        //         groupedFilters[filter.field].push({
        //             [filter.operator]: filter.value
        //         });
        //     }
        // });
        filters.forEach(filter => {
            if (filter.field && (filter.value || filter.operator === 'is_null' || filter.operator === 'is_not_null')) {
                if (!groupedFilters[filter.field]) {
                    groupedFilters[filter.field] = [];
                }
                // For null operators, we don't need a value
                if (filter.operator === 'is_null' || filter.operator === 'is_not_null') {
                    groupedFilters[filter.field].push({
                        [filter.operator]: null
                    });
                } else {
                    groupedFilters[filter.field].push({
                        [filter.operator]: filter.value
                    });
                }
            }
        });

        // Convert grouped filters to the desired format
        const formattedFilters: Record<string, any> = {};

        Object.entries(groupedFilters).forEach(([field, conditions]) => {
            if (conditions.length === 1) {
                // If there's only one condition for this field, use the simple format
                formattedFilters[field] = conditions[0];
            } else {
                // If there are multiple conditions for this field, use an array format
                formattedFilters[field] = {
                    OR: conditions
                };
            }
        });

        // Handle date range filter
        if (dateRangeFilter.dateRange.from && dateRangeFilter.dateRange.to) {
            const startDate = new Date(dateRangeFilter.dateRange.from);
            const endDate = new Date(dateRangeFilter.dateRange.to);

            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);

            const startIso = startDate.toISOString().split('T')[0];
            const endIso = endDate.toISOString().split('T')[0];

            formattedFilters[dateRangeFilter?.key] = {
                gte: startDate,
                lte: endDate
            };
        }
        onApplyFilters(formattedFilters);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px] rounded-lg">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-[#403E43]">Filter</DialogTitle>
                </DialogHeader>

                {metaData && <div className="space-y-4 py-4">
                    {filters && filters.map((filter, index) => (
                        <div key={index} className="flex gap-2 items-center">
                            <Select
                                value={filter.field}
                                onValueChange={(value) => updateFilter(index, "field", value)}
                            >
                                <SelectTrigger className="w-[170px] bg-[#F1F0FB] border-[#E5DEFF]">
                                    <SelectValue placeholder="Select field" />
                                </SelectTrigger>
                                <SelectContent>
                                    {metaData && Object.entries(metaData)
                                        .filter(([key, value]) => {
                                            // Only show fields that are columns and not dates
                                            const isColumnAndNotDate = value?.isColumnShow && value?.datatype != "date";
                                            // Don't show fields that are already selected in other filters
                                            const isNotAlreadySelected = !filters.some((f, i) => i !== index && f.field === key);
                                            return isColumnAndNotDate && isNotAlreadySelected;
                                        })
                                        .map(([key, value]) => (
                                            <SelectItem key={key} value={key}>{value.displayName}</SelectItem>
                                        ))
                                    }
                                </SelectContent>
                            </Select>


                            {metaData[filters[index].field] && (
                                <FilterOperators
                                    value={filter.operator}
                                    onChange={(value) => updateFilter(index, "operator", value)}
                                    col={metaData[filters[index].field]}
                                />
                            )}

                            {metaData[filters[index].field] &&
                                <FilterInputs
                                    className="flex-1 bg-[#F1F0FB] border-[#E5DEFF]"
                                    value={String(filter.value)}
                                    onChange={(val) => updateFilter(index, "value", val)}
                                    col={metaData[filters[index].field]}
                                    setSelectFilterValues={setSelectFilterValues}
                                    selectFilterValues={selectFilterValues}
                                    operator={filter.operator}
                                />
                            }

                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeFilter(index)}
                                disabled={filters.length === 1}
                                className="hover:bg-[#FDE1D3]"
                            >
                                <X className="h-4 w-4 text-[#d946ef]" />
                            </Button>
                        </div>
                    ))}
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1 text-[#9b87f5] border-[#9b87f5] hover:bg-[#E5DEFF] font-semibold"
                        onClick={addFilter}
                    >
                        <Plus className="h-4 w-4" /> Add filter
                    </Button>

                    {dateRangeFilter?.key && <div className="space-y-2">
                        <Label className="font-semibold text-[#403E43]">{dateRangeFilter?.label}</Label>
                        <div className="grid gap-2">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        id="date"
                                        variant="outline"
                                        className={cn(
                                            "w-full justify-start text-left font-normal bg-[#F1F0FB] border-[#E5DEFF]",
                                            !dateRange.from && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4 text-[#9b87f5]" />
                                        {dateRange.from ? (
                                            dateRange.to ? (
                                                <>
                                                    {format(dateRange.from, "dd-MM-y")} - {format(dateRange.to, "dd-MM-y")}
                                                </>
                                            ) : (
                                                format(dateRange.from, "dd-MM-y")
                                            )
                                        ) : (
                                            <span>Select a date</span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        initialFocus
                                        mode="range"
                                        defaultMonth={dateRange.from}
                                        selected={{ from: dateRange.from, to: dateRange.to }}
                                        onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })} numberOfMonths={2}
                                        className="p-3 pointer-events-auto"
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                    }
                </div>
                }

                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose} className="px-6 text-[#403E43] border-[#E5DEFF] bg-[#f3f3f3]">
                        Cancel
                    </Button>
                    <Button
                        variant="default"
                        className="px-6 bg-primary hover:bg-primary text-white font-bold shadow-none"
                        onClick={handleApplyFilters}
                    >
                        Apply Filters
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}