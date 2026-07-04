import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchResultsTable } from '../SearchResultsTable';
import { SqlResultsTable } from '.';
import { MetricsDisplay } from './MetricsDisplay';
import { InvoiceMapPreview } from './InvoiceMapPreview';
import { ReconciliationSuggestions } from './ReconciliationSuggestions';
import { FinancialReportDisplay } from './FinancialReportDisplay';
import { ToolLegalEntityScopeLabel } from './ToolLegalEntityScopeLabel';
import { AccountLedgerDisplay } from './AccountLedgerDisplay';
import { PostingJournalDisplay } from './PostingJournalDisplay';
import { PostingDualDisplay, type PostingDualTable } from './PostingDualDisplay';
import { ToolInvocation as BaseToolInvocation, ToolResult as BaseToolResult } from '@/components/utils/helper';
import { useChat as useChatContext } from '@/contexts/ChatContext';
import { getModelDisplayName, getViewName } from '@/utils/modelDisplayNames';
import { normalizeToolInvocation, resolvePostingSearchDisplayHint } from '../chatUtils';
import { resolveToolLegalEntityLabel } from '@/utils/toolEntityLabel';
import { Wrench } from 'lucide-react';

interface ExtendedToolResult extends BaseToolResult {
    error?: boolean | string;
    description?: string;
    message?: string;
    report_id?: string;
    filters?: Record<string, unknown>;
    currencyCode?: string;
    legal_entity_names?: string[];
    success?: boolean;
    focusAccountName?: string;
    focusAccountId?: string;
    journalFocusSide?: 'debit' | 'credit';
    journalFocusAccountName?: string;
    journalTitle?: string;
    tables?: PostingDualTable[];
}

interface ToolInvocation extends Omit<BaseToolInvocation, 'result'> {
    result?: ExtendedToolResult;
    args?: Record<string, unknown>;
}

interface ToolResponseRendererProps {
    toolInvocations: ToolInvocation[];
    sidebarMode?: boolean;
    /** Fallback when tool result omits currencyCode (e.g. legal entity reporting currency). */
    defaultCurrencyCode?: string;
    /** When provided, used by ReconciliationSuggestions to send a follow-up message (e.g. confirm match) */
    onSendMessage?: (text: string) => void;
}

export const ToolResponseRenderer: React.FC<ToolResponseRendererProps> = ({
    toolInvocations,
    sidebarMode,
    defaultCurrencyCode,
    onSendMessage,
}) => {
    const navigate = useNavigate();
    const { setPageContext } = useChatContext();

    const resolveCurrencyCode = (result?: ExtendedToolResult) =>
        (typeof result?.currencyCode === 'string' && result.currencyCode.trim()
            ? result.currencyCode.trim().toUpperCase()
            : undefined) ?? defaultCurrencyCode;

    // Update context when createRecord is successful
    useEffect(() => {
        if (!toolInvocations || toolInvocations.length === 0) {
            return;
        }

        const createRecordTool = toolInvocations.find(
            tool => (tool.toolName === 'createRecord' || tool.toolName === 'createPosting') &&
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
    const normalizedInvocations = toolInvocations
        .map((tool) => normalizeToolInvocation(tool))
        .filter((tool): tool is ToolInvocation => tool != null);

    const processedTools = normalizedInvocations.reduce((acc, tool) => {
        if (!tool.result) {
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

    // Filter out tools with errors and no data (keep search tools for empty-state UI)
    const validTools = processedTools.filter(tool => {
        const hasError = tool.result?.error;
        const hasArrayData = tool.result?.data && Array.isArray(tool.result.data) && tool.result.data.length > 0;
        const hasObjectData = tool.result?.data && typeof tool.result.data === 'object' && !Array.isArray(tool.result.data);
        const hasData = hasArrayData || hasObjectData;
        const isSearchTool =
            tool.toolName === 'searchRecords' || /search/i.test(tool.toolName);

        return !hasError || hasData || isSearchTool;
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
                const postingModel =
                    (tool.result?.model as string | undefined) ||
                    (tool.args?.modelName as string | undefined);

                const toolNameBadge = (
                    <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                        <Wrench className="w-3 h-3 mr-1.5 shrink-0" />
                        {tool.toolName}
                    </div>
                );

                const descriptionElement = description ? (
                    <p className="text-sm text-slate-600">{description}</p>
                ) : null;

                const entityScopeLabel = resolveToolLegalEntityLabel(tool.result);

                const wrapToolResult = (
                    content: React.ReactNode,
                    options?: {
                        showDescription?: boolean;
                        hideToolBadge?: boolean;
                        hideEntityScope?: boolean;
                    }
                ) => (
                    <div key={index} className="space-y-2">
                        {!options?.hideToolBadge && toolNameBadge}
                        {options?.showDescription !== false && descriptionElement}
                        {!options?.hideEntityScope && (
                            <ToolLegalEntityScopeLabel label={entityScopeLabel} />
                        )}
                        {content}
                    </div>
                );

                // Financial reports (trial balance, etc.)
                if (
                    tool.toolName === 'runFinancialReport' ||
                    uiHint === 'financial_report'
                ) {
                    return wrapToolResult(
                        <FinancialReportDisplay
                            reportId={String(tool.result.report_id ?? 'trial_balance')}
                            data={Array.isArray(data) ? data : []}
                            filters={tool.result.filters as Record<string, unknown> | undefined}
                            description={description ?? (tool.result.description as string | undefined)}
                            currencyCode={resolveCurrencyCode(tool.result)}
                            sidebarMode={sidebarMode}
                        />,
                        { showDescription: false, hideEntityScope: true }
                    );
                }

                // Posting search — ledger (+/−) or journal (debit/credit columns)
                if (
                    (tool.toolName === 'searchRecords' || tool.toolName.includes('search')) &&
                    Array.isArray(data) &&
                    data.length > 0 &&
                    resolvePostingSearchDisplayHint(uiHint, postingModel, data) != null
                ) {
                    const postingHint = resolvePostingSearchDisplayHint(
                        uiHint,
                        postingModel,
                        data
                    );

                    if (postingHint === 'account_ledger') {
                        return wrapToolResult(
                                <AccountLedgerDisplay
                                    rows={data}
                                    focusAccountName={
                                        (tool.result.focusAccountName as string | undefined) ??
                                        undefined
                                    }
                                    currencyCode={resolveCurrencyCode(tool.result)}
                                    sidebarMode={sidebarMode}
                                />
                        );
                    }
                    if (postingHint === 'posting_journal') {
                        return wrapToolResult(
                                <PostingJournalDisplay
                                    rows={data}
                                    title={tool.result.journalTitle as string | undefined}
                                    highlightSide={tool.result.journalFocusSide as 'debit' | 'credit' | undefined}
                                    highlightAccountName={tool.result.journalFocusAccountName as string | undefined}
                                    currencyCode={resolveCurrencyCode(tool.result)}
                                    sidebarMode={sidebarMode}
                                />
                        );
                    }
                    if (postingHint === 'posting_dual' && Array.isArray(tool.result.tables)) {
                        return wrapToolResult(
                                <PostingDualDisplay
                                    tables={tool.result.tables as PostingDualTable[]}
                                    currencyCode={resolveCurrencyCode(tool.result)}
                                    sidebarMode={sidebarMode}
                                />
                        );
                    }
                    return wrapToolResult(
                        <PostingJournalDisplay
                            rows={data}
                            title={tool.result.journalTitle as string | undefined}
                            currencyCode={resolveCurrencyCode(tool.result)}
                            sidebarMode={sidebarMode}
                        />
                    );
                }

                // Handle searchRecords - generic table for non-posting models
                if (tool.toolName === 'searchRecords' || tool.toolName.includes('search')) {
                    if (Array.isArray(data) && data.length > 0) {
                        return wrapToolResult(
                            <SearchResultsTable
                                data={data}
                                columns={columns}
                                modelName={tool.result.model}
                                metadata={tool.result.metaData}
                            />
                        );
                    }
                    return wrapToolResult(
                        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                            <p className="text-sm text-gray-700">
                                No records found matching your search criteria.
                            </p>
                        </div>
                    );
                }

                // Switch case based on uiHint
                switch (uiHint) {
                    case 'table':
                        if (resultType === 'sql_result') {
                            return wrapToolResult(
                                <SqlResultsTable
                                    data={data}
                                    columns={columns}
                                    resultType={resultType}
                                />
                            );
                        }
                        return wrapToolResult(
                            <SearchResultsTable
                                data={data}
                                columns={columns}
                                modelName={tool.result.model}
                                metadata={tool.result.metaData}
                            />
                        );

                    case 'chart':
                        return wrapToolResult(
                                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-sm text-yellow-800">
                                        Chart visualization for {tool.toolName} - Coming soon
                                    </p>
                                </div>
                        );

                    case 'form':
                        return wrapToolResult(
                                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                                    <p className="text-sm text-green-800">
                                        Form interface for {tool.toolName} - Coming soon
                                    </p>
                                </div>
                        );

                    case 'list':
                        return wrapToolResult(
                                <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                                    <p className="text-sm text-purple-800">
                                        List view for {tool.toolName} - Coming soon
                                    </p>
                                </div>
                        );

                    case 'metrics':
                        return wrapToolResult(
                            <MetricsDisplay
                                data={data}
                                columns={columns}
                                toolName={tool.toolName}
                                description={description}
                                hideToolBadge
                            />
                        );

                    case 'reconciliation_suggestions':
                        return wrapToolResult(
                                <ReconciliationSuggestions
                                    data={Array.isArray(data) ? data : []}
                                    onSendMessage={onSendMessage}
                                    sidebarMode={sidebarMode}
                                />
                        );

                    case 'financial_report':
                        return wrapToolResult(
                            <FinancialReportDisplay
                                reportId={String(tool.result.report_id ?? 'trial_balance')}
                                data={Array.isArray(data) ? data : []}
                                filters={tool.result.filters as Record<string, unknown> | undefined}
                                description={description ?? tool.result.description as string | undefined}
                                currencyCode={resolveCurrencyCode(tool.result)}
                                sidebarMode={sidebarMode}
                            />,
                            { showDescription: false, hideEntityScope: true }
                        );

                    case 'invoice map':
                        // Handle invoice extraction result
                        if (tool.result.data && typeof tool.result.data === 'object' && !Array.isArray(tool.result.data)) {
                            return wrapToolResult(
                                    <InvoiceMapPreview
                                        data={tool.result.data}
                                        message={tool.result.message}
                                        sidebarMode={sidebarMode}
                                    />
                            );
                        }
                        return wrapToolResult(
                                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-sm text-yellow-800">
                                        Invoice data structure is unexpected
                                    </p>
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

                        return wrapToolResult(
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
                        );
                    }
                }
            })}
        </div>
    );
}; 