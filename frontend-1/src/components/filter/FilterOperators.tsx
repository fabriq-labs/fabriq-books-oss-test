import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface FilterOperatorsProps {
    value: string;
    onChange: (value: string) => void;
    col: Record<string, any>;
    className?: string;
}

export function FilterOperators({ value, onChange, col, className }: FilterOperatorsProps) {
    const getOperators = (columnType?: string) => {
        switch (columnType) {
            case 'select':
                return [
                    { value: "eq", label: "Equals" },
                    { value: "neq", label: "Not Equals" },
                    { value: "is_null", label: "Is Null" },
                    { value: "is_not_null", label: "Is Not Null" }
                ];
            case 'number':
                return [
                    { value: "eq", label: "Equals" },
                    { value: "neq", label: "Not Equals" },
                    { value: "gt", label: "Greater Than" },
                    { value: "gte", label: "Greater Than or Equal" },
                    { value: "lt", label: "Less Than" },
                    { value: "lte", label: "Less Than or Equal" },
                    { value: "is_null", label: "Is Null" },
                    { value: "is_not_null", label: "Is Not Null" }
                ];
            default:
                return [
                    { value: "eq", label: "Equals" },
                    { value: "neq", label: "Not Equals" },
                    { value: "contains", label: "Contains" },
                    { value: "ncontains", label: "Not Contains" },
                    { value: "gt", label: "Greater Than" },
                    { value: "gte", label: "Greater Than or Equal" },
                    { value: "lt", label: "Less Than" },
                    { value: "lte", label: "Less Than or Equal" },
                    { value: "is_null", label: "Is Null" },
                    { value: "is_not_null", label: "Is Not Null" }
                ];
        }
    };

    const operators = getOperators(col.tableProps?.columnType);

    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className={className || "w-[110px] bg-[#F1F0FB] border-[#E5DEFF]"}>
                <SelectValue placeholder="Operator" />
            </SelectTrigger>
            <SelectContent>
                {operators.map(op => (
                    <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
} 