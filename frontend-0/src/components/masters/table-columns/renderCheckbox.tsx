import React from 'react';

interface MetaDataSelect {
    [key: string]: string;
}

const renderCheckbox = (record: any, key: string, select?: MetaDataSelect) => {
    const value = record[key];

    // Determine if the value is true/false
    let isTrue = false;

    // Handle boolean values
    if (typeof value === 'boolean') {
        isTrue = value;
    }
    // Handle string representations of boolean
    else if (typeof value === 'string') {
        const lowerValue = value.toLowerCase();
        isTrue = lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes';
    }
    // Handle numeric representations
    else if (typeof value === 'number') {
        isTrue = value === 1;
    }
    // Default fallback
    else {
        isTrue = Boolean(value);
    }

    // Return badge component
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isTrue
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
            }`}>
            {isTrue ? 'Yes' : 'No'}
        </span>
    );
};

export default renderCheckbox; 