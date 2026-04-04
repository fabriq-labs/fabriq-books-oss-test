import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';

// Test data fixtures for purchase invoice tests
export const createPurchaseInvoiceData = (
  supplierId: string,
  locationId: string,
  orgId: string,
  userId: string,
  options?: {
    purchaseOrderId?: string;
  }
) => {
  const data: any = {
    invoice_number: `PI-${Date.now()}`,
    invoice_date: new Date(),
    invoice_type: 'PURCHASE',
    invoice_status: 'Draft',
    supplier_name: 'Test Supplier',
    invoice_total: 0, // Will be calculated by line items
    location_id: locationId,
    org_id: orgId,
    created_by: userId,
    modified_by: userId,
  };
  
  if (options?.purchaseOrderId) {
    data.purchase_order_id = options.purchaseOrderId;
  }
  
  // Explicitly exclude id field (database-generated)
  delete data.id;
  
  return data;
};

export const createPurchaseInvoiceLineItemData = (
  invoiceId: string,
  itemMasterId: string,
  orgId: string,
  userId: string,
  options?: {
    purchaseOrderItemId?: string;
  }
) => {
  const data: any = {
    instance_id: invoiceId,
    item_master_id: itemMasterId,
    item_name: 'Test Item',
    item_description: 'Test item description',
    item_type: 'Product',
    invoice_qty: 2,
    rate: 500.00,
    line_total: 1000.00,
    org_id: orgId,
    created_by: userId,
    modified_by: userId,
  };
  
  if (options?.purchaseOrderItemId) {
    data.purchase_order_item_id = options.purchaseOrderItemId;
  }
  
  // Explicitly exclude id field (database-generated)
  delete data.id;
  
  return data;
};

// Helper functions
export const assertPurchaseInvoiceCreated = async (invoiceId: string) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      invoice_line_item: true,
      workflow_instance: true,
    },
  });

  expect(invoice).toBeDefined();
  expect(invoice?.id).toBe(invoiceId);
  expect(invoice?.invoice_type).toBe('PURCHASE');

  return invoice;
};

export const assertWorkflowState = async (wfInstanceId: string, expectedState: string) => {
  const instance = await prisma.workflow_instance.findUnique({
    where: { id: wfInstanceId }
  });

  expect(instance).toBeDefined();
  expect(instance?.current_state).toBe(expectedState);

  return instance;
};

// Clean up test data (only cleanup test-created data, not seed data)
export const cleanupTestData = async (orgId: string) => {
  // Note: Seed data invoices should not be deleted
  // This function is for cleaning up any test-created invoices if needed
};
