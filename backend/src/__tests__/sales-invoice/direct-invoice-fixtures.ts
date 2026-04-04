import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';

// Test data fixtures for direct sales invoice tests
export const createDirectInvoiceData = (customerId: string, locationId: string, orgId: string, userId: string) => ({
  invoice_number: `INV-DIRECT-${Date.now()}`,
  invoice_date: new Date(),
  invoice_version: 1,
  invoice_status: 'Draft',
  invoice_type: 'SALES',
  customer_id: customerId,
  location_id: locationId,
  invoice_net_total: 0, // Will be calculated by line items
  invoice_total: 0, // Will be calculated by line items
  balance_amount: 0, // Will be calculated by line items
  payment_terms: 'Net 30',
  shipping_method: 'Standard', // String field in model
  shipping_terms: 'FOB',
  org_id: orgId,
  created_by: userId,
  modified_by: userId,
  status: '9', // Draft status
});

export const createInvoiceLineItemData = (
  itemMasterId: string,
  orgId: string,
  userId: string,
  quantity: number = 2,
  rate: number = 500.00
) => ({
  item_master_id: itemMasterId, // FK to item_master - exists in model
  item_name: 'Test Item',
  item_description: 'Test item description',
  item_type: 'Product',
  item_number: 'ITEM-001',
  ordered_quantity: quantity, // Float in model
  rate: rate,
  ordered_amount: rate * quantity,
  invoice_qty: quantity, // Int in model
  line_total: rate * quantity,
  invoiced_amount: rate * quantity,
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
  permissions: {
    invoice: {
      '*': 'write' as const  // Give full write access to invoice
    }
  },
});

// Helper functions
export const assertInvoiceCreated = async (invoiceId: string) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      invoice_line_item: true,
      customers: true,
      location: true,
    }
  });

  expect(invoice).toBeDefined();
  expect(invoice?.id).toBe(invoiceId);

  return invoice;
};

export const assertInvoiceLineItems = async (invoiceId: string, expectedCount: number) => {
  const lineItems = await prisma.invoice_line_item.findMany({
    where: { instance_id: invoiceId }
  });

  expect(lineItems.length).toBe(expectedCount);

  return lineItems;
};

export const assertInvoiceTotals = (invoice: any, expectedItems: number) => {
  // Verify line items exist
  expect(invoice?.invoice_line_item).toBeDefined();
  expect(invoice?.invoice_line_item.length).toBe(expectedItems);

  // Calculate expected totals
  const expectedTotal = invoice?.invoice_line_item.reduce((sum: number, item: any) => {
    return sum + (item.line_total || 0);
  }, 0);

  // Verify totals match
  expect(invoice?.invoice_total).toBe(expectedTotal);
  expect(invoice?.balance_amount).toBe(expectedTotal);

  return invoice;
};

export const calculateInvoiceTotal = (lineItems: any[]): number => {
  return lineItems.reduce((sum, item) => {
    return sum + (item.line_total || 0);
  }, 0);
};

// Clean up test data (only cleanup test-created data, not seed data)
export const cleanupTestData = async (orgId: string) => {
  console.log('\n🧹 Cleaning up test data...');

  try {
    // Delete invoice line items first (foreign key constraint)
    await prisma.invoice_line_item.deleteMany({
      where: { org_id: orgId }
    });

    // Delete invoices
    await prisma.invoice.deleteMany({
      where: { org_id: orgId, invoice_type: 'SALES', sales_order_id: null }
    });

    console.log('✓ Test data cleaned up');
  } catch (error) {
    console.error('Error cleaning up test data:', error);
  }
};

