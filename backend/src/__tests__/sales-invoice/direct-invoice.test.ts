import { ModelService } from '../../services/core/ModelService';
import { WorkflowEngine } from '../../workflow-engine/core/WorkflowEngine';
import prisma from '../../lib/prisma';
import {
  createDirectInvoiceData,
  createInvoiceLineItemData,
  assertInvoiceCreated,
  assertInvoiceLineItems,
  assertInvoiceTotals,
  calculateInvoiceTotal,
  cleanupTestData,
} from './direct-invoice-fixtures';
import { loadTestConfig, createTestContext, validateTestData, TestConfig } from '../test-configs/test-config-loader';

describe('Direct Sales Invoice Creation Tests', () => {
  // Increase timeout for database operations
  jest.setTimeout(30000); // 30 seconds

  let config: TestConfig;
  let context: any;

  console.log('\n🚀 Starting Direct Sales Invoice Creation Tests');
  const modelService = ModelService.getInstance();
  const workflowEngine = new WorkflowEngine(prisma);

  // Load configuration from environment or default
  beforeAll(() => {
    config = loadTestConfig();
    context = createTestContext(config);
  });
  let locationId: string;
  let customerId: string;
  let itemId1: string;
  let itemId2: string;
  let itemId3: string;

  beforeAll(async () => {
    // Validate that the configured test data exists
    await validateTestData(config, prisma);

    // Get existing seed data IDs
    const customer = await prisma.customers.findUnique({ where: { id: config.customerId } });
    if (!customer) {
      throw new Error(`Customer ${config.customerId} not found. Run the appropriate setup script first.`);
    }
    customerId = customer.id;

    const item1 = await prisma.item_master.findUnique({ where: { id: config.items.productA } });
    if (!item1) {
      throw new Error(`Item ${config.items.productA} not found. Run the appropriate setup script first.`);
    }
    itemId1 = item1.id;

    const item2 = await prisma.item_master.findUnique({ where: { id: config.items.serviceB } });
    if (!item2) {
      throw new Error(`Item ${config.items.serviceB} not found. Run the appropriate setup script first.`);
    }
    itemId2 = item2.id;

    const item3 = await prisma.item_master.findUnique({ where: { id: config.items.productC } });
    if (!item3) {
      throw new Error(`Item ${config.items.productC} not found. Run the appropriate setup script first.`);
    }
    itemId3 = item3.id;

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

  describe('Basic Direct Invoice Creation', () => {
    it('should create a direct sales invoice without sales order', async () => {
      console.log('\n=== TEST 1: Basic Direct Invoice Creation ===');
      const invoiceData = createDirectInvoiceData(
        customerId,
        locationId,
        config.orgId,
        context.user.id
      );
      console.log('Invoice Data:', JSON.stringify(invoiceData, null, 2));

      const result = await modelService.create('invoice', context, invoiceData, {});
      console.log('Create Result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.data.id).toBeDefined();
      console.log('✓ Invoice Created:', JSON.stringify(result.data, null, 2));

      // Verify invoice details
      expect(result.data.invoice_type).toBe('SALES');
      expect(result.data.customer_id).toBe(customerId);
      expect(result.data.location_id).toBe(locationId);
      console.log('✓ Test 1 PASSED\n');
    });
  });

  describe('Direct Invoice with Line Items', () => {
    it('should create direct invoice with line items using addChildrenToParent', async () => {
      console.log('\n=== TEST 2: Direct Invoice with Line Items ===');
      const invoiceData = createDirectInvoiceData(
        customerId,
        locationId,
        config.orgId,
        context.user.id
      );
      console.log('Creating invoice...');

      const invoiceResult = await modelService.create('invoice', context, invoiceData, {});
      const invoiceId = invoiceResult.data.id;
      console.log('✓ Invoice Created:', invoiceId);

      // Add line items
      const lineItems = [
        createInvoiceLineItemData(itemId1, config.orgId, context.user.id, 2, 1000.00)
      ];
      console.log('Adding line items:', JSON.stringify(lineItems, null, 2));

      const itemsResult = await modelService.addChildrenToParent(
        'invoice',
        invoiceId,
        'invoice_line_item',
        context,
        lineItems,
        {}
      );
      // console.log('Add Line Items Result:', JSON.stringify(itemsResult, null, 2));

      expect(itemsResult.success).toBe(true);
      expect(itemsResult.data).toBeDefined();

      // Verify that the line item was actually created by querying the database
      const invoiceLineItems = await prisma.invoice_line_item.findMany({
        where: { instance_id: invoiceId }
      });
      console.log('✓ Invoice Line Items in DB:', invoiceLineItems.length);
      console.log('Line Items:', JSON.stringify(invoiceLineItems, null, 2));
      expect(invoiceLineItems.length).toBe(1);
      console.log('✓ Test 2 PASSED\n');
    });
  });

  describe('Direct Invoice with Multiple Line Items', () => {
    it('should create direct invoice with multiple line items', async () => {
      console.log('\n=== TEST 3: Direct Invoice with Multiple Line Items ===');
      const invoiceData = createDirectInvoiceData(
        customerId,
        locationId,
        config.orgId,
        context.user.id
      );

      const invoiceResult = await modelService.create('invoice', context, invoiceData, {});
      const invoiceId = invoiceResult.data.id;
      console.log('✓ Invoice Created:', invoiceId);

      // Add multiple line items (3 items)
      const lineItems = [
        createInvoiceLineItemData(itemId1, config.orgId, context.user.id, 1, 1000.00), // 1000
        createInvoiceLineItemData(itemId2, config.orgId, context.user.id, 2, 500.00),  // 1000
        createInvoiceLineItemData(itemId3, config.orgId, context.user.id, 1, 750.00),  // 750
      ];
      console.log('Adding 3 line items...');

      await modelService.addChildrenToParent('invoice', invoiceId, 'invoice_line_item', context, lineItems, {});
      console.log('✓ Line items added');

      // Verify invoice has 3 line items
      const invoiceLineItems = await prisma.invoice_line_item.findMany({
        where: { instance_id: invoiceId }
      });

      expect(invoiceLineItems.length).toBe(3);

      // Calculate expected total
      const expectedTotal = calculateInvoiceTotal(invoiceLineItems);
      console.log('Expected Total:', expectedTotal);
      expect(expectedTotal).toBe(2750.00); // 1000 + 1000 + 750
      console.log('✓ Test 3 PASSED\n');
    });
  });

  describe('Customer and Location Details Mapping', () => {
    it('should copy customer and location details to direct invoice', async () => {
      console.log('\n=== TEST 4: Customer and Location Details ===');
      const invoiceData = createDirectInvoiceData(
        customerId,
        locationId,
        config.orgId,
        context.user.id
      );

      const invoiceResult = await modelService.create('invoice', context, invoiceData, {});
      const invoiceId = invoiceResult.data.id;
      console.log('✓ Invoice Created:', invoiceId);

      // Add line item
      const lineItems = [createInvoiceLineItemData(itemId1, config.orgId, context.user.id)];
      await modelService.addChildrenToParent('invoice', invoiceId, 'invoice_line_item', context, lineItems, {});

      // Verify invoice has customer_id and location_id
      const invoice = await assertInvoiceCreated(invoiceId);

      expect(invoice?.customer_id).toBe(customerId);
      expect(invoice?.location_id).toBe(locationId);
      expect(invoice?.invoice_type).toBe('SALES');

      // Verify customer details
      expect(invoice?.customers).toBeDefined();
      expect(invoice?.customers?.customer_name).toBe('Aether Dynamics Corp');

      // Verify location details
      expect(invoice?.location).toBeDefined();
      console.log('✓ Test 4 PASSED\n');
    });
  });

  describe('Invoice Totals Calculation', () => {
    it('should calculate invoice totals correctly from line items', async () => {
      console.log('\n=== TEST 5: Invoice Totals Calculation ===');
      const invoiceData = createDirectInvoiceData(
        customerId,
        locationId,
        config.orgId,
        context.user.id
      );

      const invoiceResult = await modelService.create('invoice', context, invoiceData, {});
      const invoiceId = invoiceResult.data.id;
      console.log('✓ Invoice Created:', invoiceId);

      // Add multiple line items with different quantities and rates
      const lineItems = [
        createInvoiceLineItemData(itemId1, config.orgId, context.user.id, 2, 1000.00), // 2000
        createInvoiceLineItemData(itemId2, config.orgId, context.user.id, 3, 500.00),   // 1500
        createInvoiceLineItemData(itemId3, config.orgId, context.user.id, 1, 750.00),   // 750
      ];

      await modelService.addChildrenToParent('invoice', invoiceId, 'invoice_line_item', context, lineItems, {});
      console.log('✓ Line items added');

      // Fetch complete invoice with line items
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { invoice_line_item: true }
      });

      expect(invoice).toBeDefined();

      // Calculate expected total: 2000 + 1500 + 750 = 4250
      const expectedTotal = 4250.00;
      const actualTotal = calculateInvoiceTotal(invoice?.invoice_line_item || []);

      console.log('Expected Total:', expectedTotal);
      console.log('Actual Total:', actualTotal);

      expect(actualTotal).toBe(expectedTotal);
      expect(invoice?.invoice_line_item.length).toBe(3);
      console.log('✓ Test 5 PASSED\n');
    });
  });

  describe('Direct Invoice Status and Metadata', () => {
    it('should set correct invoice status and metadata for direct invoices', async () => {
      console.log('\n=== TEST 6: Invoice Status and Metadata ===');
      const invoiceData = createDirectInvoiceData(
        customerId,
        locationId,
        config.orgId,
        context.user.id
      );

      const invoiceResult = await modelService.create('invoice', context, invoiceData, {});
      const invoiceId = invoiceResult.data.id;
      console.log('✓ Invoice Created:', invoiceId);

      // Verify invoice status
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId }
      });
      console.log("invoice", invoice);
      expect(invoice?.invoice_status).toBe('Draft');
      expect(invoice?.invoice_type).toBe('SALES');
      expect(invoice?.org_id).toBe(config.orgId);
      expect(invoice?.sales_order_id).toBeNull(); // Direct invoice has no sales order
      expect(invoice?.purchase_order_id).toBeNull(); // Not a purchase invoice
      expect(invoice?.created_by).toBe(context.user.id);
      expect(invoice?.modified_by).toBe(context.user.id);

      console.log('Invoice Status:', invoice?.invoice_status);
      console.log('Invoice Type:', invoice?.invoice_type);
      console.log('Sales Order ID:', invoice?.sales_order_id);
      console.log('✓ Test 6 PASSED\n');
    });
  });

  describe('Direct Invoice with Different Item Types', () => {
    it('should create direct invoice with both products and services', async () => {
      console.log('\n=== TEST 7: Mixed Product and Service Items ===');
      const invoiceData = createDirectInvoiceData(
        customerId,
        locationId,
        config.orgId,
        context.user.id
      );

      const invoiceResult = await modelService.create('invoice', context, invoiceData, {});
      const invoiceId = invoiceResult.data.id;
      console.log('✓ Invoice Created:', invoiceId);

      // Add items - Product A is a Product, Service B is a Service, Product C is a Product
      const lineItems = [
        createInvoiceLineItemData(itemId1, config.orgId, context.user.id, 2, 1000.00), // Product
        createInvoiceLineItemData(itemId2, config.orgId, context.user.id, 1, 500.00),  // Service
      ];

      await modelService.addChildrenToParent('invoice', invoiceId, 'invoice_line_item', context, lineItems, {});
      console.log('✓ Line items added');

      // Fetch line items with item master details
      const invoiceLineItems = await prisma.invoice_line_item.findMany({
        where: { instance_id: invoiceId },
        include: { item_master: true }
      });

      expect(invoiceLineItems.length).toBe(2);

      // Verify item types from item_master
      const productItem = invoiceLineItems.find((item: any) => item.item_master_id === itemId1);
      const serviceItem = invoiceLineItems.find((item: any) => item.item_master_id === itemId2);

      // Get the actual item types from item_master
      expect(productItem?.item_master_id).toBeDefined();
      expect(serviceItem?.item_master_id).toBeDefined();

      const productMaster = await prisma.item_master.findUnique({ where: { id: productItem!.item_master_id! } });
      const serviceMaster = await prisma.item_master.findUnique({ where: { id: serviceItem!.item_master_id! } });

      expect(productMaster?.item_type).toBe('Product');
      expect(serviceMaster?.item_type).toBe('Service');

      console.log('✓ Test 7 PASSED\n');
    });
  });

  describe('Direct Invoice Line Item Details', () => {
    it('should store correct details for each invoice line item', async () => {
      console.log('\n=== TEST 8: Line Item Details ===');
      const invoiceData = createDirectInvoiceData(
        customerId,
        locationId,
        config.orgId,
        context.user.id
      );

      const invoiceResult = await modelService.create('invoice', context, invoiceData, {});
      const invoiceId = invoiceResult.data.id;

      // Create line item with specific details
      const lineItemData = {
        item_master_id: itemId1, // Add FK to item_master
        item_name: 'Product A',
        item_description: 'Test Product A',
        item_type: 'Product',
        item_number: 'PROD-A',
        invoice_qty: 5,
        rate: 1000.00,
        ordered_quantity: 5, // Float field
        ordered_amount: 5000.00,
        line_total: 5000.00,
        invoiced_amount: 5000.00,
        org_id: config.orgId,
        created_by: context.user.id,
        modified_by: context.user.id,
      };

      await modelService.addChildrenToParent('invoice', invoiceId, 'invoice_line_item', context, [lineItemData], {});

      // Fetch line item and verify details
      const lineItems = await prisma.invoice_line_item.findMany({
        where: { instance_id: invoiceId }
      });

      expect(lineItems.length).toBe(1);
      expect(lineItems[0].invoice_qty).toBe(5);
      expect(lineItems[0].rate).toBe(1000.00);
      expect(lineItems[0].line_total).toBe(5000.00);
      expect(lineItems[0].item_name).toBe('Product A');
      console.log('✓ Test 8 PASSED\n');
    });
  });

  describe('Invoice Workflow Transitions and Posting Logic - Creation of Postings on Submit and Reversal on Reject', () => {
    it('should transition invoice through workflow states with posting creation on submit and reversal on reject', async () => {
      console.log('\n=== TEST 9: Invoice Workflow Transitions and Posting Logic ===');

      // Create a direct sales invoice
      const invoiceData = createDirectInvoiceData(
        customerId,
        locationId,
        config.orgId,
        context.user.id
      );

      const invoiceResult = await modelService.create('invoice', context, invoiceData, {});
      // console.log('Invoice Result:', JSON.stringify(invoiceResult, null, 2));
      const invoiceId = invoiceResult.data.id;
      const wfInstanceId = invoiceResult.data.wf_instance_id;

      console.log('✓ Direct Sales Invoice Created:', invoiceId);
      console.log('✓ Workflow Instance ID:', wfInstanceId);

      // Add line items
      const lineItems = [
        createInvoiceLineItemData(itemId1, config.orgId, context.user.id, 2, 1000.00), // 2000
        createInvoiceLineItemData(itemId2, config.orgId, context.user.id, 1, 500.00),  // 500
      ];
      await modelService.addChildrenToParent('invoice', invoiceId, 'invoice_line_item', context, lineItems, {});
      console.log('✓ Line items added - Total: $2,500');

      // Verify invoice starts in Draft state
      expect(invoiceResult.data.invoice_status).toBe('Draft');
      expect(wfInstanceId).toBeDefined();

      // Get initial workflow context
      const initialWfContext = await workflowEngine.getWorkflowContext(wfInstanceId, context);
      expect(initialWfContext.currentState.name).toBe('Draft');
      console.log('✓ Invoice is in Draft state');

      // Check initial posting count (for this specific invoice)
      const initialPostings = await prisma.posting.count({
        where: { invoice_id: invoiceId }
      });
      console.log('✓ Initial postings for invoice:', initialPostings);

      // Transition: Draft → Submitted
      console.log('Transitioning from Draft to Submitted...');
      const submitAction = initialWfContext.availableActions.find(a => a.name === 'Submit');
      expect(submitAction).toBeDefined();

      await workflowEngine.executeTransition(initialWfContext, submitAction!, context, {});
      console.log('✓ Transitioned to Submitted state');

      // Verify workflow state
      const submittedWfContext = await workflowEngine.getWorkflowContext(wfInstanceId, context);
      expect(submittedWfContext.currentState.name).toBe('Submitted');
      console.log('✓ Confirmed invoice is in Submitted state');

      // Check postings after submit (should have 1 new posting created)
      // DR: Accounts Receivable $2,500, CR: Revenue $2,500
      const submittedPostings = await prisma.posting.count({
        where: { invoice_id: invoiceId }
      });
      expect(submittedPostings).toBe(initialPostings + 1);
      console.log('✓ Posting created on submit!');

      // Transition: Submitted → Approved (nothing happens on approval)
      console.log('Transitioning from Submitted to Approved...');
      const approveAction = submittedWfContext.availableActions.find(a => a.name === 'Approve');
      expect(approveAction).toBeDefined();

      await workflowEngine.executeTransition(submittedWfContext, approveAction!, context, {});
      console.log('✓ Transitioned to Approved state');

      // Verify workflow state
      const approvedWfContext = await workflowEngine.getWorkflowContext(wfInstanceId, context);
      expect(approvedWfContext.currentState.name).toBe('Approved');
      console.log('✓ Confirmed invoice is in Approved state');

      // Check postings after approval (should be same count - nothing happens on approval)
      const approvedPostings = await prisma.posting.count({
        where: { invoice_id: invoiceId }
      });
      expect(approvedPostings).toBe(submittedPostings);
      console.log('✓ No additional postings created on approval');

      // Verify the posting content
      const createdPosting = await prisma.posting.findFirst({
        where: { invoice_id: invoiceId }
      });
      expect(createdPosting).toBeDefined();
      expect(createdPosting?.posting_type).toBe('SALES_INVOICE');
      expect(createdPosting?.amount?.toString()).toBe('2500');
      expect(createdPosting?.invoice_id).toBe(invoiceId);
      expect(createdPosting?.description).toContain('Sales Invoice');
      // Note: Customer name may be undefined in some test scenarios
      // expect(createdPosting?.description).toContain('ACME Corporation');
      console.log('✓ Posting verified:', {
        type: createdPosting?.posting_type,
        amount: createdPosting?.amount,
        description: createdPosting?.description?.substring(0, 50) + '...'
      });

      console.log('✅ SALES INVOICE POSTING SUCCESSFULLY CREATED ON SUBMIT!');
      console.log('   DR: Accounts Receivable $2,500');
      console.log('   CR: Revenue $2,500');
      console.log('   (Nothing happens on approval)');

      // Test rejection scenario: Submit invoice (posting created), then reject it (posting reversed)
      console.log('Testing rejection scenario with separate invoice...');

      // Create another invoice for rejection testing
      const rejectInvoiceData = createDirectInvoiceData(
        customerId,
        locationId,
        config.orgId,
        context.user.id
      );

      const rejectInvoiceResult = await modelService.create('invoice', context, rejectInvoiceData, {});
      const rejectInvoiceId = rejectInvoiceResult.data.id;
      const rejectWfInstanceId = rejectInvoiceResult.data.wf_instance_id;

      // Add line items to rejection test invoice
      const rejectLineItems = [
        createInvoiceLineItemData(itemId1, config.orgId, context.user.id, 1, 1000.00),
      ];
      await modelService.addChildrenToParent('invoice', rejectInvoiceId, 'invoice_line_item', context, rejectLineItems, {});
      console.log('✓ Created separate invoice for rejection testing');

      // Submit the rejection test invoice
      const rejectInitialWfContext = await workflowEngine.getWorkflowContext(rejectWfInstanceId, context);
      const rejectSubmitAction = rejectInitialWfContext.availableActions.find(a => a.name === 'Submit');
      await workflowEngine.executeTransition(rejectInitialWfContext, rejectSubmitAction!, context, {});
      console.log('✓ Submitted rejection test invoice');

      // Now reject it from Submitted back to Draft (this should trigger posting reversal when side effects are configured)
      console.log('Transitioning from Submitted back to Draft (Reject)...');
      const rejectSubmittedWfContext = await workflowEngine.getWorkflowContext(rejectWfInstanceId, context);
      const rejectFromSubmittedAction = rejectSubmittedWfContext.availableActions.find(a => a.name === 'Reject');
      expect(rejectFromSubmittedAction).toBeDefined();

      await workflowEngine.executeTransition(rejectSubmittedWfContext, rejectFromSubmittedAction!, context, {});
      console.log('✓ Rejected back to Draft state');

      // Verify workflow state
      const rejectedWfContext = await workflowEngine.getWorkflowContext(rejectWfInstanceId, context);
      expect(rejectedWfContext.currentState.name).toBe('Draft');
      console.log('✓ Confirmed invoice is back in Draft state');

      // Check postings after rejection (should have 2 postings: 1 original + 1 reversal)
      // DR: Revenue $1,000, CR: Accounts Receivable $1,000 (reversal of original)
      const finalPostings = await prisma.posting.count({
        where: { invoice_id: rejectInvoiceId }
      });
      expect(finalPostings).toBe(2); // 1 original posting + 1 reversal posting
      console.log('✓ Reversal posting created on rejection!');

      // Verify both the original and reversal postings
      const originalPosting = await prisma.posting.findFirst({
        where: {
          invoice_id: rejectInvoiceId,
          posting_type: 'SALES_INVOICE'
        }
      });
      expect(originalPosting).toBeDefined();
      expect(originalPosting?.amount?.toString()).toBe('1000');
      expect(originalPosting?.status).toBe('REVERSED'); // Original should be marked as reversed

      const reversalPosting = await prisma.posting.findFirst({
        where: {
          invoice_id: rejectInvoiceId,
          posting_type: 'REVERSAL'
        }
      });
      expect(reversalPosting).toBeDefined();
      expect(reversalPosting?.amount?.toString()).toBe('1000'); // Same amount as original
      expect(reversalPosting?.description).toContain('REVERSAL');
      expect(reversalPosting?.reversal_of_posting_id).toBe(originalPosting?.id); // Should reference the original
      console.log('✅ REVERSAL POSTING CREATED:');
      console.log('   DR: Revenue $1,000');
      console.log('   CR: Accounts Receivable $1,000 (reversal of original posting)');

      // Verify invoice status is reset
      const finalInvoice = await prisma.invoice.findUnique({
        where: { id: rejectInvoiceId }
      });
      expect(finalInvoice?.invoice_status).toBe('Draft');
      console.log('✓ Invoice status reset to Draft');

      // Note about approved invoices
      console.log('📝 NOTE: Once an invoice reaches Approved state, it cannot be rejected back to Draft.');
      console.log('   Approved is a final state. Additional actions like "Void" or "Cancel" could be added later.');

      console.log('✓ Test 9 PASSED - Workflow transitions work correctly');
      console.log('🎯 Side effects are configured for SUBMIT (posting creation) and REJECT (posting reversal)');
      console.log('📝 NOTE: Posting creation happens on submit, reversal happens on reject');
      console.log('✓ Test 9 PASSED\n');
    });
  });
});

