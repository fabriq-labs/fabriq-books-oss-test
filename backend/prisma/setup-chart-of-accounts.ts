import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

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

async function setupChartOfAccounts(orgId: string, legalEntityId: string, templatePath?: string, currency: string = 'USD') {
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

  // Track created accounts for parent-child relationships
  const createdAccounts: Map<string, CreatedAccount> = new Map();

  // Recursive function to create accounts depth-first (parents first)
  async function createAccount(
    template: AccountTemplate,
    parentId?: string
  ): Promise<string> {
    // Create unique key for upsert - prefer org_id + code, fallback to org_id + name
    const uniqueKey = template.code
      ? `${legalEntityId}-${template.code}`
      : `${legalEntityId}-${template.name}`;

    // Check if account already exists
    const existingAccount = await prisma.account.findFirst({
      where: {
        org_id: orgId,
        legal_entity_id: legalEntityId,
        OR: [
          template.code ? { code: template.code } : {},
          { name: template.name }
        ].filter(condition => Object.keys(condition).length > 0)
      }
    });

    if (existingAccount) {
      console.log(`   ✓ Account exists: ${template.name} (${template.code || 'no code'})`);
      createdAccounts.set(uniqueKey, {
        id: existingAccount.id,
        name: existingAccount.name,
        classification: existingAccount.classification as AccountClassification,
        code: existingAccount.code || undefined
      });
      return existingAccount.id;
    }

    // Create the account (we've already verified it doesn't exist above)
    const deterministicId = `acco_${uniqueKey.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const newAccount = await prisma.account.create({
      data: {
        id: deterministicId,
        name: template.name,
        classification: template.classification as any,
        type: template.types,
        code: template.code,
        parent_account_id: parentId,
        org_id: orgId,
        legal_entity_id: legalEntityId,
        currency,
        is_active: true,
        created_at: new Date(),
        modified_at: new Date()
      }
    });

    console.log(`   ✓ Created account: ${template.name} (${template.code || 'no code'})`);

    // Store for parent-child relationships
    createdAccounts.set(uniqueKey, {
      id: newAccount.id,
      name: newAccount.name,
      classification: newAccount.classification as AccountClassification,
      code: newAccount.code || undefined
    });

    return newAccount.id;
  }

  // Recursive function to process the hierarchy
  async function processAccountHierarchy(
    templates: AccountTemplate[],
    parentId?: string
  ): Promise<void> {
    for (const template of templates) {
      // Create parent account first
      const accountId = await createAccount(template, parentId);

      // Then create children recursively
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
  console.log(`   Total accounts: ${totalAccounts}`);

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
  return createdAccounts;
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
      prisma.$disconnect();
    });
}

export { setupChartOfAccounts };
