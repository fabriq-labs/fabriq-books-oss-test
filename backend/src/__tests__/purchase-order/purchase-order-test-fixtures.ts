import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';

// Test data fixtures for purchase order tests
export const createPurchaseOrderData = (
  supplierId: string,
  locationId: string,
  orgId: string,
  userId: string
) => ({
  supplier_id: supplierId,
  location_id: locationId,
  po_date: new Date(),
  purchase_reason: 'Test purchase order',
  org_id: orgId,
  created_by: userId,
  modified_by: userId,
  status: 'Draft',
});

// Note: purchase_order_item is typically created from purchase_requisition workflow
// This fixture is kept for potential direct PO creation scenarios
export const createPurchaseOrderItemData = (
  itemMasterId: string,
  purchaseRequisitionId: string,
  orgId: string,
  userId: string
) => ({
  purchase_requisition_id: purchaseRequisitionId, // Required field
  product_id: itemMasterId,
  item_name: 'Test Item',
  item_description: 'Test item description',
  item_type: 'Product',
  quantity: 2,
  rate: 500.00,
  item_total: 1000.00,
  uom: 'EA',
  org_id: orgId,
  created_by: userId,
  modified_by: userId,
});

// Helper functions
export const assertWorkflowState = async (wfInstanceId: string, expectedState: string) => {
  const instance = await prisma.workflow_instance.findUnique({
    where: { id: wfInstanceId }
  });

  expect(instance).toBeDefined();
  expect(instance?.current_state).toBe(expectedState);

  return instance;
};

