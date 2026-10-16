import React, { useState, useEffect } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { CheckCircle2, CircleDashed, AlertCircle } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";


type TransactionDataTableProps = {
    onBack: () => void;
    onUpload: () => void;
    clearImport: () => void;
    csvHeaders: string[];
    csvData: Record<string, string>[];
    metaData: any;
};

const TransactionDataTable = ({ onBack, onUpload, metaData, csvHeaders, csvData }: TransactionDataTableProps) => {
    const csvColumnHeaders = Object.keys(metaData).filter(key => metaData[key].isColumnShow === true);
    const { toast } = useToast();
    const [selectedColumns, setSelectedColumns] = useState<Record<number, string | null>>({});

    // State to track resolved values from A
    // PI for select columns
    const [resolvedValues, setResolvedValues] = useState<Record<string, Record<string, any>>>({});
    const [isLoading, setIsLoading] = useState<Record<number, boolean>>({});
    const [mappedData, setMappedData] = useState<Record<string, any>>();

    const handleUpload = () => {
        console.log("csvHeaders.map:", csvHeaders.map((header, index) => metaData[selectedColumns[index]]))
        console.log("selectedColumns", selectedColumns);
        console.log("resolvedValues", resolvedValues);

    }
    // // Mock API function to fetch data based on column type
    // const fetchDataFromAPI = async (fieldKey: string, searchValue: string) => {
    //     // Simulate API call with timeout
    //     return new Promise<any>((resolve) => {
    //         setTimeout(() => {
    //             // Check if the field has tableProps with columnType "select"
    //             const fieldDef = metaData[fieldKey as keyof typeof metaData];

    //             if (fieldDef && 'tableProps' in fieldDef && fieldDef.tableProps?.columnType === 'select') {
    //                 const { selectProps } = fieldDef.tableProps;
    //                 const { instanceType, searchParams, instanceKey } = selectProps as any;

    //                 // For this example, we're using the mockAccountsAPI as our data source
    //                 if (instanceType === 'account') {
    //                     const result = mockAccountsAPI.find(item =>
    //                         item[searchParams as keyof typeof item]?.toLowerCase() === searchValue.toLowerCase()
    //                     );

    //                     if (result) {
    //                         resolve({
    //                             found: true,
    //                             id: result[instanceKey as keyof typeof result],
    //                             data: result
    //                         });
    //                     } else {
    //                         resolve({
    //                             found: false,
    //                             message: `No match found for "${searchValue}"`,
    //                         });
    //                     }
    //                 } else {
    //                     resolve({ found: false, message: "Unsupported instance type" });
    //                 }
    //             } else {
    //                 resolve({ found: false, message: "Field is not a select type" });
    //             }
    //         }, 300); // Simulate network delay
    //     });
    // };

    // Get fields that can be updated (permission: "update")
    const getSelectableFields = () => {
        return Object.entries(metaData)
            .filter(([_, value]: [string, any]) => value.permission === "update")
            .map(([key, value]: [string, any]) => ({
                key,
                label: value.displayName || key,
                required: !!value.required,
                tableProps: value.tableProps
            }));
    };

    const mapColumnsToSelectableFields = (metaColumn, csvColumn) => {
        setMappedData((prevState) => ({ ...prevState, [metaColumn]: csvColumn }));
        console.log("mappedData", mappedData);

    }

    const handleColumnSelect = (index: number, value: string | null) => {
        // Convert "none" to null for our internal state
        const normalizedValue = value === "none" ? null : value;

        // Check if this value is already selected in another column
        const existingColumnIndex = Object.entries(selectedColumns).find(
            ([colIndex, colValue]) => colValue === normalizedValue && parseInt(colIndex) !== index && normalizedValue !== null
        );

        // If found, clear that column
        const newSelectedColumns = { ...selectedColumns };
        if (existingColumnIndex && normalizedValue !== null) {
            newSelectedColumns[parseInt(existingColumnIndex[0])] = null;
        }

        // Update current column
        newSelectedColumns[index] = normalizedValue;
        setSelectedColumns(newSelectedColumns);
        console.log(selectedColumns);

        // If the selected field is a select type, resolve values from API
        if (normalizedValue) {
            const field = selectableFields.find(field => field.key === normalizedValue);
            if (field?.tableProps?.columnType === 'select') {
                resolveValuesForColumn(index, normalizedValue);
            }
        }
    };
    // Resolve all values for a column from the API
    const resolveValuesForColumn = async (columnIndex: number, fieldKey: string) => {
        setIsLoading((prev) => ({ ...prev, [columnIndex]: true }));

        // Get the field definition
        const fieldDef = metaData[fieldKey as keyof typeof metaData];

        if (fieldDef && 'tableProps' in fieldDef && fieldDef.tableProps?.columnType === 'select') {
            const { selectProps } = fieldDef.tableProps;
            const { searchParams } = selectProps as any;

            // Get unique values from the column
            const columnValues = csvData.map(row => Object.values(row)[columnIndex]);
            const uniqueValues = [...new Set(columnValues)].filter(Boolean);

            const results: Record<string, any> = {};

            // Resolve each unique value
            // for (const value of uniqueValues) {
            //     if (typeof value === 'string') {
            //         const result = await fetchDataFromAPI(fieldKey, value);
            //         results[value] = result;
            //     }
            // }

            setResolvedValues(prev => ({
                ...prev,
                [fieldKey]: results
            }));
        }

        setIsLoading((prev) => ({ ...prev, [columnIndex]: false }));
    };

    const selectableFields = getSelectableFields();

    // Check if a column is mapped to a field
    const isColumnMapped = (index: number) => {
        return !!selectedColumns[index];
    };

    // Check if a column is mapped to a required field
    const isRequiredField = (index: number) => {
        if (!selectedColumns[index]) return false;
        const field = selectableFields.find(field => field.key === selectedColumns[index]);
        return field ? field.required : false;
    };

    // Check if the selected column is a select type
    const isSelectTypeColumn = (index: number) => {
        if (!selectedColumns[index]) return false;
        const field = selectableFields.find(field => field.key === selectedColumns[index]);
        return field?.tableProps?.columnType === 'select';
    };

    // Get resolved value for a cell
    const getResolvedValue = (columnIndex: number, rowValue: string) => {
        const fieldKey = selectedColumns[columnIndex];
        if (!fieldKey || !rowValue) return null;

        return resolvedValues[fieldKey]?.[rowValue] || null;
    };

    // Render cell with appropriate content based on resolution status
    const renderCellContent = (columnIndex: number, rowValue: string) => {
        if (!selectedColumns[columnIndex]) return rowValue || "—";

        if (isSelectTypeColumn(columnIndex)) {
            const resolved = getResolvedValue(columnIndex, rowValue);

            if (isLoading[columnIndex]) {
                return <span className="text-gray-400">Loading...</span>;
            }

            if (!rowValue) return "—";

            if (!resolved) {
                return <span className="flex items-center space-x-1"><span>{rowValue}</span></span>;
            }

            if (resolved.found) {
                return (
                    <div className="flex flex-col">
                        <span className="text-purple-700 font-medium">{rowValue}</span>
                        <span className="text-xs text-gray-500">ID: {resolved.id}</span>
                    </div>
                );
            } else {
                return (
                    <div className="flex items-center space-x-1 text-amber-600">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>{rowValue}</span>
                        <span className="text-xs bg-amber-100 px-1 py-0.5 rounded">Not found</span>
                    </div>
                );
            }
        }

        return rowValue || "—";
    };

    useEffect(() => {
        // Check for select type columns and resolve their values when component loads
        Object.entries(selectedColumns).forEach(([index, fieldKey]) => {
            if (fieldKey) {
                const field = selectableFields.find(field => field.key === fieldKey);
                if (field?.tableProps?.columnType === 'select') {
                    resolveValuesForColumn(parseInt(index), fieldKey);
                }
            }
        });
    }, []);  // eslint-disable-line react-hooks/exhaustive-deps
    console.log(csvData);
    return (
        <div className="w-full">
            <h2 className="text-xl font-semibold mb-6 pb-2 border-b">Data for Import</h2>
            <div className="border rounded-md overflow-hidden">
                <Table>
                    <TableHeader className="bg-gray-100">
                        <TableRow>
                            <TableHead className="w-[40px]">
                                <Checkbox />
                            </TableHead>
                            {csvHeaders.map((_, index) => (
                                <TableHead
                                    key={index}
                                    className={`py-3 ${isColumnMapped(index) ? 'bg-purple-100/50 text-purple-800' : ''}`}
                                >
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5 mb-3">
                                            <span className="font-medium text-sm">{csvHeaders[index]}</span>
                                            {isSelectTypeColumn(index) && (
                                                <span className="text-xs bg-blue-100/80 text-blue-800 px-1.5 py-0.5 rounded-sm">API</span>
                                            )}
                                        </div>
                                        <Select
                                            value={selectedColumns[index] || "none"}
                                            onValueChange={(value) => {
                                                handleColumnSelect(index, value);
                                                mapColumnsToSelectableFields(value, csvHeaders[index])
                                            }
                                            }                                        >
                                            <SelectTrigger className={`w-full h-8 text-sm border-0 `}>
                                                <SelectValue placeholder="Select field" />
                                            </SelectTrigger>
                                            <SelectContent className="max-h-[200px]">
                                                <SelectItem value="none" className="text-sm">Select field</SelectItem>
                                                {selectableFields.map((field) => (
                                                    <SelectItem key={field.key} value={field.key} className="text-sm">
                                                        {field.label}{field.required ? ' *' : ''}
                                                        {field.tableProps?.columnType === 'select' && (
                                                            <span className="ml-1 text-xs text-blue-600">(API)</span>
                                                        )}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </TableHead>
                            ))}
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {csvData.map((row, i) => (
                            <TableRow key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                                <TableCell>
                                    <Checkbox />
                                </TableCell>
                                {csvHeaders.map((_, index) => {
                                    const cellValue = Object.values(row)[index] || "";
                                    const hasApiError = isSelectTypeColumn(index) &&
                                        cellValue &&
                                        getResolvedValue(index, cellValue as string)?.found === false;

                                    return (
                                        <TableCell
                                            key={index}
                                            className={`${isColumnMapped(index) ? 'bg-purple-50/30' : ''} 
                                ${hasApiError ? 'bg-amber-50' : ''}`}
                                        >
                                            {renderCellContent(index, cellValue as string)}
                                        </TableCell>
                                    );
                                })}
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0" title="Edit">
                                                <span className="sr-only">Edit</span>
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    width="14"
                                                    height="14"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                >
                                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                                </svg>
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem>Edit</DropdownMenuItem>
                                            <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <div className="mt-4 flex items-center justify-between">
                <Pagination>
                    <PaginationContent>
                        <PaginationItem>
                            <PaginationPrevious href="#" />
                        </PaginationItem>
                        <PaginationItem>
                            <PaginationLink href="#" isActive>1</PaginationLink>
                        </PaginationItem>
                        <PaginationItem>
                            <PaginationLink href="#">2</PaginationLink>
                        </PaginationItem>
                        <PaginationItem>
                            <PaginationNext href="#" />
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
                <div className="text-sm text-gray-500">10 / page</div>
            </div>

            <div className="mt-8 flex justify-end gap-4">
                <Button variant="outline" onClick={onBack}>Discard</Button>
                <Button
                    onClick={handleUpload}
                    className="bg-purple-600 hover:bg-purple-700"
                    disabled={
                        // Disable if required fields are not selected
                        selectableFields
                            .filter(field => field.required)
                            .some(field => !Object.values(selectedColumns).includes(field.key)) ||
                        // Or if any select-type column has values that couldn't be resolved
                        Object.entries(selectedColumns).some(([index, fieldKey]) => {
                            if (!fieldKey) return false;

                            const field = selectableFields.find(f => f.key === fieldKey);
                            if (field?.tableProps?.columnType !== 'select') return false;

                            const columnIndex = parseInt(index);
                            const columnValues = csvData
                                .map(row => Object.values(row)[columnIndex])
                                .filter(Boolean) as string[];

                            return columnValues.some(value => {
                                const resolved = resolvedValues[fieldKey]?.[value];
                                return resolved && !resolved.found;
                            });
                        })
                    }
                >
                    Upload CSV
                </Button>
            </div>
        </div>
    );
};

export default TransactionDataTable;
