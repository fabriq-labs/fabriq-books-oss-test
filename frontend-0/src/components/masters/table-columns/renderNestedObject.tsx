import React from 'react';

interface MetaDataSelect {
    [key: string]: string;
}

function displayFieldFor(select: MetaDataSelect): string | undefined {
    const marked = Object.keys(select).find((field) => select[field] === 'update');
    if (marked) return marked;
    if (typeof select.name === 'string') return 'name';
    return Object.keys(select).find(
        (field) => field !== 'id' && typeof select[field] === 'string'
    );
}

const renderNestedObject = (record: any, key: string, select: MetaDataSelect) => {
    const displayField = displayFieldFor(select);

    if (!displayField) return '—';

    const nestedObject = record[key];
    if (!nestedObject) return '—';

    return nestedObject[displayField] || '—';
};

export default renderNestedObject; 