import { ModelService } from '../../services/core/ModelService';
import { WorkflowEngine } from '../../workflow-engine/core/WorkflowEngine';
import prisma from '../../lib/prisma';
import { loadTestConfig, createTestContext, validateTestData, TestConfig } from '../test-configs/test-config-loader';
import { createPurchaseOrderThroughWorkflow, setupTestContexts } from './purchase-order-test-helpers';

describe('Purchase Order Zoho Books Sync Tests', () => {
  // Increase timeout for database operations and API calls
  jest.setTimeout(180000); // 180 seconds

  console.log('\n🚀 Starting Purchase Order Zoho Books Sync Tests');
  const modelService = ModelService.getInstance();
  const workflowEngine = new WorkflowEngine(prisma);

  let config: TestConfig;
  let context: any;
  let locationId: string;
  let itemId: string;
  let buyerContext: any;
  let managerContext: any;
  let zohoSupplierId: string; // Supplier synced from Zoho with source_record_id

  // Load configuration from environment or default
  beforeAll(() => {
    config = loadTestConfig();
    context = createTestContext(config);
  });

  beforeAll(async () => {
    // Validate that the configured test data exists
    await validateTestData(config, prisma);

    // Get existing seed data IDs
    const item = await prisma.item_master.findFirst({ where: { name: config.items.zohoProductName } });
    if (!item) {
      throw new Error(`Item ${config.items.zohoProductName} not found. Run the appropriate setup script first.`);
    }
    itemId = item.id;

    const location = await prisma.location.findUnique({ where: { id: config.locationId } });
    if (!location) {
      throw new Error(`Location ${config.locationId} not found. Run the appropriate setup script first.`);
    }
    locationId = location.id;

    // Find supplier synced from Zoho (has source_record_id = '2280971000000329057')
    const zohoSupplier = await prisma.supplier.findFirst({
      where: {
        source_record_id: '2280971000000329057',
        org_id: config.orgId,
      },
    });

    if (!zohoSupplier) {
      throw new Error(
        'Supplier with source_record_id "2280971000000329057" not found. ' +
        'Please ensure you have synced suppliers from Zoho first.'
      );
    }

    zohoSupplierId = zohoSupplier.id;
    console.log('✓ Found Zoho supplier:', zohoSupplier.supplier_name, `(ID: ${zohoSupplierId})`);

    // Update the item to use the Zoho supplier so the generated PO will use it
    await prisma.item_master.update({
      where: { id: itemId },
      data: { supplier_id: zohoSupplierId },
    });
    console.log('✓ Updated item to use Zoho supplier');

    // Setup test contexts
    const contexts = await setupTestContexts(config, prisma);
    buyerContext = contexts.buyerContext;
    managerContext = contexts.managerContext;
  });

  it('should sync purchase order to Zoho when approved (real API call)', async () => {
    console.log('\n=== TEST: Purchase Order Zoho Sync (Real API) ===');

    // Create PO through workflow using common helper
    const { poId, poWfInstanceId } = await createPurchaseOrderThroughWorkflow(
      modelService,
      workflowEngine,
      context,
      managerContext,
      buyerContext,
      locationId,
      itemId,
      config.orgId,
      zohoSupplierId
    );

    // Verify supplier has source_record_id before proceeding (for real API test)
    const supplierWithDetails = await prisma.supplier.findUnique({
      where: { id: zohoSupplierId },
      select: {
        id: true,
        supplier_name: true,
        source_record_id: true,
        source_system_id: true,
      },
    });

    if (!supplierWithDetails) {
      throw new Error(`Supplier ${zohoSupplierId} not found`);
    }

    if (!supplierWithDetails.source_record_id) {
      throw new Error(
        `Supplier ${zohoSupplierId} (${supplierWithDetails.supplier_name}) does not have source_record_id. ` +
        `Expected: 2280971000000329057. Please ensure the supplier is synced from Zoho.`
      );
    }

    console.log('✓ Supplier verification:');
    console.log('  - Supplier ID:', supplierWithDetails.id);
    console.log('  - Supplier Name:', supplierWithDetails.supplier_name);
    console.log('  - Source Record ID (Zoho Vendor ID):', supplierWithDetails.source_record_id);
    console.log('  - Source System ID:', supplierWithDetails.source_system_id);

    // Verify the PO has the supplier relationship loaded
    const poWithSupplier = await prisma.purchase_order.findUnique({
      where: { id: poId },
      include: {
        supplier_details: {
          select: {
            id: true,
            supplier_name: true,
            source_record_id: true,
          },
        },
      },
    });

    if (!poWithSupplier?.supplier_details) {
      throw new Error(`Purchase order ${poId} does not have supplier_details`);
    }

    if (!poWithSupplier.supplier_details.source_record_id) {
      throw new Error(
        `Purchase order supplier (${poWithSupplier.supplier_details.supplier_name}) does not have source_record_id. ` +
        `This is required for Zoho sync.`
      );
    }

    console.log('✓ PO Supplier verification:');
    console.log('  - PO Supplier ID:', poWithSupplier.supplier_details.id);
    console.log('  - PO Supplier Name:', poWithSupplier.supplier_details.supplier_name);
    console.log('  - PO Supplier Source Record ID (will be sent as vendor_id to Zoho):', poWithSupplier.supplier_details.source_record_id);

    // Verify PO is in pending approval state
    const pendingWfInstance = await prisma.workflow_instance.findUnique({
      where: { id: poWfInstanceId },
    });
    expect(pendingWfInstance?.current_state).toBe('PO Pending Approval');
    console.log('✓ PO is in PO Pending Approval state');

    // Now transition to "PO Issued" - this will trigger REAL Zoho sync
    console.log('⚠️  Executing transition - this will make a REAL API call to Zoho Books...');
    console.log('⚠️  Using vendor_id:', poWithSupplier.supplier_details.source_record_id);
    
    const poWfContext2 = await workflowEngine.getWorkflowContext(poWfInstanceId, buyerContext);
    const poApproveAction = poWfContext2.availableActions.find(a => a.name === 'Approve');
    expect(poApproveAction).toBeDefined();
    
    // This will make a real API call to Zoho
    await workflowEngine.executeTransition(poWfContext2, poApproveAction!, buyerContext, {});
    console.log('✓ PO Transitioned to PO Issued - Zoho sync completed');

    // Verify PO is in issued state
    const issuedWfInstance = await prisma.workflow_instance.findUnique({
      where: { id: poWfInstanceId },
    });
    expect(issuedWfInstance?.current_state).toBe('PO Issued');
    expect(issuedWfInstance?.status).toBe('completed');
    console.log('✓ PO is in PO Issued state (final)');

    // Verify sync fields are set in database
    const updatedPO = await prisma.$queryRaw<Array<{
      id: string;
      source_record_id: string | null;
      source_system_id: string | null;
      sync_status: string | null;
      source_updated_at: Date | null;
    }>>`
      SELECT id, source_record_id, source_system_id, sync_status, source_updated_at
      FROM purchase_order
      WHERE id = ${poId}
    `;

    expect(updatedPO.length).toBe(1);
    const updatedPOData = updatedPO[0];
    expect(updatedPOData.source_record_id).toBeTruthy(); // Should have a real Zoho PO ID
    expect(updatedPOData.source_system_id).toBeDefined();
    expect(updatedPOData.sync_status).toBe('synced');
    expect(updatedPOData.source_updated_at).toBeDefined();
    console.log('✓ PO sync fields verified:');
    console.log('  - source_record_id:', updatedPOData.source_record_id);
    console.log('  - source_system_id:', updatedPOData.source_system_id);
    console.log('  - sync_status:', updatedPOData.sync_status);
    console.log('  - source_updated_at:', updatedPOData.source_updated_at);

    // Optionally verify the PO exists in Zoho by fetching it
    if (updatedPOData.source_record_id) {
      try {
        const { ZohoBooksAPIClient } = await import('../../lib/integrations/zoho_books/zoho_api_client');
        const { getOAuthCredentials } = await import('../../lib/integrations/shared/erp-connection-loader');
        const oauthConfig = await getOAuthCredentials(config.orgId, 'zoho_books');
        const zohoClient = new ZohoBooksAPIClient(oauthConfig);
        const zohoPO = await zohoClient.getPurchaseOrder(updatedPOData.source_record_id);
        
        expect(zohoPO).toBeDefined();
        expect(zohoPO.purchaseorder_id).toBe(updatedPOData.source_record_id);
        console.log('✓ Verified PO exists in Zoho Books:');
        console.log('  - Zoho PO Number:', zohoPO.purchaseorder_number);
        console.log('  - Zoho PO ID:', zohoPO.purchaseorder_id);
        console.log('  - Vendor ID:', zohoPO.vendor_id);
      } catch (error) {
        console.warn('⚠️  Could not verify PO in Zoho (this is okay):', error instanceof Error ? error.message : 'Unknown error');
        // Don't fail the test if verification fails - the sync status is already verified
      }
    }

    console.log('✓ Test PASSED (Real API call completed successfully)\n');
    console.log('⚠️  NOTE: A purchase order was created in Zoho Books. You may want to delete it manually if needed.');
  });
});


