import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEffect, useState, useRef } from "react";
import { viewAPI } from "@/api/api";

interface EnhancedFilterBadgesProps {
    filters: Record<string, any>;
    onClearFilter: (field: string) => void;
    onClearAll: () => void;
    filterConfig: {
        enableFilters: boolean;
        enableSearch: boolean;
    };
    /** Column metadata from the parent list — enables generic label resolution for any select field */
    metaData?: Record<string, any>;
    /** Pre-resolved id→label cache carried from FilterModal via Master */
    labelCache?: Record<string, string>;
}

interface LabelMapping {
    [key: string]: string;
}

const FIELD_DISPLAY_NAMES: Record<string, string> = {
    legal_entity_id: "Legal Entity",
    business_unit_id: "Business Unit",
    coa_code: "COA Code",
    coa_id: "COA",
    budget_line_id: "Budget Line",
    budget_period_id: "Budget Period",
    location_id: "Location",
    cost_center_id: "Cost Center",
    department_id: "Department",
    supplier_id: "Supplier",
    supplier_name: "Supplier",
    payment_term_id: "Payment Term",
    shipping_term_id: "Shipping Term",
    shipping_method_id: "Shipping Method",
    preferred_currency_id: "Currency",
    currency_id: "Currency",
    base_currency_id: "Base Currency",
    item_id: "Item",
    account_id_or_credit_account_id: "Account (debit or credit)",
    status: "Status",
    description: "Description",
    notes: "Notes",
    amount: "Amount",
    value_date: "Date",
};

function getFieldDisplayName(field: string): string {
    return FIELD_DISPLAY_NAMES[field]
        ?? field.replace(/_id$/, '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

export function EnhancedFilterBadges({ filters, onClearFilter, onClearAll, filterConfig, metaData, labelCache }: EnhancedFilterBadgesProps) {
    /** Fallback label store for IDs not in labelCache — resolved generically from metaData */
    const [resolvedLabels, setResolvedLabels] = useState<LabelMapping>({});

    const extractOperatorValues = (value: any): string[] => {
        if (!value) return [];
        const collected: string[] = [];
        if (value.eq != null) collected.push(String(value.eq));
        if (value.neq != null) collected.push(String(value.neq));
        if (Array.isArray(value.in)) value.in.forEach((v: any) => collected.push(String(v)));
        if (Array.isArray(value.nin)) value.nin.forEach((v: any) => collected.push(String(v)));
        if (Array.isArray(value.OR)) {
            value.OR.forEach((condition: Record<string, any>) => {
                const [operator, operatorValue] = Object.entries(condition)[0] || [];
                if ((operator === "eq" || operator === "neq") && operatorValue != null) {
                    collected.push(String(operatorValue));
                }
            });
        }
        return collected;
    };

    // Generic label resolution for any select field present in metaData.
    // Uses a ref to deduplicate in-flight fetches across re-renders.
    const resolvedIdsRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        if (!metaData) return;

        const toFetch: Array<{ id: string; instanceType: string; instanceLabel: string }> = [];
        Object.entries(filters).forEach(([field, value]) => {
            const sp = metaData[field]?.tableProps?.selectProps;
            if (!sp?.instanceType || !sp?.instanceLabel) return;
            extractOperatorValues(value).forEach(id => {
                if (resolvedIdsRef.current.has(id) || labelCache?.[id]) return;
                resolvedIdsRef.current.add(id);
                toFetch.push({ id, instanceType: sp.instanceType, instanceLabel: sp.instanceLabel });
            });
        });
        if (toFetch.length === 0) return;

        let isMounted = true;
        const load = async () => {
            const updates: LabelMapping = {};
            for (const { id, instanceType, instanceLabel } of toFetch) {
                try {
                    const r = await viewAPI.getById(instanceType, id, "default") as any;
                    const label = r?.data?.[instanceLabel];
                    updates[id] = label ? String(label) : id;
                } catch {
                    updates[id] = id;
                }
            }
            if (isMounted && Object.keys(updates).length > 0) {
                setResolvedLabels(prev => ({ ...prev, ...updates }));
            }
        };
        load();
        return () => { isMounted = false; };
    }, [filters, metaData, labelCache]);

    const filterCount = Object.keys(filters).length;
    if (filterCount === 0) return null;

    const lookup = (id: string) => labelCache?.[id] ?? resolvedLabels[id] ?? id;

    const getFilterLabel = (field: string, value: any): string => {
        // Root-level OR from multi-value mixed-op filters (e.g. ncontains with 2 values).
        // value is an array of { fieldName: { op: val } } objects.
        if (field === 'OR' && Array.isArray(value)) {
            const firstCond = Object.entries(value[0] ?? {})[0];
            if (!firstCond) return 'Filter';
            const [orField] = firstCond;
            const dispName = getFieldDisplayName(orField);
            const parts = value.map((c: Record<string, any>) => {
                const [, fieldOp] = Object.entries(c)[0] || [];
                if (!fieldOp || typeof fieldOp !== 'object') return String(fieldOp ?? c);
                const [op, v] = Object.entries(fieldOp as Record<string, any>)[0] || [];
                if (op === 'contains' || op === 'icontains') return `Contains "${v}"`;
                if (op === 'ncontains' || op === 'not_contains') return `Not Contains "${v}"`;
                if (op === 'starts_with') return `Starts With "${v}"`;
                if (op === 'ends_with') return `Ends With "${v}"`;
                return lookup(String(v));
            });
            return `${dispName}: ${parts.join(' OR ')}`;
        }

        const displayName = getFieldDisplayName(field);

        if (Array.isArray(value?.in)) {
            const labels = value.in.map((v: string) => lookup(String(v))).join(" OR ");
            return `${displayName}: ${labels}`;
        }
        if (Array.isArray(value?.nin)) {
            const labels = value.nin.map((v: string) => lookup(String(v))).join(" OR ");
            return `${displayName}: Not (${labels})`;
        }
        if (Array.isArray(value?.OR)) {
            const parts = value.OR.map((condition: Record<string, any>) => {
                const [op, condValue] = Object.entries(condition)[0] || [];
                if (op === "is_null") return "is null";
                if (op === "is_not_null") return "is not null";
                const lbl = lookup(String(condValue));
                return op === "neq" ? `Not "${lbl}"` : lbl;
            }).join(" OR ");
            return `${displayName}: ${parts}`;
        }

        // Date range
        if (value.gte != null && value.lte != null && (field.includes('date') || field === 'value_date')) {
            const fmt = (d: Date) => {
                const dd = d.getDate().toString().padStart(2, '0');
                const mm = (d.getMonth() + 1).toString().padStart(2, '0');
                return `${dd}/${mm}/${d.getFullYear()}`;
            };
            return `${displayName}: ${fmt(new Date(value.gte))} - ${fmt(new Date(value.lte))}`;
        }

        // Amount range
        if (field === "amount") {
            if (value.gte != null && value.lte != null) return `Amount: ${value.gte} - ${value.lte}`;
            if (value.gte != null) return `Amount: ≥ ${value.gte}`;
            if (value.lte != null) return `Amount: ≤ ${value.lte}`;
        }

        const op = Object.keys(value)[0];
        const v = value[op];

        if (op === 'is_null') return `${displayName}: is null`;
        if (op === 'is_not_null') return `${displayName}: is not null`;
        if (op === 'eq') return `${displayName}: ${lookup(String(v))}`;
        if (op === 'neq') return `${displayName}: Not "${lookup(String(v))}"`;
        if (op === 'contains' || op === 'icontains') return `${displayName}: Contains "${v}"`;
        if (op === 'ncontains' || op === 'not_contains') return `${displayName}: Not Contains "${v}"`;
        if (op === 'starts_with') return `${displayName}: Starts With "${v}"`;
        if (op === 'not_starts_with') return `${displayName}: Not Starts With "${v}"`;
        if (op === 'ends_with') return `${displayName}: Ends With "${v}"`;
        if (op === 'gt') return `${displayName}: > ${v}`;
        if (op === 'gte') return `${displayName}: ≥ ${v}`;
        if (op === 'lt') return `${displayName}: < ${v}`;
        if (op === 'lte') return `${displayName}: ≤ ${v}`;

        return `${displayName}: ${op} ${v}`;
    };

    return (
        <div className="flex flex-wrap gap-2 my-4">
            {Object.entries(filters).map(([field, value]) => {
                const isOrBadge = (field === 'OR' && Array.isArray(value) && value.length > 1)
                    || (Array.isArray(value?.in) && value.in.length > 1)
                    || (Array.isArray(value?.nin) && value.nin.length > 1)
                    || (Array.isArray(value?.OR) && value.OR.length > 1);
                return (
                    <Badge
                        key={field}
                        variant="secondary"
                        className={`max-w-full px-4 py-2 flex items-center gap-1 !rounded-full font-semibold ${
                            isOrBadge
                                ? 'bg-[#e8d4f2] text-[#591e80]'
                                : 'bg-[#E5DEFF] text-[#403E43]'
                        }`}
                    >
                        <span className="truncate">{getFilterLabel(field, value)}</span>
                        <X
                            className="h-3 w-3 cursor-pointer ml-1 text-[#9b87f5] hover:bg-[#d6bcfa] rounded-full transition-colors"
                            onClick={() => onClearFilter(field)}
                        />
                    </Badge>
                );
            })}

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
