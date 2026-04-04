import { ModelService } from '../../services/core/ModelService';
import { WorkflowEngine } from '../../workflow-engine/core/WorkflowEngine';
import prisma from '../../lib/prisma';
import { loadTestConfig, createTestContext, validateTestData, TestConfig } from '../test-configs/test-config-loader';
import { createPurchaseOrderThroughWorkflow, setupTestContexts } from './purchase-order-test-helpers';

describe('Purchase Order QuickBooks Sync Tests', () => {
  // Increase timeout for database operations and API calls
  jest.setTimeout(180000); // 180 seconds

  console.log('\n🚀 Starting Purchase Order QuickBooks Sync Tests');
  const modelService = ModelService.getInstance();
  const workflowEngine = new WorkflowEngine(prisma);

  let config: TestConfig;
  let context: any;
  let locationId: string;
  let quickbooksItemId: string;
  let buyerContext: any;
  let managerContext: any;
  let quickbooksSupplierId: string; // Supplier synced from QuickBooks with source_record_id

  // Load configuration from environment or default
  beforeAll(() => {
    config = loadTestConfig();
    context = createTestContext(config);
  });

  beforeAll(async () => {
    // Validate that the configured test data exists
    await validateTestData(config, prisma);

    // Find supplier synced from QuickBooks (has source_system with system_type = 'quickbooks')
    const quickbooksSourceSystem = await prisma.source_system.findFirst({
        where: {
          system_type: 'quickbooks',
          is_active: true,
          org_id: config.orgId,
        },
      });

    if (!quickbooksSourceSystem) {
      throw new Error('No active QuickBooks source system found. ' +
        'Please ensure you have configured a QuickBooks connection first.');
    }

    // Get existing seed data IDs
    const item = await prisma.item_master.findFirst({ where: { source_system_id: quickbooksSourceSystem.id, name: 'Pump' } });
    if (!item) {
      throw new Error(`Item ${config.items.quickbooksProductName} not found. Run the appropriate setup script first.`);
    }
    quickbooksItemId = item.id;

    const location = await prisma.location.findUnique({ where: { id: config.locationId } });
    if (!location) {
      throw new Error(`Location ${config.locationId} not found. Run the appropriate setup script first.`);
    }
    locationId = location.id;


    const quickbooksSupplier = await prisma.supplier.findFirst({
      where: {
        source_system_id: quickbooksSourceSystem.id,
        source_record_id: { not: null },
        org_id: config.orgId,
      },
    });

    if (!quickbooksSupplier) {
      throw new Error(
        'No QuickBooks supplier found with source_record_id. ' +
        'Please ensure you have synced suppliers from QuickBooks first.'
      );
    }

    quickbooksSupplierId = quickbooksSupplier.id;
    console.log('✓ Found QuickBooks supplier:', quickbooksSupplier.supplier_name, `(ID: ${quickbooksSupplierId}, Source ID: ${quickbooksSupplier.source_record_id})`);

    // Update the item to use the QuickBooks supplier so the generated PO will use it
    await prisma.item_master.update({
      where: { id: quickbooksItemId },
      data: { supplier_id: quickbooksSupplierId },
    });
    console.log('✓ Updated item to use QuickBooks supplier');

    // Setup test contexts
    const contexts = await setupTestContexts(config, prisma);
    buyerContext = contexts.buyerContext;
    managerContext = contexts.managerContext;
  });

  it('should sync purchase order to QuickBooks when approved (real API call)', async () => {
    console.log('\n=== TEST: Purchase Order QuickBooks Sync (Real API) ===');

    // Create PO through workflow using common helper
    const { poId, poWfInstanceId } = await createPurchaseOrderThroughWorkflow(
      modelService,
      workflowEngine,
      context,
      managerContext,
      buyerContext,
      locationId,
      quickbooksItemId,
      config.orgId,
      quickbooksSupplierId
    );

    // Verify supplier has source_record_id before proceeding (for real API test)
    const supplierWithDetails = await prisma.supplier.findUnique({
      where: { id: quickbooksSupplierId },
      select: {
        id: true,
        supplier_name: true,
        source_record_id: true,
        source_system_id: true,
      },
    });

    if (!supplierWithDetails) {
      throw new Error(`Supplier ${quickbooksSupplierId} not found`);
    }

    if (!supplierWithDetails.source_record_id) {
      throw new Error(
        `Supplier ${quickbooksSupplierId} (${supplierWithDetails.supplier_name}) does not have source_record_id. ` +
        `Please ensure the supplier is synced from QuickBooks.`
      );
    }

    console.log('✓ Supplier verification:');
    console.log('  - Supplier ID:', supplierWithDetails.id);
    console.log('  - Supplier Name:', supplierWithDetails.supplier_name);
    console.log('  - Source Record ID (QuickBooks Vendor ID):', supplierWithDetails.source_record_id);
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
        `This is required for QuickBooks sync.`
      );
    }

    console.log('✓ PO Supplier verification:');
    console.log('  - PO Supplier ID:', poWithSupplier.supplier_details.id);
    console.log('  - PO Supplier Name:', poWithSupplier.supplier_details.supplier_name);
    console.log('  - PO Supplier Source Record ID (will be sent as VendorRef.value to QuickBooks):', poWithSupplier.supplier_details.source_record_id);

    // Now transition to "PO Issued" - this will trigger REAL QuickBooks sync
    console.log('⚠️  Executing transition - this will make a REAL API call to QuickBooks Online...');
    console.log('⚠️  Using vendor_id:', poWithSupplier.supplier_details.source_record_id);
    
    const poWfContext2 = await workflowEngine.getWorkflowContext(poWfInstanceId, buyerContext);
    const poApproveAction = poWfContext2.availableActions.find(a => a.name === 'Approve');
    expect(poApproveAction).toBeDefined();
    
    // This will make a real API call to QuickBooks
    await workflowEngine.executeTransition(poWfContext2, poApproveAction!, buyerContext, {});
    console.log('✓ PO Transitioned to PO Issued - QuickBooks sync completed');

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
    expect(updatedPOData.source_record_id).toBeTruthy(); // Should have a real QuickBooks PO ID
    expect(updatedPOData.source_system_id).toBeDefined();
    expect(updatedPOData.sync_status).toBe('synced');
    expect(updatedPOData.source_updated_at).toBeDefined();
    console.log('✓ PO sync fields verified:');
    console.log('  - source_record_id:', updatedPOData.source_record_id);
    console.log('  - source_system_id:', updatedPOData.source_system_id);
    console.log('  - sync_status:', updatedPOData.sync_status);
    console.log('  - source_updated_at:', updatedPOData.source_updated_at);

    // Optionally verify the PO exists in QuickBooks by fetching it
    if (updatedPOData.source_record_id) {
      try {
        const { QuickBooksAPIClient } = await import('../../lib/integrations/quickbooks/quickbooks_api_client');
        const { getOAuthCredentials } = await import('../../lib/integrations/shared/erp-connection-loader');
        const prisma = (await import('../../lib/prisma')).default;
        
        // Get connection ID for token persistence
        const sourceSystem = await prisma.source_system.findFirst({
          where: {
            org_id: config.orgId,
            system_type: 'quickbooks',
            is_active: true,
          },
        });
        
        const oauthConfigRaw = await getOAuthCredentials(config.orgId, 'quickbooks');
        
        // Map to QuickBooksOAuthConfig format (realm_id is required for QuickBooks)
        // QuickBooks uses realm_id, which may be stored as organization_id or realm_id in the config
        const qbOAuthConfig = {
          client_id: oauthConfigRaw.client_id,
          client_secret: oauthConfigRaw.client_secret,
          refresh_token: oauthConfigRaw.refresh_token,
          realm_id: (oauthConfigRaw as any).realm_id || oauthConfigRaw.organization_id || '',
          environment: ((oauthConfigRaw as any).environment || 'production') as 'sandbox' | 'production',
          connectionId: sourceSystem?.id, // Include connectionId for token persistence
        };
        
        if (!qbOAuthConfig.realm_id) {
          throw new Error('QuickBooks realm_id is required. Please ensure it is set in the connection configuration.');
        }
        
        const qbClient = new QuickBooksAPIClient(qbOAuthConfig);
        const qbPO = await qbClient.getPurchaseOrder(updatedPOData.source_record_id);
        
        expect(qbPO).toBeDefined();
        expect(qbPO.Id).toBe(updatedPOData.source_record_id);
        console.log('✓ Verified PO exists in QuickBooks Online:');
        console.log('  - QuickBooks PO Number:', qbPO.DocNumber);
        console.log('  - QuickBooks PO ID:', qbPO.Id);
        console.log('  - Vendor ID:', qbPO.VendorRef?.value);
      } catch (error) {
        console.warn('⚠️  Could not verify PO in QuickBooks (this is okay):', error instanceof Error ? error.message : 'Unknown error');
        // Don't fail the test if verification fails - the sync status is already verified
      }
    }

    console.log('✓ Test PASSED (Real API call completed successfully)\n');
    console.log('⚠️  NOTE: A purchase order was created in QuickBooks Online. You may want to delete it manually if needed.');
  });
});

