import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const defaultPrisma = new PrismaClient();

interface AccountTemplate {
  name: string;
  classification: AccountClassification;
  types: string[];
  code?: string;
  children?: AccountTemplate[];
}

type AccountClassification = 'Assets' | 'Liabilities' | 'Income' | 'Expense' | 'Equity';

interface CreatedAccount {
  id: string;
  name: string | null;
  classification: AccountClassification | null;
  code?: string | null;
}

export interface SetupChartOfAccountsResult {
  accounts: Map<string, CreatedAccount>;
  created: number;
  existing: number;
}

async function setupChartOfAccounts(
  orgId: string,
  legalEntityId: string,
  templatePath?: string,
  currency: string = 'USD',
  prisma: PrismaClient = defaultPrisma
): Promise<SetupChartOfAccountsResult> {
  console.log('💰 Setting up Chart of Accounts...');
  console.log(`   Organization: ${orgId}`);
  console.log(`   Legal Entity: ${legalEntityId}`);
  console.log(`   Currency: ${currency}`);

  // Default template path
  const defaultTemplatePath = path.join(__dirname, 'setup-US_CA', 'chart-of-accounts.json');
  const chartOfAccountsPath = templatePath || defaultTemplatePath;

  // Read the chart of accounts template
  const templateData: AccountTemplate[] = JSON.parse(
    fs.readFileSync(chartOfAccountsPath, 'utf8')
  );

  console.log(`   Template loaded: ${templateData.length} top-level accounts`);

  // FK uses currency.id; `code` is unique on currency (ISO 4217).
  const currencyCode = currency.trim().toUpperCase();
  const resolvedCurrency = await prisma.currency.findUnique({
    where: { code: currencyCode }
  });
  if (!resolvedCurrency) {
    console.warn(
      `   ⚠ No currency row with code ${currencyCode}; accounts will be created without base_currency_id`
    );
  }

  // Track created accounts for parent-child relationships
  const createdAccounts: Map<string, CreatedAccount> = new Map();
  let createdCount = 0;
  let existingCount = 0;

  // Recursive function to upsert accounts depth-first (parents first)
  async function createAccount(
    template: AccountTemplate,
    parentId?: string
  ): Promise<string> {
    // Deterministic ID encodes the composite key (legalEntityId + code/name)
    const uniqueKey = template.code
      ? `${legalEntityId}-${template.code}`
      : `${legalEntityId}-${template.name}`;
    const deterministicId = `acco_${uniqueKey.replace(/[^a-zA-Z0-9]/g, '_')}`;

    const alreadyExists = !!(await prisma.account.findUnique({
      where: { id: deterministicId },
      select: { id: true },
    }));

    const account = await prisma.account.upsert({
      where: { id: deterministicId },
      create: {
        id: deterministicId,
        name: template.name,
        classification: template.classification as any,
        type: template.types,
        code: template.code,
        parent_account_id: parentId,
        org_id: orgId,
        legal_entity_id: legalEntityId,
        base_currency_id: resolvedCurrency?.id ?? null,
        is_active: true,
        created_at: new Date(),
        modified_at: new Date(),
      },
      update: {
        name: template.name,
        classification: template.classification as any,
        type: template.types,
        code: template.code,
        parent_account_id: parentId,
        base_currency_id: resolvedCurrency?.id ?? null,
        modified_at: new Date(),
      },
    });

    if (alreadyExists) {
      console.log(`   ✓ Account exists: ${template.name} (${template.code || 'no code'})`);
      existingCount++;
    } else {
      console.log(`   ✓ Created account: ${template.name} (${template.code || 'no code'})`);
      createdCount++;
    }

    createdAccounts.set(uniqueKey, {
      id: account.id,
      name: account.name,
      classification: account.classification as AccountClassification,
      code: account.code || undefined,
    });

    return account.id;
  }

  // Recursive function to process the hierarchy
  async function processAccountHierarchy(
    templates: AccountTemplate[],
    parentId?: string
  ): Promise<void> {
    for (const template of templates) {
      const accountId = await createAccount(template, parentId);
      if (template.children && template.children.length > 0) {
        await processAccountHierarchy(template.children, accountId);
      }
    }
  }

  // Process all top-level accounts
  await processAccountHierarchy(templateData);

  // Summary
  const totalAccounts = createdAccounts.size;
  console.log('');
  console.log('📊 Chart of Accounts Setup Complete!');
  console.log(`   Total accounts: ${totalAccounts} (created: ${createdCount}, existing: ${existingCount})`);

  // Show breakdown by classification
  const classificationCounts: Record<string, number> = {};
  for (const account of Array.from(createdAccounts.values())) {
    if (account.classification) {
      classificationCounts[account.classification] = (classificationCounts[account.classification] || 0) + 1;
    }
  }

  console.log('   Breakdown by classification:');
  Object.entries(classificationCounts).forEach(([classification, count]) => {
    console.log(`     ${classification}: ${count} accounts`);
  });

  console.log('');
  return { accounts: createdAccounts, created: createdCount, existing: existingCount };
}

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
