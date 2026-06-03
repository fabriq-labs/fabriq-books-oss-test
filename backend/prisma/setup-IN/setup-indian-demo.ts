import * as fs from 'fs';
import * as path from 'path';
import { setupChartOfAccounts } from '../setup-chart-of-accounts';

import prisma from '../../src/lib/prisma';
import { seedPaymentTermsFromCsv } from '../../src/utils/setup/seedPaymentTermsFromCsv';
import { buildAirbyteExtractionConfigFromEnv } from '../setup-airbyte-extraction-config';
import {
  hashStableDemoApiKey,
  stableIndianDemoApiKeyPlaintext,
} from '../demo-stable-api-keys';
const csv = require('csv-parser');

interface CsvRow {
  [key: string]: string;
}

async function loadCsvData(filePath: string): Promise<CsvRow[]> {
  return new Promise((resolve, reject) => {
    const results: CsvRow[] = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data: CsvRow) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

const postingCsvStr = (v?: string) => (v != null && String(v).trim() !== '' ? String(v).trim() : '');
const postingCsvOpt = (v?: string) => {
  const s = postingCsvStr(v);
  return s === '' ? undefined : s;
};
const postingCsvDate = (v?: string): Date | undefined => {
  const s = postingCsvStr(v);
  if (!s) return undefined;
  const d = new Date(s.includes('T') ? s : `${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/** Map a posting.csv row (full schema) to Prisma create/update fields. */
function postingCsvRowToPrismaData(row: CsvRow, defaultOrgId: string): Record<string, unknown> {
  const valueDate = postingCsvDate(row.value_date) ?? postingCsvDate(row.posting_date);
  const postingDate = postingCsvDate(row.posting_date) ?? valueDate;
  if (!valueDate || !postingDate) {
    throw new Error(`Posting ${row.id}: missing value_date/posting_date`);
  }

  const data: Record<string, unknown> = {
    value_date: valueDate,
    posting_date: postingDate,
    amount: parseFloat(row.amount),
    org_id: postingCsvStr(row.org_id) || defaultOrgId,
    name: postingCsvOpt(row.name) ?? (postingCsvStr(row.description).slice(0, 50) || undefined),
    account_id: postingCsvOpt(row.account_id) ?? null,
    credit_account_id: postingCsvOpt(row.credit_account_id) ?? null,
    description: postingCsvOpt(row.description),
    posting_type: postingCsvOpt(row.posting_type),
    status: postingCsvOpt(row.status),
    notes: postingCsvOpt(row.notes),
    legal_entity_id: postingCsvOpt(row.legal_entity_id),
    created_by: postingCsvOpt(row.created_by),
    modified_by: postingCsvOpt(row.modified_by),
    assigned_to: postingCsvOpt(row.assigned_to),
    account_name: postingCsvOpt(row.account_name),
    category_name: postingCsvOpt(row.category_name),
    invoice_id: postingCsvOpt(row.invoice_id),
    reversal_of_posting_id: postingCsvOpt(row.reversal_of_posting_id),
    trade_id: postingCsvOpt(row.trade_id),
    holding_id: postingCsvOpt(row.holding_id),
    reconciliation_status: postingCsvOpt(row.reconciliation_status),
    matched_reference: postingCsvOpt(row.matched_reference),
    payment_receipt_id: postingCsvOpt(row.payment_receipt_id),
  };

  const incomeType = postingCsvOpt(row.income_type);
  const incomeSource = postingCsvOpt(row.income_source);
  if (incomeType) data.income_type = incomeType;
  if (incomeSource) data.income_source = incomeSource;

  const aiScore = postingCsvOpt(row.ai_cat_score);
  if (aiScore) data.ai_cat_score = parseFloat(aiScore);

  const aiCatAt = postingCsvDate(row.ai_categorized_at);
  if (aiCatAt) data.ai_categorized_at = aiCatAt;

  const reversedAt = postingCsvDate(row.reversed_at);
  if (reversedAt) data.reversed_at = reversedAt;

  return data;
}

const POSTING_CSV_FILES = [
  'posting-demo-india.csv',
  'posting-demo-usa.csv',
  'posting-demo-mumbai.csv',
  'posting-demo-bangalore.csv',
];

/** Bank-import style lines for reconciliation / categorization UI (one-sided; HQ only). */
const RECONCILIATION_POSTING_CSV = 'posting.csv';

const DEMO_POSTING_IDS = [
  'post_demo_01', 'post_demo_02', 'post_demo_03', 'post_demo_04', 'post_demo_05',
  'post_demo_06', 'post_demo_07', 'post_demo_08', 'post_demo_09', 'post_demo_10',
  'post_demo_11', 'post_demo_12', 'post_demo_13', 'post_demo_14', 'post_demo_15',
  'post_demo_16', 'post_demo_17', 'post_demo_18', 'post_demo_19', 'post_demo_20',
  'post_demo_21', 'post_demo_22', 'post_demo_23', 'post_demo_24',
];

async function upsertPostingsFromCsvFile(csvFileName: string, demoOrgId: string): Promise<number> {
  const filePath = path.join(__dirname, csvFileName);
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ Skipping ${csvFileName} (file not found)`);
    return 0;
  }
  const postingData = await loadCsvData(filePath);
  for (const row of postingData) {
    const payload = postingCsvRowToPrismaData(row, demoOrgId);
    await prisma.posting.upsert({
      where: { id: row.id },
      update: payload as any,
      create: { id: row.id, ...payload } as any,
    });
  }
  return postingData.length;
}

async function upsertAllPostingsFromCsv(demoOrgId: string): Promise<number> {
  let total = 0;
  for (const file of POSTING_CSV_FILES) {
    const count = await upsertPostingsFromCsvFile(file, demoOrgId);
    if (count > 0) {
      console.log(`  ✓ Loaded ${count} postings from ${file}`);
    }
    total += count;
  }
  return total;
}

/** `payment_receipt_id` is @unique on posting — only one posting may reference a receipt. */
async function releasePaymentReceiptLink(
  demoOrgId: string,
  paymentReceiptId: string,
  keepPostingId: string
): Promise<number> {
  const result = await prisma.posting.updateMany({
    where: {
      org_id: demoOrgId,
      payment_receipt_id: paymentReceiptId,
      id: { not: keepPostingId },
    },
    data: {
      payment_receipt_id: null,
      reconciliation_status: null,
      matched_reference: null,
    },
  });
  return result.count;
}

/**
 * Load one-sided bank postings for reconciliation demo (post_demo_*).
 * Loaded after FY journal CSVs so both datasets coexist.
 */
const INDIAN_DEMO_ORG_ID = 'org_indian_demo';
const INDIAN_DEMO_LEGAL_ENTITY_ID = 'org_indian_demo';

/** Resolve payment_terms.id from CSV (id or label e.g. pay_demo_net30 / "Net 30"). */
async function resolveDemoPaymentTermsId(
  raw: string | undefined,
  orgId: string,
  cache: Map<string, string | null>
): Promise<string | null> {
  const key = (raw ?? '').trim();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  const byId = await prisma.payment_terms.findFirst({
    where: { id: key, org_id: orgId },
    select: { id: true },
  });
  if (byId) {
    cache.set(key, byId.id);
    return byId.id;
  }

  const byLabel = await prisma.payment_terms.findFirst({
    where: { org_id: orgId, payment_terms: key },
    select: { id: true },
  });
  const resolved = byLabel?.id ?? null;
  cache.set(key, resolved);
  if (!resolved) {
    console.warn(`  ⚠ Unknown payment_terms_id "${key}" for org ${orgId}; leaving null`);
  }
  return resolved;
}

/**
 * Upsert demo sales invoices + line items from CSV (includes invoice_net_total).
 * Safe to re-run without full setup — use CLI flag --sync-invoices.
 */
async function upsertDemoInvoicesFromCsv(
  arAccountId: string,
  baseDate: Date = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 2);
    return d;
  })()
): Promise<{ invoices: number; lineItems: number }> {
  const invoiceData = await loadCsvData(path.join(__dirname, 'invoice.csv'));
  const paymentTermsCache = new Map<string, string | null>();
  const orgId = INDIAN_DEMO_ORG_ID;

  for (const row of invoiceData) {
    const daysOffset = parseInt(row.days_offset, 10) || 0;
    const invDate = new Date(baseDate);
    invDate.setDate(invDate.getDate() + daysOffset);
    const invoiceTotal = parseFloat(row.invoice_total);
    const invoiceNetTotal =
      row.invoice_net_total != null && String(row.invoice_net_total).trim() !== ''
        ? parseFloat(row.invoice_net_total)
        : invoiceTotal;
    const paymentTermsId = await resolveDemoPaymentTermsId(
      row.payment_terms_id,
      row.org_id || orgId,
      paymentTermsCache
    );
    const invoiceFields = {
      invoice_number: row.invoice_number,
      invoice_date: invDate,
      invoice_type: 'SALES' as const,
      customer_id: row.customer_id,
      invoice_total: invoiceTotal,
      invoice_net_total: invoiceNetTotal,
      balance_amount: parseFloat(row.balance_amount),
      payment_terms_id: paymentTermsId,
      org_id: row.org_id || INDIAN_DEMO_ORG_ID,
      account_id: arAccountId,
      status: row.status || 'SENT',
      legal_entity_id: row.legal_entity_id || INDIAN_DEMO_LEGAL_ENTITY_ID,
    };
    await prisma.invoice.upsert({
      where: { id: row.id },
      update: invoiceFields,
      create: { id: row.id, ...invoiceFields },
    });
  }

  const invoiceLineItemData = await loadCsvData(path.join(__dirname, 'invoice_line_item.csv'));
  for (const row of invoiceLineItemData) {
    const qty = parseFloat(row.ordered_quantity ?? row.invoice_qty ?? '1');
    const rate = parseFloat(row.rate ?? row.line_total);
    const lineTotal = parseFloat(row.line_total);
    const lineFields = {
      instance_id: row.instance_id,
      item_master_id: postingCsvStr(row.item_master_id) || null,
      item_name: postingCsvOpt(row.item_name),
      item_number: postingCsvOpt(row.item_number),
      item_type: postingCsvOpt(row.item_type),
      ordered_quantity: qty,
      invoice_qty: parseInt(String(row.invoice_qty ?? qty), 10) || Math.round(qty),
      rate,
      ordered_amount: row.ordered_amount ? parseFloat(row.ordered_amount) : rate * qty,
      line_total: lineTotal,
      invoiced_amount: parseFloat(row.invoiced_amount),
      org_id: row.org_id || orgId,
    };
    await prisma.invoice_line_item.upsert({
      where: { id: row.id },
      update: lineFields,
      create: { id: row.id, ...lineFields },
    });
  }

  return { invoices: invoiceData.length, lineItems: invoiceLineItemData.length };
}

async function syncDemoInvoicesFromCsv() {
  console.log('📄 Syncing demo invoices from CSV (invoice_net_total, balances, line items)...');

  const arAccount = await prisma.account.findFirst({
    where: {
      org_id: INDIAN_DEMO_ORG_ID,
      legal_entity_id: INDIAN_DEMO_LEGAL_ENTITY_ID,
      code: '1105',
    },
  });
  if (!arAccount) {
    throw new Error('Chart of accounts missing Accounts Receivable (1105). Run full Indian demo setup first.');
  }

  const { invoices, lineItems } = await upsertDemoInvoicesFromCsv(arAccount.id);
  console.log(`  ✓ Invoices: ${invoices}, line items: ${lineItems}`);
  console.log('✅ Demo invoice sync complete.');
  await prisma.$disconnect();
}

async function upsertReconciliationBankPostingsFromCsv(
  bankAccount: { id: string },
  demoOrgId: string,
  demoLegalEntityId: string,
  baseDate: Date
): Promise<number> {
  const filePath = path.join(__dirname, RECONCILIATION_POSTING_CSV);
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ Skipping ${RECONCILIATION_POSTING_CSV} (file not found)`);
    return 0;
  }

  const postingData = await loadCsvData(filePath);
  for (const row of postingData) {
    const daysOffset = parseInt(row.days_offset, 10) || 0;
    const valueDate = new Date(baseDate);
    valueDate.setDate(valueDate.getDate() + daysOffset);
    const isCredit = row.is_credit === 'true' || row.is_credit === '1';
    const updateData: Record<string, unknown> = {
      value_date: valueDate,
      posting_date: valueDate,
      amount: parseFloat(row.amount),
      description: row.description,
      org_id: row.org_id || demoOrgId,
      legal_entity_id: demoLegalEntityId,
      name: (row.description || '').slice(0, 50),
      account_id: isCredit ? bankAccount.id : null,
      credit_account_id: isCredit ? null : bankAccount.id,
      status: 'ACTIVE',
    };
    if (row.payment_receipt_id && String(row.payment_receipt_id).trim() !== '') {
      const receiptId = String(row.payment_receipt_id).trim();
      const released = await releasePaymentReceiptLink(demoOrgId, receiptId, row.id);
      if (released > 0) {
        console.log(
          `  ↳ Cleared payment_receipt_id on ${released} other posting(s) before linking ${row.id} → ${receiptId}`
        );
      }
      updateData.payment_receipt_id = receiptId;
      updateData.reconciliation_status = row.reconciliation_status || 'MATCHED';
      updateData.matched_reference = row.matched_reference || null;
    } else {
      updateData.payment_receipt_id = null;
      updateData.reconciliation_status = row.reconciliation_status?.trim() || null;
      updateData.matched_reference = row.matched_reference?.trim() || null;
    }
    await prisma.posting.upsert({
      where: { id: row.id },
      update: updateData as any,
      create: { id: row.id, ...updateData } as any,
    });
  }
  return postingData.length;
}

async function setupIndianDemoData() {
  console.log('🇮🇳 Setting up Indian Demo Data...');
  console.log('');

  try {
    const indianDemoSeedRowCounts = {
      salesOrders: 0,
      salesOrderItems: 0,
      quotes: 0,
      quoteItems: 0,
      deliveryChallans: 0,
      deliveryChallanItems: 0,
      creditNotes: 0,
      creditNoteItems: 0,
      exchangeRates: 0,
      instruments: 0,
      holdings: 0,
      trades: 0,
    };

    // ===== 1. LOAD AND INSERT ORG DATA =====
    console.log('🏢 Loading organization data...');
    const orgData = await loadCsvData(path.join(__dirname, 'org.csv'));

    for (const org of orgData) {
      await prisma.org.upsert({
        where: { id: org.id },
        update: {
          name: org.name,
          slug: org.slug,
          settings: org.settings || '{}',
          external_mapping: org.external_mapping ? JSON.parse(org.external_mapping) : {},
          active_subscription: org.active_subscription === 'true',
          erp_system_type: org.erp_system_type,
        },
        create: {
          id: org.id,
          name: org.name,
          slug: org.slug,
          settings: org.settings || '{}',
          external_mapping: org.external_mapping ? JSON.parse(org.external_mapping) : {},
          active_subscription: org.active_subscription === 'true',
          erp_system_type: org.erp_system_type,
        },
      });
    }
    console.log(`  ✓ Loaded ${orgData.length} organizations`);

    // ===== 2. LOAD AND INSERT ORGANIZATION DATA =====
    console.log('🏢 Loading business organization data...');
    const organizationData = await loadCsvData(path.join(__dirname, 'organization.csv'));

    for (const org of organizationData) {
      const updateData: any = {
        organization_name: org.organization_name,
        legal_name: org.legal_name,
        address: org.address,
        city: org.city,
        state: org.state,
        country: org.country,
        zip_code: org.zip_code,
        website: org.website,
        is_it_headquartres: org.is_it_headquartres,
        is_it_a_groupcompany: org.is_it_a_groupcompany,
        group_company_name: org.group_company_name,
        org_id: org.org_id,
        financial_year_type: org.financial_year_type,
      };

      const createData: any = {
        id: org.id,
        organization_name: org.organization_name,
        legal_name: org.legal_name,
        address: org.address,
        city: org.city,
        state: org.state,
        country: org.country,
        zip_code: org.zip_code,
        website: org.website,
        is_it_headquartres: org.is_it_headquartres,
        is_it_a_groupcompany: org.is_it_a_groupcompany,
        group_company_name: org.group_company_name,
        org_id: org.org_id,
        financial_year_type: org.financial_year_type,
      };

      // Only set basecurrency_id when present (must reference existing currency.id)
      const baseCurrencyId = org.basecurrency_id?.trim();
      if (baseCurrencyId) {
        updateData.basecurrency_id = baseCurrencyId;
        createData.basecurrency_id = baseCurrencyId;
      }

      await prisma.entity.upsert({
        where: { id: org.id },
        update: updateData,
        create: createData,
      });
    }
    console.log(`  ✓ Loaded ${organizationData.length} business organizations`);

    // ===== 2.5. SETUP CHART OF ACCOUNTS FOR EACH ORGANIZATION =====
    console.log('💰 Setting up chart of accounts for organizations...');
    const coaTemplateIn = path.join(__dirname, 'chart-of-accounts.json');
    const coaTemplateUs = path.join(__dirname, '..', 'setup-US_CA', 'chart-of-accounts.json');
    for (const org of organizationData) {
      const isUsd = org.basecurrency_id?.trim() === 'curr_usd';
      const currency = isUsd ? 'USD' : 'INR';
      const templatePath = isUsd ? coaTemplateUs : coaTemplateIn;
      await setupChartOfAccounts('org_indian_demo', org.id, templatePath, currency);
    }
    console.log(`  ✓ Set up chart of accounts for ${organizationData.length} organizations`);

    // ===== 2.57. LOAD MASTERS FROM CSV (shipping, tax, item_category, uom, cost_center) =====
    console.log('📋 Loading master data (shipping method, shipping terms, tax, item category, UOM, cost center)...');
    const shippingMethodData = await loadCsvData(path.join(__dirname, 'shipping_method.csv'));
    for (const row of shippingMethodData) {
      await prisma.shipping_method.upsert({
        where: { id: row.id },
        update: { shipping_method: row.shipping_method, description: row.description, status: row.status || null, org_id: row.org_id },
        create: { id: row.id, shipping_method: row.shipping_method, description: row.description, status: row.status || null, org_id: row.org_id },
      });
    }
    const shippingTermsData = await loadCsvData(path.join(__dirname, 'shipping_terms.csv'));
    for (const row of shippingTermsData) {
      await prisma.shipping_terms.upsert({
        where: { id: row.id },
        update: { shipping_terms: row.shipping_terms, description: row.description, status: row.status || null, org_id: row.org_id },
        create: { id: row.id, shipping_terms: row.shipping_terms, description: row.description, status: row.status || null, org_id: row.org_id },
      });
    }
    const taxMasterData = await loadCsvData(path.join(__dirname, 'tax_master.csv'));
    for (const row of taxMasterData) {
      const effectiveFrom = row.effective_from ? new Date(row.effective_from) : new Date('2022-07-01');
      await prisma.tax_master.upsert({
        where: { id: row.id },
        update: { tax_name: row.tax_name, tax_code: row.tax_code, tax_rate: parseInt(row.tax_rate, 10), effective_from: effectiveFrom, geo: row.geo, status: row.status || null, org_id: row.org_id },
        create: { id: row.id, tax_name: row.tax_name, tax_code: row.tax_code, tax_rate: parseInt(row.tax_rate, 10), effective_from: effectiveFrom, geo: row.geo, status: row.status || null, org_id: row.org_id },
      });
    }
    const itemCategoryData = await loadCsvData(path.join(__dirname, 'item_category.csv'));
    for (const row of itemCategoryData) {
      await prisma.item_category.upsert({
        where: { id: row.id },
        update: { item_category: row.item_category, item_subcategory: row.item_subcategory || null, org_id: row.org_id },
        create: { id: row.id, item_category: row.item_category, item_subcategory: row.item_subcategory || null, org_id: row.org_id },
      });
    }
    const uomData = await loadCsvData(path.join(__dirname, 'uom.csv'));
    for (const row of uomData) {
      await prisma.uom.upsert({
        where: { id: row.id },
        update: { name: row.name || null, org_id: row.org_id || null },
        create: { id: row.id, name: row.name || null, org_id: row.org_id || null },
      });
    }
    const costCenterData = await loadCsvData(path.join(__dirname, 'cost_center.csv'));
    for (const row of costCenterData) {
      await prisma.cost_center.upsert({
        where: { id: row.id },
        update: { cost_center: row.cost_center, legal_entity_id: row.legal_entity_id || null, status: row.status || null, org_id: row.org_id },
        create: { id: row.id, cost_center: row.cost_center, legal_entity_id: row.legal_entity_id || null, status: row.status || null, org_id: row.org_id },
      });
    }
    console.log(`  ✓ Shipping methods: ${shippingMethodData.length}, Shipping terms: ${shippingTermsData.length}, Tax: ${taxMasterData.length}, Item categories: ${itemCategoryData.length}, UOM: ${uomData.length}, Cost centers: ${costCenterData.length}`);

    // ===== 2.58. LOAD CATEGORY_GROUP, CATEGORY (data.prisma) =====



    // ===== 2.6. SETUP ZOHO BOOKS ERP CONNECTION =====
    console.log('🔌 Setting up Zoho Books ERP connection...');
    if (orgData.length > 0) {
      const orgId = 'org_indian_demo'; // Use the first organization's ID

      // Extract Zoho credentials from environment variables
      const clientId = process.env.ZOHO_CLIENT_ID;
      const clientSecret = process.env.ZOHO_CLIENT_SECRET;
      const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
      const organizationId = process.env.ZOHO_ORGANIZATION_ID;
      const apiDomain = process.env.ZOHO_API_DOMAIN || 'www.zohoapis.com';
      const accountsDomain = process.env.ZOHO_ACCOUNTS_DOMAIN || 'https://accounts.zoho.in';

      if (clientId && clientSecret && refreshToken) {
        // Check if ERP_CONFIG_ENCRYPTION_KEY is set
        if (!process.env.ERP_CONFIG_ENCRYPTION_KEY) {
          console.log('  ⚠️  Warning: ERP_CONFIG_ENCRYPTION_KEY not set. Skipping Zoho Books configuration.');
          console.log('     Set ERP_CONFIG_ENCRYPTION_KEY in environment to enable ERP connection setup.');
        } else {
          try {
            // Prepare connection config (plain object - Prisma middleware will encrypt automatically)
            const connectionConfig = {
              oauth: {
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                organization_id: organizationId,
                api_domain: apiDomain,
                accounts_domain: accountsDomain,
              },
            };

            const extractionConfig = buildAirbyteExtractionConfigFromEnv(
              process.env.AIRBYTE_CONNECTION_ID_ZOHO
            );

            // Prisma middleware automatically encrypts connection_config before saving
            // Check if record exists
            const existing = await prisma.source_system.findFirst({
              where: {
                org_id: 'org_indian_demo',
                system_type: 'zoho_books',
              },
            });

            if (existing) {
              // Update existing record (middleware encrypts automatically)
              await prisma.source_system.update({
                where: { id: existing.id },
                data: {
                  connection_config: connectionConfig as any,
                  ...(extractionConfig ? { extraction_config: extractionConfig as any } : {}),
                  modified_at: new Date(),
                },
              });
              console.log(`  ✓ Updated Zoho Books connection for org ${orgId} (id: ${existing.id})`);
              if (extractionConfig) {
                console.log('    ✓ Airbyte extraction_config applied (Indian demo / Zoho)');
              } else {
                console.log(
                  '    ⚠️  Skipping extraction_config: set AIRBYTE_CLIENT_ID, AIRBYTE_CLIENT_SECRET, AIRBYTE_CONNECTION_ID_ZOHO'
                );
              }
            } else {
              // Insert new record (middleware encrypts automatically)
              const newRecord = await prisma.source_system.create({
                data: {
                  org_id: orgId,
                  system_type: 'zoho_books',
                  name: 'Zoho Books Production',
                  connection_config: connectionConfig as any,
                  ...(extractionConfig ? { extraction_config: extractionConfig as any } : {}),
                  is_active: true,
                },
              });
              console.log(`  ✓ Created Zoho Books connection for org ${orgId} (id: ${newRecord.id})`);
              if (extractionConfig) {
                console.log('    ✓ Airbyte extraction_config applied (Indian demo / Zoho)');
              } else {
                console.log(
                  '    ⚠️  Skipping extraction_config: set AIRBYTE_CLIENT_ID, AIRBYTE_CLIENT_SECRET, AIRBYTE_CONNECTION_ID_ZOHO'
                );
              }
            }
          } catch (error) {
            console.error('  ❌ Error setting up Zoho Books connection:', error);
            throw error;
          }
        }
      } else {
        console.log('  ⚠️  Warning: Zoho Books credentials not found in environment variables.');
        console.log('     Required: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN');
        console.log('     Optional: ZOHO_ORGANIZATION_ID, ZOHO_API_DOMAIN, ZOHO_ACCOUNTS_DOMAIN');
      }
    } else {
      console.log('  ⚠️  Warning: No organizations found. Skipping Zoho Books configuration.');
    }

    // ===== 2.9. LOAD PAYMENT_TERMS FROM CSV (before customers so payment_term_id can be set) =====
    const paymentTermsSeedCounts = await seedPaymentTermsFromCsv({ prismaClient: prisma });
    const paymentTermsLoadedCount = paymentTermsSeedCounts.total;

    // ===== 3. LOAD AND INSERT CUSTOMER DATA =====
    console.log('👥 Loading customer data...');
    const customerData = await loadCsvData(path.join(__dirname, 'customers.csv'));

    for (const customer of customerData) {
      const updateData: any = {
        customer_name: customer.customer_name,
        primary_email: customer.primary_email,
        primary_phone: customer.primary_phone,
        customer_address: customer.customer_address,
        city: customer.city,
        state: customer.state,
        country: customer.country,
        zip_code: customer.zip_code,
        industry: customer.industry,
        website: customer.website,
        org_id: customer.org_id,
        preferred_currency_id: customer.preferred_currency_id,
        payment_term_id: customer.payment_term_id,
      };

      const createData: any = {
        id: customer.id,
        customer_name: customer.customer_name,
        primary_email: customer.primary_email,
        primary_phone: customer.primary_phone,
        customer_address: customer.customer_address,
        city: customer.city,
        state: customer.state,
        country: customer.country,
        zip_code: customer.zip_code,
        industry: customer.industry,
        website: customer.website,
        org_id: customer.org_id,
        preferred_currency_id: customer.preferred_currency_id,
        payment_term_id: customer.payment_term_id,
      };

      // Only add preferred_currency_id if it exists and is not 'null'
      if (customer.preferred_currency_id && customer.preferred_currency_id !== 'null') {
        updateData.preferred_currency_id = customer.preferred_currency_id;
        createData.preferred_currency_id = customer.preferred_currency_id;
      }
      // Only add payment_term_id if it exists and is not empty
      if (customer.payment_term_id && String(customer.payment_term_id).trim() !== '') {
        updateData.payment_term_id = customer.payment_term_id;
        createData.payment_term_id = customer.payment_term_id;
      }

      await prisma.customers.upsert({
        where: { id: customer.id },
        update: updateData,
        create: createData,
      });
    }
    console.log(`  ✓ Loaded ${customerData.length} customers`);

    // ===== 4. LOAD AND INSERT SUPPLIER DATA =====
    console.log('🏭 Loading supplier data...');
    const supplierData = await loadCsvData(path.join(__dirname, 'suppliers.csv'));

    for (const supplier of supplierData) {
      await prisma.supplier.upsert({
        where: { id: supplier.id },
        update: {
          supplier_name: supplier.supplier_name,
          legal_name: supplier.legal_name,
          supplier_address: supplier.supplier_address,
          city: supplier.city,
          state: supplier.state,
          country: supplier.country,
          zip_code: supplier.zip_code,
          primary_phone: supplier.primary_phone,
          alternative_phone: supplier.alternative_phone,
          primary_email: supplier.primary_email,
          secondary_email: supplier.secondary_email,
          industry: supplier.industry,
          business_classification: supplier.business_classification,
          status: supplier.status,
          buyer_review_added: supplier.buyer_review_added,
          onboarded_date: supplier.onboarded_date ? new Date(supplier.onboarded_date) : new Date(),
          org_id: supplier.org_id,
          payment_term_id: supplier.payment_term_id,
          shipping_term_id: supplier.shipping_term_id,
          shipping_method_id: supplier.shipping_method_id,
          preferred_currency_id: supplier.preferred_currency_id,
        },
        create: {
          id: supplier.id,
          supplier_name: supplier.supplier_name,
          legal_name: supplier.legal_name,
          supplier_address: supplier.supplier_address,
          city: supplier.city,
          state: supplier.state,
          country: supplier.country,
          zip_code: supplier.zip_code,
          primary_phone: supplier.primary_phone,
          alternative_phone: supplier.alternative_phone,
          primary_email: supplier.primary_email,
          secondary_email: supplier.secondary_email,
          industry: supplier.industry,
          business_classification: supplier.business_classification,
          status: supplier.status,
          buyer_review_added: supplier.buyer_review_added,
          onboarded_date: supplier.onboarded_date ? new Date(supplier.onboarded_date) : new Date(),
          org_id: supplier.org_id,
          payment_term_id: supplier.payment_term_id,
          shipping_term_id: supplier.shipping_term_id,
          shipping_method_id: supplier.shipping_method_id,
          preferred_currency_id: supplier.preferred_currency_id,
        },
      });
    }
    console.log(`  ✓ Loaded ${supplierData.length} suppliers`);

    // ===== 5. LOAD AND INSERT LOCATION DATA =====
    console.log('🏢 Loading location data...');
    const locationData = await loadCsvData(path.join(__dirname, 'locations.csv'));

    for (const location of locationData) {
      const updateData: any = {
        location: location.location,
        address: location.address,
        city: location.city,
        state: location.state,
        country: location.country,
        zip_code: location.zip_code,
        org_id: location.org_id,
        legal_entity_id: location.legal_entity_id,
      };

      const createData: any = {
        id: location.id,
        location: location.location,
        address: location.address,
        city: location.city,
        state: location.state,
        country: location.country,
        zip_code: location.zip_code,
        org_id: location.org_id,
        legal_entity_id: location.legal_entity_id,
      };

      // Only add optional fields if they exist and are not empty
      if (location.customer_id && typeof location.customer_id === 'string' && location.customer_id.trim() !== '') {
        updateData.customer_id = location.customer_id;
        createData.customer_id = location.customer_id;
      }

      // Temporarily skip legal_entity_id to test the rest of the script
      // if (location.legal_entity_id && location.legal_entity_id.trim() !== '') {
      //   updateData.legal_entity_id = location.legal_entity_id;
      //   createData.legal_entity_id = location.legal_entity_id;
      // }

      await prisma.location.upsert({
        where: { id: location.id },
        update: updateData,
        create: createData,
      });
    }
    console.log(`  ✓ Loaded ${locationData.length} locations`);

    // ===== 6. LOAD AND INSERT ITEM DATA =====
    console.log('📦 Loading item data...');
    const itemData = await loadCsvData(path.join(__dirname, 'items.csv'));

    for (const item of itemData) {
      const updateData: any = {
        item_code: item.item_code,
        item_name: item.item_name,
        name: item.name,
        item_shortname: item.item_shortname,
        item_description: item.item_description,
        item_type: item.item_type,
        unit_price: parseFloat(item.unit_price),
        stockable: item.stockable,
        item_status: item.item_status,
        supplier_id: item.supplier_id,
        uom_id: item.uom_id || null,
        tax_master_id: item.tax_master_id || null,
        tax_rate_intra_id: item.tax_rate_intra_id || null,
        org_id: item.org_id,
        currency_id: item.currency_id || null,
      };

      const createData: any = {
        id: item.id,
        item_code: item.item_code,
        item_name: item.item_name,
        name: item.name,
        item_shortname: item.item_shortname,
        item_description: item.item_description,
        item_type: item.item_type,
        unit_price: parseFloat(item.unit_price),
        stockable: item.stockable,
        item_status: item.item_status,
        supplier_id: item.supplier_id,
        item_category_id: item.item_category_id || null,
        uom_id: item.uom_id || null,
        tax_master_id: item.tax_master_id || null,
        tax_rate_intra_id: item.tax_rate_intra_id || null,
        org_id: item.org_id,
      };

      // Only add currency_id if it exists and is not empty or 'undefined'
      if (item.currency_id && typeof item.currency_id === 'string' && item.currency_id.trim() !== '' && item.currency_id.trim() !== 'undefined') {
        updateData.currency_id = item.currency_id;
        createData.currency_id = item.currency_id;
      }

      await prisma.item_master.upsert({
        where: { id: item.id },
        update: updateData,
        create: createData,
      });
    }
    console.log(`  ✓ Loaded ${itemData.length} items`);

    // ===== 6.5. LOAD SUPPLIER_ITEMS FROM CSV =====
    console.log('🔗 Loading supplier items...');
    const supplierItemsData = await loadCsvData(path.join(__dirname, 'supplier_items.csv'));
    for (const row of supplierItemsData) {
      await prisma.supplier_items.upsert({
        where: { id: row.id },
        update: { supplier_id: row.supplier_id || null, item_id: row.item_id || null, org_id: row.org_id || null },
        create: { id: row.id, supplier_id: row.supplier_id || null, item_id: row.item_id || null, org_id: row.org_id || null },
      });
    }
    console.log(`  ✓ Loaded ${supplierItemsData.length} supplier_items`);

    // ===== 7. LOAD AND INSERT USER DATA =====
    console.log('👤 Loading user data...');
    const userData = await loadCsvData(path.join(__dirname, 'users.csv'));

    for (const user of userData) {
      await prisma.user.upsert({
        where: { id: user.id },
        update: {
          email: user.email,
          name: user.name,
          password: user.password,
          external_id: user.external_id,
          auth_provider: user.auth_provider,
          manager_id: user.manager_id || null,
          org_id: user.org_id,
        },
        create: {
          id: user.id,
          email: user.email,
          name: user.name,
          password: user.password,
          external_id: user.external_id,
          auth_provider: user.auth_provider,
          manager_id: user.manager_id || null,
          org_id: user.org_id,
        },
      });
    }
    console.log(`  ✓ Loaded ${userData.length} users`);

    // ===== 8. LOAD AND INSERT ROLE-USER DATA =====
    console.log('🔗 Loading role-user assignments...');
    const roleUserData = await loadCsvData(path.join(__dirname, 'role_user.csv'));

    // Sanjay: Finance Team + Super Admin (no Buyer) — remove legacy assignment if re-seeding
    const removedSanjayBuyer = await prisma.role_user.deleteMany({
      where: {
        user_id: 'user_sanjay_gupta',
        role_id: 'role_83c8876b-a13b-4098-84ca-da0832abade3',
        org_id: 'org_indian_demo',
      },
    });
    if (removedSanjayBuyer.count > 0) {
      console.log(`  ✓ Removed ${removedSanjayBuyer.count} Buyer role assignment for Sanjay Gupta`);
    }

    for (const user of userData) {
      const apiKeyHash = await hashStableDemoApiKey(stableIndianDemoApiKeyPlaintext(user.id));
      await prisma.user.upsert({
        where: { id: user.id },
        update: {
          email: user.email,
          name: user.name,
          password: user.password,
          external_id: user.external_id,
          auth_provider: user.auth_provider,
          manager_id: user.manager_id || null,
          org_id: user.org_id,
          api_key: apiKeyHash,
        },
        create: {
          id: user.id,
          email: user.email,
          name: user.name,
          password: user.password,
          external_id: user.external_id,
          auth_provider: user.auth_provider,
          manager_id: user.manager_id || null,
          org_id: user.org_id,
          api_key: apiKeyHash,
        },
      });
    }
    console.log(`  ✓ Loaded ${userData.length} users (stable X-API-Key per user: fabriq-indian-demo-<user_id> — see prisma/demo-stable-api-keys.ts)`);

    for (const roleUser of roleUserData) {
      await prisma.role_user.upsert({
        where: { id: roleUser.id },
        update: {
          role_id: roleUser.role_id,
          user_id: roleUser.user_id,
          created_at: new Date(roleUser.created_at),
          modified_at: new Date(roleUser.modified_at),
          created_by: roleUser.created_by,
          modified_by: roleUser.modified_by,
          org_id: roleUser.org_id,
        },
        create: {
          id: roleUser.id,
          role_id: roleUser.role_id,
          user_id: roleUser.user_id,
          created_at: new Date(roleUser.created_at),
          modified_at: new Date(roleUser.modified_at),
          created_by: roleUser.created_by,
          modified_by: roleUser.modified_by,
          org_id: roleUser.org_id,
        },
      });
    }
    console.log(`  ✓ Loaded ${roleUserData.length} role-user assignments`);

    // ===== 8.5. LOAD BUSINESS_UNIT AND DEPARTMENT FROM CSV =====
    console.log('🏢 Loading business units and departments...');
    const businessUnitData = await loadCsvData(path.join(__dirname, 'business_unit.csv'));
    for (const row of businessUnitData) {
      await prisma.business_unit.upsert({
        where: { id: row.id },
        update: { business_unit: row.business_unit || null, name: row.name || null, legal_entity_id: row.legal_entity_id || null, status: row.status || null, created_by: row.created_by, org_id: row.org_id || null },
        create: { id: row.id, business_unit: row.business_unit || null, name: row.name || null, legal_entity_id: row.legal_entity_id || null, status: row.status || null, created_by: row.created_by, org_id: row.org_id || null },
      });
    }
    const departmentData = await loadCsvData(path.join(__dirname, 'department.csv'));
    for (const row of departmentData) {
      await prisma.department.upsert({
        where: { id: row.id },
        update: { name: row.name, legal_entity_id: row.legal_entity_id, business_unit_id: row.business_unit_id || null, org_id: row.org_id || null },
        create: { id: row.id, name: row.name, legal_entity_id: row.legal_entity_id, business_unit_id: row.business_unit_id || null, org_id: row.org_id || null },
      });
    }
    console.log(`  ✓ Business units: ${businessUnitData.length}, Departments: ${departmentData.length}`);

    // ===== 8.55. SALES PIPELINE (SO, QUOTE, DC, CREDIT NOTE), FX, INVESTMENTS =====
    const baseTxnDate = new Date();
    baseTxnDate.setMonth(baseTxnDate.getMonth() - 2);
    const dateWithOffset = (daysOffset: number) => {
      const d = new Date(baseTxnDate);
      d.setDate(d.getDate() + daysOffset);
      return d;
    };
    const csvStr = (v?: string) => (v != null && String(v).trim() !== '' ? String(v).trim() : '');
    const csvOpt = (v?: string) => {
      const s = csvStr(v);
      return s === '' || s === 'null' || s === 'undefined' ? null : s;
    };
    const parseTags = (v?: string) => {
      const s = csvStr(v);
      if (!s) return [] as string[];
      return s.split('|').map((t) => t.trim()).filter(Boolean);
    };

    const accountIdByCoaCode = async (code: string) => {
      const acc = await prisma.account.findFirst({
        where: { org_id: 'org_indian_demo', legal_entity_id: 'org_indian_demo', code },
      });
      if (!acc) {
        throw new Error(`Indian demo: COA account code "${code}" not found for org org_indian_demo`);
      }
      return acc.id;
    };

    // Currencies are global (org_id = 'system') — look up by code only
    const currencyIdByCode = async (isoCode: string) => {
      const code = isoCode.toUpperCase();
      const cur = await prisma.currency.findUnique({ where: { code } });
      if (!cur) {
        throw new Error(`Indian demo: currency code "${code}" not found in global currency table`);
      }
      return cur.id;
    };

    /** exchange_rate.csv: use public.currency.id (e.g. curr_usd); ISO code fallback for legacy rows */
    const exchangeRateCurrencyId = async (_orgId: string, cell: string | undefined) => {
      const raw = csvStr(cell ?? '');
      if (!raw) {
        throw new Error(`Indian demo: exchange_rate row missing currency id/code`);
      }
      const byId = await prisma.currency.findUnique({ where: { id: raw } });
      if (byId) return byId.id;
      return currencyIdByCode(raw);
    };

    console.log('🧾 Loading sales orders and line items from CSV...');
    const salesOrderRows = await loadCsvData(path.join(__dirname, 'sales_order.csv'));
    for (const row of salesOrderRows) {
      const soDate = dateWithOffset(parseInt(row.days_offset, 10) || 0);
      await prisma.sales_order.upsert({
        where: { id: row.id },
        update: {
          so_number: row.so_number || null,
          so_date: soDate,
          customer_id: csvOpt(row.customer_id),
          location_id: csvOpt(row.location_id),
          total_amount: parseFloat(row.total_amount),
          status: csvStr(row.status) || null,
          payment_terms_id: csvOpt(row.payment_terms_id),
          shipping_method_id: csvOpt(row.shipping_method_id),
          shipping_terms_id: csvOpt(row.shipping_terms_id),
          org_id: row.org_id,
          created_by: csvOpt(row.created_by),
          notes: csvOpt(row.notes),
        },
        create: {
          id: row.id,
          so_number: row.so_number || null,
          so_date: soDate,
          customer_id: csvOpt(row.customer_id),
          location_id: csvOpt(row.location_id),
          total_amount: parseFloat(row.total_amount),
          status: csvStr(row.status) || null,
          payment_terms_id: csvOpt(row.payment_terms_id),
          shipping_method_id: csvOpt(row.shipping_method_id),
          shipping_terms_id: csvOpt(row.shipping_terms_id),
          org_id: row.org_id,
          created_by: csvOpt(row.created_by),
          notes: csvOpt(row.notes),
        },
      });
    }
    const salesOrderItemRows = await loadCsvData(path.join(__dirname, 'sales_order_item.csv'));
    for (const row of salesOrderItemRows) {
      await prisma.sales_order_item.upsert({
        where: { id: row.id },
        update: {
          sales_order_id: csvOpt(row.sales_order_id),
          item_master_id: csvOpt(row.item_master_id),
          item_name: csvOpt(row.item_name),
          quantity: parseFloat(row.quantity),
          rate: parseFloat(row.rate),
          line_total: parseFloat(row.line_total),
          uom: csvOpt(row.uom),
          org_id: row.org_id,
        },
        create: {
          id: row.id,
          sales_order_id: csvOpt(row.sales_order_id),
          item_master_id: csvOpt(row.item_master_id),
          item_name: csvOpt(row.item_name),
          quantity: parseFloat(row.quantity),
          rate: parseFloat(row.rate),
          line_total: parseFloat(row.line_total),
          uom: csvOpt(row.uom),
          org_id: row.org_id,
        },
      });
    }
    console.log(`  ✓ Sales orders: ${salesOrderRows.length}, Line items: ${salesOrderItemRows.length}`);

    console.log('📑 Loading quotes and quote line items from CSV...');
    const quoteRows = await loadCsvData(path.join(__dirname, 'quote.csv'));
    for (const row of quoteRows) {
      const quoteDate = dateWithOffset(parseInt(row.days_offset, 10) || 0);
      const expOff = parseInt(row.expiry_days_offset, 10);
      const expiryDate = new Date(quoteDate);
      expiryDate.setDate(expiryDate.getDate() + (Number.isFinite(expOff) ? expOff : 30));
      await prisma.quote.upsert({
        where: { id: row.id },
        update: {
          quote_number: row.quote_number || null,
          quote_date: quoteDate,
          expiry_date: expiryDate,
          reference_number: csvOpt(row.reference_number),
          customer_id: csvOpt(row.customer_id),
          location_id: csvOpt(row.location_id),
          sales_order_id: csvOpt(row.sales_order_id),
          project_id: csvOpt(row.project_id),
          status: csvStr(row.status) || null,
          total_amount: parseFloat(row.total_amount),
          org_id: row.org_id,
          created_by: csvOpt(row.created_by),
        },
        create: {
          id: row.id,
          quote_number: row.quote_number || null,
          quote_date: quoteDate,
          expiry_date: expiryDate,
          reference_number: csvOpt(row.reference_number),
          customer_id: csvOpt(row.customer_id),
          location_id: csvOpt(row.location_id),
          sales_order_id: csvOpt(row.sales_order_id),
          project_id: csvOpt(row.project_id),
          status: csvStr(row.status) || null,
          total_amount: parseFloat(row.total_amount),
          org_id: row.org_id,
          created_by: csvOpt(row.created_by),
        },
      });
    }
    const quoteItemRows = await loadCsvData(path.join(__dirname, 'quote_item.csv'));
    for (const row of quoteItemRows) {
      await prisma.quote_item.upsert({
        where: { id: row.id },
        update: {
          quote_id: row.quote_id,
          item_master_id: csvOpt(row.item_master_id),
          item_name: csvOpt(row.item_name),
          quantity: parseFloat(row.quantity),
          rate: parseFloat(row.rate),
          line_total: parseFloat(row.line_total),
          uom: csvOpt(row.uom),
          org_id: row.org_id,
        },
        create: {
          id: row.id,
          quote_id: row.quote_id,
          item_master_id: csvOpt(row.item_master_id),
          item_name: csvOpt(row.item_name),
          quantity: parseFloat(row.quantity),
          rate: parseFloat(row.rate),
          line_total: parseFloat(row.line_total),
          uom: csvOpt(row.uom),
          org_id: row.org_id,
        },
      });
    }
    console.log(`  ✓ Quotes: ${quoteRows.length}, Quote line items: ${quoteItemRows.length}`);

    console.log('🚚 Loading delivery challans and line items from CSV...');
    const dcRows = await loadCsvData(path.join(__dirname, 'delivery_challan.csv'));
    for (const row of dcRows) {
      const challanDate = dateWithOffset(parseInt(row.days_offset, 10) || 0);
      const delOff = parseInt(row.delivery_days_offset, 10);
      const deliveryDate = Number.isFinite(delOff) ? dateWithOffset(delOff) : null;
      await prisma.delivery_challan.upsert({
        where: { id: row.id },
        update: {
          challan_number: row.challan_number || null,
          challan_date: challanDate,
          challan_type: (csvStr(row.challan_type) || 'DELIVERY') as any,
          sales_order_id: csvOpt(row.sales_order_id),
          customer_id: csvOpt(row.customer_id),
          location_id: csvOpt(row.location_id),
          delivery_status: (csvStr(row.delivery_status) || null) as any,
          delivery_date: deliveryDate,
          driver_name: csvOpt(row.driver_name),
          vehicle_number: csvOpt(row.vehicle_number),
          reference_number: csvOpt(row.reference_number),
          total_amount: parseFloat(row.total_amount),
          status: csvStr(row.status) || null,
          org_id: row.org_id,
        },
        create: {
          id: row.id,
          challan_number: row.challan_number || null,
          challan_date: challanDate,
          challan_type: (csvStr(row.challan_type) || 'DELIVERY') as any,
          sales_order_id: csvOpt(row.sales_order_id),
          customer_id: csvOpt(row.customer_id),
          location_id: csvOpt(row.location_id),
          delivery_status: (csvStr(row.delivery_status) || null) as any,
          delivery_date: deliveryDate,
          driver_name: csvOpt(row.driver_name),
          vehicle_number: csvOpt(row.vehicle_number),
          reference_number: csvOpt(row.reference_number),
          total_amount: parseFloat(row.total_amount),
          status: csvStr(row.status) || null,
          org_id: row.org_id,
        },
      });
    }
    const dcItemRows = await loadCsvData(path.join(__dirname, 'delivery_challan_item.csv'));
    for (const row of dcItemRows) {
      await prisma.delivery_challan_item.upsert({
        where: { id: row.id },
        update: {
          delivery_challan_id: row.delivery_challan_id,
          sales_order_item_id: csvOpt(row.sales_order_item_id),
          item_master_id: csvOpt(row.item_master_id),
          quantity_ordered: parseFloat(row.quantity_ordered),
          quantity_delivered: parseFloat(row.quantity_delivered),
          rate: parseFloat(row.rate),
          line_total: parseFloat(row.line_total),
          uom: csvOpt(row.uom),
          delivery_status: (csvStr(row.delivery_status) || null) as any,
          org_id: row.org_id,
        },
        create: {
          id: row.id,
          delivery_challan_id: row.delivery_challan_id,
          sales_order_item_id: csvOpt(row.sales_order_item_id),
          item_master_id: csvOpt(row.item_master_id),
          quantity_ordered: parseFloat(row.quantity_ordered),
          quantity_delivered: parseFloat(row.quantity_delivered),
          rate: parseFloat(row.rate),
          line_total: parseFloat(row.line_total),
          uom: csvOpt(row.uom),
          delivery_status: (csvStr(row.delivery_status) || null) as any,
          org_id: row.org_id,
        },
      });
    }
    console.log(`  ✓ Delivery challans: ${dcRows.length}, DC line items: ${dcItemRows.length}`);

    console.log('💱 Loading exchange rates from CSV...');
    const exchangeRateRows = await loadCsvData(path.join(__dirname, 'exchange_rate.csv'));
    for (const row of exchangeRateRows) {
      const eff = row.effective_date ? new Date(row.effective_date) : new Date();
      const exOrgId = csvStr(row.org_id) || 'org_indian_demo';
      const fromCell = row.from_currency_id ?? row.from_currency;
      const toCell = row.to_currency_id ?? row.to_currency;
      const fromCurrencyId = await exchangeRateCurrencyId(exOrgId, fromCell);
      const toCurrencyId = await exchangeRateCurrencyId(exOrgId, toCell);
      await prisma.exchange_rate.upsert({
        where: { id: row.id },
        update: {
          org_id: row.org_id,
          from_currency_id: fromCurrencyId,
          to_currency_id: toCurrencyId,
          effective_date: eff,
          rate: row.rate,
          rate_type: (csvStr(row.rate_type) || 'SPOT') as any,
          source: csvOpt(row.source),
        },
        create: {
          id: row.id,
          org_id: row.org_id,
          from_currency_id: fromCurrencyId,
          to_currency_id: toCurrencyId,
          effective_date: eff,
          rate: row.rate,
          rate_type: (csvStr(row.rate_type) || 'SPOT') as any,
          source: csvOpt(row.source),
        },
      });
    }
    console.log(`  ✓ Exchange rates: ${exchangeRateRows.length}`);

    console.log('📈 Loading instruments, holdings, and trades from CSV...');
    const instrumentRows = await loadCsvData(path.join(__dirname, 'instrument.csv'));
    for (const row of instrumentRows) {
      let details: any = undefined;
      const dj = csvStr(row.details_json);
      if (dj) {
        try {
          details = JSON.parse(dj);
        } catch {
          details = {};
        }
      }
      await prisma.instrument.upsert({
        where: { id: row.id },
        update: {
          org_id: csvOpt(row.org_id),
          symbol: row.symbol,
          name: row.name,
          type: csvStr(row.type) as any,
          isin: csvOpt(row.isin),
          details: details ?? undefined,
        },
        create: {
          id: row.id,
          org_id: csvOpt(row.org_id),
          symbol: row.symbol,
          name: row.name,
          type: csvStr(row.type) as any,
          isin: csvOpt(row.isin),
          details: details ?? undefined,
        },
      });
    }

    const holdingRows = await loadCsvData(path.join(__dirname, 'holding.csv'));
    for (const row of holdingRows) {
      const accId = await accountIdByCoaCode(csvStr(row.account_code));
      const holdingOrgId = csvStr(row.org_id) || 'org_indian_demo';
      const currencyId = await currencyIdByCode(
        csvStr(row.currency) || 'INR',
      );
      const lastTradeOff = parseInt(row.last_trade_days_offset, 10);
      const lastTradeDate = Number.isFinite(lastTradeOff) ? dateWithOffset(lastTradeOff) : null;
      await prisma.holding.upsert({
        where: { id: row.id },
        update: {
          org_id: csvOpt(row.org_id),
          account_id: accId,
          instrument_id: row.instrument_id,
          quantity: row.quantity,
          average_cost: row.average_cost,
          current_price: csvOpt(row.current_price) ? row.current_price : null,
          market_value: csvOpt(row.market_value) ? row.market_value : null,
          currency_id: currencyId,
          last_trade_date: lastTradeDate,
          notes: csvOpt(row.notes),
          tags: parseTags(row.tags),
        },
        create: {
          id: row.id,
          org_id: csvOpt(row.org_id),
          account_id: accId,
          instrument_id: row.instrument_id,
          quantity: row.quantity,
          average_cost: row.average_cost,
          current_price: csvOpt(row.current_price) ? row.current_price : null,
          market_value: csvOpt(row.market_value) ? row.market_value : null,
          currency_id: currencyId,
          last_trade_date: lastTradeDate,
          notes: csvOpt(row.notes),
          tags: parseTags(row.tags),
        },
      });
    }

    const tradeRows = await loadCsvData(path.join(__dirname, 'trade.csv'));
    for (const row of tradeRows) {
      const accId = await accountIdByCoaCode(csvStr(row.account_code));
      const tgtCode = csvStr(row.target_account_code);
      const tgtId = tgtCode ? await accountIdByCoaCode(tgtCode) : null;
      const vd = dateWithOffset(parseInt(row.value_days_offset, 10) || 0);
      await prisma.trade.upsert({
        where: { id: row.id },
        update: {
          org_id: csvOpt(row.org_id),
          instrument_id: csvOpt(row.instrument_id),
          account_id: accId,
          target_account_id: tgtId,
          type: csvStr(row.type) as any,
          quantity: row.quantity,
          price: row.price,
          brokerage: csvOpt(row.brokerage) ? row.brokerage : null,
          tax: csvOpt(row.tax) ? row.tax : null,
          net_amount: csvOpt(row.net_amount) ? row.net_amount : null,
          total_amount: csvOpt(row.total_amount) ? row.total_amount : null,
          exchange: csvOpt(row.exchange),
          value_date: vd,
          trade_id: csvOpt(row.trade_id_external),
          name: csvOpt(row.name),
        },
        create: {
          id: row.id,
          org_id: csvOpt(row.org_id),
          instrument_id: csvOpt(row.instrument_id),
          account_id: accId,
          target_account_id: tgtId,
          type: csvStr(row.type) as any,
          quantity: row.quantity,
          price: row.price,
          brokerage: csvOpt(row.brokerage) ? row.brokerage : null,
          tax: csvOpt(row.tax) ? row.tax : null,
          net_amount: csvOpt(row.net_amount) ? row.net_amount : null,
          total_amount: csvOpt(row.total_amount) ? row.total_amount : null,
          exchange: csvOpt(row.exchange),
          value_date: vd,
          trade_id: csvOpt(row.trade_id_external),
          name: csvOpt(row.name),
        },
      });
    }
    console.log(`  ✓ Instruments: ${instrumentRows.length}, Holdings: ${holdingRows.length}, Trades: ${tradeRows.length}`);

    Object.assign(indianDemoSeedRowCounts, {
      salesOrders: salesOrderRows.length,
      salesOrderItems: salesOrderItemRows.length,
      quotes: quoteRows.length,
      quoteItems: quoteItemRows.length,
      deliveryChallans: dcRows.length,
      deliveryChallanItems: dcItemRows.length,
      exchangeRates: exchangeRateRows.length,
      instruments: instrumentRows.length,
      holdings: holdingRows.length,
      trades: tradeRows.length,
    });

    // ===== 8.6. LOAD BUDGET_PERIOD, BUDGET_LINE, GENERAL_LEDGER, PROJECT_MASTER =====
    const createdByUser = userData.length > 0 ? userData[0].id : 'system';
    const demoAccountForBudget = await prisma.account.findFirst({
      where: { org_id: 'org_indian_demo', legal_entity_id: 'org_indian_demo' },
    });
    console.log('📊 Loading budget periods, budget lines, general ledger, and projects...');
    const budgetPeriodData = await loadCsvData(path.join(__dirname, 'budget_period.csv'));
    for (const row of budgetPeriodData) {
      const fromDate = row.from_date ? new Date(row.from_date) : null;
      const toDate = row.to_date ? new Date(row.to_date) : null;
      await prisma.budget_period.upsert({
        where: { id: row.id },
        update: {
          budget_period: row.budget_period || null,
          from_date: fromDate,
          to_date: toDate,
          status: row.status || null,
          created_by: createdByUser,
          org_id: row.org_id || null,
          account_id: demoAccountForBudget?.id ?? undefined,
        },
        create: {
          id: row.id,
          budget_period: row.budget_period || null,
          from_date: fromDate,
          to_date: toDate,
          status: row.status || null,
          created_by: createdByUser,
          org_id: row.org_id || null,
          account_id: demoAccountForBudget?.id ?? undefined,
        },
      });
    }
    const budgetLineData = await loadCsvData(path.join(__dirname, 'budget_line.csv'));
    for (const row of budgetLineData) {
      const bpStart = row.bp_start_date ? new Date(row.bp_start_date) : null;
      const bpEnd = row.bp_end_date ? new Date(row.bp_end_date) : null;
      await prisma.budget_line.upsert({
        where: { id: row.id },
        update: {
          budget_line: row.budget_line || null,
          budget_period_id: row.budget_period_id || null,
          bp_start_date: bpStart,
          bp_end_date: bpEnd,
          allocated_budget: parseFloat(row.allocated_budget),
          created_by: createdByUser,
          org_id: row.org_id,
        },
        create: {
          id: row.id,
          budget_line: row.budget_line || null,
          budget_period_id: row.budget_period_id || null,
          bp_start_date: bpStart,
          bp_end_date: bpEnd,
          allocated_budget: parseFloat(row.allocated_budget),
          created_by: createdByUser,
          org_id: row.org_id,
        },
      });
    }
    const generalLedgerData = await loadCsvData(path.join(__dirname, 'general_ledger.csv'));
    for (const row of generalLedgerData) {
      await prisma.general_ledger.upsert({
        where: { id: row.id },
        update: {
          gl_number: row.gl_number || null,
          gl_code: parseInt(row.gl_code, 10),
          gl_name: row.gl_name,
          description: row.description,
          account_id: (demoAccountForBudget?.id ?? row.account_id) || null,
          legal_entity_id: 'org_indian_demo',
          status: row.status || null,
          created_by: createdByUser,
          org_id: row.org_id || null,
        },
        create: {
          id: row.id,
          gl_number: row.gl_number || null,
          gl_code: parseInt(row.gl_code, 10),
          gl_name: row.gl_name,
          description: row.description,
          account_id: (demoAccountForBudget?.id ?? row.account_id) || null,
          legal_entity_id: 'org_indian_demo',
          status: row.status || null,
          created_by: createdByUser,
          org_id: row.org_id || null,
        },
      });
    }
    const projectMasterData = await loadCsvData(path.join(__dirname, 'project_master.csv'));
    for (const row of projectMasterData) {
      const projStart = row.project_start_date ? new Date(row.project_start_date) : null;
      const projEnd = row.project_end_date ? new Date(row.project_end_date) : null;
      await prisma.project_master.upsert({
        where: { id: row.id },
        update: {
          project_code: row.project_code || null,
          project_name: row.project_name || null,
          legal_entity_id: row.legal_entity_id || null,
          project_start_date: projStart,
          project_end_date: projEnd,
          budget_line_id: row.budget_line_id || null,
          account_id: demoAccountForBudget?.id ?? undefined,
          created_by: createdByUser,
          org_id: row.org_id || null,
        },
        create: {
          id: row.id,
          project_code: row.project_code || null,
          project_name: row.project_name || null,
          legal_entity_id: row.legal_entity_id || null,
          project_start_date: projStart,
          project_end_date: projEnd,
          budget_line_id: row.budget_line_id || null,
          account_id: demoAccountForBudget?.id ?? undefined,
          created_by: createdByUser,
          org_id: row.org_id || null,
        },
      });
    }
    console.log(`  ✓ Budget periods: ${budgetPeriodData.length}, Budget lines: ${budgetLineData.length}, General ledger: ${generalLedgerData.length}, Projects: ${projectMasterData.length}`);

    // ===== 8.7. LOAD EMPLOYEE_MASTER (resolve role by role_name) =====
    console.log('👥 Loading employee master...');
    const employeeMasterData = await loadCsvData(path.join(__dirname, 'employee_master.csv'));
    for (const row of employeeMasterData) {
      const role = await prisma.role.findFirst({ where: { name: row.role_name } });
      if (!role) {
        console.warn(`  ⚠️  Role "${row.role_name}" not found, skipping employee ${row.id}`);
        continue;
      }
      await prisma.employee_master.upsert({
        where: { id: row.id },
        update: {
          first_name: row.first_name,
          last_name: row.last_name || null,
          email: row.email,
          legal_entity_id: row.legal_entity_id,
          business_unit_id: row.business_unit_id || null,
          user_id: row.user_id,
          user_role_id: role.id,
          manager: row.manager,
          location_id: row.location_id,
          cost_center_id: row.cost_center_id,
          department_id: row.department_id,
          org_id: row.org_id,
        },
        create: {
          id: row.id,
          first_name: row.first_name,
          last_name: row.last_name || null,
          email: row.email,
          legal_entity_id: row.legal_entity_id,
          business_unit_id: row.business_unit_id || null,
          user_id: row.user_id,
          user_role_id: role.id,
          manager: row.manager,
          location_id: row.location_id,
          cost_center_id: row.cost_center_id,
          department_id: row.department_id,
          org_id: row.org_id,
        },
      });
    }
    console.log(`  ✓ Employee master: ${employeeMasterData.length} records`);

    // ===== 9. DEMO DATA FOR RECONCILIATION + AR (from CSV) =====
    const demoOrgId = 'org_indian_demo';
    const demoLegalEntityId = 'org_indian_demo';

    const bankAccount = await prisma.account.findFirst({
      where: { org_id: demoOrgId, legal_entity_id: demoLegalEntityId, code: '1102' },
    });
    const arAccount = await prisma.account.findFirst({
      where: { org_id: demoOrgId, legal_entity_id: demoLegalEntityId, code: '1105' },
    });
    if (!bankAccount || !arAccount) {
      throw new Error('Chart of accounts missing Checking (1102) or Accounts Receivable (1105). Run COA setup first.');
    }

    const baseDate = new Date();
    baseDate.setMonth(baseDate.getMonth() - 2);

    console.log('📄 Loading sales invoices and line items from CSV...');
    const { invoices: invoiceCount, lineItems: invoiceLineItemCount } =
      await upsertDemoInvoicesFromCsv(arAccount.id, baseDate);
    console.log(`  ✓ Invoices: ${invoiceCount}, Invoice line items: ${invoiceLineItemCount}`);

    console.log('📄 Loading credit notes and line items from CSV (after invoices for FK)...');
    const cnAccountIdAr = await accountIdByCoaCode('1105');
    const creditNoteRows = await loadCsvData(path.join(__dirname, 'credit_note.csv'));
    for (const row of creditNoteRows) {
      const cnDays = parseInt(row.days_offset, 10) || 0;
      const cnDate = new Date(baseDate);
      cnDate.setDate(cnDate.getDate() + cnDays);
      const acctCode = csvStr(row.account_code);
      const acctId = acctCode ? await accountIdByCoaCode(acctCode) : cnAccountIdAr;
      await prisma.credit_note.upsert({
        where: { id: row.id },
        update: {
          credit_note_number: row.credit_note_number || null,
          credit_note_date: cnDate,
          customer_id: csvOpt(row.customer_id),
          location_id: csvOpt(row.location_id),
          invoice_id: csvOpt(row.invoice_id),
          sales_order_id: csvOpt(row.sales_order_id),
          account_id: acctId,
          credit_note_total: parseFloat(row.credit_note_total),
          balance_amount: parseFloat(row.balance_amount),
          credit_note_status: csvStr(row.credit_note_status) || null,
          credit_note_type: csvStr(row.credit_note_type) || null,
          reason: csvOpt(row.reason),
          org_id: row.org_id,
        },
        create: {
          id: row.id,
          credit_note_number: row.credit_note_number || null,
          credit_note_date: cnDate,
          customer_id: csvOpt(row.customer_id),
          location_id: csvOpt(row.location_id),
          invoice_id: csvOpt(row.invoice_id),
          sales_order_id: csvOpt(row.sales_order_id),
          account_id: acctId,
          credit_note_total: parseFloat(row.credit_note_total),
          balance_amount: parseFloat(row.balance_amount),
          credit_note_status: csvStr(row.credit_note_status) || null,
          credit_note_type: csvStr(row.credit_note_type) || null,
          reason: csvOpt(row.reason),
          org_id: row.org_id,
        },
      });
    }
    const creditNoteItemRows = await loadCsvData(path.join(__dirname, 'credit_note_item.csv'));
    for (const row of creditNoteItemRows) {
      await prisma.credit_note_item.upsert({
        where: { id: row.id },
        update: {
          credit_note_id: row.credit_note_id,
          item_master_id: csvOpt(row.item_master_id),
          invoice_line_item_id: csvOpt(row.invoice_line_item_id),
          item_name: csvOpt(row.item_name),
          quantity: parseFloat(row.quantity),
          rate: parseFloat(row.rate),
          line_total: parseFloat(row.line_total),
          uom: csvOpt(row.uom),
          org_id: row.org_id,
        },
        create: {
          id: row.id,
          credit_note_id: row.credit_note_id,
          item_master_id: csvOpt(row.item_master_id),
          invoice_line_item_id: csvOpt(row.invoice_line_item_id),
          item_name: csvOpt(row.item_name),
          quantity: parseFloat(row.quantity),
          rate: parseFloat(row.rate),
          line_total: parseFloat(row.line_total),
          uom: csvOpt(row.uom),
          org_id: row.org_id,
        },
      });
    }
    console.log(`  ✓ Credit notes: ${creditNoteRows.length}, CN line items: ${creditNoteItemRows.length}`);
    indianDemoSeedRowCounts.creditNotes = creditNoteRows.length;
    indianDemoSeedRowCounts.creditNoteItems = creditNoteItemRows.length;

    console.log('💳 Loading payment receipts from CSV...');
    const paymentReceiptData = await loadCsvData(path.join(__dirname, 'payment_receipt.csv'));
    for (const row of paymentReceiptData) {
      const daysOffset = parseInt(row.days_offset, 10) || 0;
      const recDate = new Date(baseDate);
      recDate.setDate(recDate.getDate() + daysOffset);
      const invoiceId = row.invoice_id && String(row.invoice_id).trim() !== '' ? row.invoice_id : null;
      const paymentRef = row.payment_reference && String(row.payment_reference).trim() !== '' ? row.payment_reference : null;
      await prisma.payment_receipt.upsert({
        where: { id: row.id },
        update: {
          receipt_number: row.receipt_number,
          receipt_date: recDate,
          customer_id: row.customer_id,
          invoice_id: invoiceId,
          amount: parseFloat(row.amount),
          payment_type: row.payment_type as 'FULL' | 'PARTIAL' | 'ADVANCE',
          payment_reference: paymentRef,
          org_id: row.org_id,
          account_id: bankAccount.id,
          currency_id: row.currency_id,
        },
        create: {
          id: row.id,
          receipt_number: row.receipt_number,
          receipt_date: recDate,
          customer_id: row.customer_id,
          invoice_id: invoiceId,
          amount: parseFloat(row.amount),
          payment_type: row.payment_type as 'FULL' | 'PARTIAL' | 'ADVANCE',
          payment_reference: paymentRef,
          org_id: row.org_id,
          account_id: bankAccount.id,
          currency_id: row.currency_id,
        },
      });
    }
    console.log(`  ✓ Loaded ${paymentReceiptData.length} payment receipts`);

    console.log('📒 Loading journal postings from CSV (India + branches + USA entity)...');
    const postingCount = await upsertAllPostingsFromCsv(demoOrgId);
    console.log(`  ✓ Loaded ${postingCount} journal postings total (double-entry)`);

    console.log('🏦 Loading reconciliation demo bank postings (one-sided, HQ checking 1102)...');
    const reconciliationPostingCount = await upsertReconciliationBankPostingsFromCsv(
      bankAccount,
      demoOrgId,
      demoLegalEntityId,
      baseDate
    );
    console.log(`  ✓ Loaded ${reconciliationPostingCount} reconciliation demo postings from ${RECONCILIATION_POSTING_CSV}`);

    // ===== 10. SUMMARY =====
    console.log('');
    console.log('✅ Indian Demo Data Setup Complete!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   🏢 Organizations: ${orgData.length}`);
    console.log(`   🏢 Business Orgs: ${organizationData.length}`);
    console.log(`   💰 Chart of Accounts: Set up for ${organizationData.length} organizations`);
    if (orgData.length > 0 && process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN && process.env.ERP_CONFIG_ENCRYPTION_KEY) {
      console.log(`   🔌 Zoho Books: Connection configured for org ${orgData[0].id}`);
    }
    console.log(`   👥 Customers: ${customerData.length}`);
    console.log(`   🏭 Suppliers: ${supplierData.length}`);
    console.log(`   🏢 Locations: ${locationData.length}`);
    console.log(`   📦 Items: ${itemData.length}`);
    console.log(`   🔗 Supplier items: ${supplierItemsData.length}`);
    console.log(`   📋 Masters: Shipping (${shippingMethodData.length}), Shipping terms (${shippingTermsData.length}), Tax (${taxMasterData.length}), Item categories (${itemCategoryData.length}), UOM (${uomData.length}), Cost centers (${costCenterData.length}), Business units (${businessUnitData.length}), Departments (${departmentData.length})`);

    console.log(`   📊 Budget periods: ${budgetPeriodData.length}, Budget lines: ${budgetLineData.length}, General ledger: ${generalLedgerData.length}, Projects: ${projectMasterData.length}, Employee master: ${employeeMasterData.length}`);
    console.log(`   👤 Users: ${userData.length}`);
    console.log(`   🔗 Role Assignments: ${roleUserData.length}`);
    console.log(`   📋 Payment terms: ${paymentTermsLoadedCount}`);
    console.log(`   📄 Sales invoices: ${invoiceCount}, Invoice line items: ${invoiceLineItemCount}`);
    console.log(`   💳 Payment receipts: ${paymentReceiptData.length}`);
    console.log(`   📒 Journal postings: ${postingCount}`);
    console.log(`   🏦 Reconciliation demo bank lines: ${reconciliationPostingCount} (${RECONCILIATION_POSTING_CSV})`);
    console.log(
      `   🧾 Sales pipeline: SO ${indianDemoSeedRowCounts.salesOrders} (+${indianDemoSeedRowCounts.salesOrderItems} lines), quotes ${indianDemoSeedRowCounts.quotes} (+${indianDemoSeedRowCounts.quoteItems} lines), DC ${indianDemoSeedRowCounts.deliveryChallans} (+${indianDemoSeedRowCounts.deliveryChallanItems} lines), credit notes ${indianDemoSeedRowCounts.creditNotes} (+${indianDemoSeedRowCounts.creditNoteItems} lines)`
    );
    console.log(
      `   💱 FX & investments: exchange rates ${indianDemoSeedRowCounts.exchangeRates}, instruments ${indianDemoSeedRowCounts.instruments}, holdings ${indianDemoSeedRowCounts.holdings}, trades ${indianDemoSeedRowCounts.trades}`
    );
    console.log('');
    console.log('🎯 Demo Users Available:');
    console.log('   Super Admin + Finance: sanjay.gupta@demo-india.com (Password: Metalimits@123)');
    console.log('   Admin: vikram.joshi@demo-india.com, karan.bhatia@demo-india.com');
    console.log('   Finance Team: priya.patel@demo-india.com, kavya.nair@demo-india.com, divya.menon@demo-india.com, pooja.saxena@demo-india.com, sanjay.gupta@demo-india.com');
    console.log('   Buyers: arjun.sharma@demo-india.com, ananya.singh@demo-india.com, meera.rao@demo-india.com, neha.agarwal@demo-india.com');
    console.log('   Delivery Team: amit.shah@demo-india.com, rajesh.yadav@demo-india.com');
    console.log('   Employees: All users have Employee role');
    console.log('');
    console.log('🇮🇳 Ready for Indian demo scenarios!');

  } catch (error) {
    console.error('❌ Failed to setup Indian demo data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/** Payment receipt IDs seeded by setup (keep these; only delete receipts created by confirming). */
const SEED_RECEIPT_IDS = [
  'payr_demo_001',
  'payr_demo_002',
  'payr_demo_003',
  'payr_demo_004',
  'payr_demo_005',
  'payr_demo_006',
  'payr_demo_007',
];

/**
 * Drop only post_demo_* reconciliation lines (and receipts created by confirming),
 * then reload from posting.csv. FY journal postings (post_fy25_*, etc.) are untouched.
 */
async function resetDemoPostingsAndReceipts() {
  const demoOrgId = 'org_indian_demo';
  const demoLegalEntityId = 'org_indian_demo';

  console.log(`🔄 Resetting reconciliation demo postings (${RECONCILIATION_POSTING_CSV})...`);

  const existingPostings = await prisma.posting.findMany({
    where: { id: { in: DEMO_POSTING_IDS }, org_id: demoOrgId },
    select: { id: true, payment_receipt_id: true },
  });

  const receiptIdsToDelete = existingPostings
    .map((p) => p.payment_receipt_id)
    .filter((id): id is string => id != null && !SEED_RECEIPT_IDS.includes(id));

  if (receiptIdsToDelete.length > 0) {
    await prisma.payment_receipt.deleteMany({ where: { id: { in: receiptIdsToDelete } } });
    console.log(`  ✓ Deleted ${receiptIdsToDelete.length} payment receipt(s) created by confirming`);
  }

  const deleted = await prisma.posting.deleteMany({
    where: { id: { in: DEMO_POSTING_IDS }, org_id: demoOrgId },
  });
  console.log(`  ✓ Deleted ${deleted.count} reconciliation demo postings`);

  const bankAccount = await prisma.account.findFirst({
    where: { org_id: demoOrgId, legal_entity_id: demoLegalEntityId, code: '1102' },
  });
  if (!bankAccount) {
    throw new Error('Chart of accounts missing Checking (1102). Run full Indian demo setup first.');
  }

  const baseDate = new Date();
  baseDate.setMonth(baseDate.getMonth() - 2);

  const count = await upsertReconciliationBankPostingsFromCsv(
    bankAccount,
    demoOrgId,
    demoLegalEntityId,
    baseDate
  );
  console.log(`  ✓ Reloaded ${count} reconciliation demo postings`);
  console.log('✅ Reconciliation demo postings reset complete.');
  await prisma.$disconnect();
}

/**
 * Drop ALL postings for the Indian demo org and re-create FY journals plus reconciliation demo bank lines.
 */
async function resetAllPostingsFromCSV() {
  const demoOrgId = 'org_indian_demo';
  const demoLegalEntityId = 'org_indian_demo';

  console.log('🔄 Dropping all postings and re-creating from CSV...');

  const deleted = await prisma.posting.deleteMany({ where: { org_id: demoOrgId } });
  console.log(`  ✓ Deleted ${deleted.count} postings`);

  const journalCount = await upsertAllPostingsFromCsv(demoOrgId);
  console.log(`  ✓ Created ${journalCount} journal postings from FY CSVs`);

  const bankAccount = await prisma.account.findFirst({
    where: { org_id: demoOrgId, legal_entity_id: demoLegalEntityId, code: '1102' },
  });
  if (!bankAccount) {
    throw new Error('Chart of accounts missing Checking (1102). Run full Indian demo setup first.');
  }

  const baseDate = new Date();
  baseDate.setMonth(baseDate.getMonth() - 2);

  const reconCount = await upsertReconciliationBankPostingsFromCsv(
    bankAccount,
    demoOrgId,
    demoLegalEntityId,
    baseDate
  );
  console.log(`  ✓ Created ${reconCount} reconciliation demo postings from ${RECONCILIATION_POSTING_CSV}`);
  console.log('✅ Posting reset complete.');
  await prisma.$disconnect();
}

const US_LEGAL_ENTITY_ID = 'org_us_office';

/**
 * Create chart of accounts for Demo Tech Solutions USA Inc (org_us_office).
 * Safe to re-run — uses deterministic account IDs (upsert).
 */
async function setupUsOfficeChartOfAccounts() {
  const entity = await prisma.entity.findUnique({ where: { id: US_LEGAL_ENTITY_ID } });
  if (!entity) {
    throw new Error(
      `Legal entity ${US_LEGAL_ENTITY_ID} not found. Run full Indian demo setup first (organization.csv).`
    );
  }

  console.log('🇺🇸 Setting up Chart of Accounts for Demo Tech Solutions USA Inc...');
  const coaTemplateUs = path.join(__dirname, '..', 'setup-US_CA', 'chart-of-accounts.json');
  const result = await setupChartOfAccounts(
    INDIAN_DEMO_ORG_ID,
    US_LEGAL_ENTITY_ID,
    coaTemplateUs,
    'USD'
  );
  console.log(`  ✓ USA COA ready: ${result.accounts.size} accounts (created: ${result.created}, existing: ${result.existing})`);
  await prisma.$disconnect();
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const resetOnly = args.includes('--reset-postings');
  const resetFull = args.includes('--reset-postings-full');
  const syncInvoices = args.includes('--sync-invoices');
  const setupUsCoa = args.includes('--setup-us-coa');

  const run = resetFull
    ? resetAllPostingsFromCSV()
    : resetOnly
      ? resetDemoPostingsAndReceipts()
      : syncInvoices
        ? syncDemoInvoicesFromCsv()
        : setupUsCoa
          ? setupUsOfficeChartOfAccounts()
          : setupIndianDemoData();

  const label = resetFull
    ? 'Posting full reset'
    : resetOnly
      ? 'Demo postings reset'
      : syncInvoices
        ? 'Demo invoice sync'
        : setupUsCoa
          ? 'USA chart of accounts setup'
          : 'Indian demo data setup';

  run
    .then(() => {
      console.log(`🎉 ${label} completed successfully!`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Failed:', error);
      process.exit(1);
    });
}

export {
  setupIndianDemoData,
  setupUsOfficeChartOfAccounts,
  upsertDemoInvoicesFromCsv,
  syncDemoInvoicesFromCsv,
  upsertReconciliationBankPostingsFromCsv,
  resetDemoPostingsAndReceipts,
  resetAllPostingsFromCSV,
};
