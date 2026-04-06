import React, { useEffect, useState, useRef } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { viewAPI } from "@/api/api";

interface ModernDropDownProps {
    instanceType: string;
    instanceKey: any;
    instanceSourceKey: any;
    instanceLabel: any;
    instanceValue?: any;
    disabled?: boolean;
    onSelectItem: (sourceKey: any, key: any, value: any, fields?: any) => void;
    limit?: number;
    searchParams?: string;
    type?: any;
    lookup_id_name?: any;
    onClear?: (sourceKey: any, fields?: any) => void;
    searchTerm?: string;
    isShowSearch?: boolean;
    defaultValue?: any[];
    onBlur?: () => void;
    style?: React.CSSProperties;
    onFocus?: () => void;
    autoFocus?: boolean;
    instanceSubLabel?: string;
    excludeIds?: string[];
}

interface LookupResponse {
    data: any[];
}

export const ModernDropDown = ({
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
    style,
    instanceSubLabel,
    excludeIds = [],
}: ModernDropDownProps) => {
    const [isLoader, setLoader] = useState(false);
    const [isLookupLoader, setLookupLoader] = useState(false);
    const [isError, setError] = useState<any>({});
    const [items, setItems] = useState<any>([]);
    const [selectedValue, setSelectedValue] = useState<any>(null);
    const [lookupFields, setLookupFields] = useState<any>([]);
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const [searchInput, setSearchInput] = useState("");
    const [filteredItems, setFilteredItems] = useState<any>([]);
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (searchInput.length > 0) {
            const filtered = items.filter((item: any) =>
                item[instanceLabel].toLowerCase().includes(searchInput.toLowerCase())
            );
            setFilteredItems(filtered);
        } else {
            setFilteredItems(items);
        }
    }, [searchInput, items]);

    useEffect(() => {

        if (instanceValue && instanceValue[instanceKey]) {
            // If instanceValue is provided and has a valid key, use it without calling API
            setItems([instanceValue, ...defaultValue]);
            setSelectedValue(instanceValue[instanceKey]);
            setIsInitialLoad(false);
        } else if (defaultValue && defaultValue.length > 0) {
            // If defaultValue is provided, use it without calling API
            setItems(defaultValue);
            setIsInitialLoad(false);
        } else {
            // Call API on initial load to get data
            fetchDropDownData("");
        }
    }, [instanceValue]);

    useEffect(() => {
        if (!isInitialLoad && searchInput !== undefined) {
            if (searchInput.length > 3) {
                fetchDropDownData(searchInput);
            }
            // Don't reset data when search input is cleared to avoid overriding selected value
        }
    }, [searchInput]);

    // Maintain focus on search input after it changes
    useEffect(() => {
        if (searchInputRef.current && searchInput.length > 0) {
            // Use a longer timeout to ensure focus happens after Select component's internal focus management
            const timeoutId = setTimeout(() => {
                if (searchInputRef.current) {
                    searchInputRef.current.focus();
                }
            }, 50);
            return () => clearTimeout(timeoutId);
        }
    }, [searchInput]);

    const onChange = async (value: string) => {
        setSelectedValue(value);
        if (value) {
            const selectedItem = items.find((item: any) => item[instanceKey] === value);
            if (lookup_id_name) {
                if (lookupFields.length === 0) {
                    const fields = await callLookup();
                    return onSelectItem(
                        instanceSourceKey,
                        instanceKey,
                        {
                            [instanceKey]: value,
                            [instanceLabel]: selectedItem?.[instanceLabel],
                            item: selectedItem,
                        },
                        fields
                    );
                }
                return onSelectItem(
                    instanceSourceKey,
                    instanceKey,
                    {
                        [instanceKey]: value,
                        [instanceLabel]: selectedItem?.[instanceLabel],
                        item: selectedItem,
                    },
                    lookupFields
                );
            }
            return onSelectItem(instanceSourceKey, instanceKey, {
                [instanceKey]: value,
                [instanceLabel]: selectedItem?.[instanceLabel],
            });
        }
    };

    const callLookup = async () => {
        if (lookupFields.length === 0) {
            setLookupLoader(true);
            try {
                const res = await viewAPI.lookup(type, lookup_id_name) as LookupResponse;
                setLookupFields(res.data);
                return res.data;
            } catch (err: any) {
                const { response } = err;
                setError({
                    status: response?.status,
                    title: response?.statusText,
                    subTitle: response?.data?.error,
                });
                return [];
            } finally {
                setLookupLoader(false);
            }
        }
        return lookupFields;
    };

    const onClearSelect = async () => {
        setSelectedValue(null);
        setSearchInput("");
        // Don't fetch data on clear - let the user search again
        if (isInitialLoad) {
            return;
        }
        if (lookup_id_name) {
            if (lookupFields.length === 0) {
                const fields = await callLookup();
                return onClear?.(instanceSourceKey, fields);
            } else {
                return onClear?.(instanceSourceKey, lookupFields);
            }
        }
        return onClear?.(instanceSourceKey);
    };


    const fetchDropDownData = (value: string) => {
        // Only show loader when there's an actual search term (not on initial load)
        if (value && value.length > 0) {
            setLoader(true);
        }
        // Debug log
        // Build filters object with proper structure
        const filters = {};
        // Add filter with searchTerm value if value is provided
        if (value && searchParams) {
            // Use searchParams as the field name
            filters[searchParams] = { contains: value };
        }

        viewAPI.search(
            instanceType,
            `${instanceType}_view`,
            1,
            limit,
            value,
            filters,
            {}
        )
            .then((res: any) => {
                // Filter out excluded IDs if they exist
                const filteredData = excludeIds?.length > 0
                    ? res.data.filter((item: any) => !excludeIds.includes(item[instanceKey]))
                    : res.data;

                setItems(filteredData);
                setLoader(false);
                setIsInitialLoad(false);
            })
            .catch((err) => {
                setLoader(false);
                setIsInitialLoad(false);

                const { response } = err;
                setError({ error: true });
                if (response?.status != 400) {
                    setError({
                        status: response?.status,
                        title: response?.statusText,
                        subTitle: response?.data?.error,
                    });
                }
            });
    };
    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchInput(e.target.value);
        // Prevent the Select component from stealing focus
        e.stopPropagation();
    };




    return (
        <Select
            value={selectedValue}
            onValueChange={onChange}
            disabled={disabled || isLookupLoader}
            onOpenChange={(open) => {
                if (open) {
                    onFocus?.();
                    // Clear search input when opening to allow fresh search
                    setSearchInput("");
                    // Focus the search input after a short delay to ensure the Select is fully open
                    setTimeout(() => {
                        if (searchInputRef.current) {
                            searchInputRef.current.focus();
                        }
                    }, 100);
                } else {
                    onBlur?.();
                    // Don't clear search input when closing to preserve the current state
                }
            }}
        >
            <SelectTrigger className="w-full" style={style}>
                <SelectValue placeholder={`Select a ${instanceType}`} />
            </SelectTrigger>
            <SelectContent>
                {isShowSearch && (
                    <div className="p-2">
                        <Input
                            ref={searchInputRef}
                            placeholder="Search..."
                            value={searchInput}
                            onChange={handleSearch}
                            onFocus={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full"
                            autoFocus
                        />
                    </div>
                )}
                {isLoader || isInitialLoad ? (
                    <div className="p-4 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                        <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
                    </div>
                ) : filteredItems && filteredItems.length > 0 ? (
                    filteredItems.map((item: any) => (
                        <SelectItem key={item[instanceKey]} value={item[instanceKey]}>
                            {item[instanceLabel]}{instanceSubLabel ? ` (${item[instanceSubLabel]})` : ''}
                        </SelectItem>
                    ))
                ) : (
                    <div className="p-2 text-center text-sm text-muted-foreground">
                        No results found
                    </div>
                )}
            </SelectContent>
        </Select>
    );
}; 