import React from 'react';
import { TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight } from 'lucide-react';
import CellValue from './CellValue';

interface TableColumn {
    key: string;
    title: string;
    visible: boolean;
    align?: 'left' | 'right' | 'center';
    datatype?: string;
    tableProps?: {
        columnType?: string;
        selectProps?: {
            instanceType?: string;
            instanceLabel?: string;
            instanceSubLabel?: string;
        };
    };
    render?: (value: unknown, record: unknown) => React.ReactNode;
}

/**
 * Map of rowId → columnKey to highlight specific cells.
 */
type CellHighlightMap = Record<string, string>;

interface DynamicTableBodyProps {
    data: any[];
    columns: TableColumn[];
    enableMultiSelect?: boolean;
    selectedRows: any[];
    onSelectRow: (row: any, checked: boolean) => void;
    enableCollapsible?: boolean;
    expandableColumns?: TableColumn[];
    expandedRows?: Set<string>;
    onToggleExpansion?: (rowId: string) => void;
    /** Optional map of rowId → columnKey for cell-level highlighting */
    cellHighlights?: CellHighlightMap;
    /** Optional render function to inject extra content after a row (e.g. suggestion buttons) */
    renderRowExtra?: (row: any) => React.ReactNode | null;
}

const DynamicTableBody: React.FC<DynamicTableBodyProps> = ({
    data,
    columns,
    enableMultiSelect = false,
    selectedRows,
    onSelectRow,
    enableCollapsible = false,
    expandableColumns = [],
    expandedRows = new Set(),
    onToggleExpansion,
    cellHighlights,
    renderRowExtra,
}) => {
    
    // Filter visible columns
    const visibleColumns = columns.filter(col => col.visible);

    const renderCellContent = (column: TableColumn, row: any) => {
        if (column.render) {
            return column.render(row[column.key], row);
        }

        return (
            <CellValue
                value={row[column.key]}
                datatype={column.datatype}
                columnType={column.tableProps?.columnType}
                selectProps={column.tableProps?.selectProps}
                row={row}
                columnKey={column.key}
            />
        );
    };

    const renderExpandableContent = (row: any) => {
        if (expandableColumns.length === 0) return null;

        return (
            <div className="bg-white border-t border-gray-100">
                <div className="px-6 py-3">
                    <div className="space-y-3">
                        {expandableColumns.map((col, index) => {
                            return (
                                <div
                                    key={col.key}
                                    className={`flex items-start gap-4 py-2 ${index !== expandableColumns.length - 1 ? 'border-b border-gray-100' : ''}`}
                                >
                                    <div className="w-32 flex-shrink-0">
                                        <span className="text-xs font-medium text-gray-600">
                                            {col.title}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-gray-900">
                                            {renderCellContent(col, row)}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <TableBody>
            {data?.map((row) => {
                const isExpanded = expandedRows.has(row.id);
                const hasExpandableContent = enableCollapsible && expandableColumns.length > 0;

                const mainRow = (
                    <TableRow key={`${row.id}-main`} className="hover:bg-gray-50 transition-colors">
                        {enableMultiSelect && (
                            <TableCell className="w-[50px] px-4 py-3">
                                <div className="flex justify-center">
                                    <Checkbox
                                        checked={selectedRows.some(r => r.id === row.id)}
                                        onCheckedChange={(checked) => onSelectRow(row, checked as boolean)}
                                        className="border-gray-300"
                                    />
                                </div>
                            </TableCell>
                        )}
                        {enableCollapsible && (
                            <TableCell className="w-[50px] px-4 py-3">
                                {hasExpandableContent ? (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => onToggleExpansion?.(row.id)}
                                        className="p-0 h-6 w-6"
                                    >
                                        {isExpanded ? (
                                            <ChevronDown className="h-4 w-4" />
                                        ) : (
                                            <ChevronRight className="h-4 w-4" />
                                        )}
                                    </Button>
                                ) : null}
                            </TableCell>
                        )}
                        {visibleColumns.map((column) => {
                            const isHighlighted = cellHighlights && cellHighlights[row.id] === column.key;
                            return (
                                <TableCell
                                    key={`${row.id}-${column.key}`}
                                    className={`px-4 py-3 ${column.align === 'right'
                                        ? 'text-right'
                                        : column.align === 'center'
                                            ? 'text-center'
                                            : 'text-left'
                                        }${isHighlighted ? ' bg-primary/10 dark:bg-primary/20 rounded-sm transition-colors' : ''}`}
                                >
                                    <div className={`flex ${column.align === 'right'
                                        ? 'justify-end'
                                        : column.align === 'center'
                                            ? 'justify-center'
                                            : 'justify-start'
                                        }`}>
                                        {renderCellContent(column, row)}
                                    </div>
                                </TableCell>
                            );
                        })}
                    </TableRow>
                );

                const extraRow =
                    renderRowExtra &&
                    (() => {
                        const extra = renderRowExtra(row);
                        if (!extra) return null;
                        return (
                            <TableRow key={`${row.id}-extra`} className="bg-muted/30 border-t-0">
                                <TableCell
                                    colSpan={
                                        (enableMultiSelect ? 1 : 0) +
                                        (enableCollapsible ? 1 : 0) +
                                        visibleColumns.length
                                    }
                                    className="px-4 py-2"
                                >
                                    {extra}
                                </TableCell>
                            </TableRow>
                        );
                    })();

                const expandedRow =
                    isExpanded && hasExpandableContent ? (
                        <TableRow key={`${row.id}-expanded`}>
                            <TableCell
                                colSpan={
                                    (enableMultiSelect ? 1 : 0) +
                                    (enableCollapsible ? 1 : 0) +
                                    visibleColumns.length
                                }
                                className="p-0"
                            >
                                {renderExpandableContent(row)}
                            </TableCell>
                        </TableRow>
                    ) : null;

                // Array of <tr> siblings (no Fragment) — valid inside tbody and keeps row keys explicit.
                return [mainRow, extraRow, expandedRow].filter(Boolean);
            })}
        </TableBody>
    );
};

export default DynamicTableBody; 