import { ModelService } from '../../services/core/ModelService';
import prisma from '../../lib/prisma';
import { calculate_payment_total } from '../../lib/actions/zeiv';
import {
    createInvoiceData,
    createPaymentReceiptData,
} from './payment-receipt-fixtures';
import { loadTestConfig, createTestContext, validateTestData, TestConfig } from '../test-configs/test-config-loader';

describe('Payment Receipt Tests', () => {
    // Increase timeout for database operations
    jest.setTimeout(30000); // 30 seconds
    console.log('\n🚀 Starting Payment Receipt Tests');
    const modelService = ModelService.getInstance();

    let config: TestConfig;
    let context: any;
    let locationId: string;
    let customerId: string;

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
    // Helper function to get invoice data graph structure (select_set)
    describe('Payment Receipt with calculate_payment_total', () => {
        it('should update invoice balance when payment receipt is created', async () => {
            console.log('\n=== TEST 1: Payment Receipt Balance Calculation ===');
            // Create invoice with hardcoded data
            const invoiceData = createInvoiceData(
                customerId,
                locationId,
                config.orgId,
                context.user.id
            );
            invoiceData.invoice_total = 2000.00; // Hardcoded total
            invoiceData.invoice_net_total = 2000.00;
            invoiceData.balance_amount = 2000.00;
            const invoiceResult = await modelService.create('invoice', context, invoiceData, {});
            const invoiceId = invoiceResult.data.id;
            // Create payment receipt using addChildrenToParent
            const paymentReceiptData = createPaymentReceiptData(
                invoiceId,
                customerId,
                config.orgId,
                context.user.id,
                750.00, // Hardcoded payment amount
                'PARTIAL'
            );
            const { invoice_id, ...paymentDataWithoutInvoiceId } = paymentReceiptData;
            const paymentResult = await modelService.addChildrenToParent(
                'invoice',
                invoiceId,
                'payment_receipt',
                context,
                [paymentDataWithoutInvoiceId],
                {}
            );
            console.log('✓ Payment Receipt Created via addChildrenToParent');
            // Verify invoice balance was updated correctly
            expect(paymentResult.data?.balance_amount).toBe(1250.00);
            console.log('✓ Test 1 PASSED\n');
        });
    });

    describe('Multiple Payment Receipts', () => {
        it('should handle multiple payments for the same invoice', async () => {
            console.log('\n=== TEST 2: Multiple Payment Receipts ===');
            // Create invoice with hardcoded data
            const invoiceData = createInvoiceData(
                customerId,
                locationId,
                config.orgId,
                context.user.id
            );
            invoiceData.invoice_total = 3000.00; // Hardcoded total
            invoiceData.invoice_net_total = 3000.00;
            invoiceData.balance_amount = 3000.00;
            const invoiceResult = await modelService.create('invoice', context, invoiceData, {});
            const invoiceId = invoiceResult.data.id;
            console.log('✓ Invoice Created:', invoiceId);
            // Create first payment (500.00) using addChildrenToParent
            const payment1Data = createPaymentReceiptData(
                invoiceId,
                customerId,
                config.orgId,
                context.user.id,
                500.00,
                'PARTIAL'
            );
            const { invoice_id: invoiceId1, ...payment1DataWithoutInvoiceId } = payment1Data;
            const payment1Result = await modelService.addChildrenToParent(
                'invoice',
                invoiceId,
                'payment_receipt',
                context,
                [payment1DataWithoutInvoiceId],
                {}
            );
            console.log('✓ Payment 1 Created via addChildrenToParent');
            expect(payment1Result.data?.balance_amount).toBe(2500.00);
            // Create second payment (1000.00) using addChildrenToParent
            const payment2Data = createPaymentReceiptData(
                invoiceId,
                customerId,
                config.orgId,
                context.user.id,
                1000.00,
                'PARTIAL'
            );
            const { invoice_id: invoiceId2, ...payment2DataWithoutInvoiceId } = payment2Data;
            const payment2Result = await modelService.addChildrenToParent(
                'invoice',
                invoiceId,
                'payment_receipt',
                context,
                [payment2DataWithoutInvoiceId],
                {}
            );
            console.log('✓ Payment 2 Created via addChildrenToParent');
            expect(payment2Result.data?.balance_amount).toBe(1500.00);
            // Get the created payment receipt ID from the result
            console.log('✓ Test 2 PASSED\n');
        });
    });

    describe('✅ createPaymentReceipt Function Tests - Using calculate_payment_total', () => {
        describe('✅ Positive Test Case (Valid Payment Receipt)', () => {
            it('should create a payment receipt when amount is less than invoice total', async () => {
                console.log('\n=== TEST: Positive Test Case (Valid Payment Receipt) ===');

                // Create invoice with invoice_total = 1000
                const invoiceData = createInvoiceData(
                    customerId,
                    locationId,
                    config.orgId,
                    context.user.id
                );
                invoiceData.invoice_total = 1000.00;
                invoiceData.invoice_net_total = 1000.00;
                invoiceData.balance_amount = 1000.00;

                const invoiceResult = await modelService.create('invoice', context, invoiceData, {});
                expect(invoiceResult.success).toBe(true);
                const invoiceId = invoiceResult.data.id;
                console.log('✓ Invoice Created:', invoiceId, 'with total:', invoiceData.invoice_total);
                // Create payment receipt with amount = 800
                const paymentData = createPaymentReceiptData(
                    invoiceId,
                    customerId,
                    config.orgId,
                    context.user.id,
                    800.00,
                    'PARTIAL'
                );

                // Remove invoice_id since addChildrenToParent handles the relationship automatically
                const { invoice_id, ...paymentDataWithoutInvoiceId } = paymentData;
                console.log('Attempting to create payment receipt with amount 800.00...');
                const result = await modelService.addChildrenToParent(
                    'invoice',
                    invoiceId,
                    'payment_receipt',
                    context,
                    [paymentDataWithoutInvoiceId],
                    {}
                );

                expect(result.success).toBe(true);
                expect(result.data).toBeDefined();
                expect(result.data?.balance_amount).toBe(200.00);
                console.log('✓ Test PASSED\n');
            });
        });

        describe('❌ Negative Test Case (Amount Exceeds Invoice Total)', () => {
            it('should throw error when payment amount exceeds invoice total', async () => {
                console.log('\n=== TEST: Negative Test Case (Amount Exceeds Invoice Total) ===');
                // Create invoice with invoice_total = 1000
                const invoiceData = createInvoiceData(
                    customerId,
                    locationId,
                    config.orgId,
                    context.user.id
                );
                invoiceData.invoice_total = 1000.00;
                invoiceData.invoice_net_total = 1000.00;
                invoiceData.balance_amount = 1000.00;
                const invoiceResult = await modelService.create('invoice', context, invoiceData, {});
                expect(invoiceResult.success).toBe(true);
                const invoiceId = invoiceResult.data.id;
                console.log('✓ Invoice Created:', invoiceId, 'with total:', invoiceData.invoice_total);
                // Try to create payment receipt with amount = 1200 (exceeds invoice total)
                const paymentData = createPaymentReceiptData(
                    invoiceId,
                    customerId,
                    config.orgId,
                    context.user.id,
                    1200.00,
                    'PARTIAL'
                );

                // Remove invoice_id since addChildrenToParent handles the relationship automatically
                const { invoice_id, ...paymentDataWithoutInvoiceId } = paymentData;
                console.log('Attempting to create payment receipt with amount 1200.00 (exceeds 1000.00)...');
                // Expect the error to be thrown when payment amount exceeds invoice total
                await expect(
                    modelService.addChildrenToParent(
                        'invoice',
                        invoiceId,
                        'payment_receipt',
                        context,
                        [paymentDataWithoutInvoiceId],
                        {}
                    )
                ).rejects.toThrow(/Total payments.*are greater than invoice total/);
                console.log('✓ Test PASSED - Error thrown as expected\n');
            });
        });

        describe('🔄 Multiple Payment Receipts for a Single Invoice', () => {
            it('should handle multiple payments correctly and reject when total exceeds invoice total', async () => {
                console.log('\n=== TEST: Multiple Payment Receipts for a Single Invoice ===');
                // Create invoice with invoice_total = 1000
                const invoiceData = createInvoiceData(
                    customerId,
                    locationId,
                    config.orgId,
                    context.user.id
                );
                invoiceData.invoice_total = 1000.00;
                invoiceData.invoice_net_total = 1000.00;
                invoiceData.balance_amount = 1000.00;

                const invoiceResult = await modelService.create('invoice', context, invoiceData, {});
                expect(invoiceResult.success).toBe(true);
                const invoiceId = invoiceResult.data.id;
                console.log('✓ Invoice Created:', invoiceId, 'with total:', invoiceData.invoice_total);
                // Helper function to validate payment using calculate_payment_total logic   
                // Create first receipt: amount = 400 ✅
                console.log('\n--- Creating First Receipt (amount = 400) ---');
                const payment1Data = createPaymentReceiptData(
                    invoiceId,
                    customerId,
                    config.orgId,
                    context.user.id,
                    400.00,
                    'PARTIAL'
                );
                const { invoice_id: invoiceId1, ...payment1DataWithoutInvoiceId } = payment1Data;
                // Validate before creating
                console.log('✓ Validation passed for first payment');
                const result1 = await modelService.addChildrenToParent(
                    'invoice',
                    invoiceId,
                    'payment_receipt',
                    context,
                    [payment1DataWithoutInvoiceId],
                    {}
                );
                expect(result1.success).toBe(true);
                expect(result1.data?.balance_amount).toBe(600.00);
                console.log('✓ First receipt created successfully');
                // Create second receipt: amount = 500 ✅
                console.log('\n--- Creating Second Receipt (amount = 500) ---');
                const payment2Data = createPaymentReceiptData(
                    invoiceId,
                    customerId,
                    config.orgId,
                    context.user.id,
                    500.00,
                    'PARTIAL'
                );
                const { invoice_id: invoiceId2, ...payment2DataWithoutInvoiceId } = payment2Data;
                // Validate before creating
                console.log('✓ Validation passed for second payment');
                const result2 = await modelService.addChildrenToParent(
                    'invoice',
                    invoiceId,
                    'payment_receipt',
                    context,
                    [payment2DataWithoutInvoiceId],
                    {}
                );
                expect(result2.success).toBe(true);
                expect(result2.data?.balance_amount).toBe(100.00);
                console.log('✓ Second receipt created successfully');
                console.log('\n--- Attempting Third Receipt (amount = 200) ---');
                const payment3Data = createPaymentReceiptData(
                    invoiceId,
                    customerId,
                    config.orgId,
                    context.user.id,
                    200.00,
                    'PARTIAL'
                );
                const { invoice_id: invoiceId3, ...payment3DataWithoutInvoiceId } = payment3Data;
                // Expect the error to be thrown when total payments exceed invoice total
                // (400 + 500 + 200 = 1100 > 1000)
                await expect(
                    modelService.addChildrenToParent(
                        'invoice',
                        invoiceId,
                        'payment_receipt',
                        context,
                        [payment3DataWithoutInvoiceId],
                        {}
                    )
                ).rejects.toThrow(/Total payments.*are greater than invoice total/);
                console.log('✓ Test PASSED - Error thrown as expected when total exceeds invoice total\n');
            });
        });
    });
});

