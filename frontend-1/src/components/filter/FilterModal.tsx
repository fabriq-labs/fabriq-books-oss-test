import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { CalendarIcon, X, Plus } from "lucide-react";
import { FilterInputs } from "./FilterInputs";
import { FilterOperators } from "./FilterOperators";
import type { FilterEnhancements } from "@/types/customRowRenderer";

interface FilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApplyFilters: (filters: Record<string, any>) => void;
    initialFilters: Record<string, any>;
    metaData: Record<string, any>;
    filterEnhancements?: FilterEnhancements;
    /** Pre-populated id→label cache owned by Master; carried into the modal on open */
    initialFilterLabels?: Record<string, string>;
    /** Reports the accumulated id→label map back to Master when filters are applied */
    onApplyFilterLabels?: (labels: Record<string, string>) => void;
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
    values: string[];
};



export function FilterModal({ isOpen, onClose, onApplyFilters, initialFilters, metaData, filterEnhancements, initialFilterLabels, onApplyFilterLabels, dateRangeFilter }: FilterModalProps) {
    const [filters, setFilters] = useState<FilterType[]>([]);
    /** Accumulated id→label map for all select fields across all filter rows */
    const [allSelectLabels, setAllSelectLabels] = useState<Record<string, string>>({});
    const dateRange = dateRangeFilter?.dateRange;
    const setDateRange = dateRangeFilter?.setDateRange;

    useEffect(() => {
        const initFilters: FilterType[] = [];

        // Convert initial filters to array format
        if (Object.keys(initialFilters).length > 0) {
            Object.entries(initialFilters).forEach(([field, conditions]) => {
                if (dateRangeFilter?.key === field) return;

                // Root-level OR from multi-value mixed-op filter (e.g. ncontains × 2).
                // Reconstruct as a single filter row when all entries share the same field+op.
                if (field === 'OR' && Array.isArray(conditions) && conditions.length > 0) {
                    const orConds = conditions as Record<string, any>[];
                    const [orField, orFieldOp] = Object.entries(orConds[0])[0] || [];
                    if (orField && orFieldOp && typeof orFieldOp === 'object') {
                        const [operator] = Object.entries(orFieldOp)[0] || [];
                        const allSame = operator && orConds.every(c => {
                            const [f, v] = Object.entries(c)[0] || [];
                            return f === orField && typeof v === 'object' && Object.keys(v as object)[0] === operator;
                        });
                        if (allSame) {
                            const values = orConds.map(c => {
                                const [, v] = Object.entries(c)[0] || [];
                                return String(Object.values(v as Record<string, any>)[0]);
                            });
                            initFilters.push({ field: orField, operator, values });
                        }
                    }
                    return;
                }

                const typedConditions = conditions as Record<string, any>;

                // Multi-eq serialised as { in: [...] }
                if (Array.isArray(typedConditions?.in)) {
                    initFilters.push({ field, operator: "eq", values: typedConditions.in.map(String) });
                    return;
                }
                // Multi-neq serialised as { nin: [...] }
                if (Array.isArray(typedConditions?.nin)) {
                    initFilters.push({ field, operator: "neq", values: typedConditions.nin.map(String) });
                    return;
                }
                // Legacy field-level OR (may come from old saved filters)
                if (typedConditions?.OR && Array.isArray(typedConditions.OR)) {
                    const firstCondition = typedConditions.OR[0] as Record<string, any> | undefined;
                    const [operator] = firstCondition ? Object.entries(firstCondition)[0] : ["eq", ""];
                    const values = typedConditions.OR
                        .map((condition: Record<string, any>) => condition?.[operator])
                        .filter((value: any) => value !== null && value !== undefined && value !== "")
                        .map((value: any) => String(value));
                    initFilters.push({ field, operator, values });
                    return;
                }

                const [operator, value] = Object.entries(typedConditions)[0] || ["eq", ""];
                initFilters.push({
                    field,
                    operator,
                    values: operator === "is_null" || operator === "is_not_null"
                        ? []
                        : value !== undefined && value !== null && value !== ""
                            ? [String(value)]
                            : [],
                });
            });
        } else {
            initFilters.push({ field: "", operator: "eq", values: [] });
        }

        setFilters(initFilters.length > 0 ? initFilters : [{ field: "", operator: "eq", values: [] }]);
    }, [initialFilters, isOpen, dateRangeFilter?.key]);

    useEffect(() => {
        if (isOpen) setAllSelectLabels(initialFilterLabels ?? {});
    }, [isOpen, initialFilterLabels]);

    const addFilter = () => {
        setFilters([...filters, { field: "", operator: "eq", values: [] }]);
    };

    const removeFilter = (index: number) => {
        setFilters(filters.filter((_, i) => i !== index));
    };

    const updateFilter = (index: number, field: string, value: any) => {

        const newFilters = [...filters];
        if (field === "field") {
            newFilters[index] = { field: value, operator: "eq", values: [] };
        } else if (field === "operator") {
            const isNullOperator = value === "is_null" || value === "is_not_null";
            newFilters[index] = {
                ...newFilters[index],
                operator: value,
                values: isNullOperator ? [] : newFilters[index].values,
            };
        } else if (field === "values") {
            newFilters[index] = { ...newFilters[index], values: value };
        }

        setFilters(newFilters);
    };

    const handleApplyFilters = () => {
        const groupedFilters: Record<string, any[]> = {};

        filters.forEach((filter) => {
            if (!filter.field) return;

            if (filter.operator === 'is_null' || filter.operator === 'is_not_null') {
                groupedFilters[filter.field] = [{ [filter.operator]: null }];
                return;
            }

            const validValues = filter.values
                .map((value) => value?.trim?.() ?? value)
                .filter((value) => value !== "");

            if (validValues.length === 0) return;

            if (!groupedFilters[filter.field]) {
                groupedFilters[filter.field] = [];
            }
            validValues.forEach((value) => {
                groupedFilters[filter.field].push({ [filter.operator]: value });
            });
        });

        const formattedFilters: Record<string, any> = {};
        // Collect multi-op OR fields for root-level expansion (e.g. multi-contains)
        const orGroups: Array<Record<string, any>[]> = [];

        Object.entries(groupedFilters).forEach(([field, conditions]) => {
            if (conditions.length === 1) {
                formattedFilters[field] = conditions[0];
                return;
            }
            const firstOp = Object.keys(conditions[0])[0];
            const allSameOp = conditions.every(c => Object.keys(c)[0] === firstOp);

            if (allSameOp && firstOp === "eq") {
                // Multi-eq → backend 'in' operator (already understood by DAL)
                formattedFilters[field] = { in: conditions.map(c => c.eq) };
            } else if (allSameOp && firstOp === "neq") {
                // Multi-neq → backend 'nin' operator
                formattedFilters[field] = { nin: conditions.map(c => c.neq) };
            } else {
                // Other ops (e.g. contains, gt) → root-level OR expansion
                orGroups.push(conditions.map(c => ({ [field]: c })));
            }
        });

        // Merge OR groups into the filter object the backend already handles
        if (orGroups.length === 1) {
            formattedFilters.OR = orGroups[0];
        } else if (orGroups.length > 1) {
            // Multiple fields with mixed-op multi-values: wrap in AND of ORs
            const existing = Array.isArray(formattedFilters.AND) ? formattedFilters.AND : [];
            formattedFilters.AND = [...existing, ...orGroups.map(group => ({ OR: group }))];
        }

        // Handle date range filter
        if (dateRangeFilter?.dateRange.from && dateRangeFilter?.dateRange.to) {
            const startDate = new Date(dateRangeFilter.dateRange.from);
            const endDate = new Date(dateRangeFilter.dateRange.to);

            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);

            formattedFilters[dateRangeFilter?.key] = {
                gte: startDate,
                lte: endDate
            };
        }
        onApplyFilterLabels?.(allSelectLabels);
        onApplyFilters(formattedFilters);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[700px] rounded-lg">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-[#403E43]">Filters</DialogTitle>
                    <p className="text-xs text-[#6b7280] mt-1">
                        Multiple values for the same field use <span className="font-semibold text-[#7028a0]">OR</span>. Different fields use <span className="font-semibold text-[#374151]">AND</span>.
                    </p>
                </DialogHeader>

                {metaData && <div className="space-y-4 py-4">
                    {filters && filters.map((filter, index) => (
                        <div key={index} className="grid grid-cols-[48px_170px_110px_minmax(0,1fr)_36px] gap-2 items-start">
                            <div className="w-12 flex justify-center pt-2">
                                {index === 0 ? (
                                    <span className="text-[11px] text-[#9ca3af] font-semibold select-none">WHERE</span>
                                ) : (
                                    <span className="text-[10px] font-bold tracking-[.06em] text-[#64748b] bg-[#f1f5f9] rounded-[3px] px-[5px] py-px select-none">AND</span>
                                )}
                            </div>
                            <Select value={filter.field} onValueChange={(value) => updateFilter(index, "field", value)}>
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


                            {metaData[filters[index].field] ? (
                                <FilterOperators
                                    value={filter.operator}
                                    onChange={(value) => updateFilter(index, "operator", value)}
                                    col={metaData[filters[index].field]}
                                    className="w-[110px] bg-[#F1F0FB] border-[#E5DEFF]"
                                />
                            ) : (
                                <div />
                            )}

                            {metaData[filters[index].field]
                                ? <FilterInputs
                                    className="flex-1 bg-[#F1F0FB] border-[#E5DEFF]"
                                    values={filter.values}
                                    onChange={(val) => updateFilter(index, "values", val)}
                                    col={metaData[filters[index].field]}
                                    operator={filter.operator}
                                    filterEnhancement={filterEnhancements?.[filter.field]}
                                    selectLabels={allSelectLabels}
                                    onLabelResolved={(id, label) =>
                                        setAllSelectLabels(prev => ({ ...prev, [id]: label }))
                                    }
                                />
                                : <div />
                            }

                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeFilter(index)}
                                disabled={filters.length === 1}
                                className="hover:bg-[#FDE1D3] mt-1"
                            >
                                <X className="h-4 w-4 text-[#d946ef]" />
                            </Button>
                        </div>
                    ))}
                    <button
                        type="button"
                        className="ml-12 inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-semibold text-[#7028a0] bg-white border border-[#d1a9e4] rounded-md hover:bg-[#f5ebf9] transition-colors"
                        onClick={addFilter}
                    >
                        <Plus className="h-3.5 w-3.5" /> Add filter row
                    </button>

                    {dateRangeFilter?.key && (
                        <div className="flex items-center gap-2">
                            <div className="w-12 flex justify-center">
                                <span className="text-[10px] font-bold tracking-[.06em] text-[#64748b] bg-[#f1f5f9] rounded-[3px] px-[5px] py-px select-none">AND</span>
                            </div>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <button
                                        type="button"
                                        className="flex flex-1 items-center gap-2 min-h-[36px] rounded-md border border-[#E5DEFF] bg-[#F5EDFB] px-3 cursor-pointer hover:border-[#9b87f5] transition-colors text-left"
                                    >
                                        <CalendarIcon className="h-3.5 w-3.5 text-[#7028a0] shrink-0" />
                                        <span className="text-xs font-semibold text-[#374151] shrink-0 whitespace-nowrap">{dateRangeFilter.label}</span>
                                        {dateRange?.from ? (
                                            <>
                                                <span className="text-sm text-[#374151] shrink-0">{format(dateRange.from, "dd/MM/yy")}</span>
                                                <span className="text-[#9ca3af] text-xs shrink-0">→</span>
                                                <span className="text-sm text-[#374151] shrink-0">
                                                    {dateRange.to ? format(dateRange.to, "dd/MM/yy") : '…'}
                                                </span>
                                            </>
                                        ) : (
                                            <span className="text-sm text-[#9ca3af]">Select date range</span>
                                        )}
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 overflow-hidden" align="start">
                                    <div className="border-b border-[#E5DEFF] bg-[#FBF8FE] px-3 py-2">
                                        <p className="text-[11px] font-medium uppercase tracking-wide text-[#8b7aa0]">
                                            Date range
                                        </p>
                                        <p className="mt-0.5 text-sm text-[#374151]">
                                            {dateRange?.from
                                                ? `${format(dateRange.from, "dd MMM yyyy")}${
                                                    dateRange.to
                                                      ? ` → ${format(dateRange.to, "dd MMM yyyy")}`
                                                      : " → …"
                                                  }`
                                                : "Pick a start and end date"}
                                        </p>
                                    </div>
                                    <Calendar
                                        initialFocus
                                        mode="range"
                                        defaultMonth={dateRange?.from ?? undefined}
                                        selected={{ from: dateRange?.from ?? undefined, to: dateRange?.to ?? undefined }}
                                        onSelect={(range) => setDateRange?.({ from: range?.from ?? null, to: range?.to ?? null })}
                                        numberOfMonths={2}
                                        captionLayout="dropdown-buttons"
                                        fromYear={2000}
                                        toYear={new Date().getFullYear() + 2}
                                        className="pointer-events-auto"
                                        classNames={{
                                            caption_label:
                                                "inline-flex items-center rounded-md border border-[#E5DEFF] bg-white px-2 py-1 text-sm font-medium text-[#374151]",
                                        }}
                                    />
                                </PopoverContent>
                            </Popover>
                            <button
                                type="button"
                                className="h-9 w-9 flex items-center justify-center rounded-md text-[#d1d5db] hover:bg-[#FDE1D3] hover:text-[#d946ef] transition-colors"
                                onClick={() => setDateRange?.({ from: null, to: null })}
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    )}
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