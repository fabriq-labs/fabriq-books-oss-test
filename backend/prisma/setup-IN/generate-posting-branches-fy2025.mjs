/**
 * Generates posting-demo-mumbai.csv and posting-demo-bangalore.csv
 * (300 double-entry postings each, Indian FY 2025-26: Apr 2025 – Mar 2026).
 * Run: node backend/prisma/setup-IN/generate-posting-branches-fy2025.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORG = 'org_indian_demo';
const FY_START = new Date('2025-04-01T00:00:00Z');
const FY_MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

const HEADERS = [
  'id', 'created_by', 'modified_by', 'created_at', 'modified_at', 'org_id', 'assigned_to',
  'account_id', 'credit_account_id', 'name', 'account_name', 'value_date', 'posting_date',
  'amount', 'category_name', 'posting_type', 'notes', 'description',
  'invoice_id', 'reversal_of_posting_id', 'status', 'reversed_at', 'legal_entity_id',
  'trade_id', 'holding_id', 'income_type', 'income_source',
  'ai_cat_score', 'ai_categorized_at', 'reconciliation_status', 'matched_reference', 'payment_receipt_id',
];

const CUSTOMERS = [
  { name: 'Tata Consultancy Services Ltd' },
  { name: 'Infosys Limited' },
  { name: 'Wipro Limited' },
  { name: 'Reliance Industries Limited' },
  { name: 'HDFC Bank Ltd' },
  { name: 'ICICI Bank Limited' },
];

const SUPPLIERS = [
  { id: 'supp_dell_india', name: 'Dell Technologies India' },
  { id: 'supp_hp_india', name: 'HP India Sales' },
  { id: 'supp_lenovo_india', name: 'Lenovo India' },
  { id: 'supp_cipla', name: 'Cipla Ltd' },
];

function makeAccounts(le) {
  const p = `acco_${le}`;
  return {
    checking: `${p}_1102`, savings: `${p}_1103`, ar: `${p}_1105`, inventory: `${p}_1106`,
    prepaid: `${p}_1107`, fixedAsset: `${p}_1201`, accumDep: `${p}_1202`, ap: `${p}_2101`,
    creditCard: `${p}_2102`, payrollLib: `${p}_2103`, taxesPayable: `${p}_2104`,
    deferredRev: `${p}_2105`, loanPayable: `${p}_2201`, salesRev: `${p}_4101`,
    serviceRev: `${p}_4102`, otherIncome: `${p}_4103`, cogs: `${p}_5101`,
    salaries: `${p}_5201`, payrollTax: `${p}_5202`, rent: `${p}_5203`, utilities: `${p}_5204`,
    insurance: `${p}_5205`, marketing: `${p}_5206`, professional: `${p}_5207`,
    software: `${p}_5208`, officeSupplies: `${p}_5209`, travel: `${p}_5210`,
    bankFees: `${p}_5211`, depreciation: `${p}_5212`, badDebt: `${p}_5213`,
    repairs: `${p}_5214`, freight: `${p}_5215`, training: `${p}_5301`, misc: `${p}_5303`,
  };
}

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
  return { base, gst };
}

function s(amount, scale) {
  return round2(amount * scale);
}

function buildBranchPostings(cfg) {
  const A = makeAccounts(cfg.legalEntityId);
  const scale = cfg.amountScale;
  let seq = 0;
  const rows = [];

  const push = (entry) => {
    seq += 1;
    const vd = entry.value_date ?? entry.posting_date;
    rows.push({
      id: entry.id ?? `${cfg.idPrefix}${String(seq).padStart(3, '0')}`,
      created_by: cfg.createdBy,
      modified_by: cfg.createdBy,
      created_at: '', modified_at: '', org_id: ORG, assigned_to: '',
      account_id: entry.account_id,
      credit_account_id: entry.credit_account_id,
      name: (entry.name ?? entry.description ?? '').slice(0, 80),
      account_name: '',
      value_date: vd,
      posting_date: entry.posting_date ?? vd,
      amount: round2(entry.amount).toFixed(2),
      category_name: '',
      posting_type: entry.posting_type ?? 'JOURNAL',
      notes: entry.notes ?? '',
      description: entry.description ?? '',
      invoice_id: '',
      reversal_of_posting_id: '',
      status: 'ACTIVE',
      reversed_at: '',
      legal_entity_id: cfg.legalEntityId,
      trade_id: '', holding_id: '',
      income_type: entry.income_type ?? '',
      income_source: entry.income_source ?? '',
      ai_cat_score: '', ai_categorized_at: '',
      reconciliation_status: entry.reconciliation_status ?? '',
      matched_reference: entry.matched_reference ?? '',
      payment_receipt_id: '',
    });
  };

  const amt = (n) => s(n, scale);
  const invTag = cfg.invoicePrefix;

  for (let m = 0; m < 12; m++) {
    const invNum = `${invTag}-${String(m + 1).padStart(3, '0')}`;
    const cust = CUSTOMERS[m % CUSTOMERS.length];
    const base = cfg.revenueBase + m * cfg.revenueStep;
    const { base: rev, gst } = gstSplit(amt(base));
    const dt = fyDate(m, 28);
    push({
      account_id: A.ar, credit_account_id: A.serviceRev, amount: rev, value_date: dt,
      name: `Service revenue ${invNum}`,
      description: `${cfg.branchLabel} — IT services — ${cust.name} — ${invNum}`,
      notes: `GST 18%: INR ${gst.toLocaleString('en-IN')}`,
    });
    push({
      account_id: A.ar, credit_account_id: A.taxesPayable, amount: gst, value_date: dt,
      name: `Output GST ${invNum}`,
      description: `CGST+SGST/IGST @18% — ${invNum} — ${cfg.gstState}`,
      notes: 'GSTR-1 B2B invoice',
    });
  }

  for (let q = 0; q < 4; q++) {
    push({
      account_id: A.ar, credit_account_id: A.salesRev,
      amount: amt(cfg.licenseBase + q * cfg.licenseStep),
      value_date: fyDate(q * 3 + 2, 20),
      name: `License revenue Q${q + 1}`,
      description: `${cfg.branchLabel} — product license Q${q + 1} FY2025-26`,
    });
  }

  for (let m = 0; m < 12; m++) {
    const cust = CUSTOMERS[(m + 2) % CUSTOMERS.length];
    push({
      account_id: A.checking, credit_account_id: A.ar,
      amount: amt(cfg.collectionBase + (m % 4) * cfg.collectionStep),
      value_date: fyDate(m, 10),
      name: `NEFT receipt — ${cust.name.slice(0, 25)}`,
      description: `Customer collection — ${cust.name} — ${cfg.bankName}`,
      notes: 'TDS u/s 194J where applicable',
      posting_type: 'BANK',
    });
  }

  for (let i = 0; i < 4; i++) {
    push({
      account_id: A.checking, credit_account_id: A.deferredRev,
      amount: amt(28000 + i * 6000),
      value_date: fyDate(i * 2 + 1, 5),
      name: 'Customer advance',
      description: `Advance billing — ${CUSTOMERS[i].name}`,
    });
    push({
      account_id: A.deferredRev, credit_account_id: A.serviceRev,
      amount: amt(26000 + i * 5000),
      value_date: fyDate(i * 2 + 3, 25),
      name: 'Deferred revenue recognised',
      description: `Milestone revenue — ${cfg.branchLabel}`,
    });
  }

  for (let m = 0; m < 12; m++) {
    const supp = SUPPLIERS[m % SUPPLIERS.length];
    const expAcct = m % 3 === 0 ? A.software : m % 3 === 1 ? A.officeSupplies : A.inventory;
    const { base: exp, gst } = gstSplit(amt(cfg.vendorBillBase + m * cfg.vendorBillStep));
    push({
      account_id: expAcct, credit_account_id: A.ap, amount: exp,
      value_date: fyDate(m, 18),
      name: `Vendor bill — ${supp.name}`,
      description: `Purchase — ${supp.id} — ${cfg.branchLabel}`,
      notes: `ITC eligible INR ${gst}`,
    });
  }

  for (let m = 0; m < 12; m++) {
    const supp = SUPPLIERS[(m + 1) % SUPPLIERS.length];
    push({
      account_id: A.ap, credit_account_id: A.checking,
      amount: amt(cfg.vendorPayBase + m * cfg.vendorPayStep),
      value_date: fyDate(m, 25),
      name: `Vendor payment — ${supp.name}`,
      description: `NEFT vendor settlement — ${cfg.branchLabel}`,
    });
  }

  for (let m = 0; m < 12; m++) {
    const cardAmt = amt(5200 + m * 250);
    push({
      account_id: m % 2 === 0 ? A.travel : A.marketing,
      credit_account_id: A.creditCard, amount: cardAmt, value_date: fyDate(m, 12),
      name: 'Corporate card expense',
      description: m % 2 === 0 ? `${cfg.travelNote}` : 'Digital marketing — regional campaigns',
    });
    push({
      account_id: A.creditCard, credit_account_id: A.checking, amount: cardAmt,
      value_date: fyDate(m, 27),
      name: 'Credit card payment',
      description: `${cfg.bankName} corporate card — statement`,
    });
  }

  for (let m = 0; m < 12; m++) {
    const gross = amt(cfg.payrollGross);
    const pfEsi = round2(gross * 0.13);
    const dt = fyDate(m, 28);
    push({
      account_id: A.salaries, credit_account_id: A.checking, amount: gross, value_date: dt,
      name: `Payroll — ${FY_MONTHS[m]} FY26`,
      description: cfg.payrollDesc,
      notes: 'TDS u/s 192 — salary',
    });
    push({
      account_id: A.payrollTax, credit_account_id: A.payrollLib, amount: pfEsi, value_date: dt,
      name: 'PF & ESI accrual',
      description: `EPFO + ESIC — ${cfg.gstState}`,
    });
  }

  for (let m = 0; m < 6; m++) {
    push({
      account_id: A.payrollLib, credit_account_id: A.checking,
      amount: amt(cfg.payrollRemit),
      value_date: fyDate(m * 2 + 1, 5),
      name: 'PF/ESI remittance',
      description: cfg.payrollRemitDesc,
    });
  }

  for (let m = 0; m < 12; m++) {
    const { base: rent } = gstSplit(amt(cfg.rentBase));
    push({
      account_id: A.rent, credit_account_id: A.checking, amount: rent,
      value_date: fyDate(m, 5),
      name: cfg.rentTitle,
      description: cfg.rentDesc,
    });
  }

  for (let m = 0; m < 12; m++) {
    push({
      account_id: A.utilities, credit_account_id: A.checking,
      amount: amt(cfg.utilitiesBase + (m % 3) * 2000),
      value_date: fyDate(m, 20),
      name: 'Utilities',
      description: cfg.utilitiesDesc,
    });
    push({
      account_id: A.software, credit_account_id: A.checking,
      amount: amt(cfg.softwareBase + m * 1200),
      value_date: fyDate(m, 8),
      name: 'SaaS & cloud',
      description: cfg.softwareDesc,
    });
  }

  for (let m = 0; m < 4; m++) {
    push({
      account_id: A.insurance, credit_account_id: A.checking,
      amount: amt(24000),
      value_date: fyDate(m * 3, 15),
      name: 'Group mediclaim',
      description: `Health insurance — ${cfg.branchLabel}`,
    });
  }

  for (let m = 0; m < 12; m++) {
    push({
      account_id: A.taxesPayable, credit_account_id: A.checking,
      amount: amt(cfg.gstPayBase + m * 1800),
      value_date: fyDate(m, 20),
      name: 'GST payment — GSTR-3B',
      description: `GST remittance — ${cfg.gstState}`,
      notes: 'Net of ITC',
    });
  }

  for (let m = 0; m < 12; m++) {
    push({
      account_id: A.professional, credit_account_id: A.checking,
      amount: amt(m % 4 === 0 ? cfg.auditFee : cfg.legalFee),
      value_date: fyDate(m, 22),
      name: m % 4 === 0 ? 'Branch audit support' : 'Legal & compliance',
      description: m % 4 === 0 ? 'Statutory support — branch books FY2025-26' : 'ROC / labour compliance',
    });
  }

  for (let m = 0; m < 12; m++) {
    if (m % 2 === 0) {
      push({
        account_id: A.marketing, credit_account_id: A.checking,
        amount: amt(22000 + m * 1800),
        value_date: fyDate(m, 14),
        name: 'Marketing spend',
        description: `${cfg.branchLabel} — lead generation`,
      });
    }
  }

  for (let i = 0; i < 4; i++) {
    push({
      account_id: A.training, credit_account_id: A.checking,
      amount: amt(14000 + i * 3000),
      value_date: fyDate(i * 3 + 1, 16),
      name: 'Training',
      description: 'Technical certification — branch staff',
    });
    push({
      account_id: A.repairs, credit_account_id: A.checking,
      amount: amt(9000 + i * 1500),
      value_date: fyDate(i * 3 + 2, 16),
      name: 'Facilities AMC',
      description: cfg.repairsDesc,
    });
    push({
      account_id: A.freight, credit_account_id: A.checking,
      amount: amt(7500),
      value_date: fyDate(i * 3, 19),
      name: 'Courier',
      description: 'Blue Dart — client deliverables',
    });
  }

  for (let m = 0; m < 8; m++) {
    push({
      account_id: A.inventory, credit_account_id: A.ap,
      amount: amt(48000 + m * 4500),
      value_date: fyDate(m + 2, 17),
      name: 'Inventory receipt',
      description: 'Components stock — branch warehouse',
    });
    push({
      account_id: A.cogs, credit_account_id: A.inventory,
      amount: amt(44000 + m * 4000),
      value_date: fyDate(m + 3, 24),
      name: 'COGS',
      description: 'Project delivery cost recognition',
    });
  }

  for (let m = 0; m < 12; m++) {
    push({
      account_id: A.bankFees, credit_account_id: A.checking,
      amount: amt(650 + m * 40),
      value_date: fyDate(m, 30),
      name: 'Bank charges',
      description: `${cfg.bankName} — service charges`,
      posting_type: 'BANK',
    });
  }

  for (let q = 0; q < 4; q++) {
    push({
      account_id: A.depreciation, credit_account_id: A.accumDep,
      amount: amt(cfg.depreciationQ),
      value_date: fyDate(q * 3 + 2, 28),
      name: `Depreciation Q${q + 1}`,
      description: 'WDV — laptops & office assets',
    });
  }

  push({
    account_id: A.fixedAsset, credit_account_id: A.checking,
    amount: amt(cfg.capexCash),
    value_date: fyDate(5, 12),
    name: 'Capex — equipment',
    description: cfg.capexDesc,
  });
  push({
    account_id: A.fixedAsset, credit_account_id: A.ap,
    amount: amt(cfg.capexCredit),
    value_date: fyDate(8, 12),
    name: 'Laptop purchase',
    description: 'Lenovo fleet — branch rollout',
  });

  for (let q = 0; q < 4; q++) {
    push({
      account_id: A.loanPayable, credit_account_id: A.checking,
      amount: amt(cfg.loanEmi),
      value_date: fyDate(q * 3 + 1, 28),
      name: 'Loan principal EMI',
      description: `${cfg.bankName} — working capital loan`,
    });
  }

  push({
    account_id: A.badDebt, credit_account_id: A.ar, amount: amt(12000),
    value_date: fyDate(9, 28), name: 'Bad debt provision',
    description: 'Doubtful receivable — branch AR ageing',
  });
  push({
    account_id: A.badDebt, credit_account_id: A.ar, amount: amt(8000),
    value_date: fyDate(11, 28), name: 'Bad debt adjustment',
    description: 'Additional provision',
  });

  for (let q = 0; q < 4; q++) {
    push({
      account_id: A.savings, credit_account_id: A.otherIncome,
      amount: amt(9500 + q * 800),
      value_date: fyDate(q * 3 + 2, 28),
      name: 'FD interest',
      description: `${cfg.bankName} — term deposit interest`,
      income_type: 'INTEREST', income_source: 'DEPOSIT',
    });
  }

  for (let m = 0; m < 8; m++) {
    push({
      account_id: A.travel, credit_account_id: A.checking,
      amount: amt(12000 + m * 900),
      value_date: fyDate(m + 1, 19),
      name: 'Travel',
      description: cfg.travelNote,
    });
    push({
      account_id: A.misc, credit_account_id: A.checking,
      amount: amt(2800 + m * 350),
      value_date: fyDate(m + 2, 21),
      name: 'Petty cash',
      description: 'Office incidentals',
    });
  }

  for (let m = 0; m < 6; m++) {
    push({
      account_id: A.prepaid, credit_account_id: A.checking,
      amount: amt(7000 + m * 1200),
      value_date: fyDate(m * 2, 12),
      name: 'TDS credit receivable',
      description: 'Form 16A — customer TDS u/s 194J',
    });
  }

  for (let m = 0; m < 4; m++) {
    push({
      account_id: A.professional, credit_account_id: A.ap,
      amount: amt(45000),
      value_date: fyDate(m * 2 + 1, 23),
      name: 'Management fee to HQ',
      description: 'Shared services — Demo Tech Solutions India Pvt Ltd',
      notes: 'Intercompany recharge',
    });
  }

  while (rows.length < 300) {
    const m = rows.length % 12;
    push({
      account_id: A.officeSupplies, credit_account_id: A.checking,
      amount: amt(2200 + m * 150),
      value_date: fyDate(m, 23),
      name: 'Office supplies',
      description: 'Stationery — branch pantry',
    });
  }
  if (rows.length > 300) rows.length = 300;

  rows.forEach((r, i) => {
    r.id = `${cfg.idPrefix}${String(i + 1).padStart(3, '0')}`;
    r.amount = parseFloat(r.amount).toFixed(2);
  });

  return rows;
}

const BRANCHES = [
  {
    legalEntityId: 'org_mumbai_branch',
    branchLabel: 'Mumbai Tech Hub',
    idPrefix: 'post_mum25_',
    outputFile: 'posting-demo-mumbai.csv',
    createdBy: 'user_meera_rao',
    invoicePrefix: 'MUM-INV',
    gstState: 'Maharashtra',
    bankName: 'ICICI Bank — BKC branch',
    amountScale: 0.58,
    revenueBase: 95000, revenueStep: 8000,
    licenseBase: 42000, licenseStep: 6000,
    collectionBase: 72000, collectionStep: 16000,
    vendorBillBase: 38000, vendorBillStep: 2800,
    vendorPayBase: 40000, vendorPayStep: 2600,
    payrollGross: 248000, payrollRemit: 64400,
    payrollDesc: 'Salaries — Mumbai delivery & sales team',
    payrollRemitDesc: 'EPFO + ESIC — Maharashtra',
    rentBase: 128000, rentTitle: 'Rent — BKC office',
    rentDesc: 'Bandra Kurla Complex — commercial lease',
    utilitiesBase: 16000, utilitiesDesc: 'Adani Electricity + Jio business — Mumbai',
    softwareBase: 52000, softwareDesc: 'AWS, Azure, dev tools — Mumbai cost centre',
    gstPayBase: 16500, auditFee: 68000, legalFee: 22000,
    depreciationQ: 62000, capexCash: 420000, capexCredit: 165000, loanEmi: 72000,
    travelNote: 'Client travel — Mumbai / Pune engagements',
    repairsDesc: 'HVAC AMC — BKC server room',
  },
  {
    legalEntityId: 'org_bangalore_office',
    branchLabel: 'Bangalore Innovation Center',
    idPrefix: 'post_blr25_',
    outputFile: 'posting-demo-bangalore.csv',
    createdBy: 'user_arjun_sharma',
    invoicePrefix: 'BLR-INV',
    gstState: 'Karnataka',
    bankName: 'HDFC Bank — Whitefield branch',
    amountScale: 0.62,
    revenueBase: 105000, revenueStep: 9000,
    licenseBase: 48000, licenseStep: 7000,
    collectionBase: 82000, collectionStep: 18000,
    vendorBillBase: 42000, vendorBillStep: 3200,
    vendorPayBase: 45000, vendorPayStep: 3000,
    payrollGross: 268000, payrollRemit: 69600,
    payrollDesc: 'Salaries — Bangalore engineering hub',
    payrollRemitDesc: 'EPFO + ESIC — Karnataka',
    rentBase: 112000, rentTitle: 'Rent — Whitefield ITPL',
    rentDesc: 'Whitefield, ITPL Main Road — tech office lease',
    utilitiesBase: 15000, utilitiesDesc: 'BESCOM + ACT Fibernet — Whitefield',
    softwareBase: 58000, softwareDesc: 'Cloud & dev tools — Bangalore R&D centre',
    gstPayBase: 17800, auditFee: 72000, legalFee: 24000,
    depreciationQ: 68000, capexCash: 465000, capexCredit: 178000, loanEmi: 78000,
    travelNote: 'Travel — Bangalore / Hyderabad client sites',
    repairsDesc: 'UPS & cooling — Whitefield lab',
  },
];

function escapeCsv(val) {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function writeCsv(fileName, rows) {
  const lines = [HEADERS.join(',')];
  for (const r of rows) {
    lines.push(HEADERS.map((h) => escapeCsv(r[h])).join(','));
  }
  const outPath = path.join(__dirname, fileName);
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  let total = 0;
  for (const r of rows) total += parseFloat(r.amount);
  console.log(`  ${fileName}: ${rows.length} rows, INR ${total.toLocaleString('en-IN')}`);
}

console.log('Generating branch postings (FY 2025-26, Apr–Mar)...');
for (const cfg of BRANCHES) {
  const rows = buildBranchPostings(cfg);
  writeCsv(cfg.outputFile, rows);
}
console.log('Done.');
