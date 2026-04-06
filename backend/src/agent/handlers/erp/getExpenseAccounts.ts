import { ERPMethodHandler } from './types';
import { ERPConnector } from '../../../lib/integrations/connectors/types';
import logger from '../../../utils/logger';

/**
 * Handler for getExpenseAccounts method
 * Fetches expense accounts from the ERP system
 */
export const getExpenseAccountsHandler: ERPMethodHandler = {
  method: 'getExpenseAccounts',
  requiresContext: false,
  description: 'Get all expense accounts from the ERP system',

  validateParams(params?: any): any {
    // No parameters needed for this method
    if (params && Object.keys(params).length > 0) {
      logger.warn('getExpenseAccounts does not require parameters, ignoring provided params', { params });
    }
    return {};
  },

  async execute(connector: ERPConnector): Promise<any> {
    return await connector.getExpenseAccounts();
  },
};

