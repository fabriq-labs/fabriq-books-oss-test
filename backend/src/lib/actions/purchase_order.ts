/**
 * Purchase Order Integration Actions
 * 
 * Syncs purchase orders from Fabriq to external ERP systems (Zoho Books, Xero, etc.)
 * when workflow completes.
 */

import { AuthContext } from '../../auth/types';
import { WorkflowContext } from '../../workflow-engine/types/workflow.types';
import logger from '../../utils/logger';
import { createPurchaseOrderConnector } from '../integrations/connectors';

/**
 * Sync purchase order to external ERP system
 * 
 * This function is called as a workflow side-effect when a purchase order
 * is approved and reaches the "PO Issued" state.
 * 
 * It:
 * 1. Fetches the purchase order with all related data
 * 2. Determines the target ERP system (via org.erp_system_type)
 * 3. Uses the appropriate connector to create the PO in the external system
 * 4. Updates the Fabriq PO with external IDs and sync status
 */
export const sync_purchase_order = async (
  context: WorkflowContext | AuthContext,
  model: string,
  instance_id: string,
  change_set: string[],
  select_set: any,
  tx: any
): Promise<void> => {
  try {
    // Extract WorkflowContext from the context parameter
    const workflowContext = (context as any).authContext ? context as WorkflowContext : null;
    const authContext = workflowContext ? workflowContext.authContext : (context as AuthContext);
    const modelId = workflowContext ? workflowContext.instance.model_id : instance_id;

    if (!authContext) {
      throw new Error('AuthContext is required but not provided');
    }

    if (!tx || !tx.purchase_order) {
      throw new Error('Transaction client is required but not provided or is invalid');
    }

    if (!authContext.user.org_id) {
      throw new Error('Organization ID is required but not provided');
    }

    // Fetch org to get ERP system type (purchase_order has org_id, not an organization relation)
    const org = await tx.org.findUnique({
      where: { id: authContext.user.org_id },
      select: { id: true, erp_system_type: true, basecurrency_id: true },
    });

    if (!org) {
      throw new Error(`Organization not found: ${authContext.user.org_id}`);
    }

    // Determine ERP type from org configuration
    // Trim whitespace to handle any leading/trailing spaces in the database
    const erpType = org.erp_system_type?.trim();
    if (!erpType) {
      throw new Error(
        `ERP system type is not configured for organization '${authContext.user.org_id}'. ` +
        `Please configure the ERP system type in the organization settings.`
      );
    }

    logger.info(`Syncing purchase order to external system (${erpType})`, {
      poId: modelId,
      orgId: authContext.user.org_id,
      erpType
    });

    // Fetch purchase order with all related data
    const purchaseOrderRecord = await tx.purchase_order.findUnique({
      where: { id: modelId },
      include: {
        supplier_details: {
          include: {
            payment_terms: true,
            shipping_method: true,
            shipping_terms: true,
          },
        },
        purchase_order_item: {
          include: {
            product: {
              include: {
                purchase_account: true, // Include coa to get external account_id via source_record_id
              },
            },
            supplier: true,
          },
        },
        location: true,
      },
    });

    if (!purchaseOrderRecord) {
      throw new Error(`Purchase order not found: ${modelId}`);
    }

    // Attach org for connectors/mappers that expect `organization` (not a Prisma relation)
    const purchaseOrder = {
      ...purchaseOrderRecord,
      organization: org,
    };

    // Check if already synced
    if (purchaseOrder.source_record_id && purchaseOrder.sync_status === 'synced') {
      logger.info('Purchase order already synced to external system', {
        poId: modelId,
        sourceRecordId: purchaseOrder.source_record_id,
      });
      return; // Already synced, skip
    }

    // Find the active connection for this org and ERP type
    const connection = await tx.source_system.findFirst({
      where: {
        org_id: authContext.user.org_id,
        system_type: erpType,
        is_active: true,
      },
    });

    console.log('erpType', erpType);
    console.log('authContext.user.org_id', authContext.user.org_id);
    console.log('connection', connection);

    logger.info('queryied for connection with erp type', erpType, 'and org id', authContext.user.org_id, 'and connection', connection);

    if (!connection) {
      throw new Error(
        `No active ERP connection found for org_id='${authContext.user.org_id}', system_type='${erpType}'. ` +
        `Please set up the ERP connection first.`
      );
    }

    // Initialize connector using connection ID
    const { createERPConnector } = await import('../integrations/connectors');
    const connector = await createERPConnector(connection.id);

    console.log('purchaseOrder', JSON.stringify(purchaseOrder, null, 2));

    // Create PO in external system via connector
    const result = await connector.createPurchaseOrder(purchaseOrder, tx);

    // Update Fabriq PO with external system IDs and sync status
    await tx.purchase_order.update({
      where: { id: modelId },
      data: {
        source_record_id: result.externalId,
        source_system_id: result.systemId,
        source_updated_at: new Date(),
        sync_status: 'synced',
        modified_at: new Date(),
      },
    });

    logger.info(`✅ Successfully synced purchase order to ${erpType}`, {
      poId: modelId,
      externalPoId: result.externalId,
      externalPoNumber: result.externalNumber,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to sync purchase order to external system', {
      poId: instance_id,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Update PO with failed sync status
    try {
      await tx.purchase_order.update({
        where: { id: instance_id },
        data: {
          sync_status: 'failed',
          modified_at: new Date(),
        },
      });
    } catch (updateError) {
      logger.error('Failed to update PO sync status after error', {
        poId: instance_id,
        error: updateError instanceof Error ? updateError.message : 'Unknown error',
      });
    }

    // Re-throw to fail the workflow transition, preserving original stack trace
    if (error instanceof Error) {
      const enhancedError = new Error(`Failed to sync purchase order: ${errorMessage}`);
      // Preserve the original stack trace
      if (error.stack) {
        enhancedError.stack = `${enhancedError.message}\n\nOriginal error stack trace:\n${error.stack}`;
      }
      throw enhancedError;
    } else {
      throw new Error(`Failed to sync purchase order: ${errorMessage}`);
    }
  }
};

