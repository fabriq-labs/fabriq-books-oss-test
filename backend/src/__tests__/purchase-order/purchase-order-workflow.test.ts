import { ModelService } from '../../services/core/ModelService';
import { WorkflowEngine } from '../../workflow-engine/core/WorkflowEngine';
import prisma from '../../lib/prisma';
import {
  createPurchaseOrderData,
  assertWorkflowState,
} from './purchase-order-test-fixtures';
import { loadTestConfig, createTestContext, validateTestData, TestConfig } from '../test-configs/test-config-loader';

describe('Purchase Order Workflow Tests', () => {
  // Increase timeout for database operations
  jest.setTimeout(30000); // 30 seconds

  console.log('\n🚀 Starting Purchase Order Workflow Tests');
  const modelService = ModelService.getInstance();
  // Disable side effects (email and ERP sync) to prevent delays in tests
  const workflowEngine = new WorkflowEngine(prisma, { executeSideEffects: false });

  let config: TestConfig;
  let context: any;
  let buyerContext: any;
  let locationId: string;
  let supplierId: string;

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

    // Create buyer context for workflow actions (PO workflow requires Buyer role)
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

  describe('Purchase Order Workflow Transitions', () => {
    it('should transition from Pending PO Creation to PO Pending Approval (Submit)', async () => {
      console.log('\n=== TEST 1: Submit Transition ===');
      const purchaseOrderData = createPurchaseOrderData(
        supplierId,
        locationId,
        config.orgId,
        context.user.id
      );

      // Create purchase order (automatically in Pending PO Creation state)
      const poResult = await modelService.create('purchase_order', context, purchaseOrderData, {});
      const poId = poResult.data.id;
      const wfInstanceId = poResult.data.wf_instance_id;
      console.log('✓ Purchase Order Created:', poId);
      console.log('✓ Workflow Instance ID:', wfInstanceId);

      // Verify initial state
      const initialWfInstance = await prisma.workflow_instance.findUnique({
        where: { id: wfInstanceId }
      });
      expect(initialWfInstance?.current_state).toBe('Pending PO Creation');
      console.log('✓ Initial State:', initialWfInstance?.current_state);

      // Get workflow context and find Submit action
      const wfContext = await workflowEngine.getWorkflowContext(wfInstanceId, buyerContext);
      console.log('Available Actions:', wfContext.availableActions.map(a => ({ name: a.name, id: a.id })));
      const submitAction = wfContext.availableActions.find(a => a.name === 'Submit');
      expect(submitAction).toBeDefined();
      console.log('submitAction:', submitAction);

      // Execute Submit transition
      await workflowEngine.executeTransition(wfContext, submitAction!, buyerContext, {});
      console.log('✓ Transitioned to PO Pending Approval');

      // Verify workflow state
      const wfInstance = await assertWorkflowState(wfInstanceId, 'PO Pending Approval');
      expect(wfInstance?.status).toBe('active');
      console.log('✓ Test 1 PASSED\n');
    });

    it('should transition from PO Pending Approval to PO Issued (Approve)', async () => {
      console.log('\n=== TEST 2: Approve Transition ===');
      const purchaseOrderData = createPurchaseOrderData(
        supplierId,
        locationId,
        config.orgId,
        context.user.id
      );

      // Create purchase order
      const poResult = await modelService.create('purchase_order', context, purchaseOrderData, {});
      const poId = poResult.data.id;
      const wfInstanceId = poResult.data.wf_instance_id;
      console.log('✓ Purchase Order Created:', poId);

      // Transition to PO Pending Approval
      const wfContext1 = await workflowEngine.getWorkflowContext(wfInstanceId, buyerContext);
      const submitAction = wfContext1.availableActions.find(a => a.name === 'Submit');
      expect(submitAction).toBeDefined();
      await workflowEngine.executeTransition(wfContext1, submitAction!, buyerContext, {});
      console.log('✓ Transitioned to PO Pending Approval');

      // Transition to PO Issued (final state)
      console.log('Transitioning to PO Issued...');
      const wfContext2 = await workflowEngine.getWorkflowContext(wfInstanceId, buyerContext);
      console.log('Available Actions:', wfContext2.availableActions.map(a => ({ name: a.name, id: a.id })));
      const approveAction = wfContext2.availableActions.find(a => a.name === 'Approve');
      expect(approveAction).toBeDefined();
      console.log('approveAction:', approveAction);
      await workflowEngine.executeTransition(wfContext2, approveAction!, buyerContext, {});
      console.log('✓ Transitioned to PO Issued');

      // Verify workflow state
      const wfInstance = await assertWorkflowState(wfInstanceId, 'PO Issued');
      expect(wfInstance?.status).toBe('completed');
      console.log('✓ Test 2 PASSED\n');
    });

    it('should transition from PO Pending Approval to PO Cancelled (Reject)', async () => {
      console.log('\n=== TEST 3: Reject Transition ===');
      const purchaseOrderData = createPurchaseOrderData(
        supplierId,
        locationId,
        config.orgId,
        context.user.id
      );

      // Create purchase order
      const poResult = await modelService.create('purchase_order', context, purchaseOrderData, {});
      const poId = poResult.data.id;
      const wfInstanceId = poResult.data.wf_instance_id;
      console.log('✓ Purchase Order Created:', poId);

      // Transition to PO Pending Approval
      const wfContext1 = await workflowEngine.getWorkflowContext(wfInstanceId, buyerContext);
      const submitAction = wfContext1.availableActions.find(a => a.name === 'Submit');
      expect(submitAction).toBeDefined();
      await workflowEngine.executeTransition(wfContext1, submitAction!, buyerContext, {});
      console.log('✓ Transitioned to PO Pending Approval');

      // Transition to PO Cancelled
      console.log('Transitioning to PO Cancelled...');
      const wfContext2 = await workflowEngine.getWorkflowContext(wfInstanceId, buyerContext);
      console.log('Available Actions:', wfContext2.availableActions.map(a => ({ name: a.name, id: a.id })));
      const rejectAction = wfContext2.availableActions.find(a => a.name === 'Reject');
      expect(rejectAction).toBeDefined();
      console.log('rejectAction:', rejectAction);
      await workflowEngine.executeTransition(wfContext2, rejectAction!, buyerContext, {});
      console.log('✓ Transitioned to PO Cancelled');

      // Verify workflow state
      const wfInstance = await assertWorkflowState(wfInstanceId, 'PO Cancelled');
      expect(wfInstance?.status).toBe('active');
      console.log('✓ Test 3 PASSED\n');
    });

    it('should complete full workflow end-to-end (Submit → Approve)', async () => {
      console.log('\n=== TEST 4: Full Workflow End-to-End ===');
      const purchaseOrderData = createPurchaseOrderData(
        supplierId,
        locationId,
        config.orgId,
        context.user.id
      );

      // Create purchase order
      const poResult = await modelService.create('purchase_order', context, purchaseOrderData, {});
      const poId = poResult.data.id;
      const wfInstanceId = poResult.data.wf_instance_id;
      console.log('✓ Purchase Order Created:', poId);

      // Verify initial state
      let wfInstance = await prisma.workflow_instance.findUnique({
        where: { id: wfInstanceId }
      });
      expect(wfInstance?.current_state).toBe('Pending PO Creation');
      console.log('✓ Initial State:', wfInstance?.current_state);

      // Step 1: Submit
      let wfContext = await workflowEngine.getWorkflowContext(wfInstanceId, buyerContext);
      const submitAction = wfContext.availableActions.find(a => a.name === 'Submit');
      await workflowEngine.executeTransition(wfContext, submitAction!, buyerContext, {});
      wfInstance = await assertWorkflowState(wfInstanceId, 'PO Pending Approval');
      console.log('✓ Step 1: Submitted → PO Pending Approval');

      // Step 2: Approve
      wfContext = await workflowEngine.getWorkflowContext(wfInstanceId, buyerContext);
      const approveAction = wfContext.availableActions.find(a => a.name === 'Approve');
      await workflowEngine.executeTransition(wfContext, approveAction!, buyerContext, {});
      wfInstance = await assertWorkflowState(wfInstanceId, 'PO Issued');
      expect(wfInstance?.status).toBe('completed');
      console.log('✓ Step 2: Approved → PO Issued (Final)');

      // Verify purchase order still exists
      const po = await prisma.purchase_order.findUnique({
        where: { id: poId }
      });
      expect(po).toBeDefined();
      expect(po?.wf_instance_id).toBe(wfInstanceId);
      console.log('✓ Purchase Order verified:', po?.po_number);
      console.log('✓ Test 4 PASSED\n');
    });
  });
});
