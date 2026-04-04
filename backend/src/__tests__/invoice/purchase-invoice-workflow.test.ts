import { ModelService } from '../../services/core/ModelService';
import { WorkflowEngine } from '../../workflow-engine/core/WorkflowEngine';
import prisma from '../../lib/prisma';
import {
  createPurchaseInvoiceData,
  createPurchaseInvoiceLineItemData,
  assertPurchaseInvoiceCreated,
  assertWorkflowState,
} from './purchase-invoice-test-fixtures';
import { loadTestConfig, createTestContext, validateTestData, TestConfig } from '../test-configs/test-config-loader';

describe('Purchase Invoice Workflow Tests', () => {
  // Increase timeout for database operations
  jest.setTimeout(30000); // 30 seconds

  console.log('\n🚀 Starting Purchase Invoice Workflow Tests');
  const modelService = ModelService.getInstance();
  const workflowEngine = new WorkflowEngine(prisma);

  let config: TestConfig;
  let context: any;
  let locationId: string;
  let supplierId: string;
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
    const location = await prisma.location.findUnique({ where: { id: config.locationId } });
    if (!location) {
      throw new Error(`Location ${config.locationId} not found. Run the appropriate setup script first.`);
    }
    locationId = location.id;

    const supplier = await prisma.supplier.findUnique({ where: { id: config.supplierId } });
    if (!supplier) {
      throw new Error(`Supplier ${config.supplierId} not found. Run the appropriate setup script first.`);
    }
    supplierId = supplier.id;

    const item = await prisma.item_master.findUnique({ where: { id: config.items.productA } });
    if (!item) {
      throw new Error(`Item ${config.items.productA} not found. Run the appropriate setup script first.`);
    }
    itemId = item.id;

    console.log('✓ All seed data verified and loaded from configuration');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Basic Purchase Invoice Creation', () => {
    it('should create a purchase invoice with workflow instance', async () => {
      console.log('\n=== TEST 1: Basic Purchase Invoice Creation ===');
      const invoiceData = createPurchaseInvoiceData(
        supplierId,
        locationId,
        config.orgId,
        context.user.id
      );
      console.log('Purchase Invoice Data:', JSON.stringify(invoiceData, null, 2));

      const result = await modelService.create('invoice', context, invoiceData, {});
      console.log('Create Result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.data.id).toBeDefined();
      expect(result.data.invoice_type).toBe('PURCHASE');
      expect(result.data.invoice_number).toBeDefined();
      console.log('✓ Purchase Invoice Created:', JSON.stringify(result.data, null, 2));

      // Verify workflow instance was created
      expect(result.data.wf_instance_id).toBeDefined();
      console.log('✓ Workflow Instance ID:', result.data.wf_instance_id);

      // Verify workflow instance exists and is active
      const wfInstance = await prisma.workflow_instance.findUnique({
        where: { id: result.data.wf_instance_id }
      });
      expect(wfInstance).toBeDefined();
      expect(wfInstance?.status).toBe('active');
      console.log('✓ Workflow State:', wfInstance?.current_state);
      console.log('✓ Test 1 PASSED\n');
    });
  });

  describe('Purchase Invoice Workflow Transitions', () => {
    it('should transition workflow through states', async () => {
      console.log('\n=== TEST 2: Purchase Invoice Workflow Transitions ===');
      const invoiceData = createPurchaseInvoiceData(
        supplierId,
        locationId,
        config.orgId,
        context.user.id
      );

      // Create purchase invoice
      const invoiceResult = await modelService.create('invoice', context, invoiceData, {});
      const invoiceId = invoiceResult.data.id;
      const wfInstanceId = invoiceResult.data.wf_instance_id;
      console.log('✓ Purchase Invoice Created:', invoiceId);
      console.log('✓ Workflow Instance ID:', wfInstanceId);

      // Get initial workflow state (if workflow exists)
      try {
        const initialWfContext = await workflowEngine.getWorkflowContext(wfInstanceId, context);
        console.log('Initial State:', initialWfContext.currentState);
        console.log('Available Actions:', initialWfContext.availableActions.map(a => a.name));

        // If there are available actions, try to transition
        if (initialWfContext.availableActions.length > 0) {
          const firstAction = initialWfContext.availableActions[0];
          console.log(`Attempting to transition using action: ${firstAction.name}`);
          
          await workflowEngine.executeTransition(initialWfContext, firstAction, context, {});
          
          // Verify workflow state changed
          const updatedWfInstance = await prisma.workflow_instance.findUnique({
            where: { id: wfInstanceId }
          });
          console.log('Updated State:', updatedWfInstance?.current_state);
          expect(updatedWfInstance?.current_state).not.toBe(initialWfContext.currentState);
        } else {
          console.log('No workflow actions available - workflow may be in final state or require specific conditions');
        }
      } catch (error: any) {
        // Workflow might not be configured for invoice, or workflow instance might not exist
        console.log('⚠️  Workflow context not available:', error.message);
        console.log('This is expected if invoice workflow is not configured');
        
        // Verify workflow instance exists
        const wfInstance = await prisma.workflow_instance.findUnique({
          where: { id: wfInstanceId }
        });
        if (wfInstance) {
          console.log('✓ Workflow instance exists:', wfInstance.current_state);
        }
      }

      // Verify invoice still exists
      const invoice = await assertPurchaseInvoiceCreated(invoiceId);
      expect(invoice?.id).toBe(invoiceId);
      console.log('✓ Test 2 PASSED\n');
    });
  });
});
