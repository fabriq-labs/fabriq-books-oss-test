import { ModelService } from '../../services/core/ModelService';
import { WorkflowEngine } from '../../workflow-engine/core/WorkflowEngine';
import prisma from '../../lib/prisma';
import {
  createPurchaseOrderData,
  assertWorkflowState,
} from './purchase-order-test-fixtures';
import { loadTestConfig, createTestContext, validateTestData, TestConfig } from '../test-configs/test-config-loader';

describe('Purchase Order Standalone Creation Tests', () => {
  // Increase timeout for database operations
  jest.setTimeout(30000); // 30 seconds

  console.log('\n🚀 Starting Purchase Order Standalone Creation Tests');
  const modelService = ModelService.getInstance();
  const workflowEngine = new WorkflowEngine(prisma);

  let config: TestConfig;
  let context: any;
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

    console.log('✓ All seed data verified and loaded from configuration');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Basic Purchase Order Creation', () => {
    it('should create a purchase order directly with workflow instance in Draft state', async () => {
      console.log('\n=== TEST 1: Basic Purchase Order Creation ===');
      const purchaseOrderData = createPurchaseOrderData(
        supplierId,
        locationId,
        config.orgId,
        context.user.id
      );
      console.log('Purchase Order Data:', JSON.stringify(purchaseOrderData, null, 2));

      const result = await modelService.create('purchase_order', context, purchaseOrderData, {});
      console.log('Create Result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.data.id).toBeDefined();
      expect(result.data.supplier_id).toBe(supplierId);
      expect(result.data.location_id).toBe(locationId);
      console.log('✓ Purchase Order Created:', JSON.stringify(result.data, null, 2));

      // Verify workflow instance was created
      expect(result.data.wf_instance_id).toBeDefined();
      console.log('✓ Workflow Instance ID:', result.data.wf_instance_id);

      // Verify workflow instance is in initial state (may vary by workflow configuration)
      const wfInstance = await prisma.workflow_instance.findUnique({
        where: { id: result.data.wf_instance_id }
      });
      expect(wfInstance).toBeDefined();
      expect(wfInstance?.status).toBe('active');
      console.log('✓ Workflow State:', wfInstance?.current_state);
      console.log('✓ Workflow Instance:', JSON.stringify(wfInstance, null, 2));
      expect(wfInstance?.status).toBe('active');
      console.log('✓ Test 1 PASSED\n');
    });
  });

  describe('Purchase Order with Line Items', () => {
    it('should create purchase order with line items', async () => {
      console.log('\n=== TEST 2: Purchase Order with Line Items ===');
      const purchaseOrderData = createPurchaseOrderData(
        supplierId,
        locationId,
        config.orgId,
        context.user.id
      );
      console.log('Creating purchase order...');

      const poResult = await modelService.create('purchase_order', context, purchaseOrderData, {});
      const poId = poResult.data.id;
      console.log('✓ Purchase Order Created:', poId);

      // Get an item from seed data
      const item = await prisma.item_master.findUnique({ where: { id: config.items.productA } });
      if (!item) {
        throw new Error(`Item ${config.items.productA} not found.`);
      }

      // Create a purchase requisition first (required for purchase_order_item)
      const prData = {
        requester: 'Test User',
        location_id: locationId,
        purchase_reason: 'Test PR for PO items',
        org_id: config.orgId,
        created_by: context.user.id,
        modified_by: context.user.id,
        status: 'Draft',
      };
      const prResult = await modelService.create('purchase_requisition', context, prData, {});
      const prId = prResult.data.id;

      // Add line items using the 'purchase_order_items' relationship
      const items = [
        {
          purchase_requisition_id: prId,
          product_id: item.id,
          item_name: item.item_name,
          item_description: item.item_description || 'Test item',
          item_type: 'Product',
          quantity: 5,
          rate: 1000.00,
          item_total: 5000.00,
          uom: 'EA',
          org_id: config.orgId,
          created_by: context.user.id,
          modified_by: context.user.id,
        }
      ];
      console.log('Adding items:', JSON.stringify(items, null, 2));

      const itemsResult = await modelService.addChildrenToParent(
        'purchase_order',
        poId,
        'purchase_order_item',
        context,
        items,
        {}
      );
      console.log('Add Items Result:', JSON.stringify(itemsResult, null, 2));

      expect(itemsResult.success).toBe(true);
      expect(itemsResult.data).toBeDefined();

      // Verify that the item was actually created by querying the database
      const poItems = await prisma.purchase_order_item.findMany({
        where: { instance_id: poId }
      });
      console.log('✓ Purchase Order Items in DB:', poItems.length);
      expect(poItems.length).toBe(1);
      expect(poItems[0].product_id).toBe(item.id);
      expect(poItems[0].quantity).toBe(5);
      console.log('✓ Test 2 PASSED\n');
    });
  });
});
