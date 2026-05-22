/**
 * Generates posting-fy2025.csv — 300 double-entry journal postings for org_indian_demo.
 * Run: node backend/prisma/setup-IN/generate-posting-fy2025.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ORG = 'org_indian_demo';
const LE = 'org_indian_demo';
const CREATED_BY = 'user_priya_patel';

const A = {
  checking: 'acco_org_indian_demo_1102',
  savings: 'acco_org_indian_demo_1103',
  ar: 'acco_org_indian_demo_1105',
  inventory: 'acco_org_indian_demo_1106',
  prepaid: 'acco_org_indian_demo_1107',
  fixedAsset: 'acco_org_indian_demo_1201',
  accumDep: 'acco_org_indian_demo_1202',
  ap: 'acco_org_indian_demo_2101',
  creditCard: 'acco_org_indian_demo_2102',
  payrollLib: 'acco_org_indian_demo_2103',
  taxesPayable: 'acco_org_indian_demo_2104',
  deferredRev: 'acco_org_indian_demo_2105',
  loanPayable: 'acco_org_indian_demo_2201',
  salesRev: 'acco_org_indian_demo_4101',
  serviceRev: 'acco_org_indian_demo_4102',
  otherIncome: 'acco_org_indian_demo_4103',
  cogs: 'acco_org_indian_demo_5101',
  salaries: 'acco_org_indian_demo_5201',
  payrollTax: 'acco_org_indian_demo_5202',
  rent: 'acco_org_indian_demo_5203',
  utilities: 'acco_org_indian_demo_5204',
  insurance: 'acco_org_indian_demo_5205',
  marketing: 'acco_org_indian_demo_5206',
  professional: 'acco_org_indian_demo_5207',
  software: 'acco_org_indian_demo_5208',
  officeSupplies: 'acco_org_indian_demo_5209',
  travel: 'acco_org_indian_demo_5210',
  bankFees: 'acco_org_indian_demo_5211',
  depreciation: 'acco_org_indian_demo_5212',
  badDebt: 'acco_org_indian_demo_5213',
  repairs: 'acco_org_indian_demo_5214',
  freight: 'acco_org_indian_demo_5215',
  training: 'acco_org_indian_demo_5301',
  misc: 'acco_org_indian_demo_5303',
};

const CUSTOMERS = [
  { id: 'cust_tata_consultancy', name: 'Tata Consultancy Services Ltd' },
  { id: 'cust_infosys', name: 'Infosys Limited' },
  { id: 'cust_wipro', name: 'Wipro Limited' },
  { id: 'cust_reliance_industries', name: 'Reliance Industries Limited' },
  { id: 'cust_hdfc_bank', name: 'HDFC Bank Ltd' },
  { id: 'cust_icici_bank', name: 'ICICI Bank Limited' },
];

const SUPPLIERS = [
  { id: 'supp_dell_india', name: 'Dell Technologies India' },
  { id: 'supp_hp_india', name: 'HP India Sales' },
  { id: 'supp_lenovo_india', name: 'Lenovo India' },
  { id: 'supp_cipla', name: 'Cipla Ltd' },
];

const INVOICES = Array.from({ length: 12 }, (_, i) => ({
  id: `inv_demo_${String(i + 1).padStart(3, '0')}`,
  num: `INV-${String(i + 1).padStart(3, '0')}`,
}));

const RECEIPTS = [
  { id: 'payr_demo_001', ref: 'REC-DEMO-001', inv: 'inv_demo_001' },
  { id: 'payr_demo_002', ref: 'REC-DEMO-002', inv: 'inv_demo_002' },
  { id: 'payr_demo_003', ref: 'REC-DEMO-003', inv: 'inv_demo_004' },
  { id: 'payr_demo_004', ref: 'REC-DEMO-004', inv: 'inv_demo_005' },
  { id: 'payr_demo_005', ref: 'REC-DEMO-005', inv: 'inv_demo_008' },
  { id: 'payr_demo_006', ref: 'REC-DEMO-006', inv: null },
  { id: 'payr_demo_007', ref: 'REC-DEMO-007', inv: 'inv_demo_003' },
];

const HEADERS = [
  'id', 'created_by', 'modified_by', 'created_at', 'modified_at', 'org_id', 'assigned_to',
  'account_id', 'credit_account_id', 'name', 'account_name', 'value_date', 'posting_date',
  'amount', 'category_name', 'posting_type', 'notes', 'description',
  'invoice_id', 'reversal_of_posting_id', 'status', 'reversed_at', 'legal_entity_id',
  'trade_id', 'holding_id', 'income_type', 'income_source',
  'ai_cat_score', 'ai_categorized_at', 'reconciliation_status', 'matched_reference', 'payment_receipt_id',
];

// Indian FY 2025-26: 2025-04-01 .. 2026-03-31
const FY_START = new Date('2025-04-01T00:00:00Z');
const MONTHS = 12;

function fyDate(monthIndex, day = 15) {
  const d = new Date(FY_START);
  d.setUTCMonth(d.getUTCMonth() + monthIndex);
  d.setUTCDate(Math.min(day, 28));
  return d.toISOString().slice(0, 10);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function gstSplit(base) {
  const gst = round2(base * 0.18);
  return { base, gst, total: round2(base + gst) };
}

let seq = 0;
const rows = [];

function push(entry) {
  seq += 1;
  const id = entry.id ?? `post_fy25_${String(seq).padStart(3, '0')}`;
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
    income_type: '',
    income_source: '',
    ai_cat_score: '',
    ai_categorized_at: '',
    reconciliation_status: entry.reconciliation_status ?? '',
    matched_reference: entry.matched_reference ?? '',
    payment_receipt_id: entry.payment_receipt_id ?? '',
  });
}

// ── Monthly service invoices (GST inclusive in AR) ─────────────────────────
for (let m = 0; m < 12; m++) {
  const inv = INVOICES[m];
  const cust = CUSTOMERS[m % CUSTOMERS.length];
  const base = 180000 + m * 15000 + (m % 3) * 25000;
  const { base: rev, gst, total } = gstSplit(base);
  const dt = fyDate(m, 28);
  push({
    account_id: A.ar,
    credit_account_id: A.serviceRev,
    amount: rev,
    value_date: dt,
    posting_date: dt,
    name: `Service revenue ${inv.num}`,
    description: `IT consulting services — ${cust.name} — ${inv.num} (taxable value)`,
    invoice_id: inv.id,
    notes: `GST 18%: INR ${gst.toLocaleString('en-IN')} on taxable value`,
  });
  push({
    account_id: A.ar,
    credit_account_id: A.taxesPayable,
    amount: gst,
    value_date: dt,
    posting_date: dt,
    name: `Output GST ${inv.num}`,
    description: `IGST/CGST+SGST @18% on ${inv.num} — ${cust.name}`,
    invoice_id: inv.id,
    notes: 'GST liability on export/domestic B2B invoice',
  });
}

// ── Product / license sales (quarterly) ───────────────────────────────────
for (let q = 0; q < 4; q++) {
  const amt = 85000 + q * 12000;
  const dt = fyDate(q * 3 + 2, 20);
  push({
    account_id: A.ar,
    credit_account_id: A.salesRev,
    amount: amt,
    value_date: dt,
    posting_date: dt,
    name: `License revenue Q${q + 1}`,
    description: `Annual software license renewal — Q${q + 1} FY2025-26`,
  });
}

// ── Customer collections (NEFT/RTGS) ──────────────────────────────────────
for (let m = 0; m < 12; m++) {
  const amt = 150000 + (m % 4) * 35000;
  const dt = fyDate(m, 10);
  const cust = CUSTOMERS[(m + 2) % CUSTOMERS.length];
  const extra = m < RECEIPTS.length
    ? {
        payment_receipt_id: RECEIPTS[m].id,
        reconciliation_status: 'MATCHED',
        matched_reference: `payment_receipt:${RECEIPTS[m].id}:${RECEIPTS[m].ref}`,
      }
    : {};
  push({
    account_id: A.checking,
    credit_account_id: A.ar,
    amount: amt,
    value_date: dt,
    posting_date: dt,
    name: `Customer receipt — ${cust.name.slice(0, 30)}`,
    description: `NEFT/RTGS collection — ${cust.name} — month ${m + 1}`,
    notes: m < 7 ? 'TDS u/s 194J deducted by customer' : '',
    ...extra,
  });
}

// ── Advance / unapplied receipts ──────────────────────────────────────────
for (let i = 0; i < 4; i++) {
  push({
    account_id: A.checking,
    credit_account_id: A.deferredRev,
    amount: 45000 + i * 10000,
    value_date: fyDate(i * 2 + 1, 5),
    name: 'Customer advance received',
    description: `Advance against future SOW — ${CUSTOMERS[i].name}`,
    notes: 'Unearned revenue until milestone billing',
  });
}

// ── Deferred revenue recognition ──────────────────────────────────────────
for (let i = 0; i < 4; i++) {
  push({
    account_id: A.deferredRev,
    credit_account_id: A.serviceRev,
    amount: 40000 + i * 8000,
    value_date: fyDate(i * 2 + 3, 25),
    name: 'Deferred revenue recognised',
    description: `Milestone ${i + 1} revenue recognition — prior customer advance`,
  });
}

// ── Vendor purchases on credit (hardware, cloud, pharma supplies) ─────────
for (let m = 0; m < 12; m++) {
  const supp = SUPPLIERS[m % SUPPLIERS.length];
  const base = 65000 + m * 5000;
  const { base: exp, gst } = gstSplit(base);
  const dt = fyDate(m, 18);
  const expAcct = m % 3 === 0 ? A.software : m % 3 === 1 ? A.officeSupplies : A.inventory;
  push({
    account_id: expAcct,
    credit_account_id: A.ap,
    amount: exp,
    value_date: dt,
    posting_date: dt,
    name: `Vendor bill — ${supp.name}`,
    description: `Purchase from ${supp.name} — ${supp.id} — month ${m + 1}`,
    notes: `Input GST credit INR ${gst}`,
  });
}

// ── Vendor payments ─────────────────────────────────────────────────────────
for (let m = 0; m < 12; m++) {
  const supp = SUPPLIERS[(m + 1) % SUPPLIERS.length];
  push({
    account_id: A.ap,
    credit_account_id: A.checking,
    amount: 70000 + m * 4500,
    value_date: fyDate(m, 25),
    posting_date: fyDate(m, 25),
    name: `Vendor payment — ${supp.name}`,
    description: `NEFT to ${supp.name} — settlement of vendor invoices`,
    notes: 'Payment run — finance batch',
  });
}

// ── Credit card vendor spend + payment ──────────────────────────────────────
for (let m = 0; m < 12; m++) {
  const amt = 8500 + m * 400;
  push({
    account_id: m % 2 === 0 ? A.travel : A.marketing,
    credit_account_id: A.creditCard,
    amount: amt,
    value_date: fyDate(m, 12),
    name: 'Corporate card expense',
    description: m % 2 === 0 ? 'Team travel — client site visit' : 'LinkedIn / Google Ads campaign',
  });
  push({
    account_id: A.creditCard,
    credit_account_id: A.checking,
    amount: amt,
    value_date: fyDate(m, 27),
    name: 'Credit card bill payment',
    description: 'HDFC corporate card statement settlement',
  });
}

// ── Payroll (monthly gross + PF/ESI accrual) ───────────────────────────────
for (let m = 0; m < 12; m++) {
  const gross = 420000;
  const pfEsi = round2(gross * 0.13);
  const dt = fyDate(m, 28);
  push({
    account_id: A.salaries,
    credit_account_id: A.checking,
    amount: gross,
    value_date: dt,
    name: `Payroll — ${['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'][m]} FY26`,
    description: 'Salary & wages — Bangalore tech team (incl. variable pay)',
    notes: 'Net pay after TDS u/s 192',
  });
  push({
    account_id: A.payrollTax,
    credit_account_id: A.payrollLib,
    amount: pfEsi,
    value_date: dt,
    name: 'PF & ESI employer contribution',
    description: 'Statutory payroll accrual — EPFO + ESIC employer share',
  });
}

// ── Payroll liability settlement (bi-monthly) ───────────────────────────────
for (let m = 0; m < 6; m++) {
  push({
    account_id: A.payrollLib,
    credit_account_id: A.checking,
    amount: 109200,
    value_date: fyDate(m * 2 + 1, 5),
    name: 'PF/ESI remittance',
    description: 'Challan payment to EPFO & ESIC — Karnataka',
  });
}

// ── Rent (monthly — Bangalore Tech Park) ────────────────────────────────────
for (let m = 0; m < 12; m++) {
  const { base, gst } = gstSplit(185000);
  push({
    account_id: A.rent,
    credit_account_id: A.checking,
    amount: base,
    value_date: fyDate(m, 5),
    name: 'Office rent — Tech Park Phase 2',
    description: 'Rent — Plot 123 Tech Park Bangalore (commercial lease)',
    notes: `GST on rent @18%: INR ${gst} — RCM may apply`,
  });
}

// ── Utilities, insurance, software subscriptions ────────────────────────────
for (let m = 0; m < 12; m++) {
  push({
    account_id: A.utilities,
    credit_account_id: A.checking,
    amount: 28000 + (m % 3) * 3500,
    value_date: fyDate(m, 20),
    name: 'Electricity & internet',
    description: 'BESCOM + ACT Fibernet — Bangalore office',
  });
  push({
    account_id: A.software,
    credit_account_id: A.checking,
    amount: 95000 + m * 2000,
    value_date: fyDate(m, 8),
    name: 'SaaS subscriptions',
    description: 'AWS, Azure, GitHub Enterprise, Jira, Slack — monthly',
    notes: 'Input tax credit eligible on GST invoices',
  });
}

for (let m = 0; m < 4; m++) {
  push({
    account_id: A.insurance,
    credit_account_id: A.checking,
    amount: 42000,
    value_date: fyDate(m * 3, 15),
    name: 'Group health insurance premium',
    description: 'Employee mediclaim — quarterly premium',
  });
}

// ── GST remittance to govt (GSTR-3B) ────────────────────────────────────────
for (let m = 0; m < 12; m++) {
  push({
    account_id: A.taxesPayable,
    credit_account_id: A.checking,
    amount: 32000 + m * 2800,
    value_date: fyDate(m, 20),
    name: 'GST payment — GSTR-3B',
    description: 'GST liability remittance — net of ITC — Karnataka',
    notes: 'Filed via GST portal — challan CPIN',
  });
}

// ── Professional fees (audit, legal) ────────────────────────────────────────
for (let m = 0; m < 12; m++) {
  push({
    account_id: A.professional,
    credit_account_id: A.checking,
    amount: m % 4 === 0 ? 125000 : 35000,
    value_date: fyDate(m, 22),
    name: m % 4 === 0 ? 'Statutory audit fees' : 'Legal & compliance retainer',
    description: m % 4 === 0
      ? 'Annual audit — FY2025-26 — CA firm engagement'
      : 'Corporate counsel — contract review & ROC filings',
  });
}

// ── Marketing, training, repairs, freight ─────────────────────────────────
for (let m = 0; m < 12; m++) {
  if (m % 2 === 0) {
    push({
      account_id: A.marketing,
      credit_account_id: A.checking,
      amount: 45000 + m * 3000,
      value_date: fyDate(m, 14),
      name: 'Digital marketing spend',
      description: 'Performance marketing — India enterprise leads',
    });
  }
}

for (let i = 0; i < 4; i++) {
  push({
    account_id: A.training,
    credit_account_id: A.checking,
    amount: 28000 + i * 5000,
    value_date: fyDate(i * 3 + 1, 16),
    name: 'Employee upskilling',
    description: 'Cloud certification & security training program',
  });
  push({
    account_id: A.repairs,
    credit_account_id: A.checking,
    amount: 15000 + i * 2500,
    value_date: fyDate(i * 3 + 2, 16),
    name: 'Server room maintenance',
    description: 'AMC — HVAC & UPS for server room',
  });
  push({
    account_id: A.freight,
    credit_account_id: A.checking,
    amount: 12000,
    value_date: fyDate(i * 3, 19),
    name: 'Courier & logistics',
    description: 'Blue Dart — hardware shipment to client sites',
  });
}

// ── COGS & inventory movements ──────────────────────────────────────────────
for (let m = 0; m < 8; m++) {
  push({
    account_id: A.inventory,
    credit_account_id: A.ap,
    amount: 95000 + m * 8000,
    value_date: fyDate(m + 2, 17),
    name: 'Inventory receipt',
    description: 'Stock receipt — resale components',
  });
  push({
    account_id: A.cogs,
    credit_account_id: A.inventory,
    amount: 88000 + m * 7500,
    value_date: fyDate(m + 3, 24),
    name: 'COGS recognition',
    description: 'Cost of goods sold on project deliverables',
  });
}

// ── Bank charges ──────────────────────────────────────────────────────────────
for (let m = 0; m < 12; m++) {
  push({
    account_id: A.bankFees,
    credit_account_id: A.checking,
    amount: 850 + m * 50,
    value_date: fyDate(m, 30),
    name: 'Bank charges',
    description: 'HDFC current account — NEFT/RTGS/cash management fees',
    posting_type: 'BANK',
  });
}

// ── Depreciation (quarterly) ────────────────────────────────────────────────
for (let q = 0; q < 4; q++) {
  push({
    account_id: A.depreciation,
    credit_account_id: A.accumDep,
    amount: 125000,
    value_date: fyDate(q * 3 + 2, 28),
    name: `Depreciation Q${q + 1} FY26`,
    description: 'Depreciation — servers, laptops, office fit-out (WDV method)',
    notes: 'As per Companies Act Schedule II',
  });
}

// ── Fixed asset purchase ──────────────────────────────────────────────────────
push({
  account_id: A.fixedAsset,
  credit_account_id: A.checking,
  amount: 850000,
  value_date: fyDate(5, 12),
  name: 'Server infrastructure capex',
  description: 'Dell PowerEdge cluster — capitalised as fixed asset',
});
push({
  account_id: A.fixedAsset,
  credit_account_id: A.ap,
  amount: 320000,
  value_date: fyDate(8, 12),
  name: 'Laptop fleet refresh',
  description: 'Lenovo ThinkPad batch — 40 units — vendor credit terms',
});

// ── Loan principal repayment ──────────────────────────────────────────────────
for (let q = 0; q < 4; q++) {
  push({
    account_id: A.loanPayable,
    credit_account_id: A.checking,
    amount: 150000,
    value_date: fyDate(q * 3 + 1, 28),
    name: 'Term loan EMI — principal',
    description: 'HDFC business loan — principal component',
    notes: 'Interest booked separately in notes',
  });
}

// ── Bad debt provision ────────────────────────────────────────────────────────
push({
  account_id: A.badDebt,
  credit_account_id: A.ar,
  amount: 25000,
  value_date: fyDate(9, 28),
  name: 'Bad debt write-off',
  description: 'Provision for doubtful receivable — aged >180 days',
});
push({
  account_id: A.badDebt,
  credit_account_id: A.ar,
  amount: 15000,
  value_date: fyDate(11, 28),
  name: 'Bad debt — partial recovery adjustment',
  description: 'Additional provision after recovery attempt',
});

// ── Other income (FD interest) ────────────────────────────────────────────────
for (let q = 0; q < 4; q++) {
  push({
    account_id: A.savings,
    credit_account_id: A.otherIncome,
    amount: 18500 + q * 1200,
    value_date: fyDate(q * 3 + 2, 28),
    name: 'FD interest credited',
    description: 'Interest on fixed deposit — HDFC savings linked FD',
    income_type: 'INTEREST',
    income_source: 'DEPOSIT',
  });
}

// ── Misc & travel ─────────────────────────────────────────────────────────────
for (let m = 0; m < 8; m++) {
  push({
    account_id: A.travel,
    credit_account_id: A.checking,
    amount: 22000 + m * 1500,
    value_date: fyDate(m + 1, 19),
    name: 'Travel & client meetings',
    description: 'Domestic travel — Mumbai/Hyderabad client visits',
    notes: 'GST on hotels/airfare in supporting vouchers',
  });
  push({
    account_id: A.misc,
    credit_account_id: A.checking,
    amount: 4500 + m * 500,
    value_date: fyDate(m + 2, 21),
    name: 'Miscellaneous expense',
    description: 'Petty cash — office refreshments & incidentals',
  });
}

// ── TDS paid on behalf (adjustment) ───────────────────────────────────────────
for (let m = 0; m < 6; m++) {
  push({
    account_id: A.prepaid,
    credit_account_id: A.checking,
    amount: 12000 + m * 2000,
    value_date: fyDate(m * 2, 12),
    name: 'TDS credit receivable',
    description: 'TDS deducted by customers u/s 194J — Form 16A pending',
    notes: 'Claim in annual ITR',
  });
}

// Pad or trim to exactly 300
if (rows.length > 300) {
  rows.length = 300;
  rows.forEach((r, i) => {
    r.id = `post_fy25_${String(i + 1).padStart(3, '0')}`;
  });
} else while (rows.length < 300) {
  const m = rows.length % 12;
  push({
    account_id: A.officeSupplies,
    credit_account_id: A.checking,
    amount: 3500 + m * 200,
    value_date: fyDate(m, 23),
    name: 'Office supplies top-up',
    description: 'Stationery & pantry supplies — filler entry',
  });
}

// Re-number IDs sequentially
rows.forEach((r, i) => {
  r.id = `post_fy25_${String(i + 1).padStart(3, '0')}`;
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

const outPath = path.join(__dirname, 'posting-fy2025.csv');
fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');

// Balance check: sum debits should equal sum credits per account classification
let totalDebits = 0;
for (const r of rows) {
  totalDebits += parseFloat(r.amount);
}
console.log(`Wrote ${rows.length} postings to ${outPath}`);
console.log(`Total debit-side amount (sum of all posting amounts): INR ${totalDebits.toLocaleString('en-IN')}`);
console.log('(Each row is balanced double-entry; global TB balance depends on opening balances.)');
