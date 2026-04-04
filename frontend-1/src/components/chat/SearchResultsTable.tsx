/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback } from 'react';
import DynamicTable from '@/components/masters/DynamicTable';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface SearchResultAction {
    type: string;
    urlTemplate: string;
}

interface SearchResultsTableProps {
    data: Record<string, any>[];
    columns?: any[];
    actions?: SearchResultAction[];
    modelName?: string;
    metadata?: any;
}

export const SearchResultsTable: React.FC<SearchResultsTableProps> = ({
    data,
    columns,
    actions,
    modelName,
    metadata
}) => {
    const navigate = useNavigate();

    const handleView = useCallback((record: Record<string, any>) => {
        // Determine the model from the record or use a default
        const model = record.model || modelName;

        if (!model) {
            console.warn('handleView: No model information available for navigation');
            return;
        }

        // Map model names to route paths and default state IDs
        const modelRouteMap: Record<string, { path: string; draftStateId: string }> = {
            'purchase_requisition': { path: 'purchases/requisitions', draftStateId: '2' },
            'purchase_order': { path: 'purchases/orders', draftStateId: '13' },
            'invoice': { path: 'purchases/bills', draftStateId: '9' },
        };

        const routeConfig = modelRouteMap[model];
        if (routeConfig) {
            const redirectUrl = `/${routeConfig.path}/${record.id}/state/${routeConfig.draftStateId}`;
            console.log(`Redirecting ${model} to:`, redirectUrl);
            navigate(redirectUrl);
            return;
        }

        // For master pages, use the view-based routing pattern
        // Use the pattern: model/view/:viewId
        const redirectUrl = `/${model}/${record.id}/view/${model}_view`;
        console.log(`Redirecting ${model} to:`, redirectUrl);
        navigate(redirectUrl);
    }, [navigate, modelName]);

    const renderActions = useCallback((record: any) => {
        return (
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => handleView(record)}>
                    <Eye size={16} />
                </Button>
            </div>
        );
    }, [handleView]);

    if (!data || data.length === 0) {
        return <div className="text-center py-4 text-gray-500">No results found</div>;
    }

    // Prepare data in the format expected by DynamicTable
    const tableData = {
        data: data,
        metaData: metadata,
        total: data.length
    };

    return (
        <div className="rounded-lg border bg-white overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b bg-gray-50">
                <h3 className="text-sm font-medium text-gray-700">
                    Found {data.length} {modelName || 'records'}
                </h3>
            </div>
            <div className="overflow-auto max-h-96 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:hover:bg-gray-400 [&::-webkit-scrollbar-track]:bg-gray-50 [&::-webkit-scrollbar-track]:rounded-full">
                <DynamicTable
                    data={tableData}
                    isLoading={false}
                    renderActions={renderActions}
                    enableMultiSelect={false}
                    enableCollapsible={true}
                    collapsibleMainColumnsCount={3}
                />
            </div>
        </div>
    );
}; 