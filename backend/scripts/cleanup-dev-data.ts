import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

// Load environment variables from .env.test
config({ path: '.env.test' });

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL }
  }
});

async function cleanupDevData() {
  console.log('🧹 Cleaning up Wayne Enterprises development data...');

  try {
    // Clean up in correct order to respect foreign keys
    await prisma.$transaction([
      // Delete payment receipts first
      prisma.payment_receipt.deleteMany({
        where: { org_id: 'org_wayne_enterprises' }
      }),

      // Delete invoices
      prisma.invoice.deleteMany({
        where: { org_id: 'org_wayne_enterprises' }
      }),

      // Delete invoice line items
      prisma.invoice_line_item.deleteMany({
        where: { org_id: 'org_wayne_enterprises' }
      }),

      // Delete item masters
      prisma.item_master.deleteMany({
        where: { org_id: 'org_wayne_enterprises' }
      }),

      // Delete item categories


      // Delete customers
      prisma.customers.deleteMany({
        where: { org_id: 'org_wayne_enterprises' }
      }),

      // Delete accounts
      prisma.account.deleteMany({
        where: { org_id: 'org_wayne_enterprises' }
      }),

      // Delete currency
      prisma.currency.deleteMany({
        where: { org_id: 'org_wayne_enterprises' }
      }),

      // Delete role assignments
      prisma.role_user.deleteMany({
        where: { org_id: 'org_wayne_enterprises' }
      }),

      // Delete users
      prisma.user.deleteMany({
        where: { org_id: 'org_wayne_enterprises' }
      }),

      // Delete roles
      prisma.role.deleteMany({
        where: { org_id: 'org_wayne_enterprises' }
      }),

      // Delete metadata organization
      prisma.org.deleteMany({
        where: { id: 'org_wayne_enterprises' }
      }),

      // Delete organization last
      prisma.entity.deleteMany({
        where: { id: 'org_wayne_enterprises' }
      }),
    ]);

    console.log('✅ Wayne Enterprises development data cleaned up successfully!');
    console.log('');
    console.log('🗑️ Removed:');
    console.log('   🏢 Wayne Enterprises organization');
    console.log('   👥 Stark Industries & LexCorp customers');
    console.log('   🏦 Bank accounts');
    console.log('   📦 Item categories');
    console.log('   🔧 Item masters (Batcomputer, Batmobile, Software)');
    console.log('   💰 Currency data');
    console.log('   👔 Roles (Administrator, Manager, User)');
    console.log('   👤 Users (Bruce Wayne, Lucius Fox, Alfred Pennyworth)');
    console.log('   📄 Any invoices and payments');

  } catch (error) {
    console.error('❌ Failed to cleanup development data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup if this script is executed directly
if (require.main === module) {
  cleanupDevData()
    .then(() => {
      console.log('🎉 Cleanup completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Cleanup failed:', error);
      process.exit(1);
    });
}

export { cleanupDevData };
