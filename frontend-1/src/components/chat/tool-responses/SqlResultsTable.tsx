import React from 'react';
import { format } from 'date-fns';

interface SqlColumn {
    field: string;
    label: string;
}

interface SqlResultsTableProps {
    data: Record<string, any>[];
    columns: SqlColumn[];
    resultType: string;
}

// Status Badge Component
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const getBadgeStyle = (status: string) => {
        const lowerStatus = status.toLowerCase();

        if (lowerStatus.includes('active') || lowerStatus.includes('issued') || lowerStatus.includes('approved')) {
            return 'bg-green-100 text-green-800 border-green-200';
        } else if (lowerStatus.includes('completed') || lowerStatus.includes('done')) {
            return 'bg-blue-100 text-blue-800 border-blue-200';
        } else if (lowerStatus.includes('pending') || lowerStatus.includes('waiting')) {
            return 'bg-yellow-100 text-yellow-800 border-yellow-200';
        } else if (lowerStatus.includes('rejected') || lowerStatus.includes('cancelled') || lowerStatus.includes('failed')) {
            return 'bg-red-100 text-red-800 border-red-200';
        } else if (lowerStatus.includes('draft')) {
            return 'bg-gray-100 text-gray-800 border-gray-200';
        } else {
            return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    return (
        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getBadgeStyle(status)}`}>
            {status}
        </span>
    );
};

export const SqlResultsTable: React.FC<SqlResultsTableProps> = ({
    data,
    columns,
    resultType
}) => {
    if (!data || data.length === 0) {
        return (
            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border">
                <p>No data returned from the query</p>
            </div>
        );
    }

    const formatValue = (value: any, field: string): React.ReactNode => {
        if (value === null || value === undefined) {
            return '-';
        }

        // Handle date fields - show only date, month, year (no time)
        if (field.includes('_at') || field.includes('date') || field.includes('created') || field.includes('updated')) {
            try {
                const date = new Date(value);
                if (!isNaN(date.getTime())) {
                    return format(date, 'MMM dd, yyyy');
                }
            } catch (e) {
                // Fallback to original value if date parsing fails
            }
        }

        // Handle status fields - show as badges
        if (field.includes('status') || field.includes('state')) {
            return <StatusBadge status={String(value)} />;
        }

        // Handle boolean values
        if (typeof value === 'boolean') {
            return value ? 'Yes' : 'No';
        }

        // Handle long text
        if (typeof value === 'string' && value.length > 50) {
            return value.substring(0, 50) + '...';
        }

        return String(value);
    };

    return (
        <div className="rounded-lg border bg-white overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b bg-gray-50">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-700">
                        SQL Query Results
                    </h3>
                    <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded-full">
                        {data.length} row{data.length !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            {columns.map((column, index) => (
                                <th
                                    key={index}
                                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200"
                                >
                                    {column.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {data.map((row, rowIndex) => (
                            <tr
                                key={rowIndex}
                                className="hover:bg-gray-50 transition-colors"
                            >
                                {columns.map((column, colIndex) => (
                                    <td
                                        key={colIndex}
                                        className="px-4 py-3 text-sm text-gray-900 border-b border-gray-100"
                                    >
                                        <div className="max-w-xs">
                                            {formatValue(row[column.field], column.field)}
                                        </div>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {resultType && (
                <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
                    <p className="text-xs text-gray-500">
                        Result type: <span className="font-mono bg-gray-200 px-1 rounded">{resultType}</span>
                    </p>
                </div>
            )}
        </div>
    );
}; 