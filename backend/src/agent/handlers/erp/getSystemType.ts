import { ERPMethodHandler } from './types';
import { ERPConnector } from '../../../lib/integrations/connectors/types';
import logger from '../../../utils/logger';

/**
 * Handler for getSystemType method
 * Returns the ERP system type identifier (e.g., 'zoho_books', 'xero')
 * Note: This is a synchronous method, not async
 */
export const getSystemTypeHandler: ERPMethodHandler = {
  method: 'getSystemType',
  requiresContext: false,
  description: 'Get the ERP system type identifier (e.g., zoho_books, xero)',

  validateParams(params?: any): any {
    // No parameters needed for this method
    if (params && Object.keys(params).length > 0) {
      logger.warn('getSystemType does not require parameters, ignoring provided params', { params });
    }
    return {};
  },

  async execute(connector: ERPConnector): Promise<any> {
    // getSystemType is synchronous, not async, but we wrap it in Promise.resolve
    // to maintain consistent async interface
    return Promise.resolve(connector.getSystemType());
  },
};

