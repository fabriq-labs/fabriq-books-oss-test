/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef, useState } from "react";
import { Select, Spin } from "antd";
import { viewAPI } from "@/api/api";
import { cn } from "@/lib/utils";
import "./dropdown.css";


interface SearchDropDownProps {
    instanceType: string;
    instanceKey: any;
    instanceSourceKey: any;
    instanceLabel: any;
    instanceValue?: any;
    disabled?: any;
    onSelectItem: any;
    limit?: any;
    searchParams?: string;
    type?: any;
    lookup_id_name?: any;
    onClear?: any;
    searchTerm?: any;
    isShowSearch?: boolean;
    defaultValue?: any[];
    onBlur?: any;
    style?: any;
    onFocus?: any;
    autoFocus?: any;
    excludeIds?: string[];
    rest?: any;
    skipApiCall?: boolean;
    placeholder?: string;
    initialCallback?: any;
    /**
     * Additional filters to apply to the search query.
     * These filters are merged with the searchParams filter (if provided).
     * 
     * @example
     * // Simple field filter
     * additionalFilters={{ status: { equals: "active" } }}
     * 
     * @example
     * // Nested relationship filter (requires backend support for 'some', 'every', 'none' operators)
     * // Filter suppliers that have at least one supplier_items record for a specific item
     * additionalFilters={{
     *   supplier_items: {
     *     some: {
     *       item_id: "item_123"
     *     }
     *   }
     * }}
     * 
     * @example
     * // Combined with text search (searchParams filter is merged automatically)
     * // This will search for suppliers with name containing "ABC" AND having supplier_items for item_123
     * <SearchDropDown
     *   instanceType="supplier"
     *   searchParams="supplier_name"
     *   additionalFilters={{
     *     supplier_items: {
     *       some: { item_id: "item_123" }
     *     }
     *   }}
     * />
     * 
     * @example
     * // Multiple filters
     * additionalFilters={{
     *   status: { equals: "active" },
     *   created_at: { gte: "2024-01-01" }
     * }}
     */
    additionalFilters?: Record<string, any>;
    /**
     * Optional client-side filter applied to fetched items before displaying.
     * Use when the API cannot filter (e.g. array fields); filter after fetch.
     */
    filterOptions?: (items: any[]) => any[];
}



export const SearchDropDown = ({
    instanceType,
    instanceKey,
    instanceSourceKey,
    instanceLabel,
    instanceValue,
    onSelectItem,
    limit = 5,
    searchParams,
    type,
    lookup_id_name,
    disabled = false,
    onClear,
    searchTerm,
    isShowSearch = true,
    defaultValue = [],
    onBlur,
    onFocus,
    autoFocus,
    excludeIds = [],
    rest,
    style,
    skipApiCall = false,
    additionalFilters,
    filterOptions,
    placeholder,
    initialCallback
}: SearchDropDownProps) => {
    const [isLoader, setLoader] = useState(false);
    const [isLookupLoader, setLookupLoader] = useState(false);
    const [isError, setError] = useState<any>({});
    const [items, setItems] = useState<any>([]);
    const [selectedValue, setSelectedValue] = useState<any>([]);
    const [lookupFields, setLookupFields] = useState<any>([]);
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const hasTriggeredInitialCallback = useRef(false);

    useEffect(() => {
        if (instanceValue && instanceValue[instanceKey]) {
            // If instanceValue is provided and has a valid key, use it without calling API
            setItems([instanceValue, ...defaultValue]);
            setSelectedValue(instanceValue[instanceKey]);
        } else if (defaultValue && defaultValue.length > 0) {
            // If defaultValue is provided, use it without calling API
            setItems(defaultValue);
        } else if (!skipApiCall) {
            // Call API on initial load to get data
            initdropdownApiCall("");
        }
        setIsInitialLoad(false);
    }, [instanceValue]);

    /**
     * Refetch data when searchTerm or additionalFilters change.
     * This ensures the dropdown updates when filters are modified (e.g., when an item is selected
     * and supplier filters need to be applied based on supplier_items relationship).
     */
    useEffect(() => {
        if (!isInitialLoad && searchTerm !== undefined) {
            fetchDropDownData(searchTerm);
        }
    }, [searchTerm, additionalFilters]);

    const initdropdownApiCall = async (searchTerm: string) => {
        const fetchedItems = await fetchDropDownData(searchTerm);

        if (!hasTriggeredInitialCallback.current && initialCallback) {
            initialCallback(fetchedItems, setSelectedValue);
            hasTriggeredInitialCallback.current = true;
        }
    };
    const onChange = async (value: string, options: any) => {
        // Stop propagation to prevent dialog from closing
        setSelectedValue(value);
        if (value) {
            if (lookup_id_name) {
                if (lookupFields.length == 0) {
                    const fields = await callLookup();
                    return onSelectItem(
                        instanceSourceKey,
                        instanceKey,
                        {
                            [instanceKey]: value,
                            [instanceLabel]: options?.label,
                            item: options?.item,
                        },
                        fields
                    );
                }
                return onSelectItem(
                    instanceSourceKey,
                    instanceKey,
                    {
                        [instanceKey]: value,
                        [instanceLabel]: options?.label,
                        item: options?.item,
                    },
                    lookupFields
                );
            }
            return onSelectItem(instanceSourceKey, instanceKey, {
                [instanceKey]: value,
                [instanceLabel]: options?.label,
                item: options?.item
            });
        }
    };

    const callLookup = async () => {
        if (lookupFields.length == 0) {
            setLookupLoader(true);
            const res = await viewAPI.lookup(type, lookup_id_name)
                .then((res: any) => {
                    setLookupFields(res.data);
                    setLookupLoader(false);
                    return res.data;
                })
                .catch((err: any) => {
                    setLookupLoader(false);
                    const { response } = err;
                    setError({
                        status: response?.status,
                        title: response?.statusText,
                        subTitle: response?.data?.error,
                    });
                    return [];
                });
            return res;
        }
        return lookupFields;
    };

    const onClearSelect = async (e?: React.MouseEvent) => {
        // Stop propagation to prevent dialog from closing
        if (e) e.stopPropagation();

        fetchDropDownData(searchTerm || "");
        if (isInitialLoad) {
            return;
        }
        if (lookup_id_name) {
            if (lookupFields.length === 0) {
                const fields = await callLookup();
                return onClear(instanceSourceKey, fields);
            } else {
                return onClear(instanceSourceKey, lookupFields);
            }
        }
        return onClear(instanceSourceKey);
    };


    const fetchDropDownData = (value: string): Promise<any[]> => {
        setLoader(true);
        // Build filters object with proper structure
        const filters: any = {};

        // Add filter with searchTerm value if value is provided
        // This creates a text search filter using the searchParams field
        if (value && searchParams) {
            // Use searchParams as the field name
            // Example: if searchParams="supplier_name" and value="ABC", creates { supplier_name: { contains: "ABC" } }
            filters[searchParams] = { contains: value };
        }

        /**
         * Merge additionalFilters if provided.
         * 
         * This allows combining text search (from searchParams) with additional filter conditions.
         * The filters are merged, so both will be applied to the query.
         * 
         * Example merge result:
         * - searchParams filter: { supplier_name: { contains: "ABC" } }
         * - additionalFilters: { supplier_items: { some: { item_id: "item_123" } } }
         * - Final filters: {
         *     supplier_name: { contains: "ABC" },
         *     supplier_items: { some: { item_id: "item_123" } }
         *   }
         * 
         * This enables filtering suppliers by name AND by relationship (suppliers mapped to a specific item).
         */
        if (additionalFilters) {
            Object.assign(filters, additionalFilters);
        }
        return viewAPI.search(
            instanceType,
            `${instanceType}_view`,
            1,
            limit,
            value,
            filters,
            {}
        )
            .then((res: any) => {
                // Filter out excluded IDs
                let filteredData = excludeIds.length > 0
                    ? res.data.filter((item: any) => !excludeIds.includes(item[instanceKey]))
                    : res.data;
                // Optional client-side filter (e.g. for array fields like account type)
                if (filterOptions && Array.isArray(filteredData)) {
                    filteredData = filterOptions(filteredData);
                }
                setItems(filteredData);
                setLoader(false);
                return filteredData;
            })
            .catch((err) => {
                console.error("SearchDropdown: API error for", instanceType, ":", err);
                setLoader(false);
                const { response } = err;
                setError({ error: true });
                if (response?.status != 400) {
                    setError({
                        status: response?.status,
                        title: response?.statusText,
                        subTitle: response?.data?.error,
                    });
                }
                return [];
            });
    };

    const onSearch = (value: string) => {
        if (value.length > 3) {
            fetchDropDownData(value);
        }
    };

    const handleDropdownClick = (e: React.MouseEvent) => {
        // Stop propagation to prevent dialog from closing
        e.stopPropagation();
    };

    return (
        <div onClick={handleDropdownClick}>
            <Select
                showSearch={isShowSearch}
                allowClear
                loading={(isLoader || isLookupLoader)}
                placeholder={placeholder || `Select a ${instanceType}`}
                value={selectedValue}
                disabled={disabled || isLookupLoader}
                optionFilterProp="label"
                onChange={onChange}
                onSearch={onSearch}
                onClear={onClearSelect}
                style={{ width: "100%" }}
                notFoundContent={isLoader ? <Spin size="small" /> : undefined}
                onBlur={onBlur}
                onFocus={onFocus}
                autoFocus={autoFocus}
                onClick={handleDropdownClick}
                className="purple-select"
                {...rest}
                options={items?.map((item: any) => {
                    return {
                        label: item[instanceLabel] + (rest?.instanceSubLabel ? ` (${item[rest?.instanceSubLabel]})` : ''),
                        value: item[instanceKey],
                        item,
                    };
                })}
            />
        </div>
    );
};
