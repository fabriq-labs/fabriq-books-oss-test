import * as fs from 'fs';
import * as path from 'path';
import { setupChartOfAccounts } from '../setup-chart-of-accounts';
import { setupCurrencyMaster } from '../setup-currency-master';
import prisma from '../../src/lib/prisma';
import {
  hashStableDemoApiKey,
  stableUsCaDemoApiKeyPlaintext,
} from '../demo-stable-api-keys';
import { buildAirbyteExtractionConfigFromEnv } from '../setup-airbyte-extraction-config';

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

async function setupUsCaDemoData() {
  console.log('🇺🇸 Setting up US-CA Demo Data...');
  console.log('');

  try {
    // ===== 1. LOAD AND INSERT ORG DATA =====
    console.log('🏢 Loading organization data...');
    const orgData = await loadCsvData(path.join(__dirname, 'org.csv'));

    for (const org of orgData) {
      await prisma.org.upsert({
        where: { id: org.id },
        update: {
          name: org.name,
          slug: org.slug,
          settings: org.settings || '{}',
          external_mapping: org.external_mapping ? JSON.parse(org.external_mapping) : {},
          active_subscription: org.active_subscription === 'true',
          erp_system_type: org.erp_system_type,
        },
        create: {
          id: org.id,
          name: org.name,
          slug: org.slug,
          settings: org.settings || '{}',
          external_mapping: org.external_mapping ? JSON.parse(org.external_mapping) : {},
          active_subscription: org.active_subscription === 'true',
          erp_system_type: org.erp_system_type,
        },
      });
    }
    console.log(`  ✓ Loaded ${orgData.length} organizations`);

    // ===== 1.5. SETUP CURRENCY MASTER FROM CSV (before organization — basecurrency_id FK) =====
    console.log('💱 Loading currency master from CSV...');
    await setupCurrencyMaster(path.join(__dirname, 'currency_master.csv'));
    console.log('  ✓ Currency master setup complete');

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

      // Only add basecurrency_id if it exists (must reference existing currency_master.id)
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

    // ===== 2.5. SETUP CHART OF ACCOUNTS FOR EACH ORGANIZATION (US template) =====
    console.log('💰 Setting up chart of accounts for organizations...');
    const coaTemplatePath = path.join(__dirname, 'chart-of-accounts.json');
    for (const org of organizationData) {
      await setupChartOfAccounts('org_techflow_us', org.id, coaTemplatePath, 'USD');
    }
    console.log(`  ✓ Set up chart of accounts for ${organizationData.length} organizations`);

    // ===== 2.57. LOAD MASTERS FROM CSV (shipping, tax, item_category, uom, cost_center) =====
    console.log('📋 Loading master data (shipping method, shipping terms, tax, item category, UOM, cost center)...');
    const shippingMethodData = await loadCsvData(path.join(__dirname, 'shipping_method.csv'));
    for (const row of shippingMethodData) {
      await prisma.shipping_method.upsert({
        where: { id: row.id },
        update: { shipping_method: row.shipping_method, description: row.description, status: row.status || null, org_id: row.org_id },
        create: { id: row.id, shipping_method: row.shipping_method, description: row.description, status: row.status || null, org_id: row.org_id },
      });
    }
    const shippingTermsData = await loadCsvData(path.join(__dirname, 'shipping_terms.csv'));
    for (const row of shippingTermsData) {
      await prisma.shipping_terms.upsert({
        where: { id: row.id },
        update: { shipping_terms: row.shipping_terms, description: row.description, status: row.status || null, org_id: row.org_id },
        create: { id: row.id, shipping_terms: row.shipping_terms, description: row.description, status: row.status || null, org_id: row.org_id },
      });
    }
    const taxMasterData = await loadCsvData(path.join(__dirname, 'tax_master.csv'));
    for (const row of taxMasterData) {
      const effectiveFrom = row.effective_from ? new Date(row.effective_from) : new Date('2024-01-01');
      const expiresOn = row.expires_on ? new Date(row.expires_on) : new Date('2026-12-31');
      await prisma.tax_master.upsert({
        where: { id: row.id },
        update: { tax_name: row.tax_name, tax_code: row.tax_code, tax_rate: parseInt(row.tax_rate, 10), effective_from: effectiveFrom, expires_on: expiresOn, geo: row.geo, status: row.status || null, org_id: row.org_id },
        create: { id: row.id, tax_name: row.tax_name, tax_code: row.tax_code, tax_rate: parseInt(row.tax_rate, 10), effective_from: effectiveFrom, expires_on: expiresOn, geo: row.geo, status: row.status || null, org_id: row.org_id },
      });
    }
    const itemCategoryData = await loadCsvData(path.join(__dirname, 'item_category.csv'));
    for (const row of itemCategoryData) {
      await prisma.item_category.upsert({
        where: { id: row.id },
        update: { item_category: row.item_category, item_subcategory: row.item_subcategory || null, org_id: row.org_id },
        create: { id: row.id, item_category: row.item_category, item_subcategory: row.item_subcategory || null, org_id: row.org_id },
      });
    }
    const uomData = await loadCsvData(path.join(__dirname, 'uom.csv'));
    for (const row of uomData) {
      await prisma.uom.upsert({
        where: { id: row.id },
        update: { name: row.name || null, org_id: row.org_id || null },
        create: { id: row.id, name: row.name || null, org_id: row.org_id || null },
      });
    }
    const costCenterData = await loadCsvData(path.join(__dirname, 'cost_center.csv'));
    for (const row of costCenterData) {
      await prisma.cost_center.upsert({
        where: { id: row.id },
        update: { cost_center: row.cost_center, legal_entity_id: row.legal_entity_id || null, status: row.status || null, org_id: row.org_id },
        create: { id: row.id, cost_center: row.cost_center, legal_entity_id: row.legal_entity_id || null, status: row.status || null, org_id: row.org_id },
      });
    }
    console.log(`  ✓ Shipping methods: ${shippingMethodData.length}, Shipping terms: ${shippingTermsData.length}, Tax: ${taxMasterData.length}, Item categories: ${itemCategoryData.length}, UOM: ${uomData.length}, Cost centers: ${costCenterData.length}`);

    // ===== 2.58. LOAD CATEGORY_GROUP, CATEGORY (data.prisma), CURRENCY (data.prisma) =====
    console.log('📂 Loading category groups, categories, and currencies...');
    const categoryGroupData = await loadCsvData(path.join(__dirname, 'category_group.csv'));
    for (const row of categoryGroupData) {
      await prisma.category_group.upsert({
        where: { id: row.id },
        update: { name: row.name, org_id: row.org_id || null },
        create: { id: row.id, name: row.name, org_id: row.org_id || null },
      });
    }
    const categoryData = await loadCsvData(path.join(__dirname, 'category.csv'));
    for (const row of categoryData) {
      await prisma.category.upsert({
        where: { id: row.id },
        update: { name: row.name, color: row.color, group_id: row.group_id || null, org_id: row.org_id || null },
        create: { id: row.id, name: row.name, color: row.color, group_id: row.group_id || null, org_id: row.org_id || null },
      });
    }
    const currencyData = await loadCsvData(path.join(__dirname, 'currency.csv'));
    for (const row of currencyData) {
      const currencyOrgId = row.org_id?.trim() || 'org_us_ca_demo';
      await prisma.currency.upsert({
        where: { code: row.code },
        update: { name: row.name, symbol: row.symbol || null, decimal_places: parseInt(row.decimal_places || '2', 10), is_active: row.is_active === 'true', org_id: currencyOrgId },
        create: { code: row.code, name: row.name, symbol: row.symbol || null, decimal_places: parseInt(row.decimal_places || '2', 10), is_active: row.is_active !== 'false', org_id: currencyOrgId },
      });
    }
    console.log(`  ✓ Category groups: ${categoryGroupData.length}, Categories: ${categoryData.length}, Currencies: ${currencyData.length}`);

    // ===== 2.6. SETUP QUICKBOOKS ONLINE ERP CONNECTION =====
    console.log('🔌 Setting up QuickBooks Online ERP connection...');
    if (orgData.length > 0) {
      const orgId = 'org_techflow_us';

      // Extract QuickBooks credentials from environment variables
      const qbClientId = process.env.QUICKBOOKS_CLIENT_ID;
      const qbClientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
      const qbRefreshToken = process.env.QUICKBOOKS_REFRESH_TOKEN;
      const qbRealmId = process.env.QUICKBOOKS_REALM_ID;
      const qbEnvironment = process.env.QUICKBOOKS_ENVIRONMENT || 'production';

      if (qbClientId && qbClientSecret && qbRefreshToken && qbRealmId) {
        // Check if ERP_CONFIG_ENCRYPTION_KEY is set
        if (!process.env.ERP_CONFIG_ENCRYPTION_KEY) {
          console.log('  ⚠️  Warning: ERP_CONFIG_ENCRYPTION_KEY not set. Skipping QuickBooks configuration.');
          console.log('     Set ERP_CONFIG_ENCRYPTION_KEY in environment to enable ERP connection setup.');
        } else {
          try {
            // Prepare connection config (plain object - Prisma middleware will encrypt automatically)
            const connectionConfig = {
              oauth: {
                client_id: qbClientId,
                client_secret: qbClientSecret,
                refresh_token: qbRefreshToken,
                realm_id: qbRealmId,
                environment: qbEnvironment,
              },
            };

            const extractionConfig = buildAirbyteExtractionConfigFromEnv(
              process.env.AIRBYTE_CONNECTION_ID_QUICKBOOKS
            );

            // Prisma middleware automatically encrypts connection_config before saving
            // Check if record exists
            const existing = await prisma.source_system.findFirst({
              where: {
                org_id: orgId,
                system_type: 'quickbooks',
              },
            });

            if (existing) {
              // Update existing record (middleware encrypts automatically)
              await prisma.source_system.update({
                where: { id: existing.id },
                data: {
                  connection_config: connectionConfig as any,
                  ...(extractionConfig ? { extraction_config: extractionConfig as any } : {}),
                  modified_at: new Date(),
                },
              });
              console.log(`  ✓ Updated QuickBooks Online connection for org ${orgId} (id: ${existing.id})`);
              if (extractionConfig) {
                console.log('    ✓ Airbyte extraction_config applied (US demo / QuickBooks)');
              } else {
                console.log(
                  '    ⚠️  Skipping extraction_config: set AIRBYTE_CLIENT_ID, AIRBYTE_CLIENT_SECRET, AIRBYTE_CONNECTION_ID_QUICKBOOKS'
                );
              }
            } else {
              // Insert new record (middleware encrypts automatically)
              const newRecord = await prisma.source_system.create({
                data: {
                  org_id: orgId,
                  system_type: 'quickbooks',
                  name: 'QuickBooks Online Production',
                  connection_config: connectionConfig as any,
                  ...(extractionConfig ? { extraction_config: extractionConfig as any } : {}),
                  is_active: true,
                },
              });
              console.log(`  ✓ Created QuickBooks Online connection for org ${orgId} (id: ${newRecord.id})`);
              if (extractionConfig) {
                console.log('    ✓ Airbyte extraction_config applied (US demo / QuickBooks)');
              } else {
                console.log(
                  '    ⚠️  Skipping extraction_config: set AIRBYTE_CLIENT_ID, AIRBYTE_CLIENT_SECRET, AIRBYTE_CONNECTION_ID_QUICKBOOKS'
                );
              }
            }
          } catch (error) {
            console.error('  ❌ Error setting up QuickBooks Online connection:', error);
            throw error;
          }
        }
      } else {
        console.log('  ⚠️  Warning: QuickBooks Online credentials not found in environment variables.');
        console.log('     Required: QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, QUICKBOOKS_REFRESH_TOKEN, QUICKBOOKS_REALM_ID');
        console.log('     Optional: QUICKBOOKS_ENVIRONMENT (default: production)');
      }
    } else {
      console.log('  ⚠️  Warning: No organizations found. Skipping QuickBooks configuration.');
    }

    // ===== 2.9. LOAD PAYMENT_TERMS FROM CSV (before customers so payment_term_id can be set) =====
    console.log('📋 Loading payment terms from CSV...');
    const paymentTermsData = await loadCsvData(path.join(__dirname, 'payment_terms.csv'));
    for (const row of paymentTermsData) {
      await prisma.payment_terms.upsert({
        where: { id: row.id },
        update: { payment_terms: row.payment_terms, description: row.description, no_of_days: row.no_of_days ? parseInt(row.no_of_days, 10) : null, org_id: row.org_id, legal_entity_id: row.legal_entity_id || null },
        create: { id: row.id, payment_terms: row.payment_terms, description: row.description, no_of_days: row.no_of_days ? parseInt(row.no_of_days, 10) : null, org_id: row.org_id, legal_entity_id: row.legal_entity_id || null },
      });
    }
    console.log(`  ✓ Loaded ${paymentTermsData.length} payment terms`);

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
        payment_term_id: customer.payment_term_id,
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
        payment_term_id: customer.payment_term_id,
      };

      // Only add preferred_currency_id if it exists and is not 'null'
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
      await prisma.supplier.upsert({
        where: { id: supplier.id },
        update: {
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
          payment_term_id: supplier.payment_term_id,
          shipping_term_id: supplier.shipping_term_id,
          shipping_method_id: supplier.shipping_method_id,
          preferred_currency_id: supplier.preferred_currency_id,
        },
        create: {
          id: supplier.id,
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
          payment_term_id: supplier.payment_term_id,
          shipping_term_id: supplier.shipping_term_id,
          shipping_method_id: supplier.shipping_method_id,
          preferred_currency_id: supplier.preferred_currency_id,
        },
      });
    }
    console.log(`  ✓ Loaded ${supplierData.length} suppliers`);

    // ===== 5. LOAD AND INSERT LOCATION DATA =====
    console.log('🏢 Loading location data...');
    const locationData = await loadCsvData(path.join(__dirname, 'locations.csv'));

    for (const location of locationData) {
      const updateData: any = {
        location: location.location,
        address: location.address,
        city: location.city,
        state: location.state,
        country: location.country,
        zip_code: location.zip_code,
        org_id: location.org_id,
        customer_id: location.customer_id,
        legal_entity_id: location.legal_entity_id,
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
        customer_id: location.customer_id,
        legal_entity_id: location.legal_entity_id,
      };

      // Only add optional fields if they exist and are not empty
      if (location.customer_id && typeof location.customer_id === 'string' && location.customer_id.trim() !== '') {
        updateData.customer_id = location.customer_id;
        createData.customer_id = location.customer_id;
      }

      // Temporarily skip legal_entity_id to test the rest of the script
      // if (location.legal_entity_id && location.legal_entity_id.trim() !== '') {
      //   updateData.legal_entity_id = location.legal_entity_id;
      //   createData.legal_entity_id = location.legal_entity_id;
      // }

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
        item_category_id: item.item_category_id || null,
        uom_id: item.uom_id || null,
        tax_master_id: item.tax_master_id || null,
        tax_rate_intra_id: item.tax_rate_intra_id || null,
        org_id: item.org_id,
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
        item_category_id: item.item_category_id || null,
        uom_id: item.uom_id || null,
        tax_master_id: item.tax_master_id || null,
        tax_rate_intra_id: item.tax_rate_intra_id || null,
        org_id: item.org_id,
      };

      // Only add currency_master_id if it exists and is not empty or 'undefined'
      if (item.currency_master_id && typeof item.currency_master_id === 'string' && item.currency_master_id.trim() !== '' && item.currency_master_id.trim() !== 'undefined') {
        updateData.currency_master_id = item.currency_master_id;
        createData.currency_master_id = item.currency_master_id;
      }

      await prisma.item_master.upsert({
        where: { id: item.id },
        update: updateData,
        create: createData,
      });
    }
    console.log(`  ✓ Loaded ${itemData.length} items`);

    // ===== 6.5. LOAD SUPPLIER_ITEMS FROM CSV =====
    console.log('🔗 Loading supplier items...');
    const supplierItemsData = await loadCsvData(path.join(__dirname, 'supplier_items.csv'));
    for (const row of supplierItemsData) {
      await prisma.supplier_items.upsert({
        where: { id: row.id },
        update: { supplier_id: row.supplier_id || null, item_id: row.item_id || null, org_id: row.org_id || null },
        create: { id: row.id, supplier_id: row.supplier_id || null, item_id: row.item_id || null, org_id: row.org_id || null },
      });
    }
    console.log(`  ✓ Loaded ${supplierItemsData.length} supplier_items`);

    // ===== 7. LOAD AND INSERT USER DATA =====
    console.log('👤 Loading user data...');
    const userData = await loadCsvData(path.join(__dirname, 'users.csv'));

    for (const user of userData) {
      const apiKeyHash = await hashStableDemoApiKey(stableUsCaDemoApiKeyPlaintext(user.id));
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
          api_key: apiKeyHash,
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
          api_key: apiKeyHash,
        },
      });
    }
    console.log(`  ✓ Loaded ${userData.length} users (stable X-API-Key per user: fabriq-us-ca-demo-<user_id> — see prisma/demo-stable-api-keys.ts)`);

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

    // ===== 8.5. LOAD BUSINESS_UNIT AND DEPARTMENT FROM CSV =====
    console.log('🏢 Loading business units and departments...');
    const businessUnitData = await loadCsvData(path.join(__dirname, 'business_unit.csv'));
    for (const row of businessUnitData) {
      await prisma.business_unit.upsert({
        where: { id: row.id },
        update: { business_unit: row.business_unit || null, name: row.name || null, legal_entity_id: row.legal_entity_id || null, status: row.status || null, created_by: row.created_by, org_id: row.org_id || null },
        create: { id: row.id, business_unit: row.business_unit || null, name: row.name || null, legal_entity_id: row.legal_entity_id || null, status: row.status || null, created_by: row.created_by, org_id: row.org_id || null },
      });
    }
    const departmentData = await loadCsvData(path.join(__dirname, 'department.csv'));
    for (const row of departmentData) {
      await prisma.department.upsert({
        where: { id: row.id },
        update: { name: row.name, legal_entity_id: row.legal_entity_id, business_unit_id: row.business_unit_id || null, org_id: row.org_id || null },
        create: { id: row.id, name: row.name, legal_entity_id: row.legal_entity_id, business_unit_id: row.business_unit_id || null, org_id: row.org_id || null },
      });
    }
    console.log(`  ✓ Business units: ${businessUnitData.length}, Departments: ${departmentData.length}`);

    // ===== 8.6. LOAD BUDGET_PERIOD, BUDGET_LINE, GENERAL_LEDGER, PROJECT_MASTER =====
    const createdByUser = userData.length > 0 ? userData[0].id : 'system';
    const demoAccountForBudget = await prisma.account.findFirst({
      where: { org_id: 'org_techflow_us', legal_entity_id: 'org_techflow_us' },
    });
    console.log('📊 Loading budget periods, budget lines, general ledger, and projects...');
    const budgetPeriodData = await loadCsvData(path.join(__dirname, 'budget_period.csv'));
    for (const row of budgetPeriodData) {
      const fromDate = row.from_date ? new Date(row.from_date) : null;
      const toDate = row.to_date ? new Date(row.to_date) : null;
      await prisma.budget_period.upsert({
        where: { id: row.id },
        update: {
          budget_period: row.budget_period || null,
          from_date: fromDate,
          to_date: toDate,
          status: row.status || null,
          created_by: createdByUser,
          org_id: row.org_id || null,
          account_id: demoAccountForBudget?.id ?? undefined,
        },
        create: {
          id: row.id,
          budget_period: row.budget_period || null,
          from_date: fromDate,
          to_date: toDate,
          status: row.status || null,
          created_by: createdByUser,
          org_id: row.org_id || null,
          account_id: demoAccountForBudget?.id ?? undefined,
        },
      });
    }
    const budgetLineData = await loadCsvData(path.join(__dirname, 'budget_line.csv'));
    for (const row of budgetLineData) {
      const bpStart = row.bp_start_date ? new Date(row.bp_start_date) : null;
      const bpEnd = row.bp_end_date ? new Date(row.bp_end_date) : null;
      await prisma.budget_line.upsert({
        where: { id: row.id },
        update: {
          budget_line: row.budget_line || null,
          budget_period_id: row.budget_period_id || null,
          bp_start_date: bpStart,
          bp_end_date: bpEnd,
          allocated_budget: parseFloat(row.allocated_budget),
          created_by: createdByUser,
          org_id: row.org_id,
        },
        create: {
          id: row.id,
          budget_line: row.budget_line || null,
          budget_period_id: row.budget_period_id || null,
          bp_start_date: bpStart,
          bp_end_date: bpEnd,
          allocated_budget: parseFloat(row.allocated_budget),
          created_by: createdByUser,
          org_id: row.org_id,
        },
      });
    }
    const generalLedgerData = await loadCsvData(path.join(__dirname, 'general_ledger.csv'));
    for (const row of generalLedgerData) {
      await prisma.general_ledger.upsert({
        where: { id: row.id },
        update: {
          gl_number: row.gl_number || null,
          gl_code: parseInt(row.gl_code, 10),
          gl_name: row.gl_name,
          description: row.description,
          account_id: (demoAccountForBudget?.id ?? row.account_id) || null,
          legal_entity_id: 'org_techflow_us',
          status: row.status || null,
          created_by: createdByUser,
          org_id: row.org_id || null,
        },
        create: {
          id: row.id,
          gl_number: row.gl_number || null,
          gl_code: parseInt(row.gl_code, 10),
          gl_name: row.gl_name,
          description: row.description,
          account_id: (demoAccountForBudget?.id ?? row.account_id) || null,
          legal_entity_id: 'org_techflow_us',
          status: row.status || null,
          created_by: createdByUser,
          org_id: row.org_id || null,
        },
      });
    }
    const projectMasterData = await loadCsvData(path.join(__dirname, 'project_master.csv'));
    for (const row of projectMasterData) {
      const projStart = row.project_start_date ? new Date(row.project_start_date) : null;
      const projEnd = row.project_end_date ? new Date(row.project_end_date) : null;
      await prisma.project_master.upsert({
        where: { id: row.id },
        update: {
          project_code: row.project_code || null,
          project_name: row.project_name || null,
          legal_entity_id: row.legal_entity_id || null,
          project_start_date: projStart,
          project_end_date: projEnd,
          budget_line_id: row.budget_line_id || null,
          account_id: demoAccountForBudget?.id ?? undefined,
          created_by: createdByUser,
          org_id: row.org_id || null,
        },
        create: {
          id: row.id,
          project_code: row.project_code || null,
          project_name: row.project_name || null,
          legal_entity_id: row.legal_entity_id || null,
          project_start_date: projStart,
          project_end_date: projEnd,
          budget_line_id: row.budget_line_id || null,
          account_id: demoAccountForBudget?.id ?? undefined,
          created_by: createdByUser,
          org_id: row.org_id || null,
        },
      });
    }
    console.log(`  ✓ Budget periods: ${budgetPeriodData.length}, Budget lines: ${budgetLineData.length}, General ledger: ${generalLedgerData.length}, Projects: ${projectMasterData.length}`);

    // ===== 8.7. LOAD EMPLOYEE_MASTER (resolve role by role_name) =====
    console.log('👥 Loading employee master...');
    const employeeMasterData = await loadCsvData(path.join(__dirname, 'employee_master.csv'));
    for (const row of employeeMasterData) {
      const role = await prisma.role.findFirst({ where: { name: row.role_name } });
      if (!role) {
        console.warn(`  ⚠️  Role "${row.role_name}" not found, skipping employee ${row.id}`);
        continue;
      }
      await prisma.employee_master.upsert({
        where: { id: row.id },
        update: {
          first_name: row.first_name,
          last_name: row.last_name || null,
          email: row.email,
          legal_entity_id: row.legal_entity_id,
          business_unit_id: row.business_unit_id || null,
          user_id: row.user_id,
          user_role_id: role.id,
          manager: row.manager,
          location_id: row.location_id,
          cost_center_id: row.cost_center_id,
          department_id: row.department_id,
          org_id: row.org_id,
        },
        create: {
          id: row.id,
          first_name: row.first_name,
          last_name: row.last_name || null,
          email: row.email,
          legal_entity_id: row.legal_entity_id,
          business_unit_id: row.business_unit_id || null,
          user_id: row.user_id,
          user_role_id: role.id,
          manager: row.manager,
          location_id: row.location_id,
          cost_center_id: row.cost_center_id,
          department_id: row.department_id,
          org_id: row.org_id,
        },
      });
    }
    console.log(`  ✓ Employee master: ${employeeMasterData.length} records`);

    // ===== 9. SUMMARY =====
    console.log('');
    console.log('✅ US-CA Demo Data Setup Complete!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   🏢 Organizations: ${orgData.length}`);
    console.log(`   🏢 Business Orgs: ${organizationData.length}`);
    console.log(`   💰 Chart of Accounts: Set up for ${organizationData.length} organizations`);
    if (orgData.length > 0 && process.env.QUICKBOOKS_CLIENT_ID && process.env.QUICKBOOKS_CLIENT_SECRET && process.env.QUICKBOOKS_REFRESH_TOKEN && process.env.QUICKBOOKS_REALM_ID && process.env.ERP_CONFIG_ENCRYPTION_KEY) {
      console.log(`   🔌 QuickBooks Online: Connection configured for org ${orgData[0].id}`);
    }
    console.log(`   👥 Customers: ${customerData.length}`);
    console.log(`   🏭 Suppliers: ${supplierData.length}`);
    console.log(`   🏢 Locations: ${locationData.length}`);
    console.log(`   📦 Items: ${itemData.length}`);
    console.log(`   🔗 Supplier items: ${supplierItemsData.length}`);
    console.log(`   📋 Masters: Shipping (${shippingMethodData.length}), Shipping terms (${shippingTermsData.length}), Tax (${taxMasterData.length}), Item categories (${itemCategoryData.length}), UOM (${uomData.length}), Cost centers (${costCenterData.length}), Business units (${businessUnitData.length}), Departments (${departmentData.length})`);
    console.log(`   📂 Category groups: ${categoryGroupData.length}, Categories: ${categoryData.length}, Currencies: ${currencyData.length}`);
    console.log(`   📊 Budget periods: ${budgetPeriodData.length}, Budget lines: ${budgetLineData.length}, General ledger: ${generalLedgerData.length}, Projects: ${projectMasterData.length}, Employee master: ${employeeMasterData.length}`);
    console.log(`   👤 Users: ${userData.length}`);
    console.log(`   🔗 Role Assignments: ${roleUserData.length}`);
    console.log(`   📋 Payment terms: ${paymentTermsData.length}`);
    console.log('');
    console.log('🎯 Demo Users Available:');
    console.log('   Super Admin: daniel.lee@techflowsolutions.com (Password: Metalimits@123)');
    console.log('   Admin: david.brown@techflowsolutions.com, joseph.young@techflowsolutions.com');
    console.log('   Finance Team: sarah.johnson@techflowsolutions.com, jessica.garcia@techflowsolutions.com, samantha.clark@techflowsolutions.com, ashley.king@techflowsolutions.com');
    console.log('   Buyers: john.smith@techflowsolutions.com, emily.wilson@techflowsolutions.com, olivia.rodriguez@techflowsolutions.com, madison.hall@techflowsolutions.com');
    console.log('   Delivery Team: michael.davis@techflowsolutions.com, christopher.martinez@techflowsolutions.com, anthony.white@techflowsolutions.com, andrew.wright@techflowsolutions.com');
    console.log('   Employees: All users have Employee role');
    console.log('');
    console.log('🇺🇸 Ready for US-CA demo scenarios!');

  } catch (error) {
    console.error('❌ Failed to setup US-CA demo data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  setupUsCaDemoData()
    .then(() => {
      console.log('🎉 US-CA demo data setup completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Setup failed:', error);
      process.exit(1);
    });
}

export { setupUsCaDemoData };
