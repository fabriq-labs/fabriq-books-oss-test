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

/**
 * Validate that the loaded config has all required data in the database
 * This should be called in beforeAll() to ensure test data exists
 */
export async function validateTestData(config: TestConfig, prisma: any) {
  const validations = [
    { name: 'Organization', id: config.orgId, table: 'organization' },
    { name: 'User', id: config.userId, table: 'user' },
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
        case 'organization':
          exists = !!(await prisma.organization.findUnique({ where: { id: validation.id } }));
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
