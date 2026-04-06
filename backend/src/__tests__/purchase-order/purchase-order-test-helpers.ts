import { ModelService } from '../../services/core/ModelService';
import { WorkflowEngine } from '../../workflow-engine/core/WorkflowEngine';
import prisma from '../../lib/prisma';
import {
  createPurchaseRequisitionData,
  createPurchaseRequisitionItemData,
} from '../purchase-requisition/purchase-requisition-test-fixtures';

// Jest expect is available globally in test files, but we need to import it for TypeScript
declare const expect: jest.Expect;

/**
 * Common helper function to create a purchase order through the full workflow
 * This function handles:
 * 1. Creating a purchase requisition
 * 2. Adding items to the PR
 * 3. Going through PR workflow (Submit -> Manager Approve -> Buyer Approve)
 * 4. Finding the created PO
 * 5. Transitioning PO to "PO Pending Approval"
 * 
 * Returns the PO ID and workflow instance ID
 */
export async function createPurchaseOrderThroughWorkflow(
  modelService: ModelService,
  workflowEngine: WorkflowEngine,
  context: any,
  managerContext: any,
  buyerContext: any,
  locationId: string,
  itemId: string,
  orgId: string,
  supplierId: string
): Promise<{ poId: string; poWfInstanceId: string }> {
  // Create purchase requisition
  const purchaseRequisitionData = createPurchaseRequisitionData(
    locationId,
    orgId,
    context.user.id
  );

  const prResult = await modelService.create('purchase_requisition', context, purchaseRequisitionData, {});
  const prId = prResult.data.id;
  const prWfInstanceId = prResult.data.wf_instance_id;
  console.log('✓ Purchase Requisition Created:', prId);

  // Add line items
  const items = [createPurchaseRequisitionItemData(itemId, orgId, context.user.id, supplierId)];
  await modelService.addChildrenToParent('purchase_requisition', prId, 'items', context, items, {});
  console.log('✓ Items added to PR');

  // Go through PR workflow to generate PO
  // Transition to Manager Review
  const prWfContext1 = await workflowEngine.getWorkflowContext(prWfInstanceId, context);
  const submitAction = prWfContext1.availableActions.find(a => a.name === 'Submit');
  await workflowEngine.executeTransition(prWfContext1, submitAction!, context, {});
  console.log('✓ PR Transitioned to Manager Review');

  // Transition to Buyer Review
  const prWfContext2 = await workflowEngine.getWorkflowContext(prWfInstanceId, managerContext);
  const approveManagerAction = prWfContext2.availableActions.find(a => a.name === 'Approve by Manager');
  await workflowEngine.executeTransition(prWfContext2, approveManagerAction!, managerContext, {});
  console.log('✓ PR Transitioned to Buyer Review');

  // Transition to Delivery - this will auto-create PO
  const prWfContext3 = await workflowEngine.getWorkflowContext(prWfInstanceId, buyerContext);
  const approveBuyerAction = prWfContext3.availableActions.find(a => a.name === 'Approve by Buyer');
  await workflowEngine.executeTransition(prWfContext3, approveBuyerAction!, buyerContext, {});
  console.log('✓ PR Transitioned to Delivery - PO should be created');

  // Verify PO was created
  const purchaseOrders = await prisma.purchase_order.findMany({
    where: { purchase_id: prId },
  });
  expect(purchaseOrders.length).toBeGreaterThan(0);
  
  // Find PO with the specified supplier (if provided)
  let po = purchaseOrders[0];
  if (supplierId) {
    const poWithSupplier = purchaseOrders.find(po => po.supplier_id === supplierId);
    if (!poWithSupplier) {
      throw new Error(`No PO found with supplier ${supplierId}. Found POs: ${purchaseOrders.map(p => p.id).join(', ')}`);
    }
    po = poWithSupplier;
  }
  
  const poId = po.id;
  const poWfInstanceId = po.wf_instance_id;
  expect(poWfInstanceId).toBeDefined();
  if (!poWfInstanceId) {
    throw new Error('Purchase order workflow instance ID is missing');
  }
  console.log('✓ Purchase Order created:', poId);
  console.log('✓ PO Workflow Instance ID:', poWfInstanceId);

  // Verify PO is in initial state
  const initialWfInstance = await prisma.workflow_instance.findUnique({
    where: { id: poWfInstanceId },
  });
  expect(initialWfInstance?.current_state).toBe('Pending PO Creation');
  console.log('✓ PO is in initial state: Pending PO Creation');

  // Transition PO to "PO Pending Approval"
  const poWfContext1 = await workflowEngine.getWorkflowContext(poWfInstanceId, buyerContext);
  const poSubmitAction = poWfContext1.availableActions.find(a => a.name === 'Submit');
  expect(poSubmitAction).toBeDefined();
  await workflowEngine.executeTransition(poWfContext1, poSubmitAction!, buyerContext, {});
  console.log('✓ PO Transitioned to PO Pending Approval');

  // Verify PO is in pending approval state
  const pendingWfInstance = await prisma.workflow_instance.findUnique({
    where: { id: poWfInstanceId },
  });
  expect(pendingWfInstance?.current_state).toBe('PO Pending Approval');
  console.log('✓ PO is in PO Pending Approval state');

  return { poId, poWfInstanceId };
}

/**
 * Common setup function to initialize test contexts and find users
 */
export async function setupTestContexts(
  config: any,
  prisma: any
): Promise<{
  buyerContext: any;
  managerContext: any;
}> {
  // Get buyer role
  const buyerRole = await prisma.role.findUnique({
    where: { name: 'Buyer' }
  });
  if (!buyerRole) {
    throw new Error('Buyer role not found. Please run setup-workflows.ts first.');
  }

  // Get buyer user (from config or find one)
  const buyerUser = await prisma.user.findFirst({
    where: {
      org_id: config.orgId,
      // Try to find user with buyer role, or use config buyerUserId
      id: (config as any).buyerUserId || undefined,
    },
    orderBy: { created_at: 'asc' }
  });

  if (!buyerUser) {
    throw new Error(`No buyer user found in organization ${config.orgId}.`);
  }

  // Create buyer context for approval actions
  const buyerContext = {
    user: {
      id: buyerUser.id,
      org_id: config.orgId,
      email: `${buyerUser.id}@example.com`,
      name: buyerUser.id.replace('user_', '').replace('_', ' ').toUpperCase()
    },
    org: {
      id: config.orgId
    }
  };

  // Get manager user for PR workflow
  const managerUser = await prisma.user.findFirst({
    where: {
      org_id: config.orgId,
      id: (config as any).managerUserId || undefined,
    },
    orderBy: { created_at: 'asc' }
  });

  if (!managerUser) {
    throw new Error(`No manager user found in organization ${config.orgId}.`);
  }

  const managerContext = {
    user: {
      id: managerUser.id,
      org_id: config.orgId,
      email: `${managerUser.id}@example.com`,
      name: managerUser.id.replace('user_', '').replace('_', ' ').toUpperCase()
    },
    org: {
      id: config.orgId
    }
  };

  return { buyerContext, managerContext };
}

