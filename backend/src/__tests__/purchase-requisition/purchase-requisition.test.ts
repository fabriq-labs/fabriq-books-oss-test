import { ModelService } from '../../services/core/ModelService';
import { WorkflowEngine } from '../../workflow-engine/core/WorkflowEngine';
import prisma from '../../lib/prisma';
import {
  createPurchaseRequisitionData,
  createPurchaseRequisitionItemData,
  assertWorkflowState,
  assertPurchaseRequisitionItems,
  assertWorkflowAssignedToManager,
  cleanupTestData,
} from './purchase-requisition-test-fixtures';
import { loadTestConfig, createTestContext, validateTestData, TestConfig } from '../test-configs/test-config-loader';

describe('Purchase Requisition Workflow Tests', () => {
  // Increase timeout for database operations
  jest.setTimeout(30000); // 30 seconds

  console.log('\n🚀 Starting Purchase Requisition Workflow Tests');
  const modelService = ModelService.getInstance();
  // Database workflow effects (e.g. generate_po_from_pr) must run for PO/invoice tests; notification effects are no-op in SideEffectExecutor
  const workflowEngine = new WorkflowEngine(prisma, { executeSideEffects: true });

  let config: TestConfig;
  let context: any;
  let locationId: string;
  let itemId: string;
  let itemSupplierId: string;
  let managerId: string;
  let managerContext: any;
  let buyerContext: any;

  // Load configuration from environment or default
  beforeAll(() => {
    config = loadTestConfig();
    context = createTestContext(config);
  });

  beforeAll(async () => {
    // Validate that the configured test data exists
    await validateTestData(config, prisma);

    // Get existing seed data IDs
    const item = await prisma.item_master.findUnique({ where: { id: config.items.productA } });
    if (!item) {
      throw new Error(`Item ${config.items.productA} not found. Run the appropriate setup script first.`);
    }
    itemId = item.id;
    if (!item.supplier_id) {
      throw new Error(`Item ${config.items.productA} does not have a supplier_id. Please ensure the item has a supplier assigned.`);
    }
    itemSupplierId = item.supplier_id;

    const location = await prisma.location.findUnique({ where: { id: config.locationId } });
    if (!location) {
      throw new Error(`Location ${config.locationId} not found. Run the appropriate setup script first.`);
    }
    locationId = location.id;

    // Try to find a manager user - look for users with manager role or find by manager relationship
    // For now, we'll try to find a user that has the manager role or is a manager
    // This is test-specific, so we'll try to find any user that could be a manager
    const managerUser = await prisma.user.findFirst({
      where: {
        org_id: config.orgId,
        // Try to find a user that's not the test user and could be a manager
        id: { not: config.userId }
      },
      orderBy: { created_at: 'asc' }
    });

    if (!managerUser) {
      throw new Error(`No manager user found in organization ${config.orgId}. Please ensure a manager user exists.`);
    }
    managerId = managerUser.id;

    // Verify test user has manager set
    const testUser = await prisma.user.findUnique({
      where: { id: config.userId },
      select: { manager_id: true }
    });

    if (!testUser || testUser.manager_id !== managerId) {
      console.log('⚠️  Test user manager_id not set correctly. Updating...');
      await prisma.user.update({
        where: { id: config.userId },
        data: { manager_id: managerId },
      });
      console.log('✓ Updated test user manager_id');
    }

    // Create manager context for approval actions
    managerContext = {
      user: {
        id: managerId,
        org_id: config.orgId,
        email: `${managerId}@example.com`,
        name: managerId.replace('user_', '').replace('_', ' ').toUpperCase()
      },
      org: {
        id: config.orgId
      }
    };

    // Create buyer context for buyer approval actions
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

    // Ensure the "Approve by Buyer" workflow action has the correct side effect to generate POs
    const prFlow = await prisma.workflow_flow.findFirst({
      where: { model_name: 'purchase_requisition' }
    });

    if (prFlow) {
      const buyerReviewState = await prisma.workflow_state.findFirst({
        where: {
          flow_id: prFlow.id,
          name: 'Buyer Review'
        }
      });

      if (buyerReviewState) {
        const approveBuyerAction = await prisma.workflow_action.findFirst({
          where: {
            source_state_id: buyerReviewState.id,
            name: 'Approve by Buyer'
          }
        });

        if (approveBuyerAction) {
          const currentSideEffects = approveBuyerAction.side_effects as any;
          const hasPoGeneration = currentSideEffects?.effects?.some(
            (e: any) => e.type === 'database' && e.config?.method === 'generate_po_from_pr'
          );

          if (!hasPoGeneration) {
            console.log('⚠️  Updating "Approve by Buyer" action to include PO generation side effect...');
            await prisma.workflow_action.update({
              where: { id: approveBuyerAction.id },
              data: {
                side_effects: {
                  effects: [{
                    type: 'database',
                    config: {
                      method: 'generate_po_from_pr'
                    }
                  }]
                }
              }
            });
            console.log('✓ Updated "Approve by Buyer" action with PO generation side effect');
          }
        }
      }
    }

    console.log('✓ All seed data verified and loaded from configuration');
    console.log('✓ Manager user:', managerId);
    console.log('✓ Test user manager_id:', testUser?.manager_id);
    console.log('✓ Manager context created for:', managerId);
    console.log('✓ Buyer context created for:', config.buyerUserId);
  });

  afterAll(async () => {
    // Clean up test data - DISABLED to preserve all data
    // Uncomment the line below if you want to clean up test data
    // await cleanupTestData(config.orgId);
    await prisma.$disconnect();
  });

  describe('Basic Purchase Requisition Creation', () => {
    it('should create a purchase requisition with workflow instance in Draft state', async () => {
      console.log('\n=== TEST 1: Basic Purchase Requisition Creation ===');
      const purchaseRequisitionData = createPurchaseRequisitionData(
        locationId,
        config.orgId,
        context.user.id
      );
      console.log('Purchase Requisition Data:', JSON.stringify(purchaseRequisitionData, null, 2));

      const result = await modelService.create('purchase_requisition', context, purchaseRequisitionData, {});
      console.log('Create Result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.data.id).toBeDefined();
      console.log('✓ Purchase Requisition Created:', JSON.stringify(result.data, null, 2));

      expect(result.data.wf_instance_id).toBeDefined();
      console.log('✓ Workflow Instance ID:', result.data.wf_instance_id);

      // Verify workflow instance is in Draft state
      const wfInstance = await assertWorkflowState(result.data.wf_instance_id, 'Draft');
      console.log('✓ Workflow Instance:', JSON.stringify(wfInstance, null, 2));
      expect(wfInstance?.status).toBe('active');
      console.log('✓ Test 1 PASSED\n');
    });
  });

  describe('Purchase Requisition with Items', () => {
    it('should create purchase requisition with line items', async () => {
      console.log('\n=== TEST 2: Purchase Requisition with Items ===');
      const purchaseRequisitionData = createPurchaseRequisitionData(
        locationId,
        config.orgId,
        context.user.id
      );
      console.log('Creating purchase requisition...');

      const prResult = await modelService.create('purchase_requisition', context, purchaseRequisitionData, {});
      const prId = prResult.data.id;
      console.log('✓ Purchase Requisition Created:', prId);

      // Add line items using the 'items' relationship
      const items = [
        createPurchaseRequisitionItemData(itemId, config.orgId, context.user.id, itemSupplierId)
      ];
      console.log('Adding items:', JSON.stringify(items, null, 2));

      const itemsResult = await modelService.addChildrenToParent(
        'purchase_requisition',
        prId,
        'items',
        context,
        items,
        {}
      );
      console.log('Add Items Result:', JSON.stringify(itemsResult, null, 2));

      expect(itemsResult.success).toBe(true);
      expect(itemsResult.data).toBeDefined();

      // Verify that the item was actually created by querying the database
      const prItems = await prisma.item.findMany({
        where: { instance_id: prId }
      });
      console.log('✓ Purchase Requisition Items in DB:', prItems.length);
      console.log('Items:', JSON.stringify(prItems, null, 2));
      expect(prItems.length).toBe(1);
      console.log('✓ Test 2 PASSED\n');
    });
  });

  describe('Workflow Transition to Manager Review', () => {
    it('should transition from Draft to Manager Review', async () => {
      console.log('\n=== TEST 3: Workflow Transition to Manager Review ===');
      const purchaseRequisitionData = createPurchaseRequisitionData(
        locationId,
        config.orgId,
        context.user.id
      );

      // Create purchase requisition (automatically in Draft state)
      const prResult = await modelService.create('purchase_requisition', context, purchaseRequisitionData, {});
      const prId = prResult.data.id;
      const wfInstanceId = prResult.data.wf_instance_id;
      console.log('✓ Purchase Requisition Created:', prId);
      console.log('✓ Workflow Instance ID:', wfInstanceId);

      // Add line items
      const items = [
        createPurchaseRequisitionItemData(itemId, config.orgId, context.user.id, itemSupplierId)
      ];
      await modelService.addChildrenToParent('purchase_requisition', prId, 'items', context, items, {});
      console.log('✓ Items added');

      // Transition from Draft to Manager Review
      console.log('Getting workflow context for Draft -> Manager Review transition...');
      const wfContext = await workflowEngine.getWorkflowContext(wfInstanceId, context);
      console.log('Available Actions:', wfContext.availableActions.map(a => ({ name: a.name, id: a.id })));
      const submitAction = wfContext.availableActions.find(a => a.name === 'Submit');
      console.log('submitAction:', submitAction);
      expect(submitAction).toBeDefined();
      await workflowEngine.executeTransition(wfContext, submitAction!, context, {});
      console.log('✓ Transitioned to Manager Review');

      // Verify workflow state
      const wfInstance = await assertWorkflowState(wfInstanceId, 'Manager Review');
      console.log('✓ Workflow Instance:', JSON.stringify(wfInstance, null, 2));
      console.log('✓ Test 3 PASSED\n');
    });

    it('should assign workflow to manager when transitioning to Manager Review', async () => {
      console.log('\n=== TEST 3B: Workflow Assignment to Manager ===');
      const purchaseRequisitionData = createPurchaseRequisitionData(
        locationId,
        config.orgId,
        context.user.id
      );

      // Create purchase requisition
      const prResult = await modelService.create('purchase_requisition', context, purchaseRequisitionData, {});
      const prId = prResult.data.id;
      const wfInstanceId = prResult.data.wf_instance_id;
      console.log('✓ Purchase Requisition Created:', prId);

      // Add line items
      const items = [createPurchaseRequisitionItemData(itemId, config.orgId, context.user.id, itemSupplierId)];
      await modelService.addChildrenToParent('purchase_requisition', prId, 'items', context, items, {});
      console.log('✓ Items added');

      // Transition to Manager Review
      const wfContext = await workflowEngine.getWorkflowContext(wfInstanceId, context);
      const submitAction = wfContext.availableActions.find(a => a.name === 'Submit');
      expect(submitAction).toBeDefined();
      await workflowEngine.executeTransition(wfContext, submitAction!, context, {});
      console.log('✓ Transitioned to Manager Review');

      // Verify workflow is assigned to the manager
      await assertWorkflowAssignedToManager(wfInstanceId, managerId);
      console.log('✓ Test 3B PASSED\n');
    });
  });

  describe('Workflow Transition to Buyer Review', () => {
    it('should transition from Manager Review to Buyer Review', async () => {
      console.log('\n=== TEST 4: Workflow Transition to Buyer Review ===');
      const purchaseRequisitionData = createPurchaseRequisitionData(
        locationId,
        config.orgId,
        context.user.id
      );

      // Create purchase requisition
      const prResult = await modelService.create('purchase_requisition', context, purchaseRequisitionData, {});
      const prId = prResult.data.id;
      const wfInstanceId = prResult.data.wf_instance_id;

      // Add line items
      const items = [createPurchaseRequisitionItemData(itemId, config.orgId, context.user.id, itemSupplierId)];
      await modelService.addChildrenToParent('purchase_requisition', prId, 'items', context, items, {});

      // Transition to Manager Review
      const wfContext1 = await workflowEngine.getWorkflowContext(wfInstanceId, context);
      const submitAction = wfContext1.availableActions.find(a => a.name === 'Submit');
      await workflowEngine.executeTransition(wfContext1, submitAction!, context, {});

      // Transition to Buyer Review (using manager's context)
      console.log('Transitioning to Buyer Review...');
      console.log('Getting workflow context as manager...');
      const wfContext2 = await workflowEngine.getWorkflowContext(wfInstanceId, managerContext);
      console.log('Available Actions:', wfContext2.availableActions.map(a => ({ name: a.name, id: a.id })));
      const approveAction = wfContext2.availableActions.find(a => a.name === 'Approve by Manager');
      console.log('approveAction:', approveAction);
      expect(approveAction).toBeDefined();
      console.log('Executing approve action as manager...');
      await workflowEngine.executeTransition(wfContext2, approveAction!, managerContext, {});
      console.log('✓ Transitioned to Buyer Review');

      // Verify workflow state
      const wfInstance = await assertWorkflowState(wfInstanceId, 'Buyer Review');
      console.log('✓ Test 4 PASSED\n');
    });
  });

  describe('Workflow Transition to Delivery', () => {
    it('should transition from Buyer Review to Delivery (final state)', async () => {
      console.log('\n=== TEST 5: Workflow Transition to Delivery ===');
      const purchaseRequisitionData = createPurchaseRequisitionData(
        locationId,
        config.orgId,
        config.buyerUserId
      );

      // Create purchase requisition
      const prResult = await modelService.create('purchase_requisition', context, purchaseRequisitionData, {});
      const prId = prResult.data.id;
      const wfInstanceId = prResult.data.wf_instance_id;

      // Add line items
      const items = [createPurchaseRequisitionItemData(itemId, config.orgId, context.user.id, itemSupplierId)];
      await modelService.addChildrenToParent('purchase_requisition', prId, 'items', context, items, {});

      // Transition to Manager Review
      const wfContext1 = await workflowEngine.getWorkflowContext(wfInstanceId, context);
      const submitAction = wfContext1.availableActions.find(a => a.name === 'Submit');
      await workflowEngine.executeTransition(wfContext1, submitAction!, context, {});

      // Transition to Buyer Review (using manager's context)
      console.log('Transitioning to Buyer Review as manager...');
      const wfContext2 = await workflowEngine.getWorkflowContext(wfInstanceId, managerContext);
      const approveManagerAction = wfContext2.availableActions.find(a => a.name === 'Approve by Manager');
      expect(approveManagerAction).toBeDefined();
      await workflowEngine.executeTransition(wfContext2, approveManagerAction!, managerContext, {});
      console.log('✓ Transitioned to Buyer Review');

      // Transition to Delivery (final state) - using buyer context since buyer role is required
      console.log('Transitioning to Delivery...');
      const wfContext3 = await workflowEngine.getWorkflowContext(wfInstanceId, buyerContext);
      console.log('Available Actions:', wfContext3.availableActions.map(a => ({ name: a.name, id: a.id })));
      const approveBuyerAction = wfContext3.availableActions.find(a => a.name === 'Approve by Buyer');
      console.log('approveBuyerAction:', approveBuyerAction);
      expect(approveBuyerAction).toBeDefined();
      await workflowEngine.executeTransition(wfContext3, approveBuyerAction!, buyerContext, {});
      console.log('✓ Transitioned to Delivery');

      // Verify workflow state
      const wfInstance = await assertWorkflowState(wfInstanceId, 'Delivery');
      expect(wfInstance?.status).toBe('completed');
      console.log('✓ Test 5 PASSED\n');
    });
  });

  describe('Purchase Order Generation', () => {
    it('should create purchase orders when transitioning from Buyer Review to Delivery', async () => {
      console.log('\n=== TEST 6: Purchase Order Generation ===');
      const purchaseRequisitionData = createPurchaseRequisitionData(
        locationId,
        config.orgId,
        context.user.id
      );

      // Create purchase requisition
      const prResult = await modelService.create('purchase_requisition', context, purchaseRequisitionData, {});
      const prId = prResult.data.id;
      const wfInstanceId = prResult.data.wf_instance_id;
      console.log('✓ Purchase Requisition Created:', prId);

      // Get both suppliers to verify later
      const supplier1 = await prisma.supplier.findUnique({ where: { id: config.supplierId } });
      // Get the second supplier from config if available, otherwise find any other supplier
      const supplier2Id = (config as any).supplierId2 || (await prisma.supplier.findFirst({
        where: {
          org_id: config.orgId,
          id: { not: config.supplierId }
        }
      }))?.id;
      const supplier2 = supplier2Id ? await prisma.supplier.findUnique({ where: { id: supplier2Id } }) : null;

      // Verify items have different suppliers (US-CA: laptop vs monitor; Indian: Dell vs Lenovo)
      const item1Master = await prisma.item_master.findUnique({ where: { id: config.items.productA } });
      const item2Master = await prisma.item_master.findUnique({ where: { id: config.items.productC } });

      if (!item1Master?.supplier_id || !item2Master?.supplier_id) {
        throw new Error('Items must have suppliers assigned');
      }

      if (item1Master.supplier_id === item2Master.supplier_id) {
        throw new Error(`Both items have the same supplier (${item1Master.supplier_id}). Use items with different suppliers for this test.`);
      }

      // Add items from different suppliers
      const item1Data = createPurchaseRequisitionItemData(config.items.productA, config.orgId, context.user.id, item1Master.supplier_id);
      const item2Data = createPurchaseRequisitionItemData(config.items.productC, config.orgId, context.user.id, item2Master.supplier_id);

      const items = [item1Data, item2Data];
      await modelService.addChildrenToParent('purchase_requisition', prId, 'items', context, items, {});
      console.log('✓ Items added from two different suppliers');

      // Transition to Manager Review
      const wfContext1 = await workflowEngine.getWorkflowContext(wfInstanceId, context);
      const submitAction = wfContext1.availableActions.find(a => a.name === 'Submit');
      await workflowEngine.executeTransition(wfContext1, submitAction!, context, {});
      console.log('✓ Transitioned to Manager Review');

      // Transition to Buyer Review (using manager's context)
      const wfContext2 = await workflowEngine.getWorkflowContext(wfInstanceId, managerContext);
      const approveManagerAction = wfContext2.availableActions.find(a => a.name === 'Approve by Manager');
      await workflowEngine.executeTransition(wfContext2, approveManagerAction!, managerContext, {});
      console.log('✓ Transitioned to Buyer Review');

      // Transition to Delivery - this should trigger PO creation
      console.log('Transitioning to Delivery (triggering PO creation)...');
      const wfContext3 = await workflowEngine.getWorkflowContext(wfInstanceId, buyerContext);
      const approveBuyerAction = wfContext3.availableActions.find(a => a.name === 'Approve by Buyer');
      expect(approveBuyerAction).toBeDefined();
      await workflowEngine.executeTransition(wfContext3, approveBuyerAction!, buyerContext, {});
      console.log('✓ Transitioned to Delivery');

      // Verify workflow state
      const wfInstance = await assertWorkflowState(wfInstanceId, 'Delivery');
      expect(wfInstance?.status).toBe('completed');

      // Verify purchase orders were created
      const purchaseOrders = await prisma.purchase_order.findMany({
        where: { purchase_id: prId }
      });

      expect(purchaseOrders).toBeDefined();
      expect(purchaseOrders.length).toBe(2); // Should create one PO per supplier
      console.log(`✓ Created ${purchaseOrders.length} purchase orders`);

      // Verify each PO has items from the correct supplier
      for (const po of purchaseOrders) {
        const poItems = await prisma.purchase_order_item.findMany({
          where: { instance_id: po.id },
          include: {
            purchase_order: {
              select: {
                supplier_id: true
              }
            }
          }
        });
        console.log(`✓ PO ${po.po_number} has ${poItems.length} items, supplier: ${po.supplier_id}`);

        // Verify items belong to the correct supplier
        expect(po.supplier_id).toBeDefined();
        const expectedSupplierIds = [supplier1?.id, supplier2?.id].filter(Boolean);
        expect(expectedSupplierIds).toContain(po.supplier_id);
      }

      console.log('✓ Test 6 PASSED\n');
    });
  });

  describe('Multiple Items Purchase Requisition', () => {
    it('should create purchase requisition with multiple line items', async () => {
      console.log('\n=== TEST 7: Multiple Items Purchase Requisition ===');
      const purchaseRequisitionData = createPurchaseRequisitionData(
        locationId,
        config.orgId,
        context.user.id
      );

      const prResult = await modelService.create('purchase_requisition', context, purchaseRequisitionData, {});
      const prId = prResult.data.id;

      // Add multiple line items (3 items)
      const items = [
        createPurchaseRequisitionItemData(itemId, config.orgId, context.user.id, itemSupplierId),
        createPurchaseRequisitionItemData(itemId, config.orgId, context.user.id, itemSupplierId),
        createPurchaseRequisitionItemData(itemId, config.orgId, context.user.id, itemSupplierId),
      ];
      await modelService.addChildrenToParent('purchase_requisition', prId, 'items', context, items, {});

      // Verify 3 items were created
      const prItems = await assertPurchaseRequisitionItems(prId, 3);
      expect(prItems.length).toBe(3);
      console.log('✓ Test 7 PASSED\n');
    });
  });

  describe('Location and Requester Details', () => {
    it('should verify location and requester details are set correctly', async () => {
      console.log('\n=== TEST 8: Location and Requester Details ===');
      const purchaseRequisitionData = createPurchaseRequisitionData(
        locationId,
        config.orgId,
        context.user.id
      );

      const prResult = await modelService.create('purchase_requisition', context, purchaseRequisitionData, {});
      const prId = prResult.data.id;

      // Add line item
      const items = [createPurchaseRequisitionItemData(itemId, config.orgId, context.user.id, itemSupplierId)];
      await modelService.addChildrenToParent('purchase_requisition', prId, 'items', context, items, {});

      // Verify location_id and requester
      const pr = await prisma.purchase_requisition.findUnique({
        where: { id: prId }
      });

      expect(pr?.location_id).toBe(locationId);
      expect(pr?.requester).toBeDefined();
      expect(pr?.requester).toBe('Test User');
      console.log('✓ Location ID:', pr?.location_id);
      console.log('✓ Requester:', pr?.requester);
      console.log('✓ Test 8 PASSED\n');
    });
  });

  describe('Invoice Generation from Purchase Order', () => {
    it('should create invoice from purchase order using custom action', async () => {
      console.log('\n=== TEST 9: Invoice Generation from Purchase Order ===');

      // Get supplier to verify later
      const supplier = await prisma.supplier.findUnique({ where: { id: config.supplierId } });
      expect(supplier).toBeDefined();
      console.log('✓ Supplier found:', supplier?.supplier_name);

      // Create purchase requisition (like previous tests)
      const purchaseRequisitionData = createPurchaseRequisitionData(
        locationId,
        config.orgId,
        context.user.id
      );

      const prResult = await modelService.create('purchase_requisition', context, purchaseRequisitionData, {});
      const prId = prResult.data.id;
      const wfInstanceId = prResult.data.wf_instance_id;
      console.log('✓ Purchase Requisition Created:', prId);

      // Add line items (from first supplier)
      const items = [createPurchaseRequisitionItemData(itemId, config.orgId, context.user.id, config.supplierId)];
      await modelService.addChildrenToParent('purchase_requisition', prId, 'items', context, items, {});
      console.log('✓ Items added');

      // Go through workflow stages (like previous tests)
      // Transition to Manager Review
      const wfContext1 = await workflowEngine.getWorkflowContext(wfInstanceId, context);
      const submitAction = wfContext1.availableActions.find(a => a.name === 'Submit');
      await workflowEngine.executeTransition(wfContext1, submitAction!, context, {});
      console.log('✓ Transitioned to Manager Review');

      // Transition to Buyer Review
      const wfContext2 = await workflowEngine.getWorkflowContext(wfInstanceId, managerContext);
      const approveManagerAction = wfContext2.availableActions.find(a => a.name === 'Approve by Manager');
      await workflowEngine.executeTransition(wfContext2, approveManagerAction!, managerContext, {});
      console.log('✓ Transitioned to Buyer Review');

      // Transition to Delivery - this will auto-create PO
      const wfContext3 = await workflowEngine.getWorkflowContext(wfInstanceId, buyerContext);
      const approveBuyerAction = wfContext3.availableActions.find(a => a.name === 'Approve by Buyer');
      await workflowEngine.executeTransition(wfContext3, approveBuyerAction!, buyerContext, {});
      console.log('✓ Transitioned to Delivery - PO should be created');

      // Verify PO was created
      const purchaseOrders = await prisma.purchase_order.findMany({
        where: { purchase_id: prId }
      });
      expect(purchaseOrders.length).toBe(1);
      const poId = purchaseOrders[0].id;
      console.log('✓ Purchase Order created:', poId);

      // Call custom action to generate invoice from the auto-created PO
      console.log('Calling generate_invoice custom action...');
      const result = await modelService.runCustomAction(
        context,
        'purchase_order',
        poId,
        'generate_invoice',
        {}
      );
      console.log('Invoice generation result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      // Verify invoice was created
      const invoice = await prisma.invoice.findUnique({
        where: { id: result.data.id },
        include: {
          invoice_line_item: true,
        },
      });

      expect(invoice).toBeDefined();
      expect(invoice?.purchase_order_id).toBe(poId);
      expect(invoice?.invoice_type).toBe('With PO');
      console.log('✓ Invoice Created:', invoice?.invoice_number);

      // Verify invoice line items were created
      expect(invoice?.invoice_line_item.length).toBeGreaterThan(0);
      console.log('✓ Invoice has line items:', invoice?.invoice_line_item.length);

      // Verify supplier details
      expect(invoice?.supplier_name).toBeDefined();
      if (supplier?.supplier_name) {
        expect(invoice?.supplier_name).toBe(supplier.supplier_name);
      }
      console.log('✓ Supplier name:', invoice?.supplier_name);
      console.log('✓ PO Number:', invoice?.po_number);

      // Verify line items have correct data
      if (invoice?.invoice_line_item && invoice.invoice_line_item.length > 0) {
        const lineItem = invoice.invoice_line_item[0];
        expect(lineItem.item_name).toBeDefined();
        expect(lineItem.purchase_order_item_id).toBeDefined();
        console.log('✓ Line item details verified:', JSON.stringify(lineItem, null, 2));
      }

      console.log('✓ Test 9 PASSED\n');
    });
  });

  describe('Purchase Requisition Rejection Workflows', () => {
    it('should reject from Manager Review back to Draft', async () => {
      console.log('\n=== TEST 10: Reject to Draft from Manager Review ===');
      const purchaseRequisitionData = createPurchaseRequisitionData(
        locationId,
        config.orgId,
        context.user.id
      );

      // Create purchase requisition
      const prResult = await modelService.create('purchase_requisition', context, purchaseRequisitionData, {});
      const prId = prResult.data.id;
      const wfInstanceId = prResult.data.wf_instance_id;
      console.log('✓ Purchase Requisition Created:', prId);

      // Add line items
      const items = [createPurchaseRequisitionItemData(itemId, config.orgId, context.user.id, itemSupplierId)];
      await modelService.addChildrenToParent('purchase_requisition', prId, 'items', context, items, {});
      console.log('✓ Items added');

      // Transition to Manager Review
      const wfContext1 = await workflowEngine.getWorkflowContext(wfInstanceId, context);
      const submitAction = wfContext1.availableActions.find(a => a.name === 'Submit');
      await workflowEngine.executeTransition(wfContext1, submitAction!, context, {});
      console.log('✓ Transitioned to Manager Review');

      // Reject back to Draft
      console.log('Rejecting back to Draft...');
      const wfContext2 = await workflowEngine.getWorkflowContext(wfInstanceId, managerContext);
      console.log('Available Actions:', wfContext2.availableActions.map(a => ({ name: a.name, id: a.id })));
      const rejectAction = wfContext2.availableActions.find(a => a.name === 'Reject to Draft');
      expect(rejectAction).toBeDefined();
      console.log('rejectAction:', rejectAction);
      await workflowEngine.executeTransition(wfContext2, rejectAction!, managerContext, {});
      console.log('✓ Rejected back to Draft');

      // Verify workflow state
      const wfInstance = await assertWorkflowState(wfInstanceId, 'Draft');
      expect(wfInstance?.status).toBe('active');
      console.log('✓ Test 10 PASSED\n');
    });

    it('should reject from Buyer Review back to Manager Review', async () => {
      console.log('\n=== TEST 11: Reject to Manager from Buyer Review ===');
      const purchaseRequisitionData = createPurchaseRequisitionData(
        locationId,
        config.orgId,
        context.user.id
      );

      // Create purchase requisition
      const prResult = await modelService.create('purchase_requisition', context, purchaseRequisitionData, {});
      const prId = prResult.data.id;
      const wfInstanceId = prResult.data.wf_instance_id;
      console.log('✓ Purchase Requisition Created:', prId);

      // Add line items
      const items = [createPurchaseRequisitionItemData(itemId, config.orgId, context.user.id, itemSupplierId)];
      await modelService.addChildrenToParent('purchase_requisition', prId, 'items', context, items, {});

      // Transition to Manager Review
      const wfContext1 = await workflowEngine.getWorkflowContext(wfInstanceId, context);
      const submitAction = wfContext1.availableActions.find(a => a.name === 'Submit');
      await workflowEngine.executeTransition(wfContext1, submitAction!, context, {});

      // Transition to Buyer Review
      const wfContext2 = await workflowEngine.getWorkflowContext(wfInstanceId, managerContext);
      const approveManagerAction = wfContext2.availableActions.find(a => a.name === 'Approve by Manager');
      await workflowEngine.executeTransition(wfContext2, approveManagerAction!, managerContext, {});
      console.log('✓ Transitioned to Buyer Review');

      // Reject back to Manager Review
      console.log('Rejecting back to Manager Review...');
      const wfContext3 = await workflowEngine.getWorkflowContext(wfInstanceId, buyerContext);
      console.log('Available Actions:', wfContext3.availableActions.map(a => ({ name: a.name, id: a.id })));
      const rejectAction = wfContext3.availableActions.find(a => a.name === 'Reject to Manager');
      expect(rejectAction).toBeDefined();
      console.log('rejectAction:', rejectAction);
      await workflowEngine.executeTransition(wfContext3, rejectAction!, buyerContext, {});
      console.log('✓ Rejected back to Manager Review');

      // Verify workflow state
      const wfInstance = await assertWorkflowState(wfInstanceId, 'Manager Review');
      expect(wfInstance?.status).toBe('active');
      console.log('✓ Test 11 PASSED\n');
    });
  });

  describe('Purchase Requisition Send Back Workflows', () => {
    it('should send back from Manager Review to Draft', async () => {
      console.log('\n=== TEST 12: Send Back from Manager Review to Draft ===');
      const purchaseRequisitionData = createPurchaseRequisitionData(
        locationId,
        config.orgId,
        context.user.id
      );

      // Create purchase requisition
      const prResult = await modelService.create('purchase_requisition', context, purchaseRequisitionData, {});
      const prId = prResult.data.id;
      const wfInstanceId = prResult.data.wf_instance_id;
      console.log('✓ Purchase Requisition Created:', prId);

      // Add line items
      const items = [createPurchaseRequisitionItemData(itemId, config.orgId, context.user.id, itemSupplierId)];
      await modelService.addChildrenToParent('purchase_requisition', prId, 'items', context, items, {});

      // Transition to Manager Review
      const wfContext1 = await workflowEngine.getWorkflowContext(wfInstanceId, context);
      const submitAction = wfContext1.availableActions.find(a => a.name === 'Submit');
      await workflowEngine.executeTransition(wfContext1, submitAction!, context, {});
      console.log('✓ Transitioned to Manager Review');

      // Send Back to Draft
      console.log('Sending back to Draft...');
      const wfContext2 = await workflowEngine.getWorkflowContext(wfInstanceId, managerContext);
      console.log('Available Actions:', wfContext2.availableActions.map(a => ({ name: a.name, id: a.id, target_state_id: a.target_state_id })));
      // Find Send Back action that goes to Draft - we'll need to check target state by querying
      const sendBackActions = wfContext2.availableActions.filter(a => a.name === 'Send Back');
      expect(sendBackActions.length).toBeGreaterThan(0);
      // Get target state for each Send Back action to find the one going to Draft
      let sendBackAction = null;
      for (const action of sendBackActions) {
        const targetState = await prisma.workflow_state.findUnique({
          where: { id: action.target_state_id },
          select: { name: true }
        });
        if (targetState?.name === 'Draft') {
          sendBackAction = action;
          break;
        }
      }
      expect(sendBackAction).toBeDefined();
      console.log('sendBackAction:', sendBackAction);
      await workflowEngine.executeTransition(wfContext2, sendBackAction!, managerContext, {});
      console.log('✓ Sent back to Draft');

      // Verify workflow state
      const wfInstance = await assertWorkflowState(wfInstanceId, 'Draft');
      expect(wfInstance?.status).toBe('active');
      console.log('✓ Test 12 PASSED\n');
    });

    it('should send back from Buyer Review to Manager Review', async () => {
      console.log('\n=== TEST 13: Send Back from Buyer Review to Manager Review ===');
      const purchaseRequisitionData = createPurchaseRequisitionData(
        locationId,
        config.orgId,
        context.user.id
      );

      // Create purchase requisition
      const prResult = await modelService.create('purchase_requisition', context, purchaseRequisitionData, {});
      const prId = prResult.data.id;
      const wfInstanceId = prResult.data.wf_instance_id;
      console.log('✓ Purchase Requisition Created:', prId);

      // Add line items
      const items = [createPurchaseRequisitionItemData(itemId, config.orgId, context.user.id, itemSupplierId)];
      await modelService.addChildrenToParent('purchase_requisition', prId, 'items', context, items, {});

      // Transition to Manager Review
      const wfContext1 = await workflowEngine.getWorkflowContext(wfInstanceId, context);
      const submitAction = wfContext1.availableActions.find(a => a.name === 'Submit');
      await workflowEngine.executeTransition(wfContext1, submitAction!, context, {});

      // Transition to Buyer Review
      const wfContext2 = await workflowEngine.getWorkflowContext(wfInstanceId, managerContext);
      const approveManagerAction = wfContext2.availableActions.find(a => a.name === 'Approve by Manager');
      await workflowEngine.executeTransition(wfContext2, approveManagerAction!, managerContext, {});
      console.log('✓ Transitioned to Buyer Review');

      // Send Back to Manager Review
      console.log('Sending back to Manager Review...');
      const wfContext3 = await workflowEngine.getWorkflowContext(wfInstanceId, buyerContext);
      console.log('Available Actions:', wfContext3.availableActions.map(a => ({ name: a.name, id: a.id, target_state_id: a.target_state_id })));
      // Find Send Back action that goes to Manager Review
      const sendBackActions = wfContext3.availableActions.filter(a => a.name === 'Send Back');
      expect(sendBackActions.length).toBeGreaterThan(0);
      let sendBackAction = null;
      for (const action of sendBackActions) {
        const targetState = await prisma.workflow_state.findUnique({
          where: { id: action.target_state_id },
          select: { name: true }
        });
        if (targetState?.name === 'Manager Review') {
          sendBackAction = action;
          break;
        }
      }
      expect(sendBackAction).toBeDefined();
      console.log('sendBackAction:', sendBackAction);
      await workflowEngine.executeTransition(wfContext3, sendBackAction!, buyerContext, {});
      console.log('✓ Sent back to Manager Review');

      // Verify workflow state
      const wfInstance = await assertWorkflowState(wfInstanceId, 'Manager Review');
      expect(wfInstance?.status).toBe('active');
      console.log('✓ Test 13 PASSED\n');
    });

    it('should send back from Buyer Review to Draft', async () => {
      console.log('\n=== TEST 14: Send Back from Buyer Review to Draft ===');
      const purchaseRequisitionData = createPurchaseRequisitionData(
        locationId,
        config.orgId,
        context.user.id
      );

      // Create purchase requisition
      const prResult = await modelService.create('purchase_requisition', context, purchaseRequisitionData, {});
      const prId = prResult.data.id;
      const wfInstanceId = prResult.data.wf_instance_id;
      console.log('✓ Purchase Requisition Created:', prId);

      // Add line items
      const items = [createPurchaseRequisitionItemData(itemId, config.orgId, context.user.id, itemSupplierId)];
      await modelService.addChildrenToParent('purchase_requisition', prId, 'items', context, items, {});

      // Transition to Manager Review
      const wfContext1 = await workflowEngine.getWorkflowContext(wfInstanceId, context);
      const submitAction = wfContext1.availableActions.find(a => a.name === 'Submit');
      await workflowEngine.executeTransition(wfContext1, submitAction!, context, {});

      // Transition to Buyer Review
      const wfContext2 = await workflowEngine.getWorkflowContext(wfInstanceId, managerContext);
      const approveManagerAction = wfContext2.availableActions.find(a => a.name === 'Approve by Manager');
      await workflowEngine.executeTransition(wfContext2, approveManagerAction!, managerContext, {});
      console.log('✓ Transitioned to Buyer Review');

      // Send Back to Draft
      console.log('Sending back to Draft...');
      const wfContext3 = await workflowEngine.getWorkflowContext(wfInstanceId, buyerContext);
      console.log('Available Actions:', wfContext3.availableActions.map(a => ({ name: a.name, id: a.id, target_state_id: a.target_state_id })));
      // Find Send Back action that goes to Draft
      const sendBackActions = wfContext3.availableActions.filter(a => a.name === 'Send Back');
      expect(sendBackActions.length).toBeGreaterThan(0);
      let sendBackAction = null;
      for (const action of sendBackActions) {
        const targetState = await prisma.workflow_state.findUnique({
          where: { id: action.target_state_id },
          select: { name: true }
        });
        if (targetState?.name === 'Draft') {
          sendBackAction = action;
          break;
        }
      }
      expect(sendBackAction).toBeDefined();
      console.log('sendBackAction:', sendBackAction);
      await workflowEngine.executeTransition(wfContext3, sendBackAction!, buyerContext, {});
      console.log('✓ Sent back to Draft');

      // Verify workflow state
      const wfInstance = await assertWorkflowState(wfInstanceId, 'Draft');
      expect(wfInstance?.status).toBe('active');
      console.log('✓ Test 14 PASSED\n');
    });
  });
});

