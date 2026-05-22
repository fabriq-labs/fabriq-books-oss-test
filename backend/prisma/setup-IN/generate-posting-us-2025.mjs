/**
 * Generates posting-us.csv — 300 double-entry journal postings for org_us_office.
 * Calendar FY 2025: Jan 1 – Dec 31, 2025 (USD).
 * Run: node backend/prisma/setup-IN/generate-posting-us-2025.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ORG = 'org_indian_demo';
const LE = 'org_us_office';
const CREATED_BY = 'user_kavya_nair';
const LE_PREFIX = 'org_us_office';

const A = {
  checking: `acco_${LE_PREFIX}_1102`,
  savings: `acco_${LE_PREFIX}_1103`,
  ar: `acco_${LE_PREFIX}_1105`,
  inventory: `acco_${LE_PREFIX}_1106`,
  prepaid: `acco_${LE_PREFIX}_1107`,
  fixedAsset: `acco_${LE_PREFIX}_1201`,
  accumDep: `acco_${LE_PREFIX}_1202`,
  ap: `acco_${LE_PREFIX}_2101`,
  creditCard: `acco_${LE_PREFIX}_2102`,
  payrollLib: `acco_${LE_PREFIX}_2103`,
  taxesPayable: `acco_${LE_PREFIX}_2104`,
  deferredRev: `acco_${LE_PREFIX}_2105`,
  loanPayable: `acco_${LE_PREFIX}_2201`,
  salesRev: `acco_${LE_PREFIX}_4101`,
  serviceRev: `acco_${LE_PREFIX}_4102`,
  otherIncome: `acco_${LE_PREFIX}_4103`,
  cogs: `acco_${LE_PREFIX}_5101`,
  salaries: `acco_${LE_PREFIX}_5201`,
  payrollTax: `acco_${LE_PREFIX}_5202`,
  rent: `acco_${LE_PREFIX}_5203`,
  utilities: `acco_${LE_PREFIX}_5204`,
  insurance: `acco_${LE_PREFIX}_5205`,
  marketing: `acco_${LE_PREFIX}_5206`,
  professional: `acco_${LE_PREFIX}_5207`,
  software: `acco_${LE_PREFIX}_5208`,
  officeSupplies: `acco_${LE_PREFIX}_5209`,
  travel: `acco_${LE_PREFIX}_5210`,
  bankFees: `acco_${LE_PREFIX}_5211`,
  depreciation: `acco_${LE_PREFIX}_5212`,
  badDebt: `acco_${LE_PREFIX}_5213`,
  repairs: `acco_${LE_PREFIX}_5214`,
  freight: `acco_${LE_PREFIX}_5215`,
  training: `acco_${LE_PREFIX}_5301`,
  misc: `acco_${LE_PREFIX}_5303`,
};

const US_CUSTOMERS = [
  'Aether Dynamics Corp',
  'Nexus Systems LLC',
  'Vertex Enterprises Inc',
  'Orion Technologies Group',
  'Pinnacle Solutions Corp',
  'Zenith Networks LLC',
];

const US_VENDORS = [
  'Amazon Web Services',
  'Microsoft Azure',
  'WeWork SF',
  'Dell Technologies USA',
  'Gusto Payroll',
];

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const HEADERS = [
  'id', 'created_by', 'modified_by', 'created_at', 'modified_at', 'org_id', 'assigned_to',
  'account_id', 'credit_account_id', 'name', 'account_name', 'value_date', 'posting_date',
  'amount', 'category_name', 'posting_type', 'notes', 'description',
  'invoice_id', 'reversal_of_posting_id', 'status', 'reversed_at', 'legal_entity_id',
  'trade_id', 'holding_id', 'income_type', 'income_source',
  'ai_cat_score', 'ai_categorized_at', 'reconciliation_status', 'matched_reference', 'payment_receipt_id',
];

// Calendar year 2025
const CY_START = new Date('2025-01-01T00:00:00Z');

function cyDate(monthIndex, day = 15) {
  const d = new Date(CY_START);
  d.setUTCMonth(monthIndex);
  d.setUTCDate(Math.min(day, 28));
  return d.toISOString().slice(0, 10);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** CA sales tax on taxable services (8.25%) */
function salesTaxSplit(base) {
  const tax = round2(base * 0.0825);
  return { base, tax, total: round2(base + tax) };
}

let seq = 0;
const rows = [];

function push(entry) {
  seq += 1;
  const id = entry.id ?? `post_us25_${String(seq).padStart(3, '0')}`;
  const vd = entry.value_date ?? entry.posting_date;
  rows.push({
    id,
    created_by: CREATED_BY,
    modified_by: CREATED_BY,
    created_at: '',
    modified_at: '',
    org_id: ORG,
    assigned_to: '',
    account_id: entry.account_id,
    credit_account_id: entry.credit_account_id,
    name: (entry.name ?? entry.description ?? '').slice(0, 80),
    account_name: '',
    value_date: vd,
    posting_date: entry.posting_date ?? vd,
    amount: entry.amount.toFixed(2),
    category_name: '',
    posting_type: entry.posting_type ?? 'JOURNAL',
    notes: entry.notes ?? '',
    description: entry.description ?? '',
    invoice_id: entry.invoice_id ?? '',
    reversal_of_posting_id: '',
    status: entry.status ?? 'ACTIVE',
    reversed_at: '',
    legal_entity_id: LE,
    trade_id: '',
    holding_id: '',
    income_type: entry.income_type ?? '',
    income_source: entry.income_source ?? '',
    ai_cat_score: '',
    ai_categorized_at: '',
    reconciliation_status: entry.reconciliation_status ?? '',
    matched_reference: entry.matched_reference ?? '',
    payment_receipt_id: entry.payment_receipt_id ?? '',
  });
}

// ── Monthly SaaS / consulting revenue + CA sales tax ───────────────────────
for (let m = 0; m < 12; m++) {
  const cust = US_CUSTOMERS[m % US_CUSTOMERS.length];
  const invNum = `US-INV-${String(m + 1).padStart(3, '0')}`;
  const base = 42000 + m * 2500 + (m % 3) * 5000;
  const { base: rev, tax } = salesTaxSplit(base);
  const dt = cyDate(m, 28);
  push({
    account_id: A.ar,
    credit_account_id: A.serviceRev,
    amount: rev,
    value_date: dt,
    name: `Service revenue ${invNum}`,
    description: `US consulting & integration — ${cust} — ${invNum}`,
    notes: `CA sales tax 8.25%: $${tax.toLocaleString('en-US')}`,
  });
  push({
    account_id: A.ar,
    credit_account_id: A.taxesPayable,
    amount: tax,
    value_date: dt,
    name: `Sales tax ${invNum}`,
    description: `CA district sales tax on ${invNum} — ${cust}`,
    notes: 'Filed via CDTFA — San Francisco district',
  });
}

// ── Product license revenue (quarterly) ─────────────────────────────────────
for (let q = 0; q < 4; q++) {
  push({
    account_id: A.ar,
    credit_account_id: A.salesRev,
    amount: 18500 + q * 2200,
    value_date: cyDate(q * 3 + 1, 20),
    name: `License revenue Q${q + 1}`,
    description: `Platform license — Q${q + 1} CY2025 — US enterprise accounts`,
  });
}

// ── Customer ACH/wire collections ─────────────────────────────────────────
for (let m = 0; m < 12; m++) {
  const cust = US_CUSTOMERS[(m + 2) % US_CUSTOMERS.length];
  push({
    account_id: A.checking,
    credit_account_id: A.ar,
    amount: 38000 + (m % 4) * 8500,
    value_date: cyDate(m, 10),
    name: `ACH receipt — ${cust.slice(0, 28)}`,
    description: `Wire/ACH collection — ${cust} — ${MONTH_LABELS[m]} 2025`,
    notes: 'Silicon Valley Bank — operating account',
    posting_type: 'BANK',
  });
}

// ── Deferred revenue (SaaS annual prepay) ───────────────────────────────────
for (let i = 0; i < 4; i++) {
  push({
    account_id: A.checking,
    credit_account_id: A.deferredRev,
    amount: 12000 + i * 3500,
    value_date: cyDate(i * 2 + 1, 6),
    name: 'Customer prepayment received',
    description: `Annual support prepay — ${US_CUSTOMERS[i]}`,
    notes: 'Deferred until service delivery milestones',
  });
}

for (let i = 0; i < 4; i++) {
  push({
    account_id: A.deferredRev,
    credit_account_id: A.serviceRev,
    amount: 11000 + i * 3000,
    value_date: cyDate(i * 2 + 3, 26),
    name: 'Deferred revenue recognized',
    description: `Milestone ${i + 1} — revenue recognition (ASC 606)`,
  });
}

// ── Vendor bills (cloud, equipment, facilities) ─────────────────────────────
for (let m = 0; m < 12; m++) {
  const vendor = US_VENDORS[m % US_VENDORS.length];
  const expAcct = m % 3 === 0 ? A.software : m % 3 === 1 ? A.officeSupplies : A.professional;
  push({
    account_id: expAcct,
    credit_account_id: A.ap,
    amount: 8500 + m * 650,
    value_date: cyDate(m, 18),
    name: `Vendor bill — ${vendor}`,
    description: `Vendor invoice — ${vendor} — ${MONTH_LABELS[m]} 2025`,
    notes: 'QuickBooks bill — awaiting payment run',
  });
}

// ── Vendor payments (ACH) ───────────────────────────────────────────────────
for (let m = 0; m < 12; m++) {
  const vendor = US_VENDORS[(m + 1) % US_VENDORS.length];
  push({
    account_id: A.ap,
    credit_account_id: A.checking,
    amount: 9200 + m * 580,
    value_date: cyDate(m, 25),
    name: `Vendor payment — ${vendor}`,
    description: `ACH payment — ${vendor} — AP batch`,
    notes: 'Bill.com payment batch #2025',
  });
}

// ── Corporate card spend + payment ──────────────────────────────────────────
for (let m = 0; m < 12; m++) {
  const amt = 2200 + m * 120;
  push({
    account_id: m % 2 === 0 ? A.travel : A.marketing,
    credit_account_id: A.creditCard,
    amount: amt,
    value_date: cyDate(m, 11),
    name: 'Amex corporate card expense',
    description: m % 2 === 0 ? 'Client travel — SFO ↔ NYC' : 'Google Ads / LinkedIn campaigns',
  });
  push({
    account_id: A.creditCard,
    credit_account_id: A.checking,
    amount: amt,
    value_date: cyDate(m, 26),
    name: 'Credit card statement payment',
    description: 'American Express corporate — statement payoff',
  });
}

// ── Bi-weekly payroll + employer payroll taxes ──────────────────────────────
for (let m = 0; m < 12; m++) {
  const gross = 95000;
  const employerTax = round2(gross * 0.0765); // FICA + FUTA/SUTA approx
  const dt = cyDate(m, 28);
  push({
    account_id: A.salaries,
    credit_account_id: A.checking,
    amount: gross,
    value_date: dt,
    name: `Payroll — ${MONTH_LABELS[m]} 2025`,
    description: 'Salaries & wages — SF engineering & G&A (Gusto)',
    notes: 'Net pay after federal/state withholding',
  });
  push({
    account_id: A.payrollTax,
    credit_account_id: A.payrollLib,
    amount: employerTax,
    value_date: dt,
    name: 'Employer payroll taxes',
    description: 'FICA, FUTA, CA SUTA/ETT employer accrual',
  });
}

for (let m = 0; m < 6; m++) {
  push({
    account_id: A.payrollLib,
    credit_account_id: A.checking,
    amount: 24500,
    value_date: cyDate(m * 2 + 1, 6),
    name: 'Payroll tax remittance',
    description: 'IRS 941 + CA EDD deposit — semi-monthly',
  });
}

// ── WeWork / office rent (SF) ───────────────────────────────────────────────
for (let m = 0; m < 12; m++) {
  push({
    account_id: A.rent,
    credit_account_id: A.checking,
    amount: 22000 + (m % 2) * 1500,
    value_date: cyDate(m, 5),
    name: 'Office rent — Market Street SF',
    description: 'WeWork / commercial lease — 100 Main St Suite 400',
    notes: 'CAM charges in separate vendor bill',
  });
}

// ── Utilities & SaaS (cash) ─────────────────────────────────────────────────
for (let m = 0; m < 12; m++) {
  push({
    account_id: A.utilities,
    credit_account_id: A.checking,
    amount: 1800 + (m % 3) * 250,
    value_date: cyDate(m, 19),
    name: 'Utilities & telecom',
    description: 'PG&E + Comcast business — SF office',
  });
  push({
    account_id: A.software,
    credit_account_id: A.checking,
    amount: 12500 + m * 400,
    value_date: cyDate(m, 8),
    name: 'Cloud & dev tools',
    description: 'AWS, Azure, GitHub, Datadog, Slack — monthly',
    notes: '1099 eligible — vendor on file',
  });
}

for (let m = 0; m < 4; m++) {
  push({
    account_id: A.insurance,
    credit_account_id: A.checking,
    amount: 14500,
    value_date: cyDate(m * 3, 14),
    name: 'Health insurance premium',
    description: 'Blue Shield group medical — quarterly',
  });
}

// ── Sales tax remittance (CDTFA) ────────────────────────────────────────────
for (let m = 0; m < 12; m++) {
  push({
    account_id: A.taxesPayable,
    credit_account_id: A.checking,
    amount: 3200 + m * 280,
    value_date: cyDate(m, 21),
    name: 'CA sales tax payment',
    description: 'CDTFA sales & use tax — SF district return',
    notes: 'QuickBooks sales tax center',
  });
}

// ── Federal / state estimated tax ───────────────────────────────────────────
for (let q = 0; q < 4; q++) {
  push({
    account_id: A.taxesPayable,
    credit_account_id: A.checking,
    amount: 18500 + q * 2000,
    value_date: cyDate(q * 3 + 2, 15),
    name: `Estimated tax Q${q + 1}`,
    description: 'IRS 1120 + CA FTB estimated — quarterly voucher',
    notes: 'Form 1120-W / CA 100-ES',
  });
}

// ── CPA / legal ─────────────────────────────────────────────────────────────
for (let m = 0; m < 12; m++) {
  push({
    account_id: A.professional,
    credit_account_id: A.checking,
    amount: m % 4 === 0 ? 22000 : 6500,
    value_date: cyDate(m, 22),
    name: m % 4 === 0 ? 'Audit & tax prep' : 'Legal retainer',
    description: m % 4 === 0
      ? 'CPA firm — annual review & corporate tax CY2025'
      : 'Outside counsel — contracts & Delaware franchise tax',
  });
}

// ── Marketing, training, repairs, freight ───────────────────────────────────
for (let m = 0; m < 12; m++) {
  if (m % 2 === 0) {
    push({
      account_id: A.marketing,
      credit_account_id: A.checking,
      amount: 8500 + m * 450,
      value_date: cyDate(m, 13),
      name: 'Demand gen spend',
      description: 'US enterprise pipeline — events & paid search',
    });
  }
}

for (let i = 0; i < 4; i++) {
  push({
    account_id: A.training,
    credit_account_id: A.checking,
    amount: 4200 + i * 800,
    value_date: cyDate(i * 3 + 1, 17),
    name: 'Employee training',
    description: 'AWS re:Invent + security certification stipends',
  });
  push({
    account_id: A.repairs,
    credit_account_id: A.checking,
    amount: 2800 + i * 400,
    value_date: cyDate(i * 3 + 2, 17),
    name: 'Facilities maintenance',
    description: 'HVAC / electrical — server closet SF office',
  });
  push({
    account_id: A.freight,
    credit_account_id: A.checking,
    amount: 950,
    value_date: cyDate(i * 3, 18),
    name: 'Shipping & courier',
    description: 'FedEx — demo hardware to US clients',
  });
}

// ── Inventory & COGS ────────────────────────────────────────────────────────
for (let m = 0; m < 8; m++) {
  push({
    account_id: A.inventory,
    credit_account_id: A.ap,
    amount: 14000 + m * 1200,
    value_date: cyDate(m + 1, 17),
    name: 'Inventory purchase',
    description: 'Hardware components — resale inventory',
  });
  push({
    account_id: A.cogs,
    credit_account_id: A.inventory,
    amount: 12800 + m * 1100,
    value_date: cyDate(m + 2, 24),
    name: 'COGS recognized',
    description: 'Project delivery — hardware cost of sales',
  });
}

// ── Bank fees ───────────────────────────────────────────────────────────────
for (let m = 0; m < 12; m++) {
  push({
    account_id: A.bankFees,
    credit_account_id: A.checking,
    amount: 125 + m * 15,
    value_date: cyDate(m, 30),
    name: 'Bank service charges',
    description: 'SVB — wire fees, positive pay, account analysis',
    posting_type: 'BANK',
  });
}

// ── Depreciation (quarterly, MACRS-style) ─────────────────────────────────────
for (let q = 0; q < 4; q++) {
  push({
    account_id: A.depreciation,
    credit_account_id: A.accumDep,
    amount: 18500,
    value_date: cyDate(q * 3 + 2, 28),
    name: `Depreciation Q${q + 1}`,
    description: 'MACRS — laptops, servers, leasehold improvements',
    notes: 'Book depreciation per GAAP',
  });
}

// ── Capex ───────────────────────────────────────────────────────────────────
push({
  account_id: A.fixedAsset,
  credit_account_id: A.checking,
  amount: 125000,
  value_date: cyDate(4, 10),
  name: 'Server infrastructure capex',
  description: 'Dell PowerEdge — capitalized asset CY2025',
});
push({
  account_id: A.fixedAsset,
  credit_account_id: A.ap,
  amount: 48000,
  value_date: cyDate(7, 10),
  name: 'Laptop fleet refresh',
  description: 'MacBook Pro batch — 25 units — net-30 terms',
});

// ── Loan principal ──────────────────────────────────────────────────────────
for (let q = 0; q < 4; q++) {
  push({
    account_id: A.loanPayable,
    credit_account_id: A.checking,
    amount: 12500,
    value_date: cyDate(q * 3 + 1, 27),
    name: 'SBA loan principal',
    description: 'Silicon Valley Bank term loan — principal portion',
    notes: 'Interest expensed separately',
  });
}

// ── Bad debt ────────────────────────────────────────────────────────────────
push({
  account_id: A.badDebt,
  credit_account_id: A.ar,
  amount: 4500,
  value_date: cyDate(8, 27),
  name: 'Bad debt expense',
  description: 'Allowance for doubtful accounts — aged AR >120 days',
});
push({
  account_id: A.badDebt,
  credit_account_id: A.ar,
  amount: 2200,
  value_date: cyDate(10, 27),
  name: 'Bad debt adjustment',
  description: 'Additional write-down after collection effort',
});

// ── Interest income ─────────────────────────────────────────────────────────
for (let q = 0; q < 4; q++) {
  push({
    account_id: A.savings,
    credit_account_id: A.otherIncome,
    amount: 850 + q * 120,
    value_date: cyDate(q * 3 + 2, 28),
    name: 'Interest income',
    description: 'SVB business savings — interest credit',
    income_type: 'INTEREST',
    income_source: 'DEPOSIT',
  });
}

// ── Travel & misc ─────────────────────────────────────────────────────────
for (let m = 0; m < 8; m++) {
  push({
    account_id: A.travel,
    credit_account_id: A.checking,
    amount: 4800 + m * 350,
    value_date: cyDate(m + 1, 16),
    name: 'Travel — client & conferences',
    description: 'Airfare, hotel, per diem — US client visits',
  });
  push({
    account_id: A.misc,
    credit_account_id: A.checking,
    amount: 650 + m * 85,
    value_date: cyDate(m + 2, 20),
    name: 'Office petty cash',
    description: 'Snacks, supplies, team events',
  });
}

// ── Prepaid software (annual contracts) ─────────────────────────────────────
for (let m = 0; m < 6; m++) {
  push({
    account_id: A.prepaid,
    credit_account_id: A.checking,
    amount: 6000 + m * 500,
    value_date: cyDate(m * 2, 9),
    name: 'Prepaid annual subscription',
    description: 'Salesforce / Zoom annual — amortize monthly',
  });
}

// ── Intercompany management fee (from India parent) ─────────────────────────
for (let m = 0; m < 6; m++) {
  push({
    account_id: A.professional,
    credit_account_id: A.ap,
    amount: 15000,
    value_date: cyDate(m * 2, 23),
    name: 'Intercompany management fee',
    description: 'Shared services allocation — Demo Tech Solutions India Pvt Ltd',
    notes: 'Transfer pricing documentation on file',
  });
}

// Pad or trim to exactly 300
if (rows.length > 300) {
  rows.length = 300;
} else {
  while (rows.length < 300) {
    const m = rows.length % 12;
    push({
      account_id: A.officeSupplies,
      credit_account_id: A.checking,
      amount: 450 + m * 35,
      value_date: cyDate(m, 23),
      name: 'Office supplies',
      description: 'Amazon Business — supplies top-up',
    });
  }
}

rows.forEach((r, i) => {
  r.id = `post_us25_${String(i + 1).padStart(3, '0')}`;
});

function escapeCsv(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const lines = [HEADERS.join(',')];
for (const r of rows) {
  lines.push(HEADERS.map((h) => escapeCsv(r[h])).join(','));
}

const outPath = path.join(__dirname, 'posting-us.csv');
fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');

let total = 0;
for (const r of rows) total += parseFloat(r.amount);
console.log(`Wrote ${rows.length} postings to ${outPath}`);
console.log(`Legal entity: ${LE} | Period: Jan–Dec 2025 | Total amount (USD): $${total.toLocaleString('en-US')}`);
