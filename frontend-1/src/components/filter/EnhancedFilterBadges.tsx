import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEffect, useState, useMemo } from "react";
import { viewAPI } from "@/api/api";

interface EnhancedFilterBadgesProps {
    filters: Record<string, any>;
    onClearFilter: (field: string) => void;
    onClearAll: () => void;
    filterConfig: {
        enableFilters: boolean;
        enableSearch: boolean;
    }
}

interface LabelMapping {
    [key: string]: string;
}

export function EnhancedFilterBadges({ filters, onClearFilter, onClearAll, filterConfig }: EnhancedFilterBadgesProps) {
    const [labelMappings, setLabelMappings] = useState<LabelMapping>({});
    const [isLoading, setIsLoading] = useState(false);

    // Memoize the account IDs to prevent unnecessary re-renders

    const { legalEntityIds, businessUnitIds, coaCodeIds, coaIds, budgetLineIds, budgetPeriodIds, locationIds, costCenterIds, departmentIds, supplierIds, paymentTermIds, shippingTermIds, shippingMethodIds, currencyMasterIds, itemIds } = useMemo(() => {
        const legalEntityIds = new Set<string>();
        const businessUnitIds = new Set<string>();
        const coaCodeIds = new Set<string>();
        const coaIds = new Set<string>();
        const budgetLineIds = new Set<string>();
        const budgetPeriodIds = new Set<string>();
        const locationIds = new Set<string>();
        const costCenterIds = new Set<string>();
        const departmentIds = new Set<string>();
        const supplierIds = new Set<string>();
        const paymentTermIds = new Set<string>();
        const shippingTermIds = new Set<string>();
        const shippingMethodIds = new Set<string>();
        const currencyMasterIds = new Set<string>();
        const itemIds = new Set<string>();

        Object.entries(filters).forEach(([field, value]) => {
            if (field === "legal_entity_id") {
                if (value.eq) legalEntityIds.add(value.eq);
                if (value.neq) legalEntityIds.add(value.neq);
            }
            if (field === "business_unit_id") {
                if (value.eq) businessUnitIds.add(value.eq);
                if (value.neq) businessUnitIds.add(value.neq);
            }
            if (field === "coa_code") {
                if (value.eq) coaCodeIds.add(value.eq);
                if (value.neq) coaCodeIds.add(value.neq);
            }
            if (field === "budget_period_id") {
                if (value.eq) budgetPeriodIds.add(value.eq);
                if (value.neq) budgetPeriodIds.add(value.neq);
            }


            if (field === "coa_id") {
                if (value.eq) coaIds.add(value.eq);
                if (value.neq) coaIds.add(value.neq);
            }
            if (field === "budget_line_id") {
                if (value.eq) budgetLineIds.add(value.eq);
                if (value.neq) budgetLineIds.add(value.neq);
            }
            if (field === "location_id") {
                if (value.eq) locationIds.add(value.eq);
                if (value.neq) locationIds.add(value.neq);
            }
            if (field === "cost_center_id") {
                if (value.eq) costCenterIds.add(value.eq);
                if (value.neq) costCenterIds.add(value.neq);
            }
            if (field === "department_id") {
                if (value.eq) departmentIds.add(value.eq);
                if (value.neq) departmentIds.add(value.neq);
            }
            if (field === "supplier_id") {
                if (value.eq) supplierIds.add(value.eq);
                if (value.neq) supplierIds.add(value.neq);
            }
            if (field === "payment_term_id") {
                if (value.eq) paymentTermIds.add(value.eq);
                if (value.neq) paymentTermIds.add(value.neq);
            }
            if (field === "shipping_term_id") {
                if (value.eq) shippingTermIds.add(value.eq);
                if (value.neq) shippingTermIds.add(value.neq);
            }
            if (field === "shipping_method_id") {
                if (value.eq) shippingMethodIds.add(value.eq);
                if (value.neq) shippingMethodIds.add(value.neq);
            }
            if (field === "preferred_currency_id") {
                if (value.eq) currencyMasterIds.add(value.eq);
                if (value.neq) currencyMasterIds.add(value.neq);
            }
            if (field === "item_id") {
                if (value.eq) itemIds.add(value.eq);
                if (value.neq) itemIds.add(value.neq);
            }
        });

        return {
            legalEntityIds: Array.from(legalEntityIds),
            businessUnitIds: Array.from(businessUnitIds),
            coaCodeIds: Array.from(coaCodeIds),
            coaIds: Array.from(coaIds),
            budgetLineIds: Array.from(budgetLineIds),
            budgetPeriodIds: Array.from(budgetPeriodIds),
            locationIds: Array.from(locationIds),
            costCenterIds: Array.from(costCenterIds),
            departmentIds: Array.from(departmentIds),
            supplierIds: Array.from(supplierIds),
            paymentTermIds: Array.from(paymentTermIds),
            shippingTermIds: Array.from(shippingTermIds),
            shippingMethodIds: Array.from(shippingMethodIds),
            currencyMasterIds: Array.from(currencyMasterIds),
            itemIds: Array.from(itemIds)
        };
    }, [filters]);

    const filterCount = Object.keys(filters).length;

    // Fetch account names for account_id filters
    useEffect(() => {
        let isMounted = true;

        const fetchLabels = async () => {
            if (!isMounted) return;
            setIsLoading(true);

            if (isMounted) {
                setIsLoading(true);
            }
            const mappings: LabelMapping = {};

            // helper function
            const fetchEntity = async (ids: string[], model: string, labelKey: string = "name") => {
                for (const id of ids) {
                    try {
                        const response = await viewAPI.getById(model, id, "default") as any;
                        if (response?.data?.[labelKey] && isMounted) {
                            mappings[id] = response.data[labelKey];
                        }
                    } catch (err) {
                        console.error(`Failed to fetch ${model} ${id}:`, err);
                        if (isMounted) {
                            mappings[id] = id; // fallback to raw id
                        }
                    }
                }
            };

            try {
                await fetchEntity(legalEntityIds, "organization", "legal_name");
                await fetchEntity(businessUnitIds, "business_unit", "business_unit");
                await fetchEntity(coaCodeIds, "coa", "coa_code"); // COA codes use 'coa_code' as label
                await fetchEntity(coaIds, "coa", "coa_code"); // COA accounts use 'coa_code' as label
                await fetchEntity(budgetLineIds, "budget_line", "budget_line"); // budget lines use 'budget_line' as label
                await fetchEntity(budgetPeriodIds, "budget_period", "budget_period"); // budget periods use 'budget_period' as label
                await fetchEntity(locationIds, "location", "location"); // locations use 'location' as label
                await fetchEntity(costCenterIds, "cost_center", "cost_center"); // cost centers use 'cost_center' as label
                await fetchEntity(departmentIds, "department", "name"); // departments use 'name' as label
                await fetchEntity(supplierIds, "supplier", "supplier_name"); // suppliers use 'supplier_name' as label
                await fetchEntity(paymentTermIds, "payment_terms", "payment_terms"); // payment terms use 'payment_term' as label
                await fetchEntity(shippingTermIds, "shipping_terms", "shipping_terms"); // shipping terms use 'shipping_term' as label
                await fetchEntity(shippingMethodIds, "shipping_method", "shipping_method"); // shipping methods use 'shipping_method' as label
                await fetchEntity(currencyMasterIds, "currency_master", "base_currency"); // currency masters use 'base_currency' as label
                await fetchEntity(itemIds, "item_master", "item_name"); // items use 'item_name' as label
            } finally {
                if (isMounted) {
                    setLabelMappings(prev => ({ ...prev, ...mappings }));
                    setIsLoading(false);
                }
            }
        };

        fetchLabels();

        return () => {
            isMounted = false;
        };
    }, [legalEntityIds, businessUnitIds, coaCodeIds, coaIds, budgetLineIds, budgetPeriodIds, locationIds, costCenterIds, departmentIds, supplierIds, paymentTermIds, shippingTermIds, shippingMethodIds, currencyMasterIds, itemIds]);

    // Early return after all hooks are called
    if (filterCount === 0) {
        return null;
    }

    const getFilterLabel = (field: string, value: any) => {


        // Handle account_id with name mapping
        if (field === "legal_entity_id") {
            if (value.eq) {
                const legalEntityName = labelMappings[value.eq] || value.eq;
                return `Legal Entity: ${legalEntityName}`;
            }
            if (value.neq) {
                const legalEntityName = labelMappings[value.neq] || value.neq;
                return `Legal Entity: Not "${legalEntityName}"`;
            }
        }
        if (field === "business_unit_id") {
            if (value.eq) {
                const businessUnitName = labelMappings[value.eq] || value.eq;
                return `Business Unit: ${businessUnitName}`;
            }
            if (value.neq) {
                const businessUnitName = labelMappings[value.neq] || value.neq;
                return `Business Unit: Not "${businessUnitName}"`;
            }
        }


        // Handle notes with better formatting
        if (field === "notes") {
            if (value.eq) {
                return `Notes: ${value.eq}`;
            }
            if (value.neq) {
                return `Notes: Not "${value.neq}"`;
            }
            if (value.contains) {
                return `Notes: Contains "${value.contains}"`;
            }
            if (value.ncontains) {
                return `Notes: Not Contains "${value.ncontains}"`;
            }
        }

        // Handle description with better formatting
        if (field === "description") {
            if (value.eq) {
                return `Description: ${value.eq}`;
            }
            if (value.neq) {
                return `Description: Not "${value.neq}"`;
            }
            if (value.contains) {
                return `Description: Contains "${value.contains}"`;
            }
            if (value.ncontains) {
                return `Description: Not Contains "${value.ncontains}"`;
            }
            if (value.starts_with) {
                return `Description: Starts With "${value.starts_with}"`;
            }
            if (value.not_starts_with) {
                return `Description: Not Starts With "${value.not_starts_with}"`;
            }
        }

        // Handle status
        if (field === "status") {
            return `Status: ${value.eq}`;
        }

        // Handle supplier_name
        if (field === "supplier_name") {
            return `Supplier: ${value.eq}`;
        }

        // Handle date ranges
        if (field === "value_date") {
            const startDate = new Date(value.gte);
            const endDate = new Date(value.lte);

            // Format dates as dd/mm/yyyy
            const formatDate = (date: Date) => {
                const day = date.getDate().toString().padStart(2, '0');
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                const year = date.getFullYear();
                return `${day}/${month}/${year}`;
            };

            return `Date: ${formatDate(startDate)} - ${formatDate(endDate)}`;
        }

        // Handle amount ranges
        if (field === "amount") {
            if (value.gte && value.lte) {
                return `Amount: ${value.gte} - ${value.lte}`;
            }
            if (value.gte) {
                return `Amount: ≥ ${value.gte}`;
            }
            if (value.lte) {
                return `Amount: ≤ ${value.lte}`;
            }
        }

        if (field === "coa_code") {
            if (value.eq) {
                const coaCodeName = labelMappings[value.eq] || value.eq;
                return `COA Code: ${coaCodeName}`;
            }
            if (value.neq) {
                const coaCodeName = labelMappings[value.neq] || value.neq;
                return `COA Code: Not "${coaCodeName}"`;
            }
        }
        if (field === "budget_period_id") {
            if (value.eq) {
                const budgetPeriodName = labelMappings[value.eq] || value.eq;
                return `Budget Period: ${budgetPeriodName}`;
            }
            if (value.neq) {
                const budgetPeriodName = labelMappings[value.neq] || value.neq;
                return `Budget Period: Not "${budgetPeriodName}"`;
            }
        }
        if (field === "coa_id") {
            if (value.eq) {
                const coaName = labelMappings[value.eq] || value.eq;
                return `COA: ${coaName}`;
            }
            if (value.neq) {
                const coaName = labelMappings[value.neq] || value.neq;
                return `COA: Not "${coaName}"`;
            }
        }
        if (field === "budget_line_id") {
            if (value.eq) {
                const budgetLineName = labelMappings[value.eq] || value.eq;
                return `Budget Line: ${budgetLineName}`;
            }
            if (value.neq) {
                const budgetLineName = labelMappings[value.neq] || value.neq;
                return `Budget Line: Not "${budgetLineName}"`;
            }
        }
        if (field === "location_id") {
            if (value.eq) {
                const locationName = labelMappings[value.eq] || value.eq;
                return `Location: ${locationName}`;
            }
            if (value.neq) {
                const locationName = labelMappings[value.neq] || value.neq;
                return `Location: Not "${locationName}"`;
            }
        }
        if (field === "cost_center_id") {
            if (value.eq) {
                const costCenterName = labelMappings[value.eq] || value.eq;
                return `Cost Center: ${costCenterName}`;
            }
            if (value.neq) {
                const costCenterName = labelMappings[value.neq] || value.neq;
                return `Cost Center: Not "${costCenterName}"`;
            }
        }
        if (field === "department_id") {
            if (value.eq) {
                const departmentName = labelMappings[value.eq] || value.eq;
                return `Department: ${departmentName}`;
            }
            if (value.neq) {
                const departmentName = labelMappings[value.neq] || value.neq;
                return `Department: Not "${departmentName}"`;
            }
        }
        if (field === "supplier_id") {
            if (value.eq) {
                const supplierName = labelMappings[value.eq] || value.eq;
                return `Supplier: ${supplierName}`;
            }
            if (value.neq) {
                const supplierName = labelMappings[value.neq] || value.neq;
                return `Supplier: Not "${supplierName}"`;
            }
        }
        if (field === "payment_term_id") {
            if (value.eq) {
                const paymentTermName = labelMappings[value.eq] || value.eq;
                return `Payment Term: ${paymentTermName}`;
            }
            if (value.neq) {
                const paymentTermName = labelMappings[value.neq] || value.neq;
                return `Payment Term: Not "${paymentTermName}"`;
            }
        }
        if (field === "shipping_term_id") {
            if (value.eq) {
                const shippingTermName = labelMappings[value.eq] || value.eq;
                return `Shipping Term: ${shippingTermName}`;
            }
            if (value.neq) {
                const shippingTermName = labelMappings[value.neq] || value.neq;
                return `Shipping Term: Not "${shippingTermName}"`;
            }
        }
        if (field === "shipping_method_id") {
            if (value.eq) {
                const shippingMethodName = labelMappings[value.eq] || value.eq;
                return `Shipping Method: ${shippingMethodName}`;
            }
            if (value.neq) {
                const shippingMethodName = labelMappings[value.neq] || value.neq;
                return `Shipping Method: Not "${shippingMethodName}"`;
            }
        }
        if (field === "preferred_currency_id") {
            if (value.eq) {
                const currencyName = labelMappings[value.eq] || value.eq;
                return `Currency: ${currencyName}`;
            }
            if (value.neq) {
                const currencyName = labelMappings[value.neq] || value.neq;
                return `Currency: Not "${currencyName}"`;
            }
        }
        if (field === "item_id") {
            if (value.eq) {
                const itemName = labelMappings[value.eq] || value.eq;
                return `Item: ${itemName}`;
            }
            if (value.neq) {
                const itemName = labelMappings[value.neq] || value.neq;
                return `Item: Not "${itemName}"`;
            }
        }

        // Generic fallback for other fields
        const operator = Object.keys(value)[0];
        const operatorValue = value[operator];

        const operatorLabels: Record<string, string> = {
            eq: "=",
            neq: "≠",
            gt: ">",
            gte: "≥",
            lt: "<",
            lte: "≤",
            contains: "contains",
            ncontains: "not contains",
            starts_with: "starts with",
            not_starts_with: "not starts with",
            ends_with: "ends with",
            is_null: "is null",
            is_not_null: "is not null"
        };

        const operatorLabel = operatorLabels[operator] || operator;

        // For null operators, don't show the value
        if (operator === 'is_null' || operator === 'is_not_null') {
            return `${field}: ${operatorLabel}`;
        }

        return `${field}: ${operatorLabel} ${operatorValue}`;
    };

    return (
        <div className="flex flex-wrap gap-2 my-4">
            {Object.entries(filters).map(([field, value]) => (
                <Badge
                    key={field}
                    variant="secondary"
                    className="px-4 py-2 flex items-center gap-1 !rounded-full bg-[#E5DEFF] text-[#403E43] font-semibold"
                >
                    {isLoading && field === "legal_entity_id" || isLoading && field === "business_unit_id" ||
                        isLoading && field === "category_id" ||
                        isLoading && field === "coa_id" || isLoading && field === "budget_line_id" || isLoading && field === "budget_period_id" || isLoading && field === "location_id"
                        || isLoading && field === "cost_center_id" || isLoading && field === "department_id" || isLoading && field === "supplier_id" || isLoading && field === "payment_term_id"
                        || isLoading && field === "shipping_term_id" || isLoading && field === "shipping_method_id" || isLoading && field === "preferred_currency_id" || isLoading && field === "item_id" || isLoading && field === "coa_code" ? (
                        <span className="animate-pulse">Loading...</span>
                    ) : (
                        getFilterLabel(field, value)
                    )}
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