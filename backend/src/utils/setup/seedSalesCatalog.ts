/**
 * Demo sales catalog: tax rates/groups, payment terms, customers, items.
 * Enough to open an invoice and pick taxed line items.
 *
 *   npm run seed:coa -- india   # or us-ca
 *   npm run seed:books-demo     # optional entities
 *   npm run seed:sales-catalog
 *   npm run seed:sales-catalog -- org_kernel
 *
 * Idempotent on (org_id, code) for tax_master / tax_group / item_master,
 * and stable ids for payment_terms + demo customer.
 */
import { PrismaClient } from '@prisma/client';
import prisma from '../../lib/prisma';

const DEFAULT_ORG = 'org_kernel';
const ACTOR = 'seed:sales-catalog';

type TaxMasterSpec = {
  code: string;
  name: string;
  rate: number;
  component_type: string;
};

type TaxGroupSpec = {
  code: string;
  name: string;
  country_code: string;
  componentCodes: string[];
};

type ItemSpec = {
  code: string;
  name: string;
  description: string;
  unit_price: number;
  item_type: string;
  taxGroupCode: string | null;
  salesAccountCode: string;
};

const TAX_MASTERS: TaxMasterSpec[] = [
  { code: 'US_ST_825', name: 'US Sales Tax 8.25%', rate: 8.25, component_type: 'sales_tax' },
  { code: 'US_ST_5', name: 'US Reduced Tax 5%', rate: 5, component_type: 'sales_tax' },
  { code: 'US_ST_0', name: 'US Zero-rated 0%', rate: 0, component_type: 'sales_tax' },
  { code: 'IN_CGST_9', name: 'India CGST 9%', rate: 9, component_type: 'CGST' },
  { code: 'IN_SGST_9', name: 'India SGST 9%', rate: 9, component_type: 'SGST' },
];

const TAX_GROUPS: TaxGroupSpec[] = [
  { code: 'US_STD', name: 'US Standard 8.25%', country_code: 'US', componentCodes: ['US_ST_825'] },
  { code: 'US_RED', name: 'US Reduced 5%', country_code: 'US', componentCodes: ['US_ST_5'] },
  { code: 'US_ZERO', name: 'US Exempt 0%', country_code: 'US', componentCodes: ['US_ST_0'] },
  { code: 'IN_GST18', name: 'India GST 18%', country_code: 'IN', componentCodes: ['IN_CGST_9', 'IN_SGST_9'] },
];

const ITEMS: ItemSpec[] = [
  {
    code: 'SVC-CONSULT',
    name: 'Consulting hour',
    description: 'Professional consulting (taxed)',
    unit_price: 150,
    item_type: 'service',
    taxGroupCode: 'US_STD',
    salesAccountCode: '4102',
  },
  {
    code: 'SVC-SUPPORT',
    name: 'Support retainer',
    description: 'Monthly support retainer (reduced tax)',
    unit_price: 500,
    item_type: 'service',
    taxGroupCode: 'US_RED',
    salesAccountCode: '4102',
  },
  {
    code: 'PROD-WIDGET',
    name: 'Widget Pro',
    description: 'Physical widget (standard sales tax)',
    unit_price: 79.99,
    item_type: 'non_inventory',
    taxGroupCode: 'US_STD',
    salesAccountCode: '4101',
  },
  {
    code: 'PROD-BOOK',
    name: 'Field guide',
    description: 'Exempt educational material',
    unit_price: 24.5,
    item_type: 'non_inventory',
    taxGroupCode: 'US_ZERO',
    salesAccountCode: '4101',
  },
  {
    code: 'SVC-IMPL',
    name: 'Implementation package',
    description: 'India GST 18% (CGST+SGST)',
    unit_price: 12000,
    item_type: 'service',
    taxGroupCode: 'IN_GST18',
    salesAccountCode: '4102',
  },
  {
    code: 'g',
    name: 'Nite',
    description: 'Existing demo item — now taxed at US standard',
    unit_price: 78,
    item_type: 'non_inventory',
    taxGroupCode: 'US_STD',
    salesAccountCode: '4101',
  },
];

async function resolveOrg(db: PrismaClient, orgId: string) {
  const org = await db.org.findUnique({ where: { id: orgId } });
  if (!org) throw new Error(`Org ${orgId} not found — run setup:kernel / AUTO_SETUP first`);
  return org;
}

async function main() {
  const orgId = process.argv[2] || DEFAULT_ORG;
  await resolveOrg(prisma, orgId);

  const currency =
    (await prisma.currency.findFirst({ where: { code: 'USD' } })) ||
    (await prisma.currency.findFirst());
  if (!currency) throw new Error('No currency — run setup:kernel');

  const entityUs =
    (await prisma.entity.findFirst({ where: { org_id: orgId, id: 'ent_demo_us' } })) ||
    (await prisma.entity.findFirst({ where: { org_id: orgId, country: 'US' } })) ||
    (await prisma.entity.findFirst({ where: { org_id: orgId } }));
  if (!entityUs) throw new Error(`No entity for ${orgId} — run seed:books-demo or create one`);

  const taxPayable =
    (await prisma.account.findFirst({
      where: { org_id: orgId, code: '2104' },
    })) ||
    (await prisma.account.findFirst({
      where: { org_id: orgId, name: { contains: 'Tax', mode: 'insensitive' }, classification: 'liability' },
    }));

  const ar =
    (await prisma.account.findFirst({ where: { org_id: orgId, code: '1105' } })) ||
    (await prisma.account.findFirst({
      where: { org_id: orgId, name: { contains: 'Receivable', mode: 'insensitive' } },
    }));

  const taxIds = new Map<string, string>();
  for (const spec of TAX_MASTERS) {
    const row = await prisma.tax_master.upsert({
      where: { org_id_code: { org_id: orgId, code: spec.code } },
      create: {
        org_id: orgId,
        code: spec.code,
        name: spec.name,
        rate: spec.rate,
        component_type: spec.component_type,
        is_active: true,
        is_recoverable: false,
        liability_account_id: taxPayable?.id ?? null,
        created_by: ACTOR,
        modified_by: ACTOR,
      },
      update: {
        name: spec.name,
        rate: spec.rate,
        component_type: spec.component_type,
        is_active: true,
        liability_account_id: taxPayable?.id ?? undefined,
        modified_by: ACTOR,
      },
    });
    taxIds.set(spec.code, row.id);
  }

  const groupIds = new Map<string, string>();
  for (const spec of TAX_GROUPS) {
    const group = await prisma.tax_group.upsert({
      where: { org_id_code: { org_id: orgId, code: spec.code } },
      create: {
        org_id: orgId,
        code: spec.code,
        name: spec.name,
        country_code: spec.country_code,
        is_active: true,
        created_by: ACTOR,
        modified_by: ACTOR,
      },
      update: {
        name: spec.name,
        country_code: spec.country_code,
        is_active: true,
        modified_by: ACTOR,
      },
    });
    groupIds.set(spec.code, group.id);

    let sequence = 1;
    for (const masterCode of spec.componentCodes) {
      const taxMasterId = taxIds.get(masterCode);
      if (!taxMasterId) throw new Error(`Missing tax_master ${masterCode}`);
      const existing = await prisma.tax_group_component.findFirst({
        where: { tax_group_id: group.id, tax_master_id: taxMasterId },
      });
      if (existing) {
        await prisma.tax_group_component.update({
          where: { id: existing.id },
          data: { sequence, modified_by: ACTOR },
        });
      } else {
        await prisma.tax_group_component.create({
          data: {
            org_id: orgId,
            tax_group_id: group.id,
            tax_master_id: taxMasterId,
            sequence,
            created_by: ACTOR,
            modified_by: ACTOR,
          },
        });
      }
      sequence += 1;
    }
  }

  const terms = await prisma.payment_terms.upsert({
    where: { id: 'payt_demo_net30' },
    create: {
      id: 'payt_demo_net30',
      org_id: orgId,
      name: 'Net 30',
      description: 'Payment due in 30 days',
      days: 30,
      entity_id: entityUs.id,
      is_active: true,
      created_by: ACTOR,
      modified_by: ACTOR,
    },
    update: {
      name: 'Net 30',
      days: 30,
      entity_id: entityUs.id,
      is_active: true,
      modified_by: ACTOR,
    },
  });

  const customerData = {
    name: 'Acme Ltd',
    email: 'billing@acme.example',
    currency_id: currency.id,
    payment_terms_id: terms.id,
    entity_id: entityUs.id,
    receivable_account_id: ar?.id ?? null,
    city: 'Austin',
    state: 'TX',
    country: 'US',
    is_active: true,
    modified_by: ACTOR,
  };

  let customer =
    (await prisma.customer.findFirst({ where: { org_id: orgId, name: 'Acme Ltd' } })) ||
    (await prisma.customer.findUnique({ where: { id: 'cust_demo_acme' } }));

  if (customer) {
    customer = await prisma.customer.update({
      where: { id: customer.id },
      data: customerData,
    });
  } else {
    customer = await prisma.customer.create({
      data: {
        id: 'cust_demo_acme',
        org_id: orgId,
        created_by: ACTOR,
        ...customerData,
      },
    });
  }

  const accountByCode = new Map<string, string>();
  for (const code of new Set(ITEMS.map((i) => i.salesAccountCode))) {
    const acct = await prisma.account.findFirst({ where: { org_id: orgId, code } });
    if (acct) accountByCode.set(code, acct.id);
  }
  const fallbackIncome = await prisma.account.findFirst({
    where: { org_id: orgId, classification: 'income' },
  });

  for (const spec of ITEMS) {
    const tax_group_id = spec.taxGroupCode ? groupIds.get(spec.taxGroupCode) ?? null : null;
    const sales_account_id =
      accountByCode.get(spec.salesAccountCode) || fallbackIncome?.id || null;

    await prisma.item_master.upsert({
      where: { org_id_code: { org_id: orgId, code: spec.code } },
      create: {
        org_id: orgId,
        code: spec.code,
        name: spec.name,
        description: spec.description,
        item_type: spec.item_type,
        unit_price: spec.unit_price,
        tax_group_id,
        sales_account_id,
        currency_id: currency.id,
        is_active: true,
        is_stockable: false,
        created_by: ACTOR,
        modified_by: ACTOR,
      },
      update: {
        name: spec.name,
        description: spec.description,
        item_type: spec.item_type,
        unit_price: spec.unit_price,
        tax_group_id,
        sales_account_id: sales_account_id ?? undefined,
        currency_id: currency.id,
        is_active: true,
        modified_by: ACTOR,
      },
    });
  }

  console.log(`Sales catalog on ${orgId}`);
  console.log(`  tax_master ${TAX_MASTERS.length}, tax_group ${TAX_GROUPS.length}`);
  console.log(`  items ${ITEMS.length} (with tax_group_id where set)`);
  console.log(`  payment_terms ${terms.id}, customer ${customer.id} → entity ${entityUs.id}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
