import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import {
  hashStableDemoApiKey,
  stableMetadataAdminApiKeyPlaintext,
} from './demo-stable-api-keys';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { applyDatabaseViews } from './apply-database-views';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('🚀 Setting up metadata (roles, views, permissions, users)...');
    console.log('');

    // ===== 1. IMPORT METADATA =====
    const viewsDir = join(__dirname, 'metadata', 'views');
    const hasJsonFiles = existsSync(viewsDir) &&
      readdirSync(viewsDir).some(file => file.endsWith('.json'));

    // Import views and prompt templates from JSON files if available (preferred method)
    if (hasJsonFiles) {
      console.log('');
      console.log('📥 Importing views and prompt templates from JSON files...');
      try {
        // Import and run sync-metadata script (this syncs both views and prompt templates)
        const { main: syncMetadata } = await import('./sync-metadata');
        await syncMetadata();
        console.log('  ✓ Imported views and prompt templates from JSON files');
      } catch (error) {
        console.error('  ⚠️  Error importing from JSON files:', error);
        throw error;
      }
    }

    // Always import roles, permissions, and role_view from SQL file
    console.log('📥 Importing roles, permissions, and role_view from SQL file...');
    try {
      const sqlFilePath = join(__dirname, 'metadata-tables.sql');
      const schemaPath = join(__dirname, 'schema');
      console.log('  Executing SQL file with prisma db execute...');
      execSync(`npx prisma db execute --schema "${schemaPath}" --file "${sqlFilePath}"`, {
        stdio: 'inherit'
      });

      console.log('  ✓ Imported roles, permissions, and role_view assignments');
    } catch (error) {
      console.error('  ⚠️  Error importing from SQL file:', error);
      throw error;
    }

    // Reporting views (account_hierarchy, account_balances, v_posting_legs, ...)
    console.log('');
    console.log('📐 Applying database reporting views...');
    applyDatabaseViews();

    // Get the roles we need for creating the admin user
    const superAdminRole = await prisma.role.findUnique({ where: { name: 'Super Admin' } });
    if (!superAdminRole) {
      throw new Error('Super Admin role not found after import');
    }

    // ===== 6. CREATE INITIAL ADMIN USER =====
    console.log('');
    console.log('👤 Creating initial admin user...');
    const hashedPassword = await hash('admin123', 10);
    const adminApiKeyHash = await hashStableDemoApiKey(stableMetadataAdminApiKeyPlaintext());
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@example.com' },
      update: {
        name: 'System Admin',
        external_id: 'admin-1',
        auth_provider: 'local',
        password: hashedPassword,
        api_key: adminApiKeyHash,
      },
      create: {
        email: 'admin@example.com',
        name: 'System Admin',
        external_id: 'admin-1',
        auth_provider: 'local',
        password: hashedPassword,
        api_key: adminApiKeyHash,
        role_users: {
          create: {
            role_id: superAdminRole.id,
          },
        },
      },
    });
    console.log(`  ✓ Admin user: ${adminUser.email} (password: admin123)`);
    console.log(`  ✓ Admin stable X-API-Key plaintext: ${stableMetadataAdminApiKeyPlaintext()} (see prisma/demo-stable-api-keys.ts)`);

    console.log('');
    // Get summary counts
    const roleCount = await prisma.role.count();
    const viewCount = await prisma.view.count();
    const permissionCount = await prisma.permission.count();
    const roleViewCount = await prisma.role_view.count();
    const promptTemplateCount = await prisma.prompt_template.count();

    console.log('✅ Metadata setup complete!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   👔 Roles: ${roleCount} imported`);
    console.log(`   👁️ Views: ${viewCount} imported`);
    console.log(`   🔐 Permissions: ${permissionCount} imported`);
    console.log(`   🔗 Role-View Assignments: ${roleViewCount} imported`);
    console.log(`   📝 Prompt Templates: ${promptTemplateCount} imported`);
    console.log(`   👤 Users: 1 admin user created`);

  } catch (error) {
    console.error('❌ Error in metadata setup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export { main };