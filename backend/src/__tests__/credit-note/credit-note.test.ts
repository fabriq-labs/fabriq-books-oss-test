import { ModelService } from '../../services/core/ModelService';
import { WorkflowEngine } from '../../workflow-engine/core/WorkflowEngine';
import prisma from '../../lib/prisma';
import {
    createCreditNoteData,
    createCreditNoteItemData,
} from './credit-note-test-fixtures';
import { loadTestConfig, createTestContext, validateTestData, TestConfig } from '../test-configs/test-config-loader';

describe('Credit Note Workflow Tests', () => {
    // Increase timeout for database operations
    jest.setTimeout(30000); // 30 seconds

    console.log('\n🚀 Starting Credit Note Workflow Tests');
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

    describe('Basic Credit Note Creation', () => {
        it('should create a credit note without invoice or sales order', async () => {
            console.log('\n=== TEST 1: Basic Credit Note Creation (Standalone) ===');
            const creditNoteData = createCreditNoteData(
                customerId,
                locationId,
                null, // No invoice
                null, // No sales order
                config.orgId,
                context.user.id
            );
            console.log('Credit Note Data:', JSON.stringify(creditNoteData, null, 2));
            const result = await modelService.create('credit_note', context, creditNoteData, {});
            console.log('Create Result:', JSON.stringify(result, null, 2));
            expect(result.success).toBe(true);
            expect(result.data.id).toBeDefined();
            console.log('✓ Credit Note Created:', JSON.stringify(result.data, null, 2));

            // Check if workflow instance exists (if credit_note has workflow)         
            console.log('✓ Test 1 PASSED\n');
        });
    });

    describe('Credit Note with Items', () => {
        it('should create credit note with line items', async () => {
            console.log('\n=== TEST 2: Credit Note with Items ===');
            const creditNoteData = createCreditNoteData(
                customerId,
                locationId,
                null,
                null,
                config.orgId,
                context.user.id
            );
            console.log('Creating credit note...');
            const creditNoteResult = await modelService.create('credit_note', context, creditNoteData, {});
            const creditNoteId = creditNoteResult.data.id;
            // Add line items
            const items = [
                createCreditNoteItemData(creditNoteId, itemId, null, config.orgId, context.user.id)
            ];
            const itemsResult = await modelService.addChildrenToParent(
                'credit_note',
                creditNoteId,
                'credit_note_item',
                context,
                items,
                {}
            );
            console.log('Add Items Result:', JSON.stringify(itemsResult, null, 2));
            expect(itemsResult.success).toBe(true);
            expect(itemsResult.data).toBeDefined();

            // Verify that the item was actually created by querying the database
            const cnItems = await prisma.credit_note_item.findMany({
                where: { credit_note_id: creditNoteId }
            });
            expect(cnItems.length).toBe(1);
            expect(cnItems[0].item_master_id).toBe(itemId);
            expect(cnItems[0].quantity).toBe(2);
            console.log('✓ Test 2 PASSED\n');
        });

        it('should create credit note with multiple line items', async () => {
            console.log('\n=== TEST 3: Credit Note with Multiple Items ===');
            const creditNoteData = createCreditNoteData(
                customerId,
                locationId,
                null,
                null,
                config.orgId,
                context.user.id
            );
            console.log('Creating credit note...');
            const creditNoteResult = await modelService.create('credit_note', context, creditNoteData, {});
            const creditNoteId = creditNoteResult.data.id;
            console.log('✓ Credit Note Created:', creditNoteId);

            // Add multiple line items (3 items)
            const items = [
                createCreditNoteItemData(creditNoteId, itemId, null, config.orgId, context.user.id),
                createCreditNoteItemData(creditNoteId, itemId, null, config.orgId, context.user.id),
                createCreditNoteItemData(creditNoteId, itemId, null, config.orgId, context.user.id),
            ];
            console.log('Adding multiple items:', items.length);

            const itemsResult = await modelService.addChildrenToParent(
                'credit_note',
                creditNoteId,
                'credit_note_item',
                context,
                items,
                {}
            );
            console.log('Add Items Result:', JSON.stringify(itemsResult, null, 2));

            expect(itemsResult.success).toBe(true);
            expect(itemsResult.data).toBeDefined();

            // Verify that all items were actually created by querying the database
            const cnItems = await prisma.credit_note_item.findMany({
                where: { credit_note_id: creditNoteId }
            });
            console.log('✓ Credit Note Items in DB:', cnItems.length);
            console.log('Items:', JSON.stringify(cnItems, null, 2));

            expect(cnItems.length).toBe(3);

            // Verify all items have correct item_master_id
            cnItems.forEach((item, index) => {
                expect(item.item_master_id).toBe(itemId);
                expect(item.quantity).toBe(2);
                console.log(`✓ Item ${index + 1} verified:`, item.id);
            });

            console.log('✓ Test 3 PASSED\n');
        });
    });
});

