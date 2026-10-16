import { WorkflowPrismaClient } from '../types/prisma.types';
import { WorkflowContext, WorkflowAction } from '../types/workflow.types';
import { AuthContext } from '../../auth/types';
import logger from '../../utils/logger';
import { workflowActionMap } from '../../domain/actions';

export interface SideEffect {
    type: 'database' | 'notification';
    config: Record<string, any>;
    conditions?: Record<string, any>;
    /** When false, this effect is not executed. Omitted or true = enabled. */
    enabled?: boolean;
}

export interface DatabaseEffect {
    type: 'database';
    config: {
        method?: string;
        params?: any[];
    };
}

export interface NotificationEffect {
    type: 'notification';
    config: {
        recipients: string[];
        template: string;
        channels: string[];
        data?: Record<string, any>;
    };
}

export class SideEffectExecutor {
    private prisma: WorkflowPrismaClient;

    constructor(prisma: WorkflowPrismaClient) {
        this.prisma = prisma;
    }

    async execute(
        effects: SideEffect[] | any,
        context: WorkflowContext,
        authContext: AuthContext,
        tx: any
    ): Promise<void> {
        const normalizedEffects: SideEffect[] = Array.isArray(effects)
            ? effects
            : (effects && Array.isArray((effects as any).effects) ? (effects as any).effects : []);

        if (!normalizedEffects || normalizedEffects.length === 0) {
            return;
        }

        logger.info('Executing side effects', {
            instanceId: context.instance.id,
            effectCount: normalizedEffects.length
        });

        for (const effect of normalizedEffects) {
            if (effect.enabled === false) {
                logger.info('Skipping disabled side effect', {
                    type: effect.type,
                    method: effect.config?.method,
                    instanceId: context.instance.id
                });
                continue;
            }
            try {
                await this.executeEffect(effect, context, authContext, tx);
            } catch (error) {
                logger.error('Side effect execution failed', {
                    effect,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    instanceId: context.instance.id
                });
                // Re-throw error to cause transaction rollback
                // Since side effects are executed within a transaction,
                // failures should rollback the entire workflow transition
                throw error;
            }
        }
    }

    private async executeEffect(
        effect: SideEffect,
        context: WorkflowContext,
        authContext: AuthContext,
        tx: any
    ): Promise<void> {
        logger.info('Executing side effect', { effect });
        switch (effect.type) {
            case 'database':
                await this.executeDatabaseUpdate(effect as DatabaseEffect, context, authContext, tx);
                break;
            case 'notification':
                await this.executeNotification(effect as NotificationEffect, context, authContext, tx);
                break;
            default:
                logger.warn('Unknown side effect type', { type: effect.type });
        }
    }

    private async executeDatabaseUpdate(
        effect: DatabaseEffect,
        context: WorkflowContext,
        authContext: AuthContext,
        tx: any
    ): Promise<void> {
        const { method } = effect.config;

        // Resolve variables
        const resolvedInstanceId = context.instance.model_id;
        logger.info('Executing workflow action', {
            method: method,
            stateName: context?.currentState?.name,
            instanceId: resolvedInstanceId
        });

        // Validate method exists in workflowActionMap
        if (!method || !workflowActionMap[method]) {
            const error = new Error(
                `Workflow action method '${method}' not found in workflowActionMap. ` +
                `Available methods: ${Object.keys(workflowActionMap).join(', ')}`
            );
            logger.error('Invalid workflow action method', {
                method,
                availableMethods: Object.keys(workflowActionMap),
                instanceId: resolvedInstanceId,
                modelName: context.instance.model_name
            });
            throw error;
        }

        try {
            await workflowActionMap[method](context, context.instance.model_name, resolvedInstanceId, [], {}, tx);
        } catch (error) {
            logger.error('Workflow action execution failed', {
                method,
                instanceId: resolvedInstanceId,
                modelName: context.instance.model_name,
                stateName: context?.currentState?.name,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            // Re-throw with additional context, preserving original stack trace
            if (error instanceof Error) {
                const errorMessage = `Failed to execute workflow action '${method}' for ${context.instance.model_name} (ID: ${resolvedInstanceId}): ${error.message}`;
                const enhancedError = new Error(errorMessage);
                // Preserve the original stack trace by including it in the new error's stack
                if (error.stack) {
                    enhancedError.stack = `${errorMessage}\n\nOriginal error stack trace:\n${error.stack}`;
                }
                throw enhancedError;
            } else {
                throw new Error(
                    `Failed to execute workflow action '${method}' for ${context.instance.model_name} (ID: ${resolvedInstanceId}): Unknown error`
                );
            }
        }
    }

    private async executeNotification(
        effect: NotificationEffect,
        context: WorkflowContext,
        authContext: AuthContext,
        tx: any
    ): Promise<void> {
        const { recipients, template, channels, data } = effect.config;

        // Resolve recipient IDs
        const resolvedRecipients = await this.resolveRecipients(recipients, context, authContext, tx);

        // TODO: Implement actual notification sending
        logger.info('Notification side effect executed', {
            recipients: resolvedRecipients,
            template,
            channels,
            data
        });
    }

    private resolveVariables(
        data: any,
        context: WorkflowContext,
        authContext: AuthContext
    ): any {
        if (typeof data === 'string') {
            return this.resolveStringVariables(data, context, authContext);
        }

        if (Array.isArray(data)) {
            return data.map(item => this.resolveVariables(item, context, authContext));
        }

        if (data && typeof data === 'object') {
            const resolved: any = {};
            for (const [key, value] of Object.entries(data)) {
                resolved[key] = this.resolveVariables(value, context, authContext);
            }
            return resolved;
        }

        return data;
    }

    private resolveStringVariables(
        str: string,
        context: WorkflowContext,
        authContext: AuthContext
    ): string {
        return str
            .replace(/\{\{user\.id\}\}/g, authContext.user.id)
            .replace(/\{\{user\.email\}\}/g, authContext.user.email)
            .replace(/\{\{user\.name\}\}/g, authContext.user.name || '')
            .replace(/\{\{instance\.id\}\}/g, context.instance.id)
            .replace(/\{\{instance\.model_id\}\}/g, context.instance.model_id)
            .replace(/\{\{instance\.model_name\}\}/g, context.instance.model_name)
            .replace(/\{\{instance\.current_state\}\}/g, context.instance.current_state)
            .replace(/\{\{instance\.org_id\}\}/g, context.instance.org_id || '')
            .replace(/\{\{now\}\}/g, new Date().toISOString())
            .replace(/\{\{today\}\}/g, new Date().toISOString().split('T')[0]);
    }

    private async resolveRecipients(
        recipients: string[],
        context: WorkflowContext,
        authContext: AuthContext,
        tx: any
    ): Promise<string[]> {
        const resolved: string[] = [];

        for (const recipient of recipients) {
            if (recipient === 'assigned_user' && context.instance.assigned_user_id) {
                resolved.push(context.instance.assigned_user_id);
            } else if (recipient === 'created_by' && context.instance.created_by) {
                resolved.push(context.instance.created_by);
            } else if (recipient === 'current_user') {
                resolved.push(authContext.user.id);
            } else if (recipient.startsWith('role:')) {
                const roleName = recipient.replace('role:', '');
                const roleUsers = await tx.role.findMany({
                    where: { name: roleName },
                    include: { users: true }
                });
                roleUsers.forEach((role: any) => {
                    role.users.forEach((user: any) => resolved.push(user.id));
                });
            } else {
                // Assume it's a direct user ID
                resolved.push(recipient);
            }
        }

        return [...new Set(resolved)]; // Remove duplicates
    }

    // buildRelations removed as part of simplification
}
