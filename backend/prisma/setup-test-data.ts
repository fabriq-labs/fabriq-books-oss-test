import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function setupTestData() {
  console.log('🚀 Setting up test data for Sales Order workflow...');
  console.log('');

  try {
    // ===== 1. CREATE MULTI-TENANCY ORG =====
    console.log('🏢 Creating multi-tenancy organization...');
    const multiTenantOrg = await prisma.org.upsert({
      where: { id: 'org_test_company' },
      update: {
        name: 'Test Company Inc',
        slug: 'testcompany',
        settings: '{}',
      },
      create: {
        id: 'org_test_company',
        name: 'Test Company Inc',
        slug: 'testcompany',
        settings: '{}',
        external_mapping: {},
        active_subscription: true,
      },
    });
    console.log(`  ✓ Created multi-tenancy org: ${multiTenantOrg.name} (${multiTenantOrg.slug})`);

    // ===== 2. CREATE BUSINESS ORGANIZATION =====
    console.log('🏢 Creating business organization...');
    const org = await prisma.organization.upsert({
      where: { id: 'org_test_company' },
      update: {
        organization_name: 'Test Company Inc',
        legal_name: 'Test Company Inc',
        address: '123 Main Street',
        city: 'San Francisco',
        state: 'California',
        country: 'United States',
        zip_code: '94102',
        website: 'https://testcompany.com',
      },
      create: {
        id: 'org_test_company',
        organization_name: 'Test Company Inc',
        legal_name: 'Test Company Inc',
        address: '123 Main Street',
        city: 'San Francisco',
        state: 'California',
        country: 'United States',
        zip_code: '94102',
        website: 'https://testcompany.com',
        is_it_headquartres: 'Yes',
        is_it_a_groupcompany: 'No',
        group_company_name: null,
        basecurrency_id: null,
        org_id: 'org_test_company',
      },
    });
    console.log(`  ✓ Created business organization: ${org.organization_name}`);

    // ===== 3. CREATE CUSTOMER =====
    console.log('👥 Creating test customer...');
    const customer = await prisma.customers.upsert({
      where: { id: 'cust_acme_corp' },
      update: {
        customer_name: 'ACME Corporation',
        primary_email: 'orders@acmecorp.com',
        primary_phone: '+1-555-0100',
        customer_address: '456 Business Ave',
        city: 'Los Angeles',
        state: 'California',
        country: 'United States',
        zip_code: '90001',
        industry: 'Manufacturing',
      },
      create: {
        id: 'cust_acme_corp',
        customer_name: 'ACME Corporation',
        primary_email: 'orders@acmecorp.com',
        primary_phone: '+1-555-0100',
        customer_address: '456 Business Ave',
        city: 'Los Angeles',
        state: 'California',
        country: 'United States',
        zip_code: '90001',
        industry: 'Manufacturing',
        website: 'https://acmecorp.com',
        org_id: 'org_test_company',
        preferred_currency_id: null,
      },
    });
    console.log(`  ✓ Created customer: ${customer.customer_name}`);

    // ===== 3.5. CREATE SUPPLIER =====
    console.log('🏢 Creating test supplier...');
    const supplier = await prisma.supplier.upsert({
      where: { id: 'supp_test_vendor' },
      update: {
        supplier_name: 'Test Vendor Inc',
        legal_name: 'Test Vendor Inc',
        supplier_address: '789 Vendor Street',
        city: 'San Jose',
        state: 'California',
        country: 'United States',
        zip_code: '95101',
        primary_phone: '+1-555-0200',
        primary_email: 'orders@testvendor.com',
        industry: 'Manufacturing',
        business_classification: 'Corporation',
        status: 'Active',
      },
      create: {
        id: 'supp_test_vendor',
        supplier_name: 'Test Vendor Inc',
        legal_name: 'Test Vendor Inc',
        supplier_address: '789 Vendor Street',
        city: 'San Jose',
        state: 'California',
        country: 'United States',
        zip_code: '95101',
        primary_phone: '+1-555-0200',
        alternative_phone: '+1-555-0201',
        primary_email: 'orders@testvendor.com',
        secondary_email: 'support@testvendor.com',
        industry: 'Manufacturing',
        business_classification: 'Corporation',
        status: 'Active',
        buyer_review_added: 'No',
        onboarded_date: new Date(),
        org_id: 'org_test_company',
      },
    });
    console.log(`  ✓ Created supplier: ${supplier.supplier_name}`);

    // Create second supplier
    const supplier2 = await prisma.supplier.upsert({
      where: { id: 'supp_test_vendor_2' },
      update: {
        supplier_name: 'Second Vendor Inc',
        legal_name: 'Second Vendor Inc',
        supplier_address: '999 Supplier Ave',
        city: 'Oakland',
        state: 'California',
        country: 'United States',
        zip_code: '94601',
        primary_phone: '+1-555-0300',
        primary_email: 'orders@secondvendor.com',
        industry: 'Manufacturing',
        business_classification: 'Corporation',
        status: 'Active',
      },
      create: {
        id: 'supp_test_vendor_2',
        supplier_name: 'Second Vendor Inc',
        legal_name: 'Second Vendor Inc',
        supplier_address: '999 Supplier Ave',
        city: 'Oakland',
        state: 'California',
        country: 'United States',
        zip_code: '94601',
        primary_phone: '+1-555-0300',
        alternative_phone: '+1-555-0301',
        primary_email: 'orders@secondvendor.com',
        secondary_email: 'support@secondvendor.com',
        industry: 'Manufacturing',
        business_classification: 'Corporation',
        status: 'Active',
        buyer_review_added: 'No',
        onboarded_date: new Date(),
        org_id: 'org_test_company',
      },
    });
    console.log(`  ✓ Created supplier 2: ${supplier2.supplier_name}`);

    // ===== 4. CREATE ITEMS =====
    console.log('📦 Creating test items...');
    const item1 = await prisma.item_master.upsert({
      where: { id: 'item_test_product_a' },
      update: {
        item_name: 'Product A',
        item_description: 'Test Product A',
        unit_price: 1000.00,
        item_type: 'Product',
        item_status: 'Active',
        supplier_id: supplier.id,
      },
      create: {
        id: 'item_test_product_a',
        item_code: 'PROD-A',
        item_name: 'Product A',
        name: 'Product A',
        item_shortname: 'ProdA',
        item_description: 'Test Product A',
        item_type: 'Product',
        unit_price: 1000.00,
        stockable: 'Yes',
        item_status: 'Active',
        supplier_id: supplier.id,
        org_id: 'org_test_company',
        currency_master_id: null,
      },
    });

    const item2 = await prisma.item_master.upsert({
      where: { id: 'item_test_service_b' },
      update: {
        item_name: 'Service B',
        item_description: 'Test Service B',
        unit_price: 500.00,
        item_type: 'Service',
        item_status: 'Active',
        supplier_id: supplier2.id, // Use second supplier
      },
      create: {
        id: 'item_test_service_b',
        item_code: 'SERV-B',
        item_name: 'Service B',
        name: 'Service B',
        item_shortname: 'ServB',
        item_description: 'Test Service B',
        item_type: 'Service',
        unit_price: 500.00,
        stockable: 'No',
        item_status: 'Active',
        supplier_id: supplier2.id, // Use second supplier
        org_id: 'org_test_company',
        currency_master_id: null,
      },
    });

    // Create third item with second supplier
    const item3 = await prisma.item_master.upsert({
      where: { id: 'item_test_product_c' },
      update: {
        item_name: 'Product C',
        item_description: 'Test Product C',
        unit_price: 750.00,
        item_type: 'Product',
        item_status: 'Active',
        supplier_id: supplier2.id,
      },
      create: {
        id: 'item_test_product_c',
        item_code: 'PROD-C',
        item_name: 'Product C',
        name: 'Product C',
        item_shortname: 'ProdC',
        item_description: 'Test Product C',
        item_type: 'Product',
        unit_price: 750.00,
        stockable: 'Yes',
        item_status: 'Active',
        supplier_id: supplier2.id,
        org_id: 'org_test_company',
        currency_master_id: null,
      },
    });
    console.log(`  ✓ Created items: ${item1.item_name}, ${item2.item_name}, ${item3.item_name}`);

    // ===== 5. CREATE LOCATION =====
    console.log('🏢 Creating test location...');
    const location = await prisma.location.upsert({
      where: { id: 'loc_test_warehouse' },
      update: {
        location: 'Test Warehouse',
        customer_id: customer.id,
        legal_entity_id: org.id,
        address: '123 Warehouse St',
        city: 'San Francisco',
        state: 'California',
        country: 'United States',
        zip_code: '94102',
      },
      create: {
        id: 'loc_test_warehouse',
        location: 'Test Warehouse',
        customer_id: customer.id,
        legal_entity_id: org.id,
        address: '123 Warehouse St',
        city: 'San Francisco',
        state: 'California',
        country: 'United States',
        zip_code: '94102',
        org_id: 'org_test_company',
      },
    });
    console.log(`  ✓ Created location: ${location.location}`);

    // ===== 6. GET EMPLOYEE ROLE =====
    console.log('👔 Getting Employee role...');
    const employeeRole = await prisma.role.findFirst({ where: { name: 'Employee' } });
    if (!employeeRole) {
      throw new Error('Employee role not found. Please run setup-metadata.ts first.');
    }
    console.log(`  ✓ Found Employee role: ${employeeRole.id}`);

    // Get Buyer role (for purchase requisition workflow)
    const buyerRole = await prisma.role.findFirst({ where: { name: 'Buyer' } });
    if (!buyerRole) {
      throw new Error('Buyer role not found. Please run setup-workflows.ts first.');
    }
    console.log(`  ✓ Found Buyer role: ${buyerRole.id}`);

    // ===== 7. CREATE TEST USERS =====
    console.log('👤 Creating test users...');
    
    // Hash password for all users
    const password = 'Metalimits@123';
    const hashedPassword = await hash(password, 10);
    
    // Test User 0 - Manager (for purchase requisition workflow tests)
    const managerUser = await prisma.user.upsert({
      where: { id: 'user_manager_123' },
      update: {
        name: 'Test Manager',
        email: 'manager@testcompany.com',
        password: hashedPassword,
        org_id: 'org_test_company',
      },
      create: {
        id: 'user_manager_123',
        email: 'manager@testcompany.com',
        name: 'Test Manager',
        password: hashedPassword,
        external_id: 'user_manager_123',
        auth_provider: 'local',
        org_id: 'org_test_company',
      },
    });

    // Assign Employee role to manager user
    await prisma.role_user.upsert({
      where: { id: 'ru_test_manager' },
      update: { role_id: employeeRole.id, user_id: managerUser.id },
      create: {
        id: 'ru_test_manager',
        role_id: employeeRole.id,
        user_id: managerUser.id,
        created_at: new Date(),
        modified_at: new Date(),
        created_by: 'system',
        modified_by: 'system',
        org_id: 'org_test_company',
      },
    });

    // Assign Buyer role to manager user (for workflow testing)
    await prisma.role_user.upsert({
      where: { id: 'ru_manager_buyer' },
      update: { role_id: buyerRole.id, user_id: managerUser.id },
      create: {
        id: 'ru_manager_buyer',
        role_id: buyerRole.id,
        user_id: managerUser.id,
        created_at: new Date(),
        modified_at: new Date(),
        created_by: 'system',
        modified_by: 'system',
        org_id: 'org_test_company',
      },
    });

    console.log(`  ✓ Created manager user: ${managerUser.email} (id: ${managerUser.id}) with Employee and Buyer roles`);

    // Test User 1 - Test User (used by tests)
    const testUser1 = await prisma.user.upsert({
      where: { id: 'user_test_123' },
      update: {
        name: 'Test User',
        email: 'test@testcompany.com',
        password: hashedPassword,
        manager_id: managerUser.id, // Set manager
        org_id: 'org_test_company',
      },
      create: {
        id: 'user_test_123',
        email: 'test@testcompany.com',
        name: 'Test User',
        password: hashedPassword,
        external_id: 'user_test_123',
        auth_provider: 'local',
        manager_id: managerUser.id, // Set manager
        org_id: 'org_test_company',
      },
    });

    // Assign Employee role to test user
    await prisma.role_user.upsert({
      where: { id: 'ru_test_user' },
      update: { role_id: employeeRole.id, user_id: testUser1.id },
      create: {
        id: 'ru_test_user',
        role_id: employeeRole.id,
        user_id: testUser1.id,
        created_at: new Date(),
        modified_at: new Date(),
        created_by: 'system',
        modified_by: 'system',
        org_id: 'org_test_company',
      },
    });

    // Assign Buyer role to test user (for workflow testing)
    await prisma.role_user.upsert({
      where: { id: 'ru_test_user_buyer' },
      update: { role_id: buyerRole.id, user_id: testUser1.id },
      create: {
        id: 'ru_test_user_buyer',
        role_id: buyerRole.id,
        user_id: testUser1.id,
        created_at: new Date(),
        modified_at: new Date(),
        created_by: 'system',
        modified_by: 'system',
        org_id: 'org_test_company',
      },
    });

    console.log(`  ✓ Created test user: ${testUser1.email} (id: ${testUser1.id}) with Employee and Buyer roles, manager: ${managerUser.name}`);
    
    // Test User 2 - Sales Rep
    const testUser2 = await prisma.user.upsert({
      where: { email: 'sales@testcompany.com' },
      update: {
        name: 'John Sales',
        password: hashedPassword, // Metalimits@123
        org_id: 'org_test_company',
      },
      create: {
        email: 'sales@testcompany.com',
        name: 'John Sales',
        password: hashedPassword, // Metalimits@123
        external_id: 'sales@testcompany.com',
        auth_provider: 'local',
        org_id: 'org_test_company',
      },
    });

    // Assign Employee role to sales user
    await prisma.role_user.upsert({
      where: { id: 'ru_test_sales' },
      update: { role_id: employeeRole.id, user_id: testUser2.id },
      create: {
        id: 'ru_test_sales',
        role_id: employeeRole.id,
        user_id: testUser2.id,
        created_at: new Date(),
        modified_at: new Date(),
        created_by: 'system',
        modified_by: 'system',
        org_id: 'org_test_company',
      },
    });

    console.log(`  ✓ Created sales user: ${testUser2.email} with Employee role`);

    // ===== 8. VERIFY SALES ORDER VIEWS AND PERMISSIONS =====
    console.log('🔍 Verifying sales order views and permissions...');
    
    const salesOrderViews = await prisma.view.findMany({
      where: { model_name: 'sales_order' }
    });
    
    const salesOrderItemViews = await prisma.view.findMany({
      where: { model_name: 'sales_order_item' }
    });

    if (salesOrderViews.length === 0) {
      console.log('  ⚠️  No views found for sales_order model');
      console.log('  ℹ️  Sales order views should be created in the future');
    } else {
      console.log(`  ✓ Found ${salesOrderViews.length} views for sales_order`);
    }

    if (salesOrderItemViews.length === 0) {
      console.log('  ⚠️  No views found for sales_order_item model');
      console.log('  ℹ️  Sales order item views should be created in the future');
    } else {
      console.log(`  ✓ Found ${salesOrderItemViews.length} views for sales_order_item`);
    }

    // Get summary
    const itemCount = await prisma.item_master.count({ where: { org_id: 'org_test_company' } });
    const customerCount = await prisma.customers.count({ where: { org_id: 'org_test_company' } });

    console.log('');
    console.log('✅ Test data setup complete!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   🏢 Multi-tenancy Org: Test Company Inc (${multiTenantOrg.slug})`);
    console.log(`   🏢 Business Organization: Test Company Inc`);
    console.log(`   👥 Customer: ACME Corporation`);
    console.log(`   🏭 Suppliers: Test Vendor Inc, Second Vendor Inc (3 items total)`);
    console.log(`   📦 Items: ${itemCount} items (Product A, Service B, Product C)`);
    console.log(`   🏢 Location: Test Warehouse`);
    console.log(`   👤 Users:`);
    console.log(`      - Manager: manager@testcompany.com (Employee + Buyer roles)`);
    console.log(`      - Employee: test@testcompany.com (reports to Manager, Employee role)`);
    console.log(`      - Sales Rep: sales@testcompany.com (Employee role)`);
    console.log('');
    console.log('🎯 Ready to test workflows!');
    console.log('   - Sales Order workflow: Draft → Submitted → Invoiced');
    console.log('   - Purchase Requisition workflow: Draft → Manager Review → Buyer Review → Delivery');

  } catch (error) {
    console.error('❌ Failed to setup test data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  setupTestData()
    .then(() => {
      console.log('🎉 Test data setup completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Setup failed:', error);
      process.exit(1);
    });
}

export { setupTestData };

