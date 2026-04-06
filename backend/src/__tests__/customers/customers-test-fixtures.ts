import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';

// Test data fixtures for customer tests
export const createCustomerData = (
  orgId: string,
  userId: string,
  options?: {
    paymentTermId?: string;
    preferredCurrencyId?: string;
  }
) => {
  const data: any = {
    customer_name: `Test Customer ${Date.now()}`,
    customer_address: '123 Test Street',
    city: 'Test City',
    state: 'Test State',
    country: 'India',
    zip_code: '560001',
    primary_phone: '+91-9876543210',
    primary_email: `testcustomer${Date.now()}@example.com`,
    industry: 'Technology',
    website: 'https://testcustomer.example.com',
    org_id: orgId,
    created_by: userId,
    modified_by: userId,
  };
  
  if (options?.paymentTermId) {
    data.payment_term_id = options.paymentTermId;
  }
  
  if (options?.preferredCurrencyId) {
    data.preferred_currency_id = options.preferredCurrencyId;
  }
  
  // Explicitly exclude id field (database-generated)
  delete data.id;
  
  return data;
};

// Helper functions
export const assertCustomerCreated = async (customerId: string) => {
  const customer = await prisma.customers.findUnique({
    where: { id: customerId },
    include: {
      payment_terms: true,
      currency_master: true,
    },
  });

  expect(customer).toBeDefined();
  expect(customer?.id).toBe(customerId);

  return customer;
};

// Clean up test data (only cleanup test-created data, not seed data)
export const cleanupTestData = async (orgId: string) => {
  // Note: Seed data customers should not be deleted
  // This function is for cleaning up any test-created customers if needed
};
