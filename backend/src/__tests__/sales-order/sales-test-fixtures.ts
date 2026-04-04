import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';

// Test data fixtures for sales order tests
export const createSalesOrderData = (customerId: string, locationId: string, orgId: string, userId: string) => ({
  so_number: `SO-${Date.now()}`,
  so_date: new Date(),
  customer_id: customerId,
  location_id: locationId,
  total_amount: 0, // Will be calculated by line items
  notes: 'Test sales order notes',
  org_id: orgId,
  created_by: userId,
  modified_by: userId,
  status: 'Draft',
});

export const createSalesOrderItemData = (salesOrderId: string, itemMasterId: string, orgId: string, userId: string) => ({
  // Note: sales_order_id is not included here - Prisma handles it automatically via nested create
  item_master_id: itemMasterId,
  item_name: 'Test Item',
  item_description: 'Test item description',
  item_type: 'Product',
  quantity: 2,
  rate: 500.00,
  line_total: 1000.00,
  uom: 'EA',
  org_id: orgId,
  created_by: userId,
  modified_by: userId,
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
export const assertInvoiceCreated = async (salesOrderId: string, orgId?: string, customerId?: string) => {
  // First try to find by sales_order_id
  let invoice = await prisma.invoice.findFirst({
    where: { sales_order_id: salesOrderId },
    include: { invoice_line_item: true }
  });

  // If not found, try to find by org and customer (for debugging)
  if (!invoice && orgId && customerId) {
    const recentInvoices = await prisma.invoice.findMany({
      where: {
        org_id: orgId,
        customer_id: customerId,
        invoice_type: 'SALES'
      },
      orderBy: { created_at: 'desc' },
      take: 5,
      include: { invoice_line_item: true }
    });

    console.log('Debug: Recent invoices found:', recentInvoices.map(inv => ({
      id: inv.id,
      sales_order_id: inv.sales_order_id,
      customer_id: inv.customer_id,
      created_at: inv.created_at
    })));

    // Try to find one that might be related (check if it was created very recently)
    invoice = recentInvoices.find(inv => !inv.sales_order_id || inv.sales_order_id === salesOrderId) || recentInvoices[0];
  }

  expect(invoice).toBeDefined();

  if (!invoice) {
    throw new Error(`Invoice not found for sales order ${salesOrderId}`);
  }

  // If invoice exists but sales_order_id doesn't match, that's the issue
  if (invoice.sales_order_id !== salesOrderId) {
    console.error(`Invoice found but sales_order_id mismatch. Expected: ${salesOrderId}, Got: ${invoice.sales_order_id}`);
    console.error('Invoice data:', JSON.stringify(invoice, null, 2));
  }

  expect(invoice?.sales_order_id).toBe(salesOrderId);

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

export const assertInvoiceLineItems = async (invoiceId: string, expectedCount: number) => {
  const lineItems = await prisma.invoice_line_item.findMany({
    where: { instance_id: invoiceId }
  });

  expect(lineItems.length).toBe(expectedCount);

  return lineItems;
};

// Mock data creation functions removed - using seed data from setup-test-data.ts instead

// Clean up test data (only cleanup test-created data, not seed data)
export const cleanupTestData = async (orgId: string) => {


  // Note: Location is part of seed data, so don't delete it
};

