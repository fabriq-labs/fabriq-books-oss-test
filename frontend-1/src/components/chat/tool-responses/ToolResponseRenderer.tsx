import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchResultsTable } from '../SearchResultsTable';
import { SqlResultsTable } from '.';
import { MetricsDisplay } from './MetricsDisplay';
import { InvoiceMapPreview } from './InvoiceMapPreview';
import { ReconciliationSuggestions } from './ReconciliationSuggestions';
import { ToolInvocation as BaseToolInvocation, ToolResult as BaseToolResult } from '@/components/utils/helper';
import { useChat as useChatContext } from '@/contexts/ChatContext';
import { getModelDisplayName, getViewName } from '@/utils/modelDisplayNames';

interface ExtendedToolResult extends BaseToolResult {
    error?: boolean;
    description?: string;
    message?: string;
}

interface ToolInvocation extends Omit<BaseToolInvocation, 'result'> {
    result?: ExtendedToolResult;
    args?: Record<string, unknown>;
}

interface ToolResponseRendererProps {
    toolInvocations: ToolInvocation[];
    sidebarMode?: boolean;
    /** When provided, used by ReconciliationSuggestions to send a follow-up message (e.g. confirm match) */
    onSendMessage?: (text: string) => void;
}

export const ToolResponseRenderer: React.FC<ToolResponseRendererProps> = ({ toolInvocations, sidebarMode, onSendMessage }) => {
    const navigate = useNavigate();
    const { setPageContext } = useChatContext();

    // Update context when createRecord is successful
    useEffect(() => {
        if (!toolInvocations || toolInvocations.length === 0) {
            return;
        }

        const createRecordTool = toolInvocations.find(
            tool => tool.toolName === 'createRecord' &&
                tool.state === 'result' &&
                tool.result &&
                !tool.result.error &&
                tool.result.data?.id &&
                tool.result.model
        );

        if (createRecordTool && createRecordTool.result) {
            const recordId = String(createRecordTool.result.data.id);
            const model = createRecordTool.result.model;
            const viewName = getViewName(model);

            // Update page context with the created record
            setPageContext({
                modelName: model,
                viewName: viewName,
                recordId: recordId
            });
        }
    }, [toolInvocations, setPageContext]);

    if (!toolInvocations || toolInvocations.length === 0) {
        return null;
    }

    // Handle navigation to record detail page
    const handleViewRecord = (recordId: string | number | undefined, model: string | undefined) => {
        if (!recordId || !model || typeof recordId !== 'string' && typeof recordId !== 'number') {
            console.warn('handleViewRecord: Missing or invalid recordId or model', { recordId, model });
            return;
        }

        const idString = String(recordId);

        // Map model names to route paths (list/detail pages)
        const modelRouteMap: Record<string, { path: string; draftStateId: string }> = {
            'purchase_requisition': { path: 'purchases/requisitions', draftStateId: '2' },
            'purchase_order': { path: 'purchases/orders', draftStateId: '13' },
            'invoice': { path: 'purchases/bills', draftStateId: '9' },
        };

        const routeConfig = modelRouteMap[model];
        if (routeConfig) {
            const redirectUrl = `/${routeConfig.path}/${idString}/state/${routeConfig.draftStateId}`;
            navigate(redirectUrl);
            return;
        }

        // For master pages, use the view-based routing pattern
        // Use the pattern: model/:id/view/:viewId
        const redirectUrl = `/${model}/${idString}/view/${model}_view`;
        navigate(redirectUrl);
    };

    // Filter and process tool invocations to show only the latest successful result per tool
    const processedTools = toolInvocations.reduce((acc, tool) => {
        if (tool.state !== 'result' || !tool.result) {
            return acc;
        }

        // Check if this tool has an error or no data
        const hasError = tool.result.error;
        // Handle both array data and object data (for invoice extraction)
        const hasArrayData = tool.result.data && Array.isArray(tool.result.data) && tool.result.data.length > 0;
        const hasObjectData = tool.result.data && typeof tool.result.data === 'object' && !Array.isArray(tool.result.data);
        const hasData = hasArrayData || hasObjectData;

        // For the same tool name, keep the latest one
        const existingToolIndex = acc.findIndex(t => t.toolName === tool.toolName);

        if (existingToolIndex >= 0) {
            // Replace existing tool with the newer one
            acc[existingToolIndex] = tool;
        } else {
            // Add new tool
            acc.push(tool);
        }

        return acc;
    }, [] as typeof toolInvocations);

    // Filter out tools with errors and no data
    const validTools = processedTools.filter(tool => {
        const hasError = tool.result?.error;
        // Handle both array data and object data (for invoice extraction)
        const hasArrayData = tool.result?.data && Array.isArray(tool.result.data) && tool.result.data.length > 0;
        const hasObjectData = tool.result?.data && typeof tool.result.data === 'object' && !Array.isArray(tool.result.data);
        const hasData = hasArrayData || hasObjectData;

        // Show tools that either have data OR don't have errors (for non-data tools)
        return !hasError || hasData;
    });

    // Check if there were failed attempts
    const failedAttempts = toolInvocations.filter(tool =>
        tool.state === 'result' && tool.result?.error &&
        (!tool.result.data || !Array.isArray(tool.result.data) || tool.result.data.length === 0)
    );

    if (validTools.length === 0) {
        return null;
    }

    return (
        <div className="space-y-4">
            {/* Show failed attempts indicator if any */}
            {failedAttempts.length > 0 && (
                <div className="text-xs text-gray-500 italic">
                    Note: {failedAttempts.length} attempt{failedAttempts.length > 1 ? 's' : ''} failed before success
                </div>
            )}

            {validTools.map((tool, index) => {
                const { uiHint, description, data, columns, resultType } = tool.result;

                // Render tool name as a small badge above content
                const toolNameBadge = (
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
                            {tool.toolName}
                        </div>
                    </div>
                );

                // Render description separately if available
                const descriptionElement = description && (
                    <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-700">{description}</p>
                    </div>
                );

                // Handle searchRecords - always render as table
                if (tool.toolName === 'searchRecords' || tool.toolName.includes('search')) {
                    if (Array.isArray(data) && data.length > 0) {
                        return (
                            <div key={index} className="space-y-3">
                                {toolNameBadge}
                                {descriptionElement}
                                <SearchResultsTable
                                    data={data}
                                    columns={columns}
                                    modelName={tool.result.model}
                                    metadata={tool.result.metaData}
                                />
                            </div>
                        );
                    } else {
                        // Show message when no results found
                        return (
                            <div key={index} className="space-y-3">
                                {toolNameBadge}
                                {descriptionElement}
                                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                                    <p className="text-sm text-gray-700">
                                        No records found matching your search criteria.
                                    </p>
                                </div>
                            </div>
                        );
                    }
                }

                // Switch case based on uiHint
                switch (uiHint) {
                    case 'table':
                        if (resultType === 'sql_result') {
                            return (
                                <div key={index} className="space-y-3">
                                    {toolNameBadge}
                                    {descriptionElement}
                                    <SqlResultsTable
                                        data={data}
                                        columns={columns}
                                        resultType={resultType}
                                    />
                                </div>
                            );
                        } else {
                            // Fallback to SearchResultsTable for other table types
                            return (
                                <div key={index} className="space-y-3">
                                    {toolNameBadge}
                                    {descriptionElement}
                                    <SearchResultsTable
                                        data={data}
                                        columns={columns}
                                        modelName={tool.result.model}
                                        metadata={tool.result.metaData}
                                    />
                                </div>
                            );
                        }

                    case 'chart':
                        return (
                            <div key={index} className="space-y-3">
                                {toolNameBadge}
                                {descriptionElement}
                                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-sm text-yellow-800">
                                        Chart visualization for {tool.toolName} - Coming soon
                                    </p>
                                </div>
                            </div>
                        );

                    case 'form':
                        return (
                            <div key={index} className="space-y-3">
                                {toolNameBadge}
                                {descriptionElement}
                                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                                    <p className="text-sm text-green-800">
                                        Form interface for {tool.toolName} - Coming soon
                                    </p>
                                </div>
                            </div>
                        );

                    case 'list':
                        return (
                            <div key={index} className="space-y-3">
                                {toolNameBadge}
                                {descriptionElement}
                                <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                                    <p className="text-sm text-purple-800">
                                        List view for {tool.toolName} - Coming soon
                                    </p>
                                </div>
                            </div>
                        );

                    case 'metrics':
                        return (
                            <div key={index} className="space-y-3">
                                <MetricsDisplay
                                    data={data}
                                    columns={columns}
                                    toolName={tool.toolName}
                                    description={description}
                                />
                            </div>
                        );

                    case 'reconciliation_suggestions':
                        return (
                            <div key={index} className="space-y-3">
                                {toolNameBadge}
                                {descriptionElement}
                                <ReconciliationSuggestions
                                    data={Array.isArray(data) ? data : []}
                                    onSendMessage={onSendMessage}
                                    sidebarMode={sidebarMode}
                                />
                            </div>
                        );

                    case 'invoice map':
                        // Handle invoice extraction result
                        if (tool.result.data && typeof tool.result.data === 'object' && !Array.isArray(tool.result.data)) {
                            return (
                                <div key={index} className="space-y-3">
                                    {toolNameBadge}
                                    {descriptionElement}
                                    <InvoiceMapPreview
                                        data={tool.result.data}
                                        message={tool.result.message}
                                        sidebarMode={sidebarMode}
                                    />
                                </div>
                            );
                        }
                        // Fallback if data structure is unexpected
                        return (
                            <div key={index} className="space-y-3">
                                {toolNameBadge}
                                {descriptionElement}
                                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-sm text-yellow-800">
                                        Invoice data structure is unexpected
                                    </p>
                                </div>
                            </div>
                        );

                    default: {
                        // Default fallback for unknown uiHint - show meaningful message instead of raw JSON
                        const hasData = (Array.isArray(data) && data.length > 0) || (data && typeof data === 'object' && Object.keys(data).length > 0);

                        // Extract record ID and model for createRecord/updateRecord
                        const recordId = tool.result?.data?.id;
                        const model = tool.result?.model;
                        const canView = (tool.toolName === 'createRecord' || tool.toolName === 'updateRecord') &&
                            recordId &&
                            model &&
                            (typeof recordId === 'string' || typeof recordId === 'number');

                        // Get model display name for createRecord focus message
                        const modelDisplayName = model ? getModelDisplayName(model) : null;
                        const isCreateRecord = tool.toolName === 'createRecord' && modelDisplayName;

                        return (
                            <div key={index} className="space-y-3">
                                {toolNameBadge}
                                {descriptionElement}
                                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex-1">
                                            <p className="text-sm text-gray-700">
                                                {hasData ? (
                                                    <>
                                                        {tool.toolName === 'createRecord' && 'Record created successfully.'}
                                                        {tool.toolName === 'updateRecord' && 'Record updated successfully.'}
                                                        {tool.toolName === 'createChildItem' && 'Item added successfully.'}
                                                        {tool.toolName === 'updateChildItem' && 'Item updated successfully.'}
                                                        {!['createRecord', 'updateRecord', 'createChildItem', 'updateChildItem'].includes(tool.toolName) &&
                                                            `Operation completed successfully. ${description || ''}`}
                                                    </>
                                                ) : (
                                                    `${tool.toolName} operation completed.`
                                                )}
                                            </p>
                                            {isCreateRecord && (
                                                <p className="text-xs text-blue-600 mt-1.5 font-medium">
                                                    This chat will now help you with this {modelDisplayName}.
                                                </p>
                                            )}
                                        </div>
                                        {canView && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleViewRecord(recordId, model)}
                                                className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 shrink-0"
                                                title="View record"
                                            >
                                                <Eye size={16} />
                                                <span className="text-xs">View</span>
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    }
                }
            })}
        </div>
    );
}; 