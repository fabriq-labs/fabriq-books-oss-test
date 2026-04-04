import { ModelService } from '../../services/core/ModelService';
import prisma from '../../lib/prisma';
import {
  createItemMasterData,
  assertItemMasterCreated,
  cleanupTestData,
} from './item-master-test-fixtures';
import { loadTestConfig, createTestContext, validateTestData, TestConfig } from '../test-configs/test-config-loader';

describe('Item Master Creation Tests', () => {
  // Increase timeout for database operations
  jest.setTimeout(30000); // 30 seconds

  console.log('\n🚀 Starting Item Master Creation Tests');
  const modelService = ModelService.getInstance();

  let config: TestConfig;
  let context: any;
  let supplierId: string;

  // Load configuration from environment or default
  beforeAll(() => {
    config = loadTestConfig();
    context = createTestContext(config);
  });

  beforeAll(async () => {
    // Validate that the configured test data exists
    await validateTestData(config, prisma);

    // Get supplier ID from config
    const supplier = await prisma.supplier.findUnique({ where: { id: config.supplierId } });
    if (!supplier) {
      throw new Error(`Supplier ${config.supplierId} not found. Run the appropriate setup script first.`);
    }
    supplierId = supplier.id;

    console.log('✓ All seed data verified and loaded from configuration');
  });

  afterAll(async () => {
    // Clean up test data - DISABLED to preserve all data
    // Uncomment the line below if you want to clean up test data
    // await cleanupTestData(config.orgId);
    await prisma.$disconnect();
  });

  describe('Product Item Creation', () => {
    it('should create a product item with supplier reference', async () => {
      console.log('\n=== TEST 1: Product Item Creation ===');
      const itemData = createItemMasterData(
        supplierId,
        config.orgId,
        context.user.id,
        {
          itemType: 'Product',
          stockable: 'Yes',
        }
      );
      console.log('Item Data:', JSON.stringify(itemData, null, 2));

      const result = await modelService.create('item_master', context, itemData, {});
      console.log('Create Result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.data.id).toBeDefined();
      expect(result.data.item_name).toBe(itemData.item_name);
      expect(result.data.item_code).toBe(itemData.item_code);
      console.log('✓ Item Created:', JSON.stringify(result.data, null, 2));

      // Verify item was actually created in database
      const item = await assertItemMasterCreated(result.data.id);
      expect(item?.item_name).toBe(itemData.item_name);
      expect(item?.item_type).toBe('Product');
      expect(item?.stockable).toBe('Yes');
      expect(item?.supplier_id).toBe(supplierId);
      expect(item?.org_id).toBe(config.orgId);
      console.log('✓ Test 1 PASSED\n');
    });
  });

  describe('Service Item Creation', () => {
    it('should create a service item (non-stockable)', async () => {
      console.log('\n=== TEST 2: Service Item Creation ===');
      
      const itemData = createItemMasterData(
        supplierId,
        config.orgId,
        context.user.id,
        {
          itemType: 'Service',
          stockable: 'No',
        }
      );
      console.log('Service Item Data:', JSON.stringify(itemData, null, 2));

      const result = await modelService.create('item_master', context, itemData, {});
      console.log('Create Result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.data.id).toBeDefined();
      
      // Verify service item was actually created in database
      const item = await assertItemMasterCreated(result.data.id);
      expect(item?.item_name).toBe(itemData.item_name);
      expect(item?.item_type).toBe('Service');
      expect(item?.stockable).toBe('No');
      expect(item?.supplier_id).toBe(supplierId);
      expect(item?.org_id).toBe(config.orgId);
      console.log('✓ Item Type:', item?.item_type);
      console.log('✓ Stockable:', item?.stockable);
      console.log('✓ Test 2 PASSED\n');
    });
  });
});
