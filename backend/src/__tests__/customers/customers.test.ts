import { ModelService } from '../../services/core/ModelService';
import prisma from '../../lib/prisma';
import {
  createCustomerData,
  assertCustomerCreated,
  cleanupTestData,
} from './customers-test-fixtures';
import { loadTestConfig, createTestContext, validateTestData, TestConfig } from '../test-configs/test-config-loader';

describe('Customer Master Creation Tests', () => {
  // Increase timeout for database operations
  jest.setTimeout(30000); // 30 seconds

  console.log('\n🚀 Starting Customer Master Creation Tests');
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

  describe('Basic Customer Creation', () => {
    it('should create a customer with all required fields', async () => {
      console.log('\n=== TEST 1: Basic Customer Creation ===');
      const customerData = createCustomerData(
        config.orgId,
        context.user.id
      );
      console.log('Customer Data:', JSON.stringify(customerData, null, 2));

      const result = await modelService.create('customers', context, customerData, {});
      console.log('Create Result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.data.id).toBeDefined();
      expect(result.data.customer_name).toBe(customerData.customer_name);
      expect(result.data.primary_email).toBe(customerData.primary_email);
      console.log('✓ Customer Created:', JSON.stringify(result.data, null, 2));

      // Verify customer was actually created in database
      const customer = await assertCustomerCreated(result.data.id);
      expect(customer?.customer_name).toBe(customerData.customer_name);
      expect(customer?.city).toBe(customerData.city);
      expect(customer?.state).toBe(customerData.state);
      expect(customer?.country).toBe(customerData.country);
      expect(customer?.org_id).toBe(config.orgId);
      console.log('✓ Test 1 PASSED\n');
    });
  });

  describe('Customer Creation with Optional Fields', () => {
    it('should create a customer with payment terms and preferred currency', async () => {
      console.log('\n=== TEST 2: Customer Creation with Optional Fields ===');

      // Get a payment term from seed data (if available)
      const paymentTerm = await prisma.payment_terms.findFirst({
        where: { org_id: config.orgId }
      });

      // Get a currency from seed data (if available)
      const currency = await prisma.currency.findFirst({
        where: { org_id: config.orgId }
      });

      const customerData = createCustomerData(
        config.orgId,
        context.user.id,
        {
          ...(paymentTerm && { paymentTermId: paymentTerm.id }),
          ...(currency && { preferredCurrencyId: currency.id }),
        }
      );
      console.log('Customer Data with Optional Fields:', JSON.stringify(customerData, null, 2));

      const result = await modelService.create('customers', context, customerData, {});
      console.log('Create Result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.data.id).toBeDefined();

      // Verify optional fields if they were provided
      if (paymentTerm) {
        expect(result.data.payment_term_id).toBe(paymentTerm.id);
        console.log('✓ Payment Term linked:', paymentTerm.id);
      }

      if (currency) {
        expect(result.data.preferred_currency_id).toBe(currency.id);
        console.log('✓ Preferred Currency linked:', currency.id);
      }

      // Verify customer was actually created in database with relationships
      const customer = await assertCustomerCreated(result.data.id);
      expect(customer?.customer_name).toBe(customerData.customer_name);

      if (paymentTerm) {
        expect(customer?.payment_term_id).toBe(paymentTerm.id);
        console.log('✓ Payment Terms relationship verified');
      }

      if (currency) {
        expect(customer?.preferred_currency_id).toBe(currency.id);
        console.log('✓ Currency relationship verified');
      }

      console.log('✓ Test 2 PASSED\n');
    });
  });
});
