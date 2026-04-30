/// <reference types="node" />
import { PrismaClient } from '@prisma/client';
import { setupChartOfAccounts } from '../src/utils/setup/setupChartOfAccounts';

const defaultPrisma = new PrismaClient();

if (require.main === module) {
  const orgId = process.argv[2];
  if (!orgId) {
    console.error('❌ Usage: npx ts-node setup-chart-of-accounts.ts <org_id>');
    console.error('   Example: npx ts-node setup-chart-of-accounts.ts org_12345');
    process.exit(1);
  }

  setupChartOfAccounts(orgId, 'legalEntityId')
    .then(() => {
      console.log('🎉 Chart of accounts setup completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Setup failed:', error);
      process.exit(1);
    })
    .finally(() => {
      defaultPrisma.$disconnect();
    });
}

export { setupChartOfAccounts };
