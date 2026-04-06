import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';

// Test data fixtures for supplier tests
export const createSupplierData = (
  orgId: string,
  userId: string,
  options?: {
    businessClassification?: string;
    status?: string;
  }
) => {
  const data: any = {
    supplier_name: `Test Supplier ${Date.now()}`,
    legal_name: `Test Supplier Legal ${Date.now()}`,
    supplier_address: '456 Supplier Street',
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'India',
    zip_code: '400001',
    primary_phone: '+91-9876543211',
    alternative_phone: '+91-9876543212',
    primary_email: `testsupplier${Date.now()}@example.com`,
    secondary_email: `testsupplier2${Date.now()}@example.com`,
    industry: 'Manufacturing',
    business_classification: options?.businessClassification || 'Vendor',
    status: options?.status || 'Active',
    buyer_review_added: 'No',
    onboarded_date: new Date(),
    org_id: orgId,
    created_by: userId,
    modified_by: userId,
  };
  
  // Explicitly exclude id field (database-generated)
  delete data.id;
  
  return data;
};

// Helper functions
export const assertSupplierCreated = async (supplierId: string) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
  });

  expect(supplier).toBeDefined();
  expect(supplier?.id).toBe(supplierId);

  return supplier;
};

// Clean up test data (only cleanup test-created data, not seed data)
export const cleanupTestData = async (orgId: string) => {
  // Note: Seed data suppliers should not be deleted
  // This function is for cleaning up any test-created suppliers if needed
};
