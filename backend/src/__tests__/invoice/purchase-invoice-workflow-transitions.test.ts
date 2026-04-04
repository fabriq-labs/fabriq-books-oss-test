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

describe('Purchase Invoice Workflow Transition Tests', () => {
  // Increase timeout for database operations
  jest.setTimeout(30000); // 30 seconds

  console.log('\n🚀 Starting Purchase Invoice Workflow Transition Tests');
  const modelService = ModelService.getInstance();
  // Disable side effects (email and ERP sync) to prevent delays in tests
  const workflowEngine = new WorkflowEngine(prisma, { executeSideEffects: false });

  let config: TestConfig;
  let context: any;
  let buyerContext: any;
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

    // Create buyer context for workflow actions (Invoice workflow requires Buyer role)
    buyerContext = {
      user: {
        id: config.buyerUserId,
        org_id: config.orgId,
        email: `${config.buyerUserId}@example.com`,
        name: config.buyerUserId.replace('user_', '').replace('_', ' ').toUpperCase()
      },
      org: {
        id: config.orgId
      }
    };

    console.log('✓ All seed data verified and loaded from configuration');
    console.log('✓ Buyer context created for:', config.buyerUserId);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Invoice Workflow Transitions', () => {
    it('should transition from Draft to Submitted (Submit)', async () => {
      console.log('\n=== TEST 1: Submit Transition ===');
      const invoiceData = createPurchaseInvoiceData(
        supplierId,
        locationId,
        config.orgId,
        context.user.id
      );

      // Create invoice (automatically in Draft state)
      const invoiceResult = await modelService.create('invoice', context, invoiceData, {});
      const invoiceId = invoiceResult.data.id;
      const wfInstanceId = invoiceResult.data.wf_instance_id;
      console.log('✓ Invoice Created:', invoiceId);
      console.log('✓ Workflow Instance ID:', wfInstanceId);

      // Note: Line items are optional for workflow tests - workflow can proceed without them
      // If needed, line items can be added separately, but for workflow transition tests they're not required
      console.log('✓ Invoice created (line items not required for workflow tests)');

      // Verify initial state
      const initialWfInstance = await prisma.workflow_instance.findUnique({
        where: { id: wfInstanceId }
      });
      expect(initialWfInstance?.current_state).toBe('Draft');
      console.log('✓ Initial State:', initialWfInstance?.current_state);

      // Get workflow context and find Submit action
      const wfContext = await workflowEngine.getWorkflowContext(wfInstanceId, buyerContext);
      console.log('Available Actions:', wfContext.availableActions.map(a => ({ name: a.name, id: a.id })));
      const submitAction = wfContext.availableActions.find(a => a.name === 'Submit');
      expect(submitAction).toBeDefined();
      console.log('submitAction:', submitAction);

      // Execute Submit transition
      await workflowEngine.executeTransition(wfContext, submitAction!, buyerContext, {});
      console.log('✓ Transitioned to Submitted');

      // Verify workflow state
      const wfInstance = await assertWorkflowState(wfInstanceId, 'Submitted');
      expect(wfInstance?.status).toBe('active');
      console.log('✓ Test 1 PASSED\n');
    });

    it('should transition from Submitted to Approved (Approve)', async () => {
      console.log('\n=== TEST 2: Approve Transition ===');
      const invoiceData = createPurchaseInvoiceData(
        supplierId,
        locationId,
        config.orgId,
        context.user.id
      );

      // Create invoice
      const invoiceResult = await modelService.create('invoice', context, invoiceData, {});
      const invoiceId = invoiceResult.data.id;
      const wfInstanceId = invoiceResult.data.wf_instance_id;

      // Note: Line items are optional for workflow tests - workflow can proceed without them

      // Transition to Submitted
      const wfContext1 = await workflowEngine.getWorkflowContext(wfInstanceId, buyerContext);
      const submitAction = wfContext1.availableActions.find(a => a.name === 'Submit');
      expect(submitAction).toBeDefined();
      await workflowEngine.executeTransition(wfContext1, submitAction!, buyerContext, {});
      console.log('✓ Transitioned to Submitted');

      // Transition to Approved (final state)
      console.log('Transitioning to Approved...');
      const wfContext2 = await workflowEngine.getWorkflowContext(wfInstanceId, buyerContext);
      console.log('Available Actions:', wfContext2.availableActions.map(a => ({ name: a.name, id: a.id })));
      const approveAction = wfContext2.availableActions.find(a => a.name === 'Approve');
      expect(approveAction).toBeDefined();
      console.log('approveAction:', approveAction);
      await workflowEngine.executeTransition(wfContext2, approveAction!, buyerContext, {});
      console.log('✓ Transitioned to Approved');

      // Verify workflow state
      const wfInstance = await assertWorkflowState(wfInstanceId, 'Approved');
      expect(wfInstance?.status).toBe('completed');
      console.log('✓ Test 2 PASSED\n');
    });

    it('should transition from Submitted to Draft (Reject)', async () => {
      console.log('\n=== TEST 3: Reject Transition ===');
      const invoiceData = createPurchaseInvoiceData(
        supplierId,
        locationId,
        config.orgId,
        context.user.id
      );

      // Create invoice
      const invoiceResult = await modelService.create('invoice', context, invoiceData, {});
      const invoiceId = invoiceResult.data.id;
      const wfInstanceId = invoiceResult.data.wf_instance_id;

      // Note: Line items are optional for workflow tests - workflow can proceed without them

      // Transition to Submitted
      const wfContext1 = await workflowEngine.getWorkflowContext(wfInstanceId, buyerContext);
      const submitAction = wfContext1.availableActions.find(a => a.name === 'Submit');
      expect(submitAction).toBeDefined();
      await workflowEngine.executeTransition(wfContext1, submitAction!, buyerContext, {});
      console.log('✓ Transitioned to Submitted');

      // Transition back to Draft (Reject)
      console.log('Transitioning back to Draft (Reject)...');
      const wfContext2 = await workflowEngine.getWorkflowContext(wfInstanceId, buyerContext);
      console.log('Available Actions:', wfContext2.availableActions.map(a => ({ name: a.name, id: a.id })));
      const rejectAction = wfContext2.availableActions.find(a => a.name === 'Reject');
      expect(rejectAction).toBeDefined();
      console.log('rejectAction:', rejectAction);
      await workflowEngine.executeTransition(wfContext2, rejectAction!, buyerContext, {});
      console.log('✓ Transitioned back to Draft');

      // Verify workflow state
      const wfInstance = await assertWorkflowState(wfInstanceId, 'Draft');
      expect(wfInstance?.status).toBe('active');
      console.log('✓ Test 3 PASSED\n');
    });

    it('should complete full workflow end-to-end (Submit → Approve)', async () => {
      console.log('\n=== TEST 4: Full Workflow End-to-End ===');
      const invoiceData = createPurchaseInvoiceData(
        supplierId,
        locationId,
        config.orgId,
        context.user.id
      );

      // Create invoice
      const invoiceResult = await modelService.create('invoice', context, invoiceData, {});
      const invoiceId = invoiceResult.data.id;
      const wfInstanceId = invoiceResult.data.wf_instance_id;

      // Note: Line items are optional for workflow tests - workflow can proceed without them

      // Verify initial state
      let wfInstance = await prisma.workflow_instance.findUnique({
        where: { id: wfInstanceId }
      });
      expect(wfInstance?.current_state).toBe('Draft');
      console.log('✓ Initial State:', wfInstance?.current_state);

      // Step 1: Submit
      let wfContext = await workflowEngine.getWorkflowContext(wfInstanceId, buyerContext);
      const submitAction = wfContext.availableActions.find(a => a.name === 'Submit');
      await workflowEngine.executeTransition(wfContext, submitAction!, buyerContext, {});
      wfInstance = await assertWorkflowState(wfInstanceId, 'Submitted');
      console.log('✓ Step 1: Submitted → Submitted');

      // Step 2: Approve
      wfContext = await workflowEngine.getWorkflowContext(wfInstanceId, buyerContext);
      const approveAction = wfContext.availableActions.find(a => a.name === 'Approve');
      await workflowEngine.executeTransition(wfContext, approveAction!, buyerContext, {});
      wfInstance = await assertWorkflowState(wfInstanceId, 'Approved');
      expect(wfInstance?.status).toBe('completed');
      console.log('✓ Step 2: Approved → Approved (Final)');

      // Verify invoice still exists
      const invoice = await assertPurchaseInvoiceCreated(invoiceId);
      expect(invoice?.id).toBe(invoiceId);
      expect(invoice?.wf_instance_id).toBe(wfInstanceId);
      console.log('✓ Invoice verified:', invoice?.invoice_number);
      console.log('✓ Test 4 PASSED\n');
    });
  });
});
