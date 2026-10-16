import { AuthContext } from '../../auth/types';
import logger from '../../utils/logger';

export interface ExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface PendingActionHandler {
  actionType: string;
  execute(action: { id: string; payload: any; action_type: string }, auth: AuthContext): Promise<ExecutionResult>;
}

const EXECUTORS: Record<string, PendingActionHandler> = {};

const PlaceholderExecutor: PendingActionHandler = {
  actionType: 'placeholder',
  async execute(action) {
    logger.info('Pending action has no domain executor', { actionId: action.id, actionType: action.action_type });
    return { success: true, data: { message: `No executor registered for ${action.action_type}` } };
  },
};

export function registerPendingActionExecutor(handler: PendingActionHandler) {
  EXECUTORS[handler.actionType] = handler;
}

export const PendingActionExecutor = {
  async execute(
    action: { id: string; payload: any; action_type: string },
    auth: AuthContext
  ): Promise<ExecutionResult> {
    const executor = EXECUTORS[action.action_type] || PlaceholderExecutor;
    return executor.execute(action, auth);
  },
  hasExecutor(actionType: string): boolean {
    return actionType in EXECUTORS;
  },
};
