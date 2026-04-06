import { AuthContext } from '../auth/types';
import {
    createRecordTool,
    updateRecordTool,
    searchRecordsTool,
    searchItemsTool,
    searchSuppliersTool,
    searchDepartmentsTool,
    searchCostCentersTool,
    searchLocationsTool,
    searchProjectsTool,
    searchBudgetPeriodsTool,
    searchBudgetLinesTool,
    searchCOATool,
    searchOrganizationsTool,
    searchEmployeesTool,
    searchUsersTool,
    createChildItemTool,
    updateChildItemTool,
    advancedSqlQueryTool,
    processInvoiceFromPdfTool,
    extractInvoiceFromFileTool,
    erpConnectorTool
} from './AgentTools';
import {
    getAnalyticsContextTool,
    analyticsQueryTool,
    suggestReconciliationMatchesTool,
    createPlanTool,
    completeStepTool,
    queueActionsTool,
    requestClarificationTool,
    categorizePostingsTool,
} from './tools';
import { QueryClassification } from './utils/questionClassifier';
import logger from '../utils/logger';

/**
 * Manages tool availability based on model context
 */
export class ToolManager {
    private static instance: ToolManager;

    private constructor() { }

    public static getInstance(): ToolManager {
        if (!ToolManager.instance) {
            ToolManager.instance = new ToolManager();
        }
        return ToolManager.instance;
    }

    /**
     * Get tools based on model name
     */
    public getToolsForModel(modelName: string, auth: AuthContext, context?: any): any {
        logger.debug('Getting tools for model', { modelName, recordId: context?.recordId });

        // Ensure modelName is in context for tools that need it
        const toolContext = context ? { ...context, modelName } : { modelName };

        // Default model only gets search functionality and advanced SQL queries
        if (modelName === 'default') {
            logger.debug('Using default tools (search + advanced SQL)');
            return {
                searchRecords: searchRecordsTool(auth),
                advancedSqlQuery: advancedSqlQueryTool(auth),
                extractInvoiceFromFile: extractInvoiceFromFileTool(auth),
                createRecord: createRecordTool(auth, toolContext),
            };
        }

        // Purchase requisition model gets all tools plus search for related models
        if (modelName === 'purchase_requisition') {
            logger.debug('Using purchase requisition tools (all operations + related model search + advanced SQL + ERP connector)');
            return {
                // Main PR operations
                searchRecords: searchRecordsTool(auth),
                createRecord: createRecordTool(auth, toolContext),
                updateRecord: updateRecordTool(auth, toolContext),
                createChildItem: createChildItemTool(auth),
                updateChildItem: updateChildItemTool(auth),
                advancedSqlQuery: advancedSqlQueryTool(auth),
                erpConnector: erpConnectorTool(auth, toolContext),

                // Search tools for related models (all use the same searchRecordsTool)
                searchItems: searchItemsTool(auth),        // item_master
                searchSuppliers: searchSuppliersTool(auth),    // supplier
                searchDepartments: searchDepartmentsTool(auth),  // department
                searchCostCenters: searchCostCentersTool(auth),  // cost_center
                searchLocations: searchLocationsTool(auth),    // location
                searchProjects: searchProjectsTool(auth),     // project_master
                searchBudgetPeriods: searchBudgetPeriodsTool(auth), // budget_period
                searchBudgetLines: searchBudgetLinesTool(auth),  // budget_line
                searchCOA: searchCOATool(auth),          // coa
                searchOrganizations: searchOrganizationsTool(auth), // organization
                searchEmployees: searchEmployeesTool(auth),    // employee_master
                searchUsers: searchUsersTool(auth)         // user_master
            };
        }

        // Invoice model gets invoice processing tools
        if (modelName === 'invoice') {
            logger.debug('Using invoice processing tools');
            return {
                searchRecords: searchRecordsTool(auth),
                createRecord: createRecordTool(auth, toolContext),
                updateRecord: updateRecordTool(auth, toolContext),
                processInvoiceFromPdf: processInvoiceFromPdfTool(auth),
                extractInvoiceFromFile: extractInvoiceFromFileTool(auth),
                advancedSqlQuery: advancedSqlQueryTool(auth),
                erpConnector: erpConnectorTool(auth, toolContext)
            };
        }

        // Purchase order model gets standard tools plus ERP connector
        if (modelName === 'purchase_order') {
            logger.debug('Using purchase order tools (all operations + advanced SQL + ERP connector)');
            return {
                searchRecords: searchRecordsTool(auth),
                createRecord: createRecordTool(auth, toolContext),
                updateRecord: updateRecordTool(auth, toolContext),
                advancedSqlQuery: advancedSqlQueryTool(auth),
                erpConnector: erpConnectorTool(auth, toolContext)
            };
        }

        // Posting model gets search + write tools + advanced SQL + reconciliation + categorization
        if (modelName === 'posting') {
            return {
                searchRecords: searchRecordsTool(auth),
                createRecord: createRecordTool(auth, toolContext),
                updateRecord: updateRecordTool(auth, toolContext),
                advancedSqlQuery: advancedSqlQueryTool(auth),
                suggestReconciliationMatches: suggestReconciliationMatchesTool(auth),
                categorizePostings: categorizePostingsTool(auth),
            };
        }

        // For any other model, provide all tools by default
        logger.debug('Using full tools for model', { modelName });
        return {
            searchRecords: searchRecordsTool(auth),
            createRecord: createRecordTool(auth, toolContext),
            updateRecord: updateRecordTool(auth, toolContext),
            advancedSqlQuery: advancedSqlQueryTool(auth),
            erpConnector: erpConnectorTool(auth, toolContext)
        };
    }

    /**
     * Get tools based on question classification
     * 
     * For analytical queries, provides:
     * - getAnalyticsContext: Schema context, relationships, multi-tenancy rules
     * - analyticsQuery: Permission-aware SQL execution with multi-step support
     * - searchRecords: For lookups during analysis
     * 
     * For transactional queries, delegates to getToolsForModel
     */
    public getToolsForClassification(
        classification: QueryClassification,
        auth: AuthContext,
        context?: any
    ): any {
        if (classification.type === 'analytical') {
            logger.info('Using analytics tools', {
                maxSteps: classification.maxSteps,
                reasoning: classification.reasoning
            });

            return {
                // Analytics-specific tools
                getAnalyticsContext: getAnalyticsContextTool(auth),
                analyticsQuery: analyticsQueryTool(auth),
                // Keep search for lookups during analysis
                searchRecords: searchRecordsTool(auth),
            };
        }

        // For transactional queries, use the standard model-based tools
        const modelName = context?.modelName || 'default';
        return this.getToolsForModel(modelName, auth, context);
    }

    /**
     * Get analytics tools directly (for explicit analytics requests)
     */
    public getAnalyticsTools(auth: AuthContext): any {
        logger.debug('Getting analytics tools');
        return {
            getAnalyticsContext: getAnalyticsContextTool(auth),
            analyticsQuery: analyticsQueryTool(auth),
            searchRecords: searchRecordsTool(auth),
        };
    }

    /**
     * Get unified tools (model-specific + analytics)
     * 
     * This is the preferred method for most requests. It provides:
     * - All model-specific tools (CRUD, search, etc.)
     * - Analytics tools (getAnalyticsContext, analyticsQuery)
     * 
     * The LLM can then decide which tools to use based on the question.
     * This eliminates the need for pre-classification and reduces misrouting.
     */
    /**
     * Core session tools always injected when a sessionId is present.
     * Cannot be removed by the allowedTools filter.
     */
    private static readonly CORE_SESSION_TOOLS = new Set(['createPlan', 'completeStep']);

    public getUnifiedTools(modelName: string, auth: AuthContext, context?: any, sessionId?: string, allowedTools?: string[]): any {
        logger.debug('Getting unified tools', { modelName, hasSession: !!sessionId, allowedTools });

        // Get model-specific tools
        const modelTools = this.getToolsForModel(modelName, auth, context);

        // Add analytics tools (always available)
        const tools: any = {
            ...modelTools,
            getAnalyticsContext: getAnalyticsContextTool(auth),
            analyticsQuery: analyticsQueryTool(auth),
        };

        // Add session tools only when operating inside an agent session
        if (sessionId) {
            tools.createPlan = createPlanTool(sessionId);
            tools.completeStep = completeStepTool(sessionId, auth);
            tools.queueActions = queueActionsTool(sessionId, auth);
            tools.requestClarification = requestClarificationTool(sessionId, auth);
        }

        // When template declares allowed_tools, filter to that set + core session tools.
        // This is the security ceiling — the request context cannot extend it.
        if (allowedTools && allowedTools.length > 0) {
            const permitted = new Set([...ToolManager.CORE_SESSION_TOOLS, ...allowedTools]);
            for (const key of Object.keys(tools)) {
                if (!permitted.has(key)) {
                    delete tools[key];
                }
            }
            logger.debug('Tools filtered by template allowed_tools', {
                allowed: [...permitted],
                final: Object.keys(tools),
            });
        }

        return tools;
    }
} 