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
    searchEntitiesTool,
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
    runFinancialReportTool,
    getOptionChainTool,
} from './tools';
import { QueryClassification } from './utils/questionClassifier';
import logger from '../utils/logger';
import {
    AGENT_MODEL_TOOL_CONFIG_TABLE,
    resolveIncludeAnalyticsTools,
    resolveModelToolNames,
} from './agentModelToolConfigCache';

type ToolFactory = () => unknown;

/**
 * Manages tool availability based on model context.
 * Per-model tool names come from DB table `agent_model_tool_config.model_tools`
 * (via agentModelToolConfigCache), editable in Super Admin → AI Templates → Model Tools.
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

    private static buildToolFactories(auth: AuthContext, toolContext?: any): Record<string, ToolFactory> {
        return {
            searchRecords: () => searchRecordsTool(auth, toolContext),
            createRecord: () => createRecordTool(auth, toolContext),
            updateRecord: () => updateRecordTool(auth, toolContext),
            createChildItem: () => createChildItemTool(auth),
            updateChildItem: () => updateChildItemTool(auth),
            advancedSqlQuery: () => advancedSqlQueryTool(auth),
            extractInvoiceFromFile: () => extractInvoiceFromFileTool(auth, toolContext),
            processInvoiceFromPdf: () => processInvoiceFromPdfTool(auth),
            erpConnector: () => erpConnectorTool(auth, toolContext),
            suggestReconciliationMatches: () => suggestReconciliationMatchesTool(auth),
            categorizePostings: () => categorizePostingsTool(auth),
            runFinancialReport: () => runFinancialReportTool(auth, toolContext),
            getOptionChain: () => getOptionChainTool(auth),
            searchItems: () => searchItemsTool(auth),
            searchSuppliers: () => searchSuppliersTool(auth),
            searchDepartments: () => searchDepartmentsTool(auth),
            searchCostCenters: () => searchCostCentersTool(auth),
            searchLocations: () => searchLocationsTool(auth),
            searchProjects: () => searchProjectsTool(auth),
            searchBudgetPeriods: () => searchBudgetPeriodsTool(auth),
            searchBudgetLines: () => searchBudgetLinesTool(auth),
            searchCOA: () => searchCOATool(auth),
            searchEntities: () => searchEntitiesTool(auth),
            searchEmployees: () => searchEmployeesTool(auth),
            searchUsers: () => searchUsersTool(auth),
            getAnalyticsContext: () => getAnalyticsContextTool(auth),
            analyticsQuery: () => analyticsQueryTool(auth, toolContext),
            queueActions: () => null, // session-only — wired in getUnifiedTools
            requestClarification: () => null,
        };
    }

    private static buildToolsFromNames(
        toolNames: string[],
        auth: AuthContext,
        toolContext?: any
    ): Record<string, unknown> {
        const factories = ToolManager.buildToolFactories(auth, toolContext);
        const tools: Record<string, unknown> = {};
        for (const name of toolNames) {
            const factory = factories[name];
            if (!factory) {
                logger.warn('Unknown agent tool in model config — skipped', { name });
                continue;
            }
            const tool = factory();
            if (tool) tools[name] = tool;
        }
        return tools;
    }

    /**
     * Get tools based on model name — reads model_tools from agent_model_tool_config.
     */
    public async getToolsForModel(modelName: string, auth: AuthContext, context?: any): Promise<any> {
        logger.debug('Getting tools for model', {
            modelName,
            recordId: context?.recordId,
            configTable: AGENT_MODEL_TOOL_CONFIG_TABLE,
        });

        const toolContext = context ? { ...context, modelName } : { modelName };
        const toolNames = await resolveModelToolNames(modelName);

        if (!toolNames.length) {
            logger.warn('No model_tools configured in agent_model_tool_config', { modelName });
            return {};
        }

        logger.debug('Resolved model tools from agent_model_tool_config', { modelName, tools: toolNames });
        return ToolManager.buildToolsFromNames(toolNames, auth, toolContext);
    }

    public async getToolsForClassification(
        classification: QueryClassification,
        auth: AuthContext,
        context?: any
    ): Promise<any> {
        const modelName = context?.modelName || 'default';
        return await this.getToolsForModel(modelName, auth, context);
    }

    private static readonly CORE_SESSION_TOOLS = new Set(['createPlan', 'completeStep']);

    public async getUnifiedTools(
        modelName: string,
        auth: AuthContext,
        context?: any,
        sessionId?: string,
        allowedTools?: string[]
    ): Promise<any> {
        logger.debug('Getting unified tools', { modelName, hasSession: !!sessionId, allowedTools });

        const modelTools = await this.getToolsForModel(modelName, auth, context);

        const tools: any = { ...modelTools };

        if (await resolveIncludeAnalyticsTools(modelName)) {
            tools.getAnalyticsContext = getAnalyticsContextTool(auth);
            tools.analyticsQuery = analyticsQueryTool(auth, context);
        }

        if (sessionId) {
            tools.createPlan = createPlanTool(sessionId);
            tools.completeStep = completeStepTool(sessionId, auth);
            tools.queueActions = queueActionsTool(sessionId, auth);
            tools.requestClarification = requestClarificationTool(sessionId, auth);
        }

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
