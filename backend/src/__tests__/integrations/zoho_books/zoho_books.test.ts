import { createPurchaseOrderConnector } from '../../../lib/integrations/connectors';

describe('Zoho Books Integration Tests', () => {
  // Increase timeout for real API calls
  jest.setTimeout(60000); // 60 seconds

  const hasRealCredentials = 
    process.env.ZOHO_CLIENT_ID && 
    process.env.ZOHO_CLIENT_SECRET && 
    process.env.ZOHO_REFRESH_TOKEN 

  beforeAll(() => {
    if (!hasRealCredentials) {
      console.log('⚠️  Skipping Zoho Books integration tests - Real credentials not configured');
    }
  });

  describe('getPurchaseOrder', () => {
    it('should fetch a purchase order from Zoho Books (Real API)', async () => {
      if (!hasRealCredentials) {
        return;
      }

      // Use an existing PO ID from environment or log a warning if not set
      // You can set TEST_ZOHO_PO_ID in your .env.test to a valid Zoho PO ID
      const zohoPoId = process.env.TEST_ZOHO_PO_ID;

      if (!zohoPoId) {
        console.log('⚠️  Skipping getPurchaseOrder test - TEST_ZOHO_PO_ID not set');
        console.log('   Please set TEST_ZOHO_PO_ID to a valid Zoho Purchase Order ID (e.g. 2280971000000335001)');
        return;
      }

      console.log(`✓ Testing getPurchaseOrder with ID: ${zohoPoId}`);

      // Create the connector using legacy function (for tests)
      // In production, use createERPConnector(connectionId)
      const connector = await createPurchaseOrderConnector('zoho_books', 'org_indian_demo');
      
      // Call the API
      const po = await connector.getPurchaseOrder(zohoPoId);

      console.log('PO:', po);

      // Assertions
      expect(po).toBeDefined();
      expect(po.purchaseorder_id).toBe(zohoPoId);
      expect(po.purchaseorder_number).toBeDefined();
      
      console.log('✓ Successfully fetched PO from Zoho:');
      console.log(`  - Number: ${po.purchaseorder_number}`);
      console.log(`  - Vendor Name: ${po.vendor_name}`);
      console.log(`  - Total: ${po.total} ${po.currency_code}`);
    });
  });
});

