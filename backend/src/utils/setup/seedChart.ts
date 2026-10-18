/**
 * Seed a geo chart of accounts onto an organization.
 *
 *   npm run seed:coa -- us-ca
 *   npm run seed:coa -- india
 *   npm run seed:coa -- us-ca org_kernel
 *
 * Run after setup:kernel. The default organization is org_kernel.
 */
import prisma from '../../lib/prisma';
import { seedChartOfAccounts } from '../../../lib/gl/seedChart';

const DEFAULT_ORG = 'org_kernel';

async function main() {
  const geo = process.argv[2];
  const orgId = process.argv[3] || DEFAULT_ORG;
  const result = await seedChartOfAccounts(geo, orgId);
  console.log(`Chart ${result.geo} on ${result.orgId}`);
  console.log(`  currency ${result.currencyCode} (${result.currencyId})`);
  console.log(`  accounts ${result.total} (created ${result.created}, existing ${result.existing})`);
  for (const [classification, count] of Object.entries(result.byClassification)) {
    if (count > 0) console.log(`  ${classification}: ${count}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
