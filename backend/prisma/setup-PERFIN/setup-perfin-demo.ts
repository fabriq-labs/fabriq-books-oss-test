import * as fs from 'fs';
import * as path from 'path';
import { setupChartOfAccounts } from '../setup-chart-of-accounts';

import prisma from '../../src/lib/prisma';
const csv = require('csv-parser');

interface CsvRow {
  [key: string]: string;
}

async function loadCsvData(filePath: string): Promise<CsvRow[]> {
  return new Promise((resolve, reject) => {
    const results: CsvRow[] = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data: CsvRow) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

async function setupPerfinDemoData() {
  console.log('💰 Setting up Personal Finance Demo Data...');
  console.log('');

  try {
    // ===== 1. LOAD AND INSERT ORG DATA =====
    console.log('🏢 Loading organization data...');
    const orgData = await loadCsvData(path.join(__dirname, 'org.csv'));

    for (const org of orgData) {
      const updateData: Record<string, unknown> = {
        name: org.name,
        slug: org.slug,
        settings: org.settings || '{}',
        external_mapping: org.external_mapping ? JSON.parse(org.external_mapping) : {},
        active_subscription: org.active_subscription === 'true',
      };
      if (org.erp_system_type !== undefined) {
        updateData.erp_system_type = org.erp_system_type || null;
      }
      const createData = { ...updateData, id: org.id } as Record<string, unknown>;
      await prisma.org.upsert({
        where: { id: org.id },
        update: updateData as any,
        create: createData as any,
      });
    }
    console.log(`  ✓ Loaded ${orgData.length} organizations`);

    // ===== 2. LOAD AND INSERT ORGANIZATION DATA =====
    console.log('🏢 Loading business organization data...');
    const organizationData = await loadCsvData(path.join(__dirname, 'organization.csv'));

    for (const org of organizationData) {
      const updateData: any = {
        organization_name: org.organization_name,
        legal_name: org.legal_name,
        address: org.address,
        city: org.city,
        state: org.state,
        country: org.country,
        zip_code: org.zip_code,
        website: org.website,
        is_it_headquartres: org.is_it_headquartres,
        is_it_a_groupcompany: org.is_it_a_groupcompany,
        group_company_name: org.group_company_name,
        org_id: org.org_id,
      };

      const createData: any = {
        id: org.id,
        organization_name: org.organization_name,
        legal_name: org.legal_name,
        address: org.address,
        city: org.city,
        state: org.state,
        country: org.country,
        zip_code: org.zip_code,
        website: org.website,
        is_it_headquartres: org.is_it_headquartres,
        is_it_a_groupcompany: org.is_it_a_groupcompany,
        group_company_name: org.group_company_name,
        org_id: org.org_id,
      };

      // Only set basecurrency_id when present (must reference existing currency.id)
      const baseCurrencyId = org.basecurrency_id?.trim();
      if (baseCurrencyId) {
        updateData.basecurrency_id = baseCurrencyId;
        createData.basecurrency_id = baseCurrencyId;
      }

      await prisma.entity.upsert({
        where: { id: org.id },
        update: updateData,
        create: createData,
      });
    }
    console.log(`  ✓ Loaded ${organizationData.length} business organizations`);

    // ===== 2.5. SETUP CHART OF ACCOUNTS FOR EACH ORGANIZATION (Personal Finance template, USD) =====
    console.log('💰 Setting up chart of accounts for organizations...');
    const coaTemplatePath = path.join(__dirname, 'chart-of-accounts.json');
    for (const org of organizationData) {
      await setupChartOfAccounts(org.org_id, org.id, coaTemplatePath, 'USD');
    }
    console.log(`  ✓ Set up chart of accounts for ${organizationData.length} organizations`);

    // ===== 3. LOAD AND INSERT CUSTOMER DATA =====
    console.log('👥 Loading customer data...');
    const customerData = await loadCsvData(path.join(__dirname, 'customers.csv'));

    for (const customer of customerData) {
      const updateData: any = {
        customer_name: customer.customer_name,
        primary_email: customer.primary_email,
        primary_phone: customer.primary_phone,
        customer_address: customer.customer_address,
        city: customer.city,
        state: customer.state,
        country: customer.country,
        zip_code: customer.zip_code,
        industry: customer.industry,
        website: customer.website,
        org_id: customer.org_id,
      };

      const createData: any = {
        id: customer.id,
        customer_name: customer.customer_name,
        primary_email: customer.primary_email,
        primary_phone: customer.primary_phone,
        customer_address: customer.customer_address,
        city: customer.city,
        state: customer.state,
        country: customer.country,
        zip_code: customer.zip_code,
        industry: customer.industry,
        website: customer.website,
        org_id: customer.org_id,
      };

      if (customer.preferred_currency_id && customer.preferred_currency_id !== 'null') {
        updateData.preferred_currency_id = customer.preferred_currency_id;
        createData.preferred_currency_id = customer.preferred_currency_id;
      }
      if (customer.payment_term_id && String(customer.payment_term_id).trim() !== '') {
        updateData.payment_term_id = customer.payment_term_id;
        createData.payment_term_id = customer.payment_term_id;
      }

      await prisma.customers.upsert({
        where: { id: customer.id },
        update: updateData,
        create: createData,
      });
    }
    console.log(`  ✓ Loaded ${customerData.length} customers`);

    // ===== 4. LOAD AND INSERT SUPPLIER DATA =====
    console.log('🏭 Loading supplier data...');
    const supplierData = await loadCsvData(path.join(__dirname, 'suppliers.csv'));

    for (const supplier of supplierData) {
      const updateData: any = {
        supplier_name: supplier.supplier_name,
        legal_name: supplier.legal_name,
        supplier_address: supplier.supplier_address,
        city: supplier.city,
        state: supplier.state,
        country: supplier.country,
        zip_code: supplier.zip_code,
        primary_phone: supplier.primary_phone,
        alternative_phone: supplier.alternative_phone,
        primary_email: supplier.primary_email,
        secondary_email: supplier.secondary_email,
        industry: supplier.industry,
        business_classification: supplier.business_classification,
        status: supplier.status,
        buyer_review_added: supplier.buyer_review_added,
        onboarded_date: supplier.onboarded_date ? new Date(supplier.onboarded_date) : new Date(),
        org_id: supplier.org_id,
      };
      const createData: any = { id: supplier.id, ...updateData };
      if (supplier.payment_term_id && String(supplier.payment_term_id).trim() !== '') {
        updateData.payment_term_id = supplier.payment_term_id;
        createData.payment_term_id = supplier.payment_term_id;
      }
      if (supplier.shipping_term_id && String(supplier.shipping_term_id).trim() !== '') {
        updateData.shipping_term_id = supplier.shipping_term_id;
        createData.shipping_term_id = supplier.shipping_term_id;
      }
      if (supplier.shipping_method_id && String(supplier.shipping_method_id).trim() !== '') {
        updateData.shipping_method_id = supplier.shipping_method_id;
        createData.shipping_method_id = supplier.shipping_method_id;
      }
      if (supplier.preferred_currency_id && String(supplier.preferred_currency_id).trim() !== '') {
        updateData.preferred_currency_id = supplier.preferred_currency_id;
        createData.preferred_currency_id = supplier.preferred_currency_id;
      }
      await prisma.supplier.upsert({
        where: { id: supplier.id },
        update: updateData,
        create: createData,
      });
    }
    console.log(`  ✓ Loaded ${supplierData.length} suppliers`);

    // ===== 5. LOAD AND INSERT LOCATION DATA =====
    console.log('🏢 Loading location data...');
    const locationData = await loadCsvData(path.join(__dirname, 'locations.csv'));
    const seededLegalEntityIds = new Set(
      organizationData.map((row) => String(row.id).trim()).filter(Boolean),
    );
    const defaultLegalEntityId =
      organizationData.length === 1 ? String(organizationData[0].id).trim() : '';

    for (const location of locationData) {
      const updateData: any = {
        location: location.location,
        address: location.address,
        city: location.city,
        state: location.state,
        country: location.country,
        zip_code: location.zip_code,
        org_id: location.org_id,
      };

      const createData: any = {
        id: location.id,
        location: location.location,
        address: location.address,
        city: location.city,
        state: location.state,
        country: location.country,
        zip_code: location.zip_code,
        org_id: location.org_id,
      };

      if (location.customer_id && typeof location.customer_id === 'string' && location.customer_id.trim() !== '') {
        updateData.customer_id = location.customer_id;
        createData.customer_id = location.customer_id;
      }
      const csvLegalEntityId = location.legal_entity_id ? String(location.legal_entity_id).trim() : '';
      let legalEntityId = csvLegalEntityId;
      if (legalEntityId && !seededLegalEntityIds.has(legalEntityId) && defaultLegalEntityId) {
        console.warn(
          `  ⚠️  Location ${location.id}: legal_entity_id "${legalEntityId}" is not a seeded entity id; using "${defaultLegalEntityId}"`,
        );
        legalEntityId = defaultLegalEntityId;
      } else if (!legalEntityId && defaultLegalEntityId) {
        legalEntityId = defaultLegalEntityId;
      }
      if (legalEntityId) {
        updateData.legal_entity_id = legalEntityId;
        createData.legal_entity_id = legalEntityId;
      }

      await prisma.location.upsert({
        where: { id: location.id },
        update: updateData,
        create: createData,
      });
    }
    console.log(`  ✓ Loaded ${locationData.length} locations`);

    // ===== 6. LOAD AND INSERT ITEM DATA =====
    console.log('📦 Loading item data...');
    const itemData = await loadCsvData(path.join(__dirname, 'items.csv'));

    for (const item of itemData) {
      const updateData: any = {
        item_code: item.item_code,
        item_name: item.item_name,
        name: item.name,
        item_shortname: item.item_shortname,
        item_description: item.item_description,
        item_type: item.item_type,
        unit_price: parseFloat(item.unit_price),
        stockable: item.stockable,
        item_status: item.item_status,
        supplier_id: item.supplier_id,
        org_id: item.org_id,
        item_category_id: item.item_category_id || null,
        uom_id: item.uom_id || null,
        tax_master_id: item.tax_master_id || null,
        tax_rate_intra_id: item.tax_rate_intra_id || null,
      };

      const createData: any = {
        id: item.id,
        item_code: item.item_code,
        item_name: item.item_name,
        name: item.name,
        item_shortname: item.item_shortname,
        item_description: item.item_description,
        item_type: item.item_type,
        unit_price: parseFloat(item.unit_price),
        stockable: item.stockable,
        item_status: item.item_status,
        supplier_id: item.supplier_id,
        org_id: item.org_id,
        item_category_id: item.item_category_id || null,
        uom_id: item.uom_id || null,
        tax_master_id: item.tax_master_id || null,
        tax_rate_intra_id: item.tax_rate_intra_id || null,
      };

      if (item.currency_id && typeof item.currency_id === 'string' && item.currency_id.trim() !== '' && item.currency_id.trim() !== 'undefined') {
        updateData.currency_id = item.currency_id;
        createData.currency_id = item.currency_id;
      }

      await prisma.item_master.upsert({
        where: { id: item.id },
        update: updateData,
        create: createData,
      });
    }
    console.log(`  ✓ Loaded ${itemData.length} items`);

    // ===== 7. LOAD AND INSERT USER DATA =====
    console.log('👤 Loading user data...');
    const userData = await loadCsvData(path.join(__dirname, 'users.csv'));

    for (const user of userData) {
      await prisma.user.upsert({
        where: { id: user.id },
        update: {
          email: user.email,
          name: user.name,
          password: user.password,
          external_id: user.external_id,
          auth_provider: user.auth_provider,
          manager_id: user.manager_id || null,
          org_id: user.org_id,
        },
        create: {
          id: user.id,
          email: user.email,
          name: user.name,
          password: user.password,
          external_id: user.external_id,
          auth_provider: user.auth_provider,
          manager_id: user.manager_id || null,
          org_id: user.org_id,
        },
      });
    }
    console.log(`  ✓ Loaded ${userData.length} users`);

    // ===== 8. LOAD AND INSERT ROLE-USER DATA =====
    console.log('🔗 Loading role-user assignments...');
    const roleUserData = await loadCsvData(path.join(__dirname, 'role_user.csv'));

    for (const roleUser of roleUserData) {
      await prisma.role_user.upsert({
        where: { id: roleUser.id },
        update: {
          role_id: roleUser.role_id,
          user_id: roleUser.user_id,
          created_at: new Date(roleUser.created_at),
          modified_at: new Date(roleUser.modified_at),
          created_by: roleUser.created_by,
          modified_by: roleUser.modified_by,
          org_id: roleUser.org_id,
        },
        create: {
          id: roleUser.id,
          role_id: roleUser.role_id,
          user_id: roleUser.user_id,
          created_at: new Date(roleUser.created_at),
          modified_at: new Date(roleUser.modified_at),
          created_by: roleUser.created_by,
          modified_by: roleUser.modified_by,
          org_id: roleUser.org_id,
        },
      });
    }
    console.log(`  ✓ Loaded ${roleUserData.length} role-user assignments`);

    // ===== 9. SUMMARY =====
    console.log('');
    console.log('✅ Personal Finance Demo Data Setup Complete!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   🏢 Organizations: ${orgData.length}`);
    console.log(`   🏢 Business Orgs: ${organizationData.length}`);

    console.log(`   💰 Chart of Accounts: Set up for ${organizationData.length} organizations`);
    console.log(`   👥 Customers: ${customerData.length}`);
    console.log(`   🏭 Suppliers: ${supplierData.length}`);
    console.log(`   🏢 Locations: ${locationData.length}`);
    console.log(`   📦 Items: ${itemData.length}`);
    console.log(`   👤 Users: ${userData.length}`);
    console.log(`   🔗 Role Assignments: ${roleUserData.length}`);
    console.log('');
    console.log('💰 Ready for personal finance scenarios!');
    console.log('');
    console.log('🎯 Demo Users Available:');
    console.log('   Super Admin: admin@example.com (Password: admin123)');
    console.log('');
    console.log('💡 Personal Finance Features:');
    console.log('   📊 Budgeting & Expense Tracking');
    console.log('   💰 Investment Portfolio Management');
    console.log('   🏠 Asset & Liability Tracking');
    console.log('   📈 Financial Goal Setting');
    console.log('   📱 Mobile-First Experience');

  } catch (error) {
    console.error('❌ Failed to setup personal finance demo data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  setupPerfinDemoData()
    .then(() => {
      console.log('🎉 Personal finance demo data setup completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Setup failed:', error);
      process.exit(1);
    });
}

export { setupPerfinDemoData };

