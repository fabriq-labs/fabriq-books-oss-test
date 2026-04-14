import { ModelService } from '../../services/core/ModelService';
import prisma from '../../lib/prisma';
import {
  createLocationData,
  assertLocationCreated,
  cleanupTestData,
} from './location-test-fixtures';
import { loadTestConfig, createTestContext, validateTestData, TestConfig } from '../test-configs/test-config-loader';

describe('Location Master Creation Tests', () => {
  // Increase timeout for database operations
  jest.setTimeout(30000); // 30 seconds

  console.log('\n🚀 Starting Location Master Creation Tests');
  const modelService = ModelService.getInstance();

  let config: TestConfig;
  let context: any;
  let customerId: string;

  // Load configuration from environment or default
  beforeAll(() => {
    config = loadTestConfig();
    context = createTestContext(config);
  });

  beforeAll(async () => {
    // Validate that the configured test data exists
    await validateTestData(config, prisma);

    // Get customer ID from config
    const customer = await prisma.customers.findUnique({ where: { id: config.customerId } });
    if (!customer) {
      throw new Error(`Customer ${config.customerId} not found. Run the appropriate setup script first.`);
    }
    customerId = customer.id;

    console.log('✓ All seed data verified and loaded from configuration');
  });

  afterAll(async () => {
    // Clean up test data - DISABLED to preserve all data
    // Uncomment the line below if you want to clean up test data
    // await cleanupTestData(config.orgId);
    await prisma.$disconnect();
  });

  describe('Standalone Location Creation', () => {
    it('should create a location without customer reference', async () => {
      console.log('\n=== TEST 1: Standalone Location Creation ===');
      const locationData = createLocationData(
        config.orgId,
        context.user.id
      );
      console.log('Location Data:', JSON.stringify(locationData, null, 2));

      const result = await modelService.create('location', context, locationData, {});
      console.log('Create Result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.data.id).toBeDefined();
      expect(result.data.location).toBe(locationData.location);
      expect(result.data.city).toBe(locationData.city);
      console.log('✓ Location Created:', JSON.stringify(result.data, null, 2));

      // Verify location was actually created in database
      const location = await assertLocationCreated(result.data.id);
      expect(location?.location).toBe(locationData.location);
      expect(location?.city).toBe(locationData.city);
      expect(location?.state).toBe(locationData.state);
      expect(location?.country).toBe(locationData.country);
      expect(location?.org_id).toBe(config.orgId);
      expect(location?.customer_id).toBeNull();
      console.log('✓ Test 1 PASSED\n');
    });
  });

  describe('Location Creation with Customer Reference', () => {
    it('should create a location with customer reference', async () => {
      console.log('\n=== TEST 2: Location Creation with Customer Reference ===');

      const locationData = createLocationData(
        config.orgId,
        context.user.id,
        {
          customerId: customerId,
        }
      );
      console.log('Location Data with Customer:', JSON.stringify(locationData, null, 2));

      const result = await modelService.create('location', context, locationData, {});
      console.log('Create Result:', JSON.stringify(result, null, 2));
      expect(result.success).toBe(true);
      expect(result.data.id).toBeDefined();

      // Verify location was actually created in database with customer reference
      const location = await assertLocationCreated(result.data.id);
      expect(location?.location).toBe(locationData.location);
      expect(location?.customer_id).toBe(customerId);
      expect(location?.org_id).toBe(config.orgId);
      console.log('✓ Customer ID:', location?.customer_id);
      console.log('✓ Test 2 PASSED\n');
    });
  });
});
