import { ModelService } from '../../services/core/ModelService';
import prisma from '../../lib/prisma';
import {
  createSupplierData,
  assertSupplierCreated,
  cleanupTestData,
} from './supplier-test-fixtures';
import { loadTestConfig, createTestContext, validateTestData, TestConfig } from '../test-configs/test-config-loader';

describe('Supplier Master Creation Tests', () => {
  // Increase timeout for database operations
  jest.setTimeout(30000); // 30 seconds

  console.log('\n🚀 Starting Supplier Master Creation Tests');
  const modelService = ModelService.getInstance();

  let config: TestConfig;
  let context: any;

  // Load configuration from environment or default
  beforeAll(() => {
    config = loadTestConfig();
    context = createTestContext(config);
  });

  beforeAll(async () => {
    // Validate that the configured test data exists
    await validateTestData(config, prisma);

    console.log('✓ All seed data verified and loaded from configuration');
  });

  afterAll(async () => {
    // Clean up test data - DISABLED to preserve all data
    // Uncomment the line below if you want to clean up test data
    // await cleanupTestData(config.orgId);
    await prisma.$disconnect();
  });

  describe('Basic Supplier Creation', () => {
    it('should create a supplier with basic information', async () => {
      console.log('\n=== TEST 1: Basic Supplier Creation ===');
      const supplierData = createSupplierData(
        config.orgId,
        context.user.id
      );
      console.log('Supplier Data:', JSON.stringify(supplierData, null, 2));

      const result = await modelService.create('supplier', context, supplierData, {});
      console.log('Create Result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.data.id).toBeDefined();
      expect(result.data.supplier_name).toBe(supplierData.supplier_name);
      expect(result.data.primary_email).toBe(supplierData.primary_email);
      console.log('✓ Supplier Created:', JSON.stringify(result.data, null, 2));

      // Verify supplier was actually created in database
      const supplier = await assertSupplierCreated(result.data.id);
      expect(supplier?.supplier_name).toBe(supplierData.supplier_name);
      expect(supplier?.city).toBe(supplierData.city);
      expect(supplier?.state).toBe(supplierData.state);
      expect(supplier?.country).toBe(supplierData.country);
      expect(supplier?.org_id).toBe(config.orgId);
      console.log('✓ Test 1 PASSED\n');
    });
  });

  describe('Supplier Creation with Business Classification', () => {
    it('should create a supplier with business classification and status', async () => {
      console.log('\n=== TEST 2: Supplier Creation with Business Classification ===');
      
      const supplierData = createSupplierData(
        config.orgId,
        context.user.id,
        {
          businessClassification: 'Contractor',
          status: 'Pending',
        }
      );
      console.log('Supplier Data with Classification:', JSON.stringify(supplierData, null, 2));

      const result = await modelService.create('supplier', context, supplierData, {});
      console.log('Create Result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.data.id).toBeDefined();
      
      // Verify supplier was actually created in database with classification
      const supplier = await assertSupplierCreated(result.data.id);
      expect(supplier?.supplier_name).toBe(supplierData.supplier_name);
      expect(supplier?.business_classification).toBe('Contractor');
      expect(supplier?.status).toBe('Pending');
      expect(supplier?.org_id).toBe(config.orgId);
      console.log('✓ Business Classification:', supplier?.business_classification);
      console.log('✓ Status:', supplier?.status);
      console.log('✓ Test 2 PASSED\n');
    });
  });
});
