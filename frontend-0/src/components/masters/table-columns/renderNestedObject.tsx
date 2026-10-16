import React from 'react';

interface MetaDataSelect {
    [key: string]: string;
}

const renderNestedObject = (record: any, key: string, select: MetaDataSelect) => {
    // Find the field to use for display
    const displayField = Object.keys(select).find(
        (field) => select[field] === 'update'
    );

    if (!displayField) return '—';

    const nestedObject = record[key];
    if (!nestedObject) return '—';

    return nestedObject[displayField] || '—';
};

export default renderNestedObject; 