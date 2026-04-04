import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';

// Test data fixtures for location tests
export const createLocationData = (
  orgId: string,
  userId: string,
  options?: {
    customerId?: string;
  }
) => {
  const data: any = {
    location: `Test Location ${Date.now()}`,
    address: '789 Location Street',
    city: 'Delhi',
    state: 'Delhi',
    country: 'India',
    zip_code: '110001',
    org_id: orgId,
    created_by: userId,
    modified_by: userId,
  };
  
  if (options?.customerId) {
    data.customer_id = options.customerId;
  }
  
  // Explicitly exclude id field (database-generated)
  delete data.id;
  
  return data;
};

// Helper functions
export const assertLocationCreated = async (locationId: string) => {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    include: {
      customers: true,
    },
  });

  expect(location).toBeDefined();
  expect(location?.id).toBe(locationId);

  return location;
};

// Clean up test data (only cleanup test-created data, not seed data)
export const cleanupTestData = async (orgId: string) => {
  // Note: Seed data locations should not be deleted
  // This function is for cleaning up any test-created locations if needed
};
