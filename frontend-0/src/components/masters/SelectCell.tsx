import React from 'react';

interface SelectCellProps {
    row: any;
    instanceType?: string;
    instanceLabel?: string;
    instanceSubLabel?: string;
    instanceSourceKey?: string;
    /** When the Prisma relation name differs from the FK-derived key (e.g. legal_entity_id → organization), set this to the actual relation name. */
    relationName?: string;
    columnKey?: string;
}

const SelectCell: React.FC<SelectCellProps> = ({
    row,
    instanceType,
    instanceLabel,
    instanceSubLabel,
    instanceSourceKey,
    relationName,
    columnKey,
}) => {
    // Determine the nested object key: explicit relationName first (backward compatible), then derive from instanceSourceKey/columnKey
    let nestedObjectKey: string | undefined;

    if (relationName) {
        nestedObjectKey = relationName;
    } else if (instanceSourceKey) {
        // Remove _id suffix to get the nested object name
        // account_id -> account, credit_account_id -> credit_account
        nestedObjectKey = instanceSourceKey.replace(/_id$/, '');
    } else if (columnKey) {
        nestedObjectKey = columnKey.replace(/_id$/, '');
    } else if (instanceType) {
        nestedObjectKey = instanceType;
    }

    if (!nestedObjectKey || !instanceLabel) {
        return <span className="text-gray-400">—</span>;
    }

    const nestedObject = row[nestedObjectKey];
    if (!nestedObject) return <span className="text-gray-400">—</span>;

    const mainValue = nestedObject[instanceLabel];
    const subValue = instanceSubLabel ? nestedObject[instanceSubLabel] : undefined;

    if (!mainValue && !subValue) return <span className="text-gray-400">—</span>;

    return (
        <div className="flex flex-col">
            {mainValue && (
                <span className="text-sm font-medium text-gray-900">
                    {mainValue}
                </span>
            )}
            {subValue && (
                <span className="text-xs text-gray-500">
                    {subValue}
                </span>
            )}
        </div>
    );
};

export default SelectCell; 