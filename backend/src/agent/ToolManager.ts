import { AuthContext } from '../auth/types';
import {
    createRecordTool,
    updateRecordTool,
    searchRecordsTool,
    searchUsersTool,
    createChildItemTool,
    updateChildItemTool,
    advancedSqlQueryTool,
} from './AgentTools';
import {
    getAnalyticsContextTool,
    analyticsQueryTool,
    createPlanTool,
    completeStepTool,
    queueActionsTool,
    requestClarificationTool,
} from './tools';
import { QueryClassification } from './utils/questionClassifier';
import logger from '../utils/logger';
import {
    AGENT_MODEL_TOOL_CONFIG_TABLE,
    resolveIncludeAnalyticsTools,
    resolveModelToolNames,
} from './agentModelToolConfigCache';
import { CORE_SESSION_TOOLS } from './templateToolFilter';

type ToolFactory = () => unknown;

/** Direct writes. Supervised mode keeps queueActions and drops these. */
export const MUTATING_AGENT_TOOLS = new Set([
    'createRecord',
    'updateRecord',
    'createChildItem',
    'updateChildItem',
]);

export function withoutMutatingTools(tools: Record<string, unknown>, mode?: string): Record<string, unknown> {
    if (mode !== 'supervised') return tools;
    const next = { ...tools };
    for (const name of MUTATING_AGENT_TOOLS) {
        delete next[name];
    }
    return next;
}

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

    private static buildToolFactories(auth: AuthContext, toolContext?: any, sessionId?: string): Record<string, ToolFactory> {
        return {
            searchRecords: () => searchRecordsTool(auth, toolContext),
            createRecord: () => createRecordTool(auth, toolContext),
            updateRecord: () => updateRecordTool(auth, toolContext),
            createChildItem: () => createChildItemTool(auth),
            updateChildItem: () => updateChildItemTool(auth),
            advancedSqlQuery: () => advancedSqlQueryTool(auth),
            searchUsers: () => searchUsersTool(auth),
            getAnalyticsContext: () => getAnalyticsContextTool(auth),
            analyticsQuery: () => analyticsQueryTool(auth, toolContext),
            queueActions: () => null,
            requestClarification: () => null,
        };
    }

    private static buildToolsFromNames(
        toolNames: string[],
        auth: AuthContext,
        toolContext?: any,
        sessionId?: string
    ): Record<string, unknown> {
        const factories = ToolManager.buildToolFactories(auth, toolContext, sessionId);
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
    public async getToolsForModel(modelName: string, auth: AuthContext, context?: any, sessionId?: string): Promise<any> {
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
        return ToolManager.buildToolsFromNames(toolNames, auth, toolContext, sessionId);
    }

    public async getToolsForClassification(
        classification: QueryClassification,
        auth: AuthContext,
        context?: any
    ): Promise<any> {
        const modelName = context?.modelName || 'default';
        return await this.getToolsForModel(modelName, auth, context);
    }

    public async getUnifiedTools(
        modelName: string,
        auth: AuthContext,
        context?: any,
        sessionId?: string,
        allowedTools?: string[],
        options?: { omitCreatePlan?: boolean; mode?: string }
    ): Promise<any> {
        logger.debug('Getting unified tools', { modelName, hasSession: !!sessionId, allowedTools, omitCreatePlan: options?.omitCreatePlan });

        const modelTools = await this.getToolsForModel(modelName, auth, context, sessionId);

        const tools: any = { ...modelTools };

        if (await resolveIncludeAnalyticsTools(modelName)) {
            tools.getAnalyticsContext = getAnalyticsContextTool(auth);
            tools.analyticsQuery = analyticsQueryTool(auth, context);
        }

        if (sessionId) {
            if (!options?.omitCreatePlan) {
                tools.createPlan = createPlanTool(sessionId);
            }
            tools.completeStep = completeStepTool(sessionId, auth);
            tools.queueActions = queueActionsTool(sessionId, auth);
            tools.requestClarification = requestClarificationTool(sessionId, auth);
        }

        if (allowedTools && allowedTools.length > 0) {
            const factories = ToolManager.buildToolFactories(auth, context, sessionId);
            for (const name of allowedTools) {
                if (tools[name]) continue;
                const factory = factories[name];
                if (!factory) continue;
                const extra = factory();
                if (extra) tools[name] = extra;
            }
            const core = options?.omitCreatePlan
                ? ['completeStep']
                : [...CORE_SESSION_TOOLS];
            const permitted = new Set([...core, ...allowedTools]);
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

        return withoutMutatingTools(tools, options?.mode);
    }
}
