import { AuthContext } from '../../auth/types';
import prisma from '../../lib/prisma';

// Test data fixtures for item_master tests
export const createItemMasterData = (
  supplierId: string,
  orgId: string,
  userId: string,
  options?: {
    itemType?: string;
    stockable?: string;
  }
) => {
  const data: any = {
    item_code: `ITEM-${Date.now()}`,
    item_name: `Test Item ${Date.now()}`,
    name: `Test Item ${Date.now()}`,
    item_shortname: `TestItem${Date.now()}`,
    item_description: 'Test item description',
    item_type: options?.itemType || 'Product',
    unit_price: 1000.00,
    stockable: options?.stockable || 'Yes',
    item_status: 'Active',
    supplier_id: supplierId,
    org_id: orgId,
    created_by: userId,
    modified_by: userId,
  };
  
  // Explicitly exclude id field (database-generated)
  delete data.id;
  
  return data;
};

// Helper functions
export const assertItemMasterCreated = async (itemId: string) => {
  const item = await prisma.item_master.findUnique({
    where: { id: itemId },
    include: {
      supplier: true,
    },
  });

  expect(item).toBeDefined();
  expect(item?.id).toBe(itemId);

  return item;
};

// Clean up test data (only cleanup test-created data, not seed data)
export const cleanupTestData = async (orgId: string) => {
  // Note: Seed data items should not be deleted
  // This function is for cleaning up any test-created items if needed
};
