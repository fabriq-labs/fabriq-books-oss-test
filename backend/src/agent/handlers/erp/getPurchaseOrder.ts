import { ERPMethodHandler } from './types';
import { ERPConnector } from '../../../lib/integrations/connectors/types';
import { AuthContext } from '../../../auth/types';
import { ModelService } from '../../../services/core/ModelService';
import logger from '../../../utils/logger';

const modelService = ModelService.getInstance();

/**
 * Handler for getPurchaseOrder method
 * Fetches a purchase order from the ERP system using external ID
 * Supports automatic resolution from context.recordId for purchase_order model
 */
export const getPurchaseOrderHandler: ERPMethodHandler = {
  method: 'getPurchaseOrder',
  requiresContext: true, // Can work with or without context, but prefers context
  description: 'Get purchase order details from ERP system. When context.recordId is available for purchase_order, automatically resolves external ID.',

  validateParams(params?: any, context?: any, auth?: AuthContext): any {
    let externalId = params?.externalId;

    // If context has recordId and we're working with purchase_order, fetch the purchase order
    // and use its source_record_id as externalId
    if (context?.recordId && context?.modelName === 'purchase_order' && !externalId) {
      logger.debug('Will fetch purchase order from context recordId', { recordId: context.recordId });
      // Return a marker that we need to resolve this in execute
      return { _needsContextResolution: true, recordId: context.recordId };
    }

    // If externalId is provided directly, use it
    if (externalId) {
      return { externalId };
    }

    // If no externalId and no context, throw error
    throw new Error(
      'getPurchaseOrder requires params with externalId field, or context.recordId for purchase_order model'
    );
  },

  async execute(
    connector: ERPConnector,
    params: any,
    context?: any,
    auth?: AuthContext
  ): Promise<any> {
    let externalId = params.externalId;

    // If we need to resolve from context, do it now
    if (params._needsContextResolution && context?.recordId && auth) {
      logger.debug('Fetching purchase order from context recordId', { recordId: context.recordId });

      const purchaseOrder = await modelService.getById('purchase_order', auth, context.recordId);

      if (!purchaseOrder.data) {
        throw new Error(`Purchase order with ID ${context.recordId} not found`);
      }

      const poData = purchaseOrder.data;
      externalId = poData.source_record_id;

      if (!externalId) {
        throw new Error(
          `Purchase order ${context.recordId} does not have a source_record_id (external ID). ` +
          `This purchase order may not be synced to the ERP system yet.`
        );
      }

      logger.debug('Using source_record_id from purchase order', {
        recordId: context.recordId,
        externalId,
      });
    }

    // Validate that we have externalId
    if (!externalId) {
      throw new Error('getPurchaseOrder requires params with externalId field, or context.recordId for purchase_order model');
    }

    // Call the connector method
    return await connector.getPurchaseOrder(externalId);
  },
};

