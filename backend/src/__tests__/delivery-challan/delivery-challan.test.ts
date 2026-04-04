import { ModelService } from '../../services/core/ModelService';
import { WorkflowEngine } from '../../workflow-engine/core/WorkflowEngine';
import prisma from '../../lib/prisma';
import {
    createDeliveryChallanData,
    createDeliveryChallanItemData,
} from './delivery-challan-test-fixtures';
import { loadTestConfig, createTestContext, validateTestData, TestConfig } from '../test-configs/test-config-loader';

describe('Delivery Challan Workflow Tests', () => {
    // Increase timeout for database operations
    jest.setTimeout(30000); // 30 seconds
    console.log('\n🚀 Starting Delivery Challan Workflow Tests');
    const modelService = ModelService.getInstance();
    let config: TestConfig;
    let context: any;
    let locationId: string;
    let customerId: string;
    let itemId: string;


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

    describe('Basic Delivery Challan Creation', () => {
        it('should create a delivery challan without sales order', async () => {
            console.log('\n=== TEST 1: Basic Delivery Challan Creation (Standalone) ===');
            const deliveryChallanData = createDeliveryChallanData(
                customerId,
                locationId,
                null, // No sales order
                config.orgId,
                context.user.id
            );
            console.log('Delivery Challan Data:', JSON.stringify(deliveryChallanData, null, 2));
            const result = await modelService.create('delivery_challan', context, deliveryChallanData, {});
            console.log('Create Result:', JSON.stringify(result, null, 2));
            expect(result.success).toBe(true);
            expect(result.data.id).toBeDefined();
            console.log('✓ Delivery Challan Created:', JSON.stringify(result.data, null, 2));

            // Check if workflow instance exists (if delivery_challan has workflow)         
            console.log('✓ Test 1 PASSED\n');
        });


    });

    describe('Delivery Challan with Items', () => {
        it('should create delivery challan with line items', async () => {
            console.log('\n=== TEST 2: Delivery Challan with Items ===');
            const deliveryChallanData = createDeliveryChallanData(
                customerId,
                locationId,
                null,
                config.orgId,
                context.user.id
            );
            console.log('Creating delivery challan...');
            const deliveryChallanResult = await modelService.create('delivery_challan', context, deliveryChallanData, {});
            const deliveryChallanId = deliveryChallanResult.data.id;
            // Add line items
            const items = [
                createDeliveryChallanItemData(deliveryChallanId, itemId, null, config.orgId, context.user.id)
            ];
            const itemsResult = await modelService.addChildrenToParent(
                'delivery_challan',
                deliveryChallanId,
                'delivery_challan_items',
                context,
                items,
                {}
            );
            console.log('Add Items Result:', JSON.stringify(itemsResult, null, 2));
            expect(itemsResult.success).toBe(true);
            expect(itemsResult.data).toBeDefined();

            // Verify that the item was actually created by querying the database
            const dcItems = await prisma.delivery_challan_item.findMany({
                where: { delivery_challan_id: deliveryChallanId }
            });
            expect(dcItems.length).toBe(1);
            expect(dcItems[0].item_master_id).toBe(itemId);
            expect(dcItems[0].quantity_delivered).toBe(2);
            console.log('✓ Test 2 PASSED\n');
        });

        it('should create delivery challan with multiple line items', async () => {
            console.log('\n=== TEST 3: Delivery Challan with Multiple Items ===');
            const deliveryChallanData = createDeliveryChallanData(
                customerId,
                locationId,
                null,
                config.orgId,
                context.user.id
            );
            console.log('Creating delivery challan...');
            const deliveryChallanResult = await modelService.create('delivery_challan', context, deliveryChallanData, {});
            const deliveryChallanId = deliveryChallanResult.data.id;
            console.log('✓ Delivery Challan Created:', deliveryChallanId);

            // Add multiple line items (3 items)
            const items = [
                createDeliveryChallanItemData(deliveryChallanId, itemId, null, config.orgId, context.user.id),
                createDeliveryChallanItemData(deliveryChallanId, itemId, null, config.orgId, context.user.id),
                createDeliveryChallanItemData(deliveryChallanId, itemId, null, config.orgId, context.user.id),
            ];
            console.log('Adding multiple items:', items.length);

            const itemsResult = await modelService.addChildrenToParent(
                'delivery_challan',
                deliveryChallanId,
                'delivery_challan_items',
                context,
                items,
                {}
            );
            console.log('Add Items Result:', JSON.stringify(itemsResult, null, 2));

            expect(itemsResult.success).toBe(true);
            expect(itemsResult.data).toBeDefined();

            // Verify that all items were actually created by querying the database
            const dcItems = await prisma.delivery_challan_item.findMany({
                where: { delivery_challan_id: deliveryChallanId }
            });
            console.log('✓ Delivery Challan Items in DB:', dcItems.length);
            console.log('Items:', JSON.stringify(dcItems, null, 2));

            expect(dcItems.length).toBe(3);

            // Verify all items have correct item_master_id
            dcItems.forEach((item: any, index: number) => {
                expect(item.item_master_id).toBe(itemId);
                expect(item.quantity_delivered).toBe(2);
                console.log(`✓ Item ${index + 1} verified:`, item.id);
            });

            console.log('✓ Test 3 PASSED\n');
        });
    });


});
