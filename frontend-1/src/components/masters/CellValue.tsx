import React from 'react';
import moment from 'moment';
import SelectCell from './SelectCell';

interface CellValueProps {
    value: any;
    datatype?: string;
    columnType?: string;
    selectProps?: {
        instanceType?: string;
        instanceLabel?: string;
        instanceSubLabel?: string;
        instanceSourceKey?: string;
        /** Prisma relation name when it differs from FK-derived key (e.g. legal_entity_id → organization). */
        relationName?: string;
    };
    row: any;
    columnKey?: string;
}

const CellValue: React.FC<CellValueProps> = ({
    value,
    datatype,
    columnType,
    selectProps,
    row,
    columnKey,
}) => {
    if (columnType === 'select') {
        return (
            <SelectCell
                row={row}
                instanceType={selectProps?.instanceType}
                instanceLabel={selectProps?.instanceLabel}
                instanceSubLabel={selectProps?.instanceSubLabel}
                instanceSourceKey={selectProps?.instanceSourceKey}
                relationName={selectProps?.relationName}
                columnKey={columnKey}
            />
        );
    }

    if (value === null || value === undefined) {
        return <span className="text-gray-400">—</span>;
    }

    switch (datatype?.toLowerCase()) {
        case 'date':
            return (
                <span className="text-sm text-gray-700">
                    {moment(value).format('DD-MM-YYYY')}
                </span>
            );
        case 'datetime':
            return (
                <span className="text-sm text-gray-700">
                    {moment(value).format('DD-MM-YYYY HH:mm')}
                </span>
            );
        default:
            // Check if the value looks like a date string (ISO format)
            if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
                return (
                    <span className="text-sm text-gray-700">
                        {moment(value).format('DD-MM-YYYY')}
                    </span>
                );
            }
            return (
                <span className="text-sm text-gray-700">
                    {value}
                </span>
            );
    }
};

export default CellValue; 