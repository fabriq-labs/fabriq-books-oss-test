import React from 'react';

interface ListProps {
    key?: string;
    label?: string;
}

function getDisplayValue(item: any, listProps: ListProps): string | null {
    if (item == null) return null;
    let label = item;
    if (listProps.label && typeof item === 'object') {
        const labelPath = listProps.label.split('.');
        label = labelPath.reduce((obj: any, prop: string) => obj?.[prop], item);
    }
    return label != null && label !== '' ? String(label) : null;
}

/**
 * Renders a single value or array of items as plain text (single value as-is, array as comma-separated).
 * Uses listProps.label with dot notation when the value is an object.
 */
const renderText = (value: any, listProps: ListProps): React.ReactNode => {
    if (value == null) return '—';

    if (Array.isArray(value)) {
        const parts = value.map((item) => getDisplayValue(item, listProps)).filter(Boolean);
        if (parts.length === 0) return '—';
        return parts.join(', ');
    }

    const single = getDisplayValue(value, listProps);
    return single ?? '—';
};

export default renderText;
