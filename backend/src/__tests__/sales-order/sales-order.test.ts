import { ModelService } from '../../services/core/ModelService';
import { WorkflowEngine } from '../../workflow-engine/core/WorkflowEngine';
import prisma from '../../lib/prisma';
import {
  createSalesOrderData,
  createSalesOrderItemData,
  assertInvoiceCreated,
  assertWorkflowState,
  assertInvoiceLineItems,
  cleanupTestData,
} from './sales-test-fixtures';
import { loadTestConfig, createTestContext, validateTestData, TestConfig } from '../test-configs/test-config-loader';

describe('Sales Order Workflow Tests', () => {
  // Increase timeout for database operations
  jest.setTimeout(30000); // 30 seconds

  console.log('\n🚀 Starting Sales Order Workflow Tests');
  const modelService = ModelService.getInstance();
  const workflowEngine = new WorkflowEngine(prisma);
const findWorkflowAction = (actions: any[], candidateNames: string[]) =>
  actions.find((action) => candidateNames.includes(action.name));

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

    // Ensure the "Generate Invoice" workflow action has the correct side effect to generate invoices
    const soFlow = await prisma.workflow_flow.findFirst({
      where: { model_name: 'sales_order' }
    });

    if (soFlow) {
      const submittedState = await prisma.workflow_state.findFirst({
        where: {
          flow_id: soFlow.id,
          name: 'Submitted'
        }
      });

      if (submittedState) {
        const generateInvoiceAction = await prisma.workflow_action.findFirst({
          where: {
            source_state_id: submittedState.id,
            name: 'Generate Invoice'
          }
        });

        if (generateInvoiceAction) {
          const currentSideEffects = generateInvoiceAction.side_effects as any;
          const hasInvoiceGeneration = currentSideEffects?.effects?.some(
            (e: any) => e.type === 'database' && e.config?.method === 'generate_invoice_from_so'
          );

          if (!hasInvoiceGeneration) {
            console.log('⚠️  Updating "Generate Invoice" action to include invoice generation side effect...');
            await prisma.workflow_action.update({
              where: { id: generateInvoiceAction.id },
              data: {
                side_effects: {
                  effects: [{
                    type: 'database',
                    config: {
                      method: 'generate_invoice_from_so'
                    }
                  }]
                }
              }
            });
            console.log('✓ Updated "Generate Invoice" action with invoice generation side effect');
          }
        }
      }
    }

    console.log('✓ All seed data verified and loaded from configuration');
  });

  afterAll(async () => {
    // Clean up test data - DISABLED to preserve all data
    // Uncomment the line below if you want to clean up test data
    // await cleanupTestData(config.orgId);
    await prisma.$disconnect();
  });

  describe('Basic Sales Order Creation', () => {
    it('should create a sales order with workflow instance in Draft state', async () => {
      console.log('\n=== TEST 1: Basic Sales Order Creation ===');
      const salesOrderData = createSalesOrderData(
        customerId,
        locationId,
        config.orgId,
        context.user.id
      );
      console.log('Sales Order Data:', JSON.stringify(salesOrderData, null, 2));

      const result = await modelService.create('sales_order', context, salesOrderData, {});
      console.log('Create Result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.data.id).toBeDefined();
      console.log('✓ Sales Order Created:', JSON.stringify(result.data, null, 2));

      expect(result.data.wf_instance_id).toBeDefined();
      console.log('✓ Workflow Instance ID:', result.data.wf_instance_id);

      // Verify workflow instance is in Draft state
      const wfInstance = await assertWorkflowState(result.data.wf_instance_id, 'Draft');
      console.log('✓ Workflow Instance:', JSON.stringify(wfInstance, null, 2));
      expect(wfInstance?.status).toBe('active');
      console.log('✓ Test 1 PASSED\n');
    });
  });

  describe('Sales Order with Items', () => {
    it('should create sales order with line items', async () => {
      console.log('\n=== TEST 2: Sales Order with Items ===');
      const salesOrderData = createSalesOrderData(
        customerId,
        locationId,
        config.orgId,
        context.user.id
      );
      console.log('Creating sales order...');

      const salesOrderResult = await modelService.create('sales_order', context, salesOrderData, {});
      const salesOrderId = salesOrderResult.data.id;
      console.log('✓ Sales Order Created:', salesOrderId);

      // Add line items
      const items = [
        createSalesOrderItemData(salesOrderId, itemId, config.orgId, context.user.id)
      ];
      console.log('Adding items:', JSON.stringify(items, null, 2));

      const itemsResult = await modelService.addChildrenToParent(
        'sales_order',
        salesOrderId,
        'sales_order_items',
        context,
        items,
        {}
      );      

      expect(itemsResult.success).toBe(true);
      expect(itemsResult.data).toBeDefined();

      // Verify that the item was actually created by querying the database
      const soItems = await prisma.sales_order_item.findMany({
        where: { sales_order_id: salesOrderId }
      });
      console.log('✓ Sales Order Items in DB:', soItems.length);
      console.log('Items:', JSON.stringify(soItems, null, 2));
      expect(soItems.length).toBe(1);
      console.log('✓ Test 2 PASSED\n');
    });
  });

  describe('Workflow Transition to Invoiced', () => {
    it('should create invoice when transitioning from Submitted to Invoiced', async () => {
      console.log('\n=== TEST 3: Workflow Transition to Invoiced ===');
      const salesOrderData = createSalesOrderData(
        customerId,
        locationId,
        config.orgId,
        context.user.id
      );

      // Create sales order (automatically in Draft state)
      const salesOrderResult = await modelService.create('sales_order', context, salesOrderData, {});
      const salesOrderId = salesOrderResult.data.id;
      const wfInstanceId = salesOrderResult.data.wf_instance_id;
      console.log('✓ Sales Order Created:', salesOrderId);
      console.log('✓ Workflow Instance ID:', wfInstanceId);

      // Add line items
      const items = [
        createSalesOrderItemData(salesOrderId, itemId, config.orgId, context.user.id)
      ];
      await modelService.addChildrenToParent('sales_order', salesOrderId, 'sales_order_items', context, items, {});
      console.log('✓ Items added');

      // Transition from Draft to Submitted
      console.log('Getting workflow context for Draft -> Submitted transition...');
      const wfContext1 = await workflowEngine.getWorkflowContext(wfInstanceId, context);
      console.log('Available Actions:', wfContext1.availableActions.map(a => ({ name: a.name, id: a.id })));
      const submitAction = wfContext1.availableActions.find(a => a.name === 'Submit');
      console.log('submitAction:', submitAction);
      expect(submitAction).toBeDefined();
      await workflowEngine.executeTransition(wfContext1, submitAction!, context, {});
      console.log('✓ Transitioned to Submitted');

      // Transition from Submitted to Invoiced (triggers invoice generation)
      console.log('Getting workflow context for Submitted -> Invoiced transition...');
      const wfContext2 = await workflowEngine.getWorkflowContext(wfInstanceId, context);
      console.log('Available Actions:', wfContext2.availableActions.map(a => ({ name: a.name, id: a.id })));
      const invoiceAction = wfContext2.availableActions.find(a => a.name === 'Approve');
      console.log('invoiceAction:', invoiceAction);
      expect(invoiceAction).toBeDefined();
      await workflowEngine.executeTransition(wfContext2, invoiceAction!, context, {});
      console.log('✓ Transitioned to Invoiced');

      // Verify invoice was created
      const invoice = await assertInvoiceCreated(salesOrderId);
      console.log('✓ Invoice Created:', JSON.stringify(invoice, null, 2));
      expect(invoice?.sales_order_id).toBe(salesOrderId);
      expect(invoice?.invoice_type).toBe('SALES');
      console.log('✓ Test 3 PASSED\n');
    });
  });

  describe('Invoice Link Verification', () => {
    it('should link invoice back to sales order', async () => {
      const salesOrderData = createSalesOrderData(
        customerId,
        locationId,
        config.orgId,
        context.user.id
      );

      const salesOrderResult = await modelService.create('sales_order', context, salesOrderData, {});
      const salesOrderId = salesOrderResult.data.id;
      const wfInstanceId = salesOrderResult.data.wf_instance_id;

      // Add line items
      const items = [createSalesOrderItemData(salesOrderId, itemId, config.orgId, context.user.id)];
      await modelService.addChildrenToParent('sales_order', salesOrderId, 'sales_order_items', context, items, {});

      // Execute workflow transitions
      const wfContext1 = await workflowEngine.getWorkflowContext(wfInstanceId, context);
      const submitAction = findWorkflowAction(wfContext1.availableActions, ['Submit for Processing', 'Submit']);
      expect(submitAction).toBeDefined();
      await workflowEngine.executeTransition(wfContext1, submitAction!, context, {});

      const wfContext2 = await workflowEngine.getWorkflowContext(wfInstanceId, context);
      const invoiceAction = findWorkflowAction(wfContext2.availableActions, ['Generate Invoice', 'Approve']);
      expect(invoiceAction).toBeDefined();
      await workflowEngine.executeTransition(wfContext2, invoiceAction!, context, {});

      // Verify invoice has sales_order_id
      const invoice = await prisma.invoice.findFirst({
        where: { sales_order_id: salesOrderId }
      });

      expect(invoice).toBeDefined();
      expect(invoice?.sales_order_id).toBe(salesOrderId);
    });
  });

  describe('Multiple Items Invoice Generation', () => {
    it('should create invoice with multiple line items', async () => {
      const salesOrderData = createSalesOrderData(
        customerId,
        locationId,
        config.orgId,
        context.user.id
      );

      const salesOrderResult = await modelService.create('sales_order', context, salesOrderData, {});
      const salesOrderId = salesOrderResult.data.id;
      const wfInstanceId = salesOrderResult.data.wf_instance_id;

      // Add multiple line items (3 items)
      const items = [
        createSalesOrderItemData(salesOrderId, itemId, config.orgId, context.user.id),
        createSalesOrderItemData(salesOrderId, itemId, config.orgId, context.user.id),
        createSalesOrderItemData(salesOrderId, itemId, config.orgId, context.user.id),
      ];
      await modelService.addChildrenToParent('sales_order', salesOrderId, 'sales_order_items', context, items, {});

      // Execute workflow transitions
      const wfContext1 = await workflowEngine.getWorkflowContext(wfInstanceId, context);
      const submitAction = findWorkflowAction(wfContext1.availableActions, ['Submit for Processing', 'Submit']);
      expect(submitAction).toBeDefined();
      await workflowEngine.executeTransition(wfContext1, submitAction!, context, {});

      const wfContext2 = await workflowEngine.getWorkflowContext(wfInstanceId, context);
      const invoiceAction = findWorkflowAction(wfContext2.availableActions, ['Generate Invoice', 'Approve']);
      expect(invoiceAction).toBeDefined();
      await workflowEngine.executeTransition(wfContext2, invoiceAction!, context, {});

      // Verify invoice has 3 line items
      const invoice = await prisma.invoice.findFirst({
        where: { sales_order_id: salesOrderId }
      });

      const lineItems = await assertInvoiceLineItems(invoice!.id, 3);
      expect(lineItems.length).toBe(3);
    });
  });

  describe('Customer and Payment Terms Mapping', () => {
    it('should copy customer and payment details to invoice', async () => {
      const salesOrderData = createSalesOrderData(
        customerId,
        locationId,
        config.orgId,
        context.user.id
      );

      const salesOrderResult = await modelService.create('sales_order', context, salesOrderData, {});
      const salesOrderId = salesOrderResult.data.id;
      const wfInstanceId = salesOrderResult.data.wf_instance_id;

      // Add line item
      const items = [createSalesOrderItemData(salesOrderId, itemId, config.orgId, context.user.id)];
      await modelService.addChildrenToParent('sales_order', salesOrderId, 'sales_order_items', context, items, {});

      // Execute workflow transitions
      const wfContext1 = await workflowEngine.getWorkflowContext(wfInstanceId, context);
      const submitAction = findWorkflowAction(wfContext1.availableActions, ['Submit for Processing', 'Submit']);
      expect(submitAction).toBeDefined();
      await workflowEngine.executeTransition(wfContext1, submitAction!, context, {});

      const wfContext2 = await workflowEngine.getWorkflowContext(wfInstanceId, context);
      const invoiceAction = findWorkflowAction(wfContext2.availableActions, ['Generate Invoice', 'Approve']);
      expect(invoiceAction).toBeDefined();
      await workflowEngine.executeTransition(wfContext2, invoiceAction!, context, {});

      // Verify invoice has customer_id and location_id
      const invoice = await prisma.invoice.findFirst({
        where: { sales_order_id: salesOrderId }
      });

      expect(invoice?.customer_id).toBe(customerId);
      expect(invoice?.location_id).toBe(locationId);
    });
  });
});

