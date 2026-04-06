import React from 'react';
import { Edit } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ListProps {
    key?: string;
    label?: string;
    isEdit?: boolean;
    editPath?: string;
}

const renderBadges = (items: any[], listProps: ListProps) => {
    const navigate = useNavigate();
    console.log(items, listProps);

    if (!items || !Array.isArray(items)) return '—';

    const handleEdit = (item: any) => {
        if (listProps.editPath) {
            navigate(listProps.editPath + '/' + item.id);
        }
    };

    return (
        <div className="flex flex-wrap gap-1 items-center">
            {items.map((item, index) => {
                const key = listProps.key ? item[listProps.key] : index;

                // Handle nested properties with dot notation
                let label = item;
                if (listProps.label) {
                    const labelPath = listProps.label.split('.');
                    label = labelPath.reduce((obj, prop) => obj?.[prop], item);
                }

                return (
                    <span
                        key={key}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-800 border border-violet-200"
                    >
                        {label || '—'}
                        {listProps.isEdit && listProps.editPath && (
                            <button
                                onClick={() => handleEdit(item)}
                                className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-violet-200 hover:bg-violet-300 text-violet-700 hover:text-violet-900 transition-colors ml-1.5"
                                title="Edit"
                            >
                                <Edit size={10} />
                            </button>
                        )}
                    </span>
                );
            })}


        </div>
    );
};

export default renderBadges; 