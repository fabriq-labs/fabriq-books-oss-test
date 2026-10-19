import { AuthContext } from '../auth/types';
import logger from '../utils/logger';
import { functionMap, workflowActionMap } from '../../lib/domain';

export type { DomainAction, DomainActionBinding } from '../../lib/domain';
export { functionMap, workflowActionMap };

export const execute_Action = async (
  context: AuthContext,
  action: string,
  model: string,
  instance_id: string,
  change_set: string[],
  select_set: any,
  tx: any,
  created?: any
) => {
  logger.debug('Executing domain action', { action, model, instance_id });
  const binding = functionMap[model];
  if (!binding) return undefined;
  if (action === 'UPDATE' && change_set.some((field) => binding.fields.includes(field))) {
    const result = await binding.method(context, model, instance_id, change_set, select_set, tx);
    return [result];
  }
  if (action === 'DELETE' || action === 'ADD') {
    const result = await binding.method(context, model, instance_id, change_set, select_set, tx, created);
    return [result];
  }
  return undefined;
};

export const executeCustomAction = async (
  _context: AuthContext,
  model: string,
  _id: string,
  action: string,
  _attributes?: any,
  _options?: any,
  _tx?: any
) => {
  logger.debug('No domain custom action registered', { model, action });
  return undefined;
};
