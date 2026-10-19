import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL }
  }
});

// Seed data for integration tests
const seedData = {
  entity: {
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
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    decimal_places: 2,
    is_active: true,
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

    // Create seed data for integration tests
    console.log('Creating seed data...');

    // Create organization first
    await prisma.entity.upsert({
      where: { id: seedData.entity.id },
      update: seedData.entity,
      create: seedData.entity,
    });

    // Create currency
    const existingCurrency = await prisma.currency.findUnique({
      where: { code: seedData.currency.code },
      select: { id: true },
    });

    const currency =
      existingCurrency ??
      (await prisma.currency.create({
        data: seedData.currency,
        select: { id: true },
      }));

    // Create customer
    const customerData = {
      ...seedData.customer,
      preferred_currency_id: currency.id,
    };

    await prisma.customers.upsert({
      where: { id: seedData.customer.id },
      update: customerData,
      create: customerData,
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
