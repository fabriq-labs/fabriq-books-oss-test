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

async function setupNRIDemoData() {
  console.log('🏠 Setting up NRI Personal Finance Data (Rajesh Kumar)...');
  console.log('');

  try {
    // ===== 1. LOAD AND INSERT ORG DATA (TENANT) =====
    console.log('🏢 Loading tenant (org) data...');
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
          erp_system_type: org.erp_system_type || null,
        },
        create: {
          id: org.id,
          name: org.name,
          slug: org.slug,
          settings: org.settings || '{}',
          external_mapping: org.external_mapping ? JSON.parse(org.external_mapping) : {},
          active_subscription: org.active_subscription === 'true',
          erp_system_type: org.erp_system_type || null,
        },
      });
    }
    console.log(`  ✓ Loaded ${orgData.length} tenant(s)`);

    // ===== 2. LOAD AND INSERT ORGANIZATION DATA (LEGAL ENTITIES) =====
    console.log('🏢 Loading organization (legal entity) data...');
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
        website: org.website || null,
        is_it_headquartres: org.is_it_headquartres,
        is_it_a_groupcompany: org.is_it_a_groupcompany,
        group_company_name: org.group_company_name || null,
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
        website: org.website || null,
        is_it_headquartres: org.is_it_headquartres,
        is_it_a_groupcompany: org.is_it_a_groupcompany,
        group_company_name: org.group_company_name || null,
        org_id: org.org_id,
      };

      // Only set basecurrency_id when present (must reference existing currency_master.id)
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
    console.log(`  ✓ Loaded ${organizationData.length} organization(s)`);

    // ===== 3. SETUP CHART OF ACCOUNTS FOR EACH ORGANIZATION =====
    console.log('💰 Setting up chart of accounts for organizations...');

    // Map legal entity IDs to their respective chart of accounts and currency
    const chartOfAccountsMap: Record<string, string> = {
      'org_rajesh_canada': path.join(__dirname, 'chart-of-accounts-canada.json'),
      'org_rajesh_india': path.join(__dirname, 'chart-of-accounts-india.json'),
    };
    const currencyMap: Record<string, string> = {
      'org_rajesh_canada': 'CAD',
      'org_rajesh_india': 'INR',
    };

    for (const org of organizationData) {
      const coaPath = chartOfAccountsMap[org.id];
      const currency = currencyMap[org.id] ?? 'USD';
      if (coaPath) {
        console.log(`  Setting up accounts for ${org.organization_name} (${currency})...`);
        await setupChartOfAccounts('org_rajesh', org.id, coaPath, currency);
      } else {
        console.log(`  ⚠️  No chart of accounts found for ${org.id}, skipping...`);
      }
    }
    console.log(`  ✓ Set up chart of accounts for ${organizationData.length} organization(s)`);

    // ===== 4. LOAD AND INSERT USER DATA =====
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
    console.log(`  ✓ Loaded ${userData.length} user(s)`);

    // ===== 5. LOAD AND INSERT ROLE-USER DATA =====
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
    console.log(`  ✓ Loaded ${roleUserData.length} role-user assignment(s)`);

    // ===== 6. SUMMARY =====
    console.log('');
    console.log('✅ NRI Personal Finance Data Setup Complete!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   🏢 Tenant: ${orgData.length} (Rajesh Kumar)`);
    console.log(`   🏠 Organizations (Legal Entities): ${organizationData.length}`);
    console.log(`      - Rajesh (Canada) - Toronto, Ontario (CAD accounts: RRSP, TFSA, GICs, etc.)`);
    console.log(`      - Rajesh (India) - Chennai, Tamil Nadu (INR accounts: PPF, EPF, NPS, FDs, etc.)`);
    console.log(`   💰 Chart of Accounts: Country-specific accounts per legal entity`);
    console.log(`   👤 Users: ${userData.length}`);
    console.log(`   🔗 Role Assignments: ${roleUserData.length}`);
    console.log('');
    console.log('🔐 Login Credentials:');
    console.log('   Email: rajesh.kumar@metalimits.com');
    console.log('   Password: Metalimits@123');
    console.log('');
    console.log('🏠 Ready for NRI personal finance management!');

  } catch (error) {
    console.error('❌ Failed to setup NRI demo data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  setupNRIDemoData()
    .then(() => {
      console.log('🎉 NRI demo data setup completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Setup failed:', error);
      process.exit(1);
    });
}

export { setupNRIDemoData };
