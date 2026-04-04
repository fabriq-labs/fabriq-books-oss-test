import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface FilterBadgesProps {
    filters: Record<string, any>;
    onClearFilter: (field: string) => void;
    onClearAll: () => void;
    filterConfig: {
        enableFilters: boolean;
        enableSearch: boolean;
    }
}

export function FilterBadges({ filters, onClearFilter, onClearAll, filterConfig }: FilterBadgesProps) {
    const filterCount = Object.keys(filters).length;

    if (filterCount === 0) return null;

    const getFilterLabel = (field: string, value: any) => {
        if (field === "status") {
            return `Status: ${value.eq}`;
        }
        if (field === "supplier_name") {
            return `Supplier: ${value.eq}`;
        }
        if (field === "value_date") {
            const startDate = new Date(value.gte).toLocaleDateString();
            const endDate = new Date(value.lte).toLocaleDateString();
            return `Date: ${startDate} - ${endDate}`;
        }
        if (field === "pr_date") {
            const startDate = new Date(value.gte).toLocaleDateString();
            const endDate = new Date(value.lte).toLocaleDateString();
            return `Date: ${startDate} - ${endDate}`;
        }
        if (field === "po_date") {
            const startDate = new Date(value.gte).toLocaleDateString();
            const endDate = new Date(value.lte).toLocaleDateString();
            return `Date: ${startDate} - ${endDate}`;
        }
        if (field === "invoice_date") {
            const startDate = new Date(value.gte).toLocaleDateString();
            const endDate = new Date(value.lte).toLocaleDateString();
            return `Date: ${startDate} - ${endDate}`;
        }
        return `${field}: ${JSON.stringify(value)}`;
    };

    return (
        <div className="flex flex-wrap gap-2 my-4">
            {Object.entries(filters).map(([field, value]) => (
                <Badge
                    key={field}
                    variant="secondary"
                    className="px-4 py-2 flex items-center gap-1 !rounded-full bg-[#E5DEFF] text-[#403E43] font-semibold"
                >
                    {getFilterLabel(field, value)}
                    <X
                        className="h-3 w-3 cursor-pointer ml-1 text-[#9b87f5] hover:bg-[#d6bcfa] rounded-full transition-colors"
                        onClick={() => onClearFilter(field)}
                    />
                </Badge>
            ))}

            {filterCount > 0 && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClearAll}
                    className="text-[#9b87f5] font-medium underline hover:text-[#7E69AB] px-2"
                >
                    Clear All
                </Button>
            )}
        </div>
    );
}
