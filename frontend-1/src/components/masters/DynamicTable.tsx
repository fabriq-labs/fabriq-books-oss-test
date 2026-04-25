import React, { useMemo, useState, forwardRef, useImperativeHandle, useEffect } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import moment from 'moment';
import { Checkbox } from '@/components/ui/checkbox';
import DynamicTableBody from './DynamicTableBody';
import DynamicTableHeader from './DynamicTableHeader';
import { generateColumns, type TableColumn } from './table-columns';
import type { CustomRowRenderer } from '@/types/customRowRenderer';

interface ApiResponse {
    data: Record<string, any>[];
    metaData: any;
    total?: number;
    field_sets?: Record<string, boolean>;
}

/**
 * Map of rowId → columnKey to highlight specific cells.
 * Used e.g. to highlight the predicted counter-account after AI reconciliation.
 */
export type CellHighlightMap = Record<string, string>;

interface DynamicTableProps {
    data: any;
    isLoading: boolean;
    renderActions: any;
    onSelectionChange?: (selectedRows: any[]) => void;
    enableMultiSelect?: boolean;
    enableCollapsible?: boolean;
    collapsibleMainColumnsCount?: number;
    /** Optional map of rowId → columnKey for cell-level highlighting */
    cellHighlights?: CellHighlightMap;
    /** Optional render function to inject extra content after a row (e.g. suggestion buttons) */
    renderRowExtra?: (row: any) => React.ReactNode | null;
    /** When provided, replaces metadata-generated columns and body rendering */
    customRowRenderer?: CustomRowRenderer;
}

const DynamicTable = forwardRef<any, DynamicTableProps>(({
    data,
    isLoading,
    renderActions,
    onSelectionChange,
    enableMultiSelect = false,
    enableCollapsible = false,
    collapsibleMainColumnsCount = 3,
    cellHighlights,
    renderRowExtra,
    customRowRenderer,
}, ref) => {
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [selectedRows, setSelectedRows] = useState<any[]>([]);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    useEffect(() => {
        setSelectedRows([]);
    }, [data]);

    useEffect(() => {
        return () => {
            setSelectedRows([]);
        };
    }, []);

    useImperativeHandle(ref, () => ({
        clearSelection: () => {
            setSelectedRows([]);
        }
    }));

    // Generate table columns from metadata using the new modular system
    const columns = useMemo(() => {
        if (customRowRenderer) {
            // Map custom column defs to TableColumn format for DynamicTableHeader
            return customRowRenderer.columns.map(col => ({
                key: col.key,
                title: col.title,
                visible: true,
                align: col.align,
                width: col.width,
                sortKey: col.sortKey,
            })) as TableColumn[];
        }
        if (!data?.metaData) return [];
        return generateColumns(data.metaData, renderActions);
    }, [data?.metaData, renderActions, customRowRenderer]);

    // Sort the data
    const sortedData = useMemo(() => {
        if (!data?.data || !sortField) return data?.data;

        return [...data.data].sort((a, b) => {
            let aValue = a[sortField];
            let bValue = b[sortField];

            // Handle nested objects
            if (typeof aValue === 'object' && aValue !== null) {
                // Check metadata to find the display field
                const meta = data.metaData[sortField];
                const displayField = meta.select ?
                    Object.keys(meta.select).find(field => meta.select[field] === 'update') :
                    null;

                aValue = displayField && aValue ? aValue[displayField] : null;
                bValue = displayField && bValue ? bValue[displayField] : null;
            }

            // Handle null values
            if (aValue === null) return sortDirection === 'asc' ? -1 : 1;
            if (bValue === null) return sortDirection === 'asc' ? 1 : -1;

            // Numeric sort when column is numeric per metadata (handles string numbers e.g. "922.85")
            const meta = data.metaData?.[sortField];
            const dataType = meta?.datatype || meta?.dataType || '';
            const numericTypes = ['number', 'decimal', 'currency', 'int', 'float'];
            if (numericTypes.includes(dataType)) {
                const aNum = Number(aValue);
                const bNum = Number(bValue);
                // Sort NaN to end (asc or desc)
                const aSort = Number.isNaN(aNum) ? (sortDirection === 'asc' ? Infinity : -Infinity) : aNum;
                const bSort = Number.isNaN(bNum) ? (sortDirection === 'asc' ? Infinity : -Infinity) : bNum;
                return sortDirection === 'asc' ? aSort - bSort : bSort - aSort;
            }

            // Compare when both values are already numbers (no metadata hint)
            if (typeof aValue === 'number' && typeof bValue === 'number') {
                return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
            }

            // Default string comparison
            const aString = String(aValue).toLowerCase();
            const bString = String(bValue).toLowerCase();
            return sortDirection === 'asc'
                ? aString.localeCompare(bString)
                : bString.localeCompare(aString);
        });
    }, [data?.data, sortField, sortDirection, data?.metaData]);

    const handleSort = (columnKey: string) => {
        // When using a custom renderer, resolve sortKey from the column def
        let field = columnKey;
        if (customRowRenderer) {
            const colDef = customRowRenderer.columns.find(c => c.key === columnKey);
            if (!colDef?.sortKey) return; // column is not sortable
            field = colDef.sortKey;
        }
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedRows(sortedData || []);
        } else {
            setSelectedRows([]);
        }
    };

    const handleSelectRow = (row: any, checked: boolean) => {
        if (checked) {
            setSelectedRows([...selectedRows, row]);
        } else {
            setSelectedRows(selectedRows.filter(r => r.id !== row.id));
        }
    };

    // Notify parent component when selection changes
    React.useEffect(() => {
        if (onSelectionChange) {
            onSelectionChange(selectedRows);
        }
    }, [selectedRows, onSelectionChange]);

    // Filter visible columns
    const visibleColumns = useMemo(() => {
        return columns.filter(col => col.visible);
    }, [columns]);

    // Split columns for collapsible mode - separate actions column
    const { dataColumns, actionsColumn } = useMemo(() => {
        const dataCols = visibleColumns.filter(col => col.key !== 'actions');
        const actionCol = visibleColumns.find(col => col.key === 'actions');
        return { dataColumns: dataCols, actionsColumn: actionCol };
    }, [visibleColumns]);

    // Split columns for collapsible mode
    const mainColumns = useMemo(() => {
        if (!enableCollapsible) return visibleColumns;
        // Take first N data columns + actions column at the end
        const mainDataColumns = dataColumns.slice(0, collapsibleMainColumnsCount);
        return actionsColumn ? [...mainDataColumns, actionsColumn] : mainDataColumns;
    }, [enableCollapsible, visibleColumns, dataColumns, actionsColumn, collapsibleMainColumnsCount]);

    const expandableColumns = useMemo(() => {
        if (!enableCollapsible) return [];
        // Remaining data columns (actions is not in expandable)
        return dataColumns.slice(collapsibleMainColumnsCount);
    }, [enableCollapsible, dataColumns, collapsibleMainColumnsCount]);

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!data?.data || data.data.length === 0) {
        return <div className="text-center py-8">No data available</div>;
    }

    const toggleRowExpansion = (rowId: string) => {
        setExpandedRows(prev => {
            const newSet = new Set(prev);
            if (newSet.has(rowId)) {
                newSet.delete(rowId);
            } else {
                newSet.add(rowId);
            }
            return newSet;
        });
    };

    return (
        <div className="rounded-md border">
            <Table>
                <DynamicTableHeader
                    columns={customRowRenderer ? columns : (enableCollapsible ? mainColumns : columns)}
                    enableMultiSelect={enableMultiSelect}
                    selectedRows={selectedRows}
                    totalRows={sortedData?.length || 0}
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    onSelectAll={handleSelectAll}
                    enableCollapsible={!customRowRenderer && enableCollapsible}
                />
                {customRowRenderer ? (
                    <TableBody>
                        {(sortedData || []).map((record) => {
                            const isSelected = selectedRows.some(r => r.id === record.id);
                            const actions = renderActions(record);
                            const rowCls = customRowRenderer.rowClassName?.(record);
                            const extraContent = renderRowExtra?.(record);
                            // Multiple <tr> siblings: use an array with per-row keys (valid inside tbody).
                            return [
                                <TableRow key={`${record.id}-main`} className={rowCls}>
                                    {customRowRenderer.renderCells(record, {
                                        isSelected,
                                        onSelect: (checked) => handleSelectRow(record, checked),
                                        actions,
                                    })}
                                </TableRow>,
                                ...(extraContent
                                    ? [
                                        <TableRow key={`${record.id}-extra`}>
                                            {/* +1 for the select-all checkbox column rendered by DynamicTableHeader */}
                                            <TableCell colSpan={customRowRenderer.columns.length + 1} className="p-0">
                                                {extraContent}
                                            </TableCell>
                                        </TableRow>,
                                    ]
                                    : []),
                            ];
                        })}
                    </TableBody>
                ) : (
                    <DynamicTableBody
                        data={sortedData || []}
                        columns={enableCollapsible ? mainColumns : columns}
                        enableMultiSelect={enableMultiSelect}
                        selectedRows={selectedRows}
                        onSelectRow={handleSelectRow}
                        enableCollapsible={enableCollapsible}
                        expandableColumns={expandableColumns}
                        expandedRows={expandedRows}
                        onToggleExpansion={toggleRowExpansion}
                        cellHighlights={cellHighlights}
                        renderRowExtra={renderRowExtra}
                    />
                )}
            </Table>
        </div>
    );
});

export default DynamicTable;