import { ModelService } from '../../services/core/ModelService';
import { WorkflowEngine } from '../../workflow-engine/core/WorkflowEngine';
import prisma from '../../lib/prisma';
import {
    createQuoteData,
    createQuoteItemData,
} from './quote-test-fixtures';
import { loadTestConfig, createTestContext, validateTestData, TestConfig } from '../test-configs/test-config-loader';

describe('Quote Workflow Tests', () => {
    // Increase timeout for database operations
    jest.setTimeout(30000); // 30 seconds

    console.log('\n🚀 Starting Quote Workflow Tests');
    const modelService = ModelService.getInstance();
    const workflowEngine = new WorkflowEngine(prisma);

    let config: TestConfig;
    let context: any;
    let locationId: string;
    let customerId: string;
    let itemId: string;
    let salesOrderId: string | null = null;
    let projectId: string | null = null;

    // Load configuration from environment or default
    beforeAll(() => {
        config = loadTestConfig();
        context = createTestContext(config);
    });

    beforeAll(async () => {
        // Validate that the configured test data exists
        await validateTestData(config, prisma);

        // Get existing seed data IDs
        const customer = await prisma.customers.findUnique({ where: { id: config.customerId } });
        if (!customer) {
            throw new Error(`Customer ${config.customerId} not found. Run the appropriate setup script first.`);
        }
        customerId = customer.id;

        const item = await prisma.item_master.findUnique({ where: { id: config.items.productA } });
        if (!item) {
            throw new Error(`Item ${config.items.productA} not found. Run the appropriate setup script first.`);
        }
        itemId = item.id;

        const location = await prisma.location.findUnique({ where: { id: config.locationId } });
        if (!location) {
            throw new Error(`Location ${config.locationId} not found. Run the appropriate setup script first.`);
        }
        locationId = location.id;

        console.log('✓ All seed data verified and loaded from configuration');
    });

    afterAll(async () => {
        // Clean up test data - DISABLED to preserve all data
        // Uncomment the line below if you want to clean up test data
        // await cleanupTestData(config.orgId);
        await prisma.$disconnect();
    });

    describe('Basic Quote Creation', () => {
        it('should create a quote without sales order or project', async () => {
            console.log('\n=== TEST 1: Basic Quote Creation (Standalone) ===');
            const quoteData = createQuoteData(
                customerId,
                locationId,
                null, // No sales order
                null, // No project
                config.orgId,
                context.user.id
            );
            console.log('Quote Data:', JSON.stringify(quoteData, null, 2));
            const result = await modelService.create('quote', context, quoteData, {});
            console.log('Create Result:', JSON.stringify(result, null, 2));
            expect(result.success).toBe(true);
            expect(result.data.id).toBeDefined();
            expect(result.data.quote_number).toBeDefined();
            expect(result.data.quote_date).toBeDefined();
            expect(result.data.expiry_date).toBeDefined();
            console.log('✓ Quote Created:', JSON.stringify(result.data, null, 2));

            // Check if workflow instance exists (if quote has workflow)         
            console.log('✓ Test 1 PASSED\n');
        });
    });

    describe('Quote with Items', () => {
        it('should create quote with line items', async () => {
            console.log('\n=== TEST 2: Quote with Items ===');
            const quoteData = createQuoteData(
                customerId,
                locationId,
                null,
                null,
                config.orgId,
                context.user.id
            );
            console.log('Creating quote...');
            const quoteResult = await modelService.create('quote', context, quoteData, {});
            const quoteId = quoteResult.data.id;
            // Add line items
            const items = [
                createQuoteItemData(quoteId, itemId, config.orgId, context.user.id)
            ];
            const itemsResult = await modelService.addChildrenToParent(
                'quote',
                quoteId,
                'quote_items',
                context,
                items,
                {}
            );
            console.log('Add Items Result:', JSON.stringify(itemsResult, null, 2));
            expect(itemsResult.success).toBe(true);
            expect(itemsResult.data).toBeDefined();

            // Verify that the item was actually created by querying the database
            const quoteItems = await prisma.quote_item.findMany({
                where: { quote_id: quoteId }
            });
            expect(quoteItems.length).toBe(1);
            expect(quoteItems[0].item_master_id).toBe(itemId);
            expect(quoteItems[0].quantity).toBe(2);
            expect(quoteItems[0].rate).toBe(500.00);
            console.log('✓ Test 2 PASSED\n');
        });

        it('should create quote with multiple line items', async () => {
            console.log('\n=== TEST 3: Quote with Multiple Items ===');
            const quoteData = createQuoteData(
                customerId,
                locationId,
                null,
                null,
                config.orgId,
                context.user.id
            );
            console.log('Creating quote...');
            const quoteResult = await modelService.create('quote', context, quoteData, {});
            const quoteId = quoteResult.data.id;
            console.log('✓ Quote Created:', quoteId);

            // Add multiple line items (3 items)
            const items = [
                createQuoteItemData(quoteId, itemId, config.orgId, context.user.id),
                createQuoteItemData(quoteId, itemId, config.orgId, context.user.id),
                createQuoteItemData(quoteId, itemId, config.orgId, context.user.id),
            ];
            console.log('Adding multiple items:', items.length);

            const itemsResult = await modelService.addChildrenToParent(
                'quote',
                quoteId,
                'quote_items',
                context,
                items,
                {}
            );
            console.log('Add Items Result:', JSON.stringify(itemsResult, null, 2));

            expect(itemsResult.success).toBe(true);
            expect(itemsResult.data).toBeDefined();

            // Verify that all items were actually created by querying the database
            const quoteItems = await prisma.quote_item.findMany({
                where: { quote_id: quoteId }
            });
            console.log('✓ Quote Items in DB:', quoteItems.length);
            console.log('Items:', JSON.stringify(quoteItems, null, 2));

            expect(quoteItems.length).toBe(3);

            // Verify all items have correct item_master_id
            quoteItems.forEach((item, index) => {
                expect(item.item_master_id).toBe(itemId);
                expect(item.quantity).toBe(2);
                expect(item.rate).toBe(500.00);
                console.log(`✓ Item ${index + 1} verified:`, item.id);
            });

            console.log('✓ Test 3 PASSED\n');
        });
    });
});

