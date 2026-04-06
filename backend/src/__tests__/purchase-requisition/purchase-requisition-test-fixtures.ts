import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';

// Test data fixtures for purchase requisition tests
export const createPurchaseRequisitionData = (locationId: string, orgId: string, userId: string) => ({
  requester: 'Test User',
  location_id: locationId,
  purchase_reason: 'Test purchase requisition',
  org_id: orgId,
  created_by: userId,
  modified_by: userId,
  status: 'Draft',
});

export const createPurchaseRequisitionItemData = (itemMasterId: string, orgId: string, userId: string, supplierId: string) => ({
  // Note: instance_id (purchase_requisition_id) will be set automatically when added via 'items' relationship
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
  supplier_id: supplierId,
});

export const createTestContext = (userId: string = 'user_kavya_nair', orgId: string = 'org_indian_demo'): AuthContext => ({
  user: {
    id: userId,
    org_id: orgId,
    email: 'kavya.nair@demo-india.com',
    name: 'Kavya Nair'
  },
  permissions: {},
});

// Helper functions
export const assertPurchaseOrderCreated = async (purchaseRequisitionId: string) => {
  const purchaseOrder = await prisma.purchase_order.findFirst({
    where: { purchase_requisition: { id: purchaseRequisitionId } },
    include: { purchase_order_item: true }
  });

  expect(purchaseOrder).toBeDefined();
  expect(purchaseOrder?.purchase_order_item[0]?.purchase_requisition_id).toBe(purchaseRequisitionId);

  return purchaseOrder;
};

export const assertWorkflowState = async (wfInstanceId: string, expectedState: string) => {
  const instance = await prisma.workflow_instance.findUnique({
    where: { id: wfInstanceId }
  });

  expect(instance).toBeDefined();
  expect(instance?.current_state).toBe(expectedState);

  return instance;
};

export const assertPurchaseRequisitionItems = async (purchaseRequisitionId: string, expectedCount: number) => {
  const items = await prisma.item.findMany({
    where: { instance_id: purchaseRequisitionId }
  });

  expect(items.length).toBe(expectedCount);

  return items;
};

export const getBuyerRole = async () => {
  const buyerRole = await prisma.role.findFirst({
    where: { name: 'Buyer' }
  });

  if (!buyerRole) {
    throw new Error('Buyer role not found. Run setup-workflows.ts first.');
  }

  return buyerRole;
};

export const getDeliveryRole = async () => {
  const deliveryRole = await prisma.role.findFirst({
    where: { name: 'Delivery' }
  });

  if (!deliveryRole) {
    throw new Error('Delivery role not found. Run setup-workflows.ts first.');
  }

  return deliveryRole;
};

export const assertWorkflowAssignedToManager = async (wfInstanceId: string, expectedManagerId: string) => {
  const instance = await prisma.workflow_instance.findUnique({
    where: { id: wfInstanceId },
    include: { current_state_ref: true }
  });

  expect(instance).toBeDefined();
  expect(instance?.assigned_user_id).toBe(expectedManagerId);
  console.log('✓ Workflow assigned to manager:', instance?.assigned_user_id);
  console.log('✓ Expected manager:', expectedManagerId);

  return instance;
};

// Clean up test data (only cleanup test-created data, not seed data)
export const cleanupTestData = async (orgId: string) => {
  // Note: Location, items, organization are part of seed data, so don't delete them
  // This function is for cleaning up any test-created purchase requisitions if needed
};

