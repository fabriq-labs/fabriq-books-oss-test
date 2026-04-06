import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL }
  }
});

// Seed data for integration tests
const seedData = {
  organization: {
    id: 'org_test_seed',
    organization_name: 'Test Organization',
    legal_name: 'Test Organization Ltd',
    address: '123 Test Street',
    city: 'Test City',
    state: 'Test State',
    country: 'Test Country',
    zip_code: '12345',
    website: 'https://test.com',
    is_it_headquartres: 'Yes',
    is_it_a_groupcompany: 'No',
    group_company_name: null,
    basecurrency_id: null,
    created_by: 'test_user',
    created_at: new Date(),
    org_id: 'org_test_seed',
  },
  currency: {
    id: 'cur_test_seed',
    base_currency: 'USD',
    from_currency: 'USD',
    currency_value: 1.0,
    effective_from: new Date(),
    status: 'Active',
    org_id: 'org_test_seed',
  },
  customer: {
    id: 'cust_test_seed',
    customer_name: 'Test Customer',
    primary_email: 'test@example.com',
    primary_phone: '+1234567890',
    customer_address: '123 Test St',
    city: 'Test City',
    state: 'Test State',
    country: 'Test Country',
    zip_code: '12345',
    industry: 'Technology',
    org_id: 'org_test_seed',
    preferred_currency_id: 'cur_test_seed',
  },
  account: {
    id: 'acc_test_seed',
    name: 'Test Bank Account',
    type: ['Asset'],
    code: '1001',
    org_id: 'org_test_seed',
  },
};

beforeAll(async () => {
  console.log('Setting up test database...');
  
  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set. Please configure your Railway PostgreSQL connection in .env.test');
  }
  
  try {
    // Test database schema is already created via db push
    console.log('Test database schema is ready!');
    
    // Setup Fabriq source system (required for lineage fields)
    console.log('Setting up Fabriq source system...');
    try {
      const databaseUrl = process.env.DATABASE_URL;
      if (databaseUrl) {
        const fabriqSourceSystemSqlPath = join(__dirname, '../../prisma/setup-fabriq-source-system.sql');
        execSync(`psql "${databaseUrl}" -f "${fabriqSourceSystemSqlPath}"`, {
          stdio: 'ignore',
          cwd: join(__dirname, '../..'),
        });
        console.log('  ✓ Fabriq source system setup complete');
      }
    } catch (error) {
      console.error('  ⚠️  Error setting up Fabriq source system:', error);
      console.log('     Continuing with seed data setup...');
    }
    
    // Create seed data for integration tests
    console.log('Creating seed data...');
    
    // Create organization first
    await prisma.organization.upsert({
      where: { id: seedData.organization.id },
      update: seedData.organization,
      create: seedData.organization,
    });
    
    // Create currency
    await prisma.currency_master.upsert({
      where: { id: seedData.currency.id },
      update: seedData.currency,
      create: seedData.currency,
    });
    
    // Create customer
    await prisma.customers.upsert({
      where: { id: seedData.customer.id },
      update: seedData.customer,
      create: seedData.customer,
    });
    
    // Create account
    await prisma.account.upsert({
      where: { id: seedData.account.id },
      update: seedData.account,
      create: seedData.account,
    });
    
    console.log('Seed data created successfully!');
    console.log('Test database setup complete!');
  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  }
});

beforeEach(async () => {
  // Don't clean data between tests - let each test manage its own data
  // This prevents foreign key constraint violations
});

afterAll(async () => {
  // CLEANUP DISABLED - Don't delete seed data
  // The sales-order tests and other tests manage their own cleanup
  // Uncomment below if you want to clean up seed data after all tests
  
  // await prisma.$transaction([
  //   prisma.payment_receipt.deleteMany(),
  //   prisma.invoice.deleteMany(),
  //   prisma.customers.deleteMany(),
  //   prisma.account.deleteMany(),
  //   prisma.currency_master.deleteMany(),
  //   prisma.organization.deleteMany(),
  // ]);
  
  await prisma.$disconnect();
});

export { prisma, seedData };
