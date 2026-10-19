/**
 * Smoke-test universal sales + source_system models (no UI).
 *
 *   cd backend && npx ts-node --transpile-only scripts/smoke-sales-model.ts
 */
import prisma from '../src/lib/prisma';

const ORG = 'org_kernel';
const ACTOR = 'smoke:sales-model';

async function main() {
  const currency = await prisma.currency.findFirst({ where: { code: 'USD' } });
  if (!currency) throw new Error('USD currency missing — run setup:kernel');

  let entity = await prisma.entity.findFirst({ where: { org_id: ORG } });
  if (!entity) {
    entity = await prisma.entity.create({
      data: {
        org_id: ORG,
        name: 'Smoke HQ',
        legal_name: 'Smoke HQ LLC',
        is_headquarters: true,
        currency_id: currency.id,
        created_by: ACTOR,
        modified_by: ACTOR,
      },
    });
  }

  const source = await prisma.source_system.upsert({
    where: { org_id_system_type: { org_id: ORG, system_type: 'quickbooks' } },
    create: {
      org_id: ORG,
      system_type: 'quickbooks',
      name: 'QBO Smoke Connection',
      connection_config: { oauth: { placeholder: true } },
      extraction_config: { airbyte: { placeholder: true } },
      is_active: true,
      entity_id: entity.id,
      created_by: ACTOR,
      modified_by: ACTOR,
    },
    update: {
      name: 'QBO Smoke Connection',
      entity_id: entity.id,
      modified_by: ACTOR,
    },
  });

  const terms = await prisma.payment_terms.create({
    data: {
      org_id: ORG,
      name: 'Net 30',
      days: 30,
      entity_id: entity.id,
      source_system_id: source.id,
      source_record_id: 'qbo-term-smoke-30',
      created_by: ACTOR,
      modified_by: ACTOR,
    },
  });

  const taxMaster = await prisma.tax_master.create({
    data: {
      org_id: ORG,
      name: 'Sales Tax 10%',
      code: 'SMOKE_ST_10',
      rate: 10,
      component_type: 'sales_tax',
      is_active: true,
      source_system_id: source.id,
      source_record_id: 'qbo-rate-smoke-10',
      created_by: ACTOR,
      modified_by: ACTOR,
    },
  });

  const taxGroup = await prisma.tax_group.create({
    data: {
      org_id: ORG,
      name: 'Standard Sales Tax',
      code: 'SMOKE_TAX',
      country_code: 'US',
      is_active: true,
      source_system_id: source.id,
      source_record_id: 'qbo-code-smoke-tax',
      created_by: ACTOR,
      modified_by: ACTOR,
      components: {
        create: {
          org_id: ORG,
          tax_master_id: taxMaster.id,
          sequence: 1,
          created_by: ACTOR,
          modified_by: ACTOR,
        },
      },
    },
  });

  let income = await prisma.account.findFirst({
    where: { org_id: ORG, classification: 'income' },
  });
  if (!income) {
    income = await prisma.account.create({
      data: {
        org_id: ORG,
        name: 'Smoke Sales Income',
        code: 'SMOKE_4000',
        classification: 'income',
        account_types: ['income'],
        currency_id: currency.id,
        entity_id: entity.id,
        created_by: ACTOR,
        modified_by: ACTOR,
      },
    });
  }

  let receivable = await prisma.account.findFirst({
    where: { org_id: ORG, classification: 'asset', name: { contains: 'Receivable' } },
  });
  if (!receivable) {
    receivable = await prisma.account.create({
      data: {
        org_id: ORG,
        name: 'Smoke Accounts Receivable',
        code: 'SMOKE_1100',
        classification: 'asset',
        account_types: ['accounts_receivable'],
        currency_id: currency.id,
        entity_id: entity.id,
        created_by: ACTOR,
        modified_by: ACTOR,
      },
    });
  }

  const customer = await prisma.customer.create({
    data: {
      org_id: ORG,
      name: 'Acme Smoke Customer',
      email: 'acme@example.com',
      currency_id: currency.id,
      payment_terms_id: terms.id,
      entity_id: entity.id,
      receivable_account_id: receivable.id,
      source_system_id: source.id,
      source_record_id: 'qbo-cust-smoke-1',
      created_by: ACTOR,
      modified_by: ACTOR,
    },
  });

  const location = await prisma.location.create({
    data: {
      org_id: ORG,
      name: 'Acme HQ',
      code: 'ACME-HQ',
      entity_id: entity.id,
      customer_id: customer.id,
      city: 'Austin',
      state: 'TX',
      country: 'US',
      postal_code: '78701',
      source_system_id: source.id,
      source_record_id: 'qbo-loc-smoke-1',
      created_by: ACTOR,
      modified_by: ACTOR,
    },
  });

  const item = await prisma.item_master.create({
    data: {
      org_id: ORG,
      name: 'Smoke Widget',
      code: 'WIDGET-1',
      description: 'Test item',
      item_type: 'non_inventory',
      unit_price: 100,
      sales_account_id: income.id,
      tax_group_id: taxGroup.id,
      currency_id: currency.id,
      source_system_id: source.id,
      source_record_id: 'qbo-item-smoke-1',
      created_by: ACTOR,
      modified_by: ACTOR,
    },
  });

  const net = 100;
  const tax = 10;
  const total = 110;

  const invoice = await prisma.invoice.create({
    data: {
      org_id: ORG,
      direction: 'sales',
      number: 'SMOKE-INV-1',
      status: 'draft',
      customer_id: customer.id,
      entity_id: entity.id,
      location_id: location.id,
      currency_id: currency.id,
      payment_terms_id: terms.id,
      net_amount: net,
      tax_amount: tax,
      total_amount: total,
      balance_amount: total,
      bill_to: 'Acme Smoke Customer, Austin TX',
      source_system_id: source.id,
      source_record_id: 'qbo-inv-smoke-1',
      created_by: ACTOR,
      modified_by: ACTOR,
      line_items: {
        create: {
          org_id: ORG,
          line_number: 1,
          item_master_id: item.id,
          description: 'Smoke Widget',
          quantity: 1,
          unit_price: 100,
          amount: 100,
          account_id: income.id,
          tax_group_id: taxGroup.id,
          source_system_id: source.id,
          source_record_id: 'qbo-invline-smoke-1',
          created_by: ACTOR,
          modified_by: ACTOR,
          line_taxes: {
            create: {
              org_id: ORG,
              tax_master_id: taxMaster.id,
              tax_group_id: taxGroup.id,
              rate: 10,
              amount: 10,
              component_type: 'sales_tax',
              created_by: ACTOR,
              modified_by: ACTOR,
            },
          },
        },
      },
    },
    include: { line_items: { include: { line_taxes: true } } },
  });

  const receipt = await prisma.payment_receipt.create({
    data: {
      org_id: ORG,
      number: 'SMOKE-RCPT-1',
      customer_id: customer.id,
      invoice_id: invoice.id,
      entity_id: entity.id,
      currency_id: currency.id,
      amount: 50,
      base_amount: 50,
      payment_type: 'partial',
      status: 'draft',
      source_system_id: source.id,
      source_record_id: 'qbo-pay-smoke-1',
      created_by: ACTOR,
      modified_by: ACTOR,
      applications: {
        create: {
          org_id: ORG,
          invoice_id: invoice.id,
          amount_applied: 50,
          created_by: ACTOR,
          modified_by: ACTOR,
        },
      },
    },
    include: { applications: true },
  });

  const credit = await prisma.credit_note.create({
    data: {
      org_id: ORG,
      number: 'SMOKE-CN-1',
      customer_id: customer.id,
      invoice_id: invoice.id,
      entity_id: entity.id,
      location_id: location.id,
      currency_id: currency.id,
      net_amount: 10,
      tax_amount: 1,
      total_amount: 11,
      balance_amount: 11,
      status: 'draft',
      source_system_id: source.id,
      source_record_id: 'qbo-cn-smoke-1',
      created_by: ACTOR,
      modified_by: ACTOR,
      line_items: {
        create: {
          org_id: ORG,
          line_number: 1,
          item_master_id: item.id,
          description: 'Partial credit',
          quantity: 0.1,
          unit_price: 100,
          amount: 10,
          account_id: income.id,
          tax_group_id: taxGroup.id,
          created_by: ACTOR,
          modified_by: ACTOR,
        },
      },
    },
    include: { line_items: true },
  });

  // Idempotent lineage upsert simulation
  const again = await prisma.customer.findUnique({
    where: {
      org_id_source_system_id_source_record_id: {
        org_id: ORG,
        source_system_id: source.id,
        source_record_id: 'qbo-cust-smoke-1',
      },
    },
  });
  if (!again || again.id !== customer.id) {
    throw new Error('Lineage unique lookup failed for customer');
  }

  const counts = {
    source_system: await prisma.source_system.count({ where: { org_id: ORG } }),
    customer: await prisma.customer.count({ where: { org_id: ORG } }),
    invoice: await prisma.invoice.count({ where: { org_id: ORG } }),
    invoice_line_item: await prisma.invoice_line_item.count({ where: { org_id: ORG } }),
    invoice_line_tax: await prisma.invoice_line_tax.count({ where: { org_id: ORG } }),
    payment_receipt: await prisma.payment_receipt.count({ where: { org_id: ORG } }),
    payment_receipt_application: await prisma.payment_receipt_application.count({
      where: { org_id: ORG },
    }),
    credit_note: await prisma.credit_note.count({ where: { org_id: ORG } }),
  };

  console.log(
    JSON.stringify(
      {
        ok: true,
        entity_id: entity.id,
        source_system_id: source.id,
        customer_id: customer.id,
        invoice_id: invoice.id,
        invoice_lines: invoice.line_items.length,
        line_taxes: invoice.line_items[0]?.line_taxes.length ?? 0,
        receipt_id: receipt.id,
        applications: receipt.applications.length,
        credit_note_id: credit.id,
        counts,
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
