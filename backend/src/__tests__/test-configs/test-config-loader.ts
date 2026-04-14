import * as fs from 'fs';
import * as path from 'path';

export interface TestConfig {
  name: string;
  orgId: string;
  userId: string;
  buyerUserId: string;
  customerId: string;
  supplierId: string;
  items: {
    zohoProductName: string;
    quickbooksProductName: string;
    productA: string;
    serviceB: string;
    productC: string;
  };
  locationId: string;
  currency: string;
  description: string;
}

const CONFIG_DIR = path.join(__dirname);

/**
 * Load test configuration based on environment variable or default
 * Set TEST_CONFIG environment variable to:
 * - 'indian-demo' for Indian demo data
 * - 'us-ca-demo' for US-CA demo data
 * - defaults to 'indian-demo' if not set
 */
export function loadTestConfig(): TestConfig {
  const configName = process.env.TEST_CONFIG || 'indian-demo';
  const configFile = `${configName}-config.json`;
  const configPath = path.join(CONFIG_DIR, configFile);

  if (!fs.existsSync(configPath)) {
    throw new Error(`Test config file not found: ${configPath}. Available configs: indian-demo, us-ca-demo`);
  }

  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent) as TestConfig;

    console.log(`\n📋 Loaded test configuration: ${config.name}`);
    console.log(`   ${config.description}`);
    console.log(`   Org: ${config.orgId}, User: ${config.userId}, Customer: ${config.customerId}`);
    console.log(`   Currency: ${config.currency}\n`);

    return config;
  } catch (error) {
    throw new Error(`Failed to load test config from ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get test context using loaded configuration
 */
export function createTestContext(config: TestConfig) {
  return {
    user: {
      id: config.userId,
      org_id: config.orgId,
      email: `${config.userId}@example.com`, // Fallback email
      name: config.userId.replace('user_', '').replace('_', ' ').toUpperCase()
    },
    org: {
      id: config.orgId
    }
  };
}

/** Invoice / PO workflows assign Draft/Submit to Buyer; primary test user is often not a buyer. */
export function createInvoiceWorkflowActorContext(config: TestConfig) {
  return {
    user: {
      id: config.buyerUserId,
      org_id: config.orgId,
      email: `${config.buyerUserId}@example.com`,
      name: config.buyerUserId.replace('user_', '').replace('_', ' ').toUpperCase(),
    },
    org: { id: config.orgId },
  };
}

/**
 * Validate that the loaded config has all required data in the database
 * This should be called in beforeAll() to ensure test data exists
 */
export async function validateTestData(config: TestConfig, prisma: any) {
  const validations = [
    { name: 'Entity', id: config.orgId, table: 'entity' },
    { name: 'User', id: config.userId, table: 'user' },
    { name: 'Buyer user (workflow actor)', id: config.buyerUserId, table: 'user' },
    { name: 'Customer', id: config.customerId, table: 'customers' },
    { name: 'Supplier', id: config.supplierId, table: 'supplier' },
    { name: 'Location', id: config.locationId, table: 'location' },
    { name: 'Item A', id: config.items.productA, table: 'item_master' },
    { name: 'Item B', id: config.items.serviceB, table: 'item_master' },
    { name: 'Item C', id: config.items.productC, table: 'item_master' }
  ];

  const missing: string[] = [];

  for (const validation of validations) {
    try {
      let exists = false;

      switch (validation.table) {
        case 'entity':
          exists = !!(await prisma.entity.findUnique({ where: { id: validation.id } }));
          break;
        case 'user':
          exists = !!(await prisma.user.findUnique({ where: { id: validation.id } }));
          break;
        case 'customers':
          exists = !!(await prisma.customers.findUnique({ where: { id: validation.id } }));
          break;
        case 'supplier':
          exists = !!(await prisma.supplier.findUnique({ where: { id: validation.id } }));
          break;
        case 'location':
          exists = !!(await prisma.location.findUnique({ where: { id: validation.id } }));
          break;
        case 'item_master':
          exists = !!(await prisma.item_master.findUnique({ where: { id: validation.id } }));
          break;
        default:
          exists = false;
      }

      if (!exists) {
        missing.push(`${validation.name} (${validation.id})`);
      }
    } catch (error) {
      missing.push(`${validation.name} (${validation.id}) - Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (missing.length > 0) {
    const setupCommand = config.orgId.includes('techflow') ?
      'cd prisma/setup-US_CA && npx ts-node setup-us-ca-demo.ts' :
      'npx ts-node prisma/setup-test-data.ts';

    throw new Error(`\n❌ Missing test data!\n\nMissing entities: ${missing.join(', ')}\n\nPlease run: ${setupCommand}\n\nOr set TEST_CONFIG environment variable to match your setup.\n`);
  }

  console.log('✅ All test data validated successfully');
}

/** Parsed workflow_action.side_effects.effects[] entry (database JSON). */
type WorkflowDbEffect = {
  type?: string;
  config?: { method?: string };
};

/**
 * Ensure Invoice Approval workflow runs ledger side effects (SALES submit / reject).
 * Idempotent: safe for DBs created before these effects were added to setup-workflows.
 */
export async function ensureInvoiceWorkflowLedgerSideEffects(prisma: {
  workflow_flow: { findFirst: (args: unknown) => Promise<{ id: string } | null> };
  workflow_state: { findFirst: (args: unknown) => Promise<{ id: string } | null> };
  workflow_action: {
    findFirst: (args: unknown) => Promise<{ id: string; side_effects: unknown } | null>;
    update: (args: unknown) => Promise<unknown>;
  };
}): Promise<void> {
  const flow = await prisma.workflow_flow.findFirst({
    where: { model_name: 'invoice', name: 'Invoice Approval' },
  });
  if (!flow) return;

  const draftState = await prisma.workflow_state.findFirst({
    where: { flow_id: flow.id, name: 'Draft' },
  });
  const submittedState = await prisma.workflow_state.findFirst({
    where: { flow_id: flow.id, name: 'Submitted' },
  });
  if (!draftState || !submittedState) return;

  const submitAction = await prisma.workflow_action.findFirst({
    where: { source_state_id: draftState.id, name: 'Submit' },
  });
  if (submitAction?.side_effects && typeof submitAction.side_effects === 'object') {
    const se = submitAction.side_effects as { effects?: unknown[] };
    const effects: WorkflowDbEffect[] = Array.isArray(se.effects) ? [...se.effects] as WorkflowDbEffect[] : [];
    if (!effects.some((e) => e?.config?.method === 'create_sales_invoice_posting')) {
      const afterCalc = effects.findIndex((e) => e?.config?.method === 'calculate_invoice_total');
      const insertAt = afterCalc >= 0 ? afterCalc + 1 : effects.length;
      effects.splice(insertAt, 0, {
        type: 'database',
        config: { method: 'create_sales_invoice_posting' },
      });
      await prisma.workflow_action.update({
        where: { id: submitAction.id },
        data: { side_effects: { effects } },
      });
    }
  }

  const rejectAction = await prisma.workflow_action.findFirst({
    where: { source_state_id: submittedState.id, name: 'Reject' },
  });
  if (rejectAction?.side_effects && typeof rejectAction.side_effects === 'object') {
    const se = rejectAction.side_effects as { effects?: unknown[] };
    const effects: WorkflowDbEffect[] = Array.isArray(se.effects) ? [...se.effects] as WorkflowDbEffect[] : [];
    if (!effects.some((e) => e?.config?.method === 'reverse_sales_invoice_postings')) {
      const afterHandle = effects.findIndex((e) => e?.config?.method === 'handle_invoice_reject');
      const insertAt = afterHandle >= 0 ? afterHandle + 1 : effects.length;
      effects.splice(insertAt, 0, {
        type: 'database',
        config: { method: 'reverse_sales_invoice_postings' },
      });
      await prisma.workflow_action.update({
        where: { id: rejectAction.id },
        data: { side_effects: { effects } },
      });
    }
  }
}
