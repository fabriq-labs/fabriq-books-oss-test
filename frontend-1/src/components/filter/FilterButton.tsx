import { Filter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import React, { useEffect, useState } from "react";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

interface FilterButtonProps {
    onClick: () => void;
    filterCount: number;
    setFilterSearchOutput?: (value: any) => void;
    filterConfig?: {
        enableFilters: boolean;
        enableSearch: boolean;
    };
    metaData: object
}


const getMetadataDropdownValues = (metaData: object) => {

    return metaData && Object.entries(metaData)
        .filter(([_, value]) => value?.isColumnShow && value?.datatype !== "date")
        .map(([key, value]) => (
            {
                value: key,
                label: value.displayName
            }
        ))
}
export function FilterButton({ onClick, filterCount, setFilterSearchOutput, filterConfig, metaData }: FilterButtonProps) {
    const isActive = filterCount > 0;
    const metaList = getMetadataDropdownValues(metaData);
    const [selectedSearchFiled, setSelectedSearchFiled] = useState<string>(metaList[0]?.value || "");
    const [searchTerm, setSearchTerm] = useState<string | undefined>(undefined);

    useEffect(() => {
        const updateFilters = () => {
            const newFilters = {};
            if (searchTerm && searchTerm.length >= 3) {
                newFilters[selectedSearchFiled] = {
                    contains: searchTerm
                };
                setFilterSearchOutput(newFilters);
            }


        };
        const debounceTimer = setTimeout(updateFilters, 300);
        return () => clearTimeout(debounceTimer);
    }, [searchTerm, selectedSearchFiled]);

    const handleClearSearch = () => {
        setSearchTerm("");
        setFilterSearchOutput(undefined);
        setSelectedSearchFiled(metaList[0]?.value || "");

    };

    return (
        <React.Fragment>
            {filterConfig?.enableSearch && <div className="flex gap-2">
                <Select
                    value={selectedSearchFiled}
                    onValueChange={(value) => setSelectedSearchFiled(value)}
                >
                    <SelectTrigger className="w-[170px] bg-[#F1F0FB] border-[#E5DEFF]">
                        <SelectValue placeholder="Select Search field" />
                    </SelectTrigger>
                    <SelectContent>
                        {metaData && Object.entries(metaData)
                            .filter(([_, value]) => value?.isColumnShow && value?.datatype !== "date")
                            .map(([key, value]) => (
                                <SelectItem key={key} value={key}>{value.displayName}</SelectItem>
                            ))
                        }
                    </SelectContent>
                </Select>
                <div className="relative">
                    <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search text"
                        className="pl-9 pr-8 py-2 w-[250px] bg-[#F1F0FB] border-[#E5DEFF]"
                    />
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-primary" />
                    {searchTerm && (
                        <button
                            onClick={handleClearSearch}
                            className="absolute right-2.5 top-2.5"
                        >
                            <X className="h-4 w-4 text-[#9b87f5] hover:text-primary" />
                        </button>
                    )}
                </div>
            </div>
            }
            <Button
                variant={isActive ? "default" : "outline"}
                className={`flex items-center gap-2 px-5 py-2 rounded-md transition-colors
        ${isActive
                        ? "bg-primary text-white hover:bg-primary"
                        : "border border-primary text-primary hover:bg-[#f1f0fb]"}
      `}
                onClick={onClick}
            >
                <Filter className={`h-4 w-4 ${isActive ? "text-white" : "text-primary"}`} />
                <span>Filter</span>
                {filterCount > 0 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 ml-1 text-xs font-bold text-primary bg-[#E5DEFF] rounded-full">
                        {filterCount}
                    </span>
                )}
            </Button>
        </React.Fragment>

    );
}