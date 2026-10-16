import React from 'react';
import { TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

interface TableColumn {
    key: string;
    title: string;
    visible: boolean;
    align?: 'left' | 'right' | 'center';
}

interface DynamicTableHeaderProps {
    columns: TableColumn[];
    enableMultiSelect?: boolean;
    selectedRows: any[];
    totalRows: number;
    sortField: string | null;
    sortDirection: 'asc' | 'desc';
    onSort: (field: string) => void;
    onSelectAll: (checked: boolean) => void;
    enableCollapsible?: boolean;
}

const DynamicTableHeader: React.FC<DynamicTableHeaderProps> = ({
    columns,
    enableMultiSelect = false,
    selectedRows,
    totalRows,
    sortField,
    sortDirection,
    onSort,
    onSelectAll,
    enableCollapsible = false,
}) => {
    const visibleColumns = columns.filter(col => col.visible);

    return (
        <TableHeader>
            <TableRow className="bg-gray-50">
                {enableMultiSelect && (
                    <TableHead className="w-[50px] pr-4 py-3 pl-[0.1rem]">
                        <div className="flex justify-center">
                            <Checkbox
                                checked={selectedRows.length === totalRows}
                                onCheckedChange={onSelectAll}
                                className="border-gray-300"
                            />
                        </div>
                    </TableHead>
                )}
                {enableCollapsible && (
                    <TableHead className="w-[50px] pr-4 py-3 pl-[0.1rem]">
                        {/* Expand column header - empty but needed for alignment */}
                    </TableHead>
                )}
                {visibleColumns.map((column) => (
                    <TableHead
                        key={column.key}
                        className={`pr-4 py-3 pl-[0.1rem] ${column.align === 'right'
                            ? 'text-right'
                            : column.align === 'center'
                                ? 'text-center'
                                : 'text-left'
                            }`}
                    >
                        <div className={`flex ${column.align === 'right'
                            ? 'justify-end'
                            : column.align === 'center'
                                ? 'justify-center'
                                : 'justify-start'
                            }`}>
                            <Button
                                variant="ghost"
                                onClick={() => onSort(column.key)}
                                className="h-8 hover:bg-gray-100"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                                        {column.title}
                                    </span>
                                    {sortField === column.key && (
                                        sortDirection === 'asc' ? (
                                            <ChevronUp className="h-4 w-4 text-gray-500 flex-shrink-0" />
                                        ) : (
                                            <ChevronDown className="h-4 w-4 text-gray-500 flex-shrink-0" />
                                        )
                                    )}
                                </div>
                            </Button>
                        </div>
                    </TableHead>
                ))}
            </TableRow>
        </TableHeader>
    );
};

export default DynamicTableHeader; 