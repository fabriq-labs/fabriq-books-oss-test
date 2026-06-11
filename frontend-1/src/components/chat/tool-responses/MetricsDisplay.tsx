import React from 'react';
import { useCurrencyFormatting } from '@/utils/currencyUtils';

interface Column {
    field: string;
    label: string;
    dataType?: string;
    isCurrency?: boolean;
    currency?: string;
    format?: string;
    precision?: number;
}

interface MetricsDisplayProps {
    data: any[];
    columns: Column[];
    toolName: string;
    description?: string;
    hideToolBadge?: boolean;
}

export const MetricsDisplay: React.FC<MetricsDisplayProps> = ({
    data,
    columns,
    toolName,
    description,
    hideToolBadge = false,
}) => {
    const { formatCurrency, getBaseCurrencyCode } = useCurrencyFormatting();
    const sessionCurrency = getBaseCurrencyCode(); // Get currency from user session

    if (!data || data.length === 0) {
        return null;
    }

    // Tool name badge

    // Description element

    // Determine icon and color based on metadata


    // Format value based on metadata
    const formatValue = (value: any, isCurrency?: boolean, format?: string, currency?: string, precision?: number) => {
        if (value === null) return 'N/A';

        // Convert string numbers to actual numbers
        let numValue: number;
        if (typeof value === 'string' && !isNaN(Number(value))) {
            numValue = Number(value);
        } else if (typeof value === 'number') {
            numValue = value;
        } else {
            return String(value);
        }

        if (isCurrency || format === 'currency') {
            // Use the session currency formatting with session currency as default
            return formatCurrency(numValue, {
                minimumFractionDigits: precision || 0,
                maximumFractionDigits: precision || 2
            });
        } else if (format === 'percentage') {
            // Handle percentage formatting with proper decimal places
            const displayPrecision = precision !== null && precision !== undefined ? precision : 1;
            return `${numValue.toFixed(displayPrecision)}%`;
        } else {
            return new Intl.NumberFormat('en-US', {
                minimumFractionDigits: precision || 0,
                maximumFractionDigits: precision || 2
            }).format(numValue);
        }
    };

    return (
        <div className="w-full space-y-3">
            {!hideToolBadge && (
            <div className="mb-2">
                <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                    <svg
                        className="w-3 h-3 mr-1.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        />
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                    </svg>
                    {toolName}
                </div>
            </div>
            )}

            {/* Description - Same style as ToolResponseRenderer */}
            {!hideToolBadge && description && (
                <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-700">{description}</p>
                </div>
            )}

            {/* Single Metric Display - Style 3: Card with Background */}
            <div className="w-full">
                {/* Handle new data structure - data is now an object with multiple metrics */}
                {data && typeof data === 'object' && !Array.isArray(data) ? (
                    // New structure: data is an object with multiple metrics
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(data).map(([key, value]) => {
                            // Find the corresponding column metadata
                            const column = columns?.find(col => col.field === key);
                            const label = column?.label || key;
                            const dataType = column?.dataType;
                            const isCurrency = column?.isCurrency;
                            const currency = column?.currency || 'USD';
                            const format = column?.format;
                            const precision = column?.precision;

                            return (
                                <div key={key} className="bg-gradient-to-br from-purple-100 to-pink-100 border border-purple-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-all duration-200">
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-purple-700 mb-1">
                                            {formatValue(value, isCurrency, format, sessionCurrency, precision)}
                                        </div>
                                        <div className="text-sm text-purple-600 font-medium">
                                            {label.replace(/_/g, ' ')}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    // Fallback for old array structure
                    Array.isArray(data) && data.map((metric: any, metricIndex: number) => (
                        <div key={metricIndex} className="flex justify-start w-full">
                            <div className="bg-gradient-to-br from-purple-100 to-pink-100 border border-purple-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-all duration-200 max-w-xs w-full">
                                {Object.entries(metric).map(([key, value]) => {
                                    // Find the corresponding column metadata
                                    const column = columns?.find(col => col.field === key);
                                    const label = column?.label || key;
                                    const dataType = column?.dataType;
                                    const isCurrency = column?.isCurrency;
                                    const currency = column?.currency || 'USD';
                                    const format = column?.format;
                                    const precision = column?.precision;

                                    return (
                                        <div key={key} className="text-center">
                                            <div className="text-2xl font-bold text-purple-700 mb-1">
                                                {formatValue(value, isCurrency, format, sessionCurrency, precision)}
                                            </div>
                                            <div className="text-sm text-purple-600 font-medium">
                                                {label.replace(/_/g, ' ')}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}; 