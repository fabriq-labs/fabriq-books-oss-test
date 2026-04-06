import React from 'react';
import renderBadges from './renderBadges';
import renderText from './renderText';
import renderNestedObject from './renderNestedObject';
import renderCheckbox from './renderCheckbox';

/** Get value from record by path (e.g. "account.name", "account.legalName"). */
function getValueByPath(record: Record<string, unknown>, path: string): unknown {
    if (!record || !path) return undefined;
    return path.split('.').reduce((obj: any, prop) => obj?.[prop], record);
}

interface SelectProps {
    type?: string;
    limit?: string;
    instanceKey?: string;
    instanceType?: string;
    searchParams?: string;
    instanceLabel?: string;
    instanceSourceKey?: string;
    /** Prisma relation name when it differs from FK-derived key (e.g. legal_entity_id → organization). */
    relationName?: string;
}

interface TableProps {
    columnType?: string;
    width?: string;
    defaultValue?: string;
    selectProps?: SelectProps;
}

interface SearchProps {
    isSearch?: boolean;
    operation?: string;
}

interface MetaDataSelect {
    [key: string]: string;
}

interface MetaDataField {
    displayName?: string;
    isColumnShow?: boolean;
    datatype?: string;
    dataType?: string;
    select?: MetaDataSelect;
    searchProps?: SearchProps;
    permission?: string;
    required?: boolean;
    tableProps?: TableProps;
    listProps?: {
        type: string;
        key?: string;
        label?: string;
        /** Dot-separated path on the row/record to read the value from (e.g. "account.name", "account.legalName"). If omitted, uses the column key. */
        recordPath?: string;
    };
    orderNo?: number;
}

interface MetaData {
    [key: string]: MetaDataField;
}

interface TableColumn {
    key: string;
    title: string;
    visible: boolean;
    align?: 'left' | 'right' | 'center';
    datatype?: string;
    tableProps?: TableProps;
    render?: (value: unknown, record: unknown) => React.ReactNode;
}

export const generateColumns = (
    metaData: MetaData,
    renderActions: (record: unknown) => React.ReactNode
): TableColumn[] => {
    if (!metaData) return [];

    const result: TableColumn[] = [];

    // Sort entries by orderNo (fields with orderNo first, then fields without)
    const sortedEntries = Object.entries(metaData).sort(([, a], [, b]) => {
        const orderA = a.orderNo ?? Infinity;
        const orderB = b.orderNo ?? Infinity;
        return orderA - orderB;
    });

    sortedEntries.forEach(([key, meta]: [string, MetaDataField]) => {
        // Skip if displayName is not provided
        if (!meta.displayName) return;

        // Set alignment based on datatype
        let alignment: 'left' | 'right' | 'center' = 'left';
        const dataType = meta.datatype || meta.dataType;
        if (dataType === 'number' || dataType === 'decimal' || dataType === 'currency') {
            alignment = 'right';
        } else if (dataType === 'date' || dataType === 'datetime') {
            alignment = 'center';
        }

        // Handle listProps column types (badge, text, etc.)
        if (meta.listProps) {
            const listColumn = {
                key,
                title: meta.displayName,
                visible: meta.isColumnShow !== false,
                align: alignment,
                datatype: meta.datatype || meta.dataType,
                tableProps: meta.tableProps,
            };
            const getListValue = (record: Record<string, unknown>) =>
                meta.listProps!.recordPath
                    ? getValueByPath(record, meta.listProps!.recordPath!)
                    : (record as Record<string, unknown>)[key];
            switch (meta.listProps.type) {
                case 'badge':
                    result.push({
                        ...listColumn,
                        render: (value, record) => renderBadges((getListValue(record as Record<string, unknown>) ?? []) as any[], meta.listProps!),
                    });
                    return;
                case 'text':
                    result.push({
                        ...listColumn,
                        render: (value, record) => renderText((getListValue(record as Record<string, unknown>) ?? []) as any[], meta.listProps!),
                    });
                    return;
            }
        }

        // Handle other column types
        if (meta.select && (meta.datatype === 'table' || meta.dataType === 'table')) {
            // Handle nested objects with select property
            result.push({
                key,
                title: meta.displayName,
                visible: meta.isColumnShow !== false,
                align: alignment,
                datatype: meta.datatype || meta.dataType,
                tableProps: meta.tableProps,
                render: (value, record) => renderNestedObject(record, key, meta.select!)
            });
        }
        else if (meta.isColumnShow && meta.tableProps?.columnType === 'checkbox') {
            result.push({
                key,
                title: meta.displayName,
                visible: true,
                align: 'center',
                datatype: meta.datatype || meta.dataType,
                tableProps: meta.tableProps,
                render: (value, record) => renderCheckbox(record, key, meta.select!)
            });
        }
        else {
            // Regular fields
            result.push({
                key,
                title: meta.displayName,
                visible: meta.isColumnShow,
                align: alignment,
                datatype: meta.datatype || meta.dataType,
                tableProps: meta.tableProps,
            });
        }
    });

    // Add action column
    result.push({
        key: 'actions',
        title: 'Actions',
        visible: true,
        align: 'right',
        render: (_, record) => (
            <>
                {renderActions && renderActions(record)}
            </>
        ),
    });

    return result;
};

export type { MetaData, MetaDataField, TableColumn }; 