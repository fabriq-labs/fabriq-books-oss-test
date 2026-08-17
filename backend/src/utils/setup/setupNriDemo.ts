/**
 * NRI personal books: Rajesh Menon.
 *
 * Tax story (do not flatten this):
 *   - Canadian tax resident (worldwide income on T1).
 *   - NRI in India — files ITR-2; Indian tax only on India-source income
 *     (Kochi rent, NRO interest, Indian CG/dividends). NRE interest is
 *     exempt in India. Canada salary is not India-source.
 *
 * Org: org_rajesh  |  Entities: ent_rajesh_canada (CAD, Jan–Dec),
 *                               ent_rajesh_india (INR, Apr–Mar)
 * Login: rajesh.menon@gmail.com / admin123
 *        kavya.menon@gmail.com  / admin123
 *
 * Idempotent: upserts org/entities/users/CoA; replaces this org's postings
 * and FX rates. Safe with --demo-data-only next to org_oss_demo.
 */
import * as path from 'path';
import { hash } from 'bcryptjs';
import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { setupChartOfAccounts } from './setupChartOfAccounts';

function nriCoaPath(file: string): string {
  return path.join(__dirname, '..', '..', '..', 'prisma', 'setup-NRI', file);
}

const ORG_ID = 'org_rajesh';
const ENT_CA = 'ent_rajesh_canada';
const ENT_IN = 'ent_rajesh_india';
const USER_RAJESH = 'user_rajesh_menon';
const USER_KAVYA = 'user_kavya_menon';
const RAJESH_EMAIL = 'rajesh.menon@gmail.com';
const KAVYA_EMAIL = 'kavya.menon@gmail.com';
const DEMO_PASSWORD = 'admin123';

const SUPER_ADMIN_ROLE = 'role_cc202e8c-204b-4451-b0fd-a9dc4cec5e38';
const FINANCE_ROLE = 'role_2c4accef-74a0-4b10-9bc9-dcad64442013';

type Reco = 'CONFIRMED' | 'SUGGESTED' | 'UNMATCHED' | null;

type Journal = {
  id: string;
  entityId: string;
  date: string;
  description: string;
  debitCode: string;
  creditCode: string;
  amount: number;
  status?: Reco;
  aiScore?: number;
  notes?: string;
  postingType?: string;
};

function accountId(entityId: string, code: string): string {
  return `acco_${`${entityId}-${code}`.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthsInclusive(startYm: string, endYm: string): { y: number; m: number; ym: string }[] {
  const [sy, sm] = startYm.split('-').map(Number);
  const [ey, em] = endYm.split('-').map(Number);
  const out: { y: number; m: number; ym: string }[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push({ y, m, ym: `${y}-${String(m).padStart(2, '0')}` });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function inrToCadRate(y: number, m: number): number {
  return round2((0.01615 + (y - 2024) * 0.00018 + ((m - 1) % 6) * 0.00007) * 10000) / 10000;
}

function buildJournals(): Journal[] {
  const rows: Journal[] = [];
  let n = 1;
  const push = (row: Omit<Journal, 'id'>) => {
    rows.push({
      id: `post_nri_${String(n).padStart(4, '0')}`,
      status: row.status ?? 'CONFIRMED',
      ...row,
    });
    n += 1;
  };

  // ── Canada opening (day before CY 2024) ──────────────────────────────────
  const caOpenDate = '2023-12-31';
  const caOpen: Array<[string, number, 'asset' | 'liability']> = [
    ['1110', 14200, 'asset'],
    ['1120', 32800, 'asset'],
    ['1210', 48500, 'asset'],
    ['1220', 92000, 'asset'],
    ['1410', 685000, 'asset'],
    ['1510', 18500, 'asset'],
    ['2110', 2140, 'liability'],
    ['2210', 412000, 'liability'],
  ];
  for (const [code, amt, side] of caOpen) {
    if (side === 'asset') {
      push({
        entityId: ENT_CA,
        date: caOpenDate,
        description: 'Opening balance — Canada personal books',
        debitCode: code,
        creditCode: '3100',
        amount: amt,
        postingType: 'OPENING_BALANCE',
        notes: 'Canadian tax resident — CAD books, calendar year.',
      });
    } else {
      push({
        entityId: ENT_CA,
        date: caOpenDate,
        description: 'Opening balance — Canada personal books',
        debitCode: '3100',
        creditCode: code,
        amount: amt,
        postingType: 'OPENING_BALANCE',
        notes: 'Canadian tax resident — CAD books, calendar year.',
      });
    }
  }

  // ── India opening (day before FY 2024-25) ────────────────────────────────
  const inOpenDate = '2024-03-31';
  const inOpen: Array<[string, number, 'asset' | 'liability']> = [
    ['1110', 1840000, 'asset'],
    ['1120', 425000, 'asset'],
    ['1210', 2500000, 'asset'],
    ['1220', 875000, 'asset'],
    ['1230', 1220000, 'asset'],
    ['1410', 9500000, 'asset'],
    ['1610', 650000, 'asset'],
    ['2110', 42000, 'liability'],
    ['2210', 2850000, 'liability'],
  ];
  for (const [code, amt, side] of inOpen) {
    if (side === 'asset') {
      push({
        entityId: ENT_IN,
        date: inOpenDate,
        description: 'Opening balance — India NRI personal books',
        debitCode: code,
        creditCode: '3100',
        amount: amt,
        postingType: 'OPENING_BALANCE',
        notes: 'NRI in India; India-source assets only in these books.',
      });
    } else {
      push({
        entityId: ENT_IN,
        date: inOpenDate,
        description: 'Opening balance — India NRI personal books',
        debitCode: '3100',
        creditCode: code,
        amount: amt,
        postingType: 'OPENING_BALANCE',
        notes: 'NRI in India; India-source assets only in these books.',
      });
    }
  }

  // ── Canada monthly CY 2024–2025 ─────────────────────────────────────────
  for (const { y, m, ym } of monthsInclusive('2024-01', '2025-12')) {
    const salary = y === 2024 ? 8420 : 8950;
    const rentIn = m === 6 && y === 2025 ? 0 : y === 2024 ? 1450 : 1525; // vacancy Jun 2025
    const violin = 640 + (m % 3) * 40;
    const groceries = 620 + (m % 4) * 18;
    const dining = 185 + (m % 5) * 12;
    const utilities = 245 + (m % 3) * 15;
    const transit = 156.0;
    const gym = 28.99;
    const mortgageInterest = y === 2024 ? 1480 : 1395;
    const mortgagePrincipal = y === 2024 ? 1200 : 1285;
    const visaSpend = 310 + (m % 6) * 22;
    const visaPay = visaSpend - 15;

    push({
      entityId: ENT_CA,
      date: `${ym}-02`,
      description: `TD PAY Shopify Inc — net pay ${ym}`,
      debitCode: '1110',
      creditCode: '4100',
      amount: salary,
      notes: 'T4 employment. Canadian resident — taxable in Canada. Not India-source.',
    });

    if (rentIn > 0) {
      push({
        entityId: ENT_CA,
        date: `${ym}-03`,
        description:
          m === 6 && y === 2025
            ? 'Basement vacant'
            : `Interac e-Transfer Priya Das — Milton basement ${ym}`,
        debitCode: '1110',
        creditCode: '4200',
        amount: rentIn,
        notes: 'T776 rental. Canadian-source.',
      });
    }

    push({
      entityId: ENT_CA,
      date: `${ym}-05`,
      description: `Carnatic violin studio — Liberty Village hall ${ym}`,
      debitCode: '1110',
      creditCode: '4300',
      amount: violin,
      notes: 'T2125 self-employment + HST collected. Canadian resident.',
    });

    push({
      entityId: ENT_CA,
      date: `${ym}-06`,
      description: `TD Mortgage interest — Milton ${ym}`,
      debitCode: '5100',
      creditCode: '1110',
      amount: mortgageInterest,
    });
    push({
      entityId: ENT_CA,
      date: `${ym}-06`,
      description: `TD Mortgage principal — Milton ${ym}`,
      debitCode: '2210',
      creditCode: '1110',
      amount: mortgagePrincipal,
    });

    push({
      entityId: ENT_CA,
      date: `${ym}-08`,
      description: `Hydro One / Enbridge / Rogers ${ym}`,
      debitCode: '5120',
      creditCode: '1110',
      amount: utilities,
    });
    push({
      entityId: ENT_CA,
      date: `${ym}-09`,
      description: `Farm Boy + No Frills ${ym}`,
      debitCode: '5200',
      creditCode: '1110',
      amount: groceries,
    });
    push({
      entityId: ENT_CA,
      date: `${ym}-11`,
      description: `A&W / Banu Biryani / Tim Hortons ${ym}`,
      debitCode: '5210',
      creditCode: '1110',
      amount: dining,
      status: m % 4 === 0 ? 'SUGGESTED' : 'CONFIRMED',
      aiScore: m % 4 === 0 ? 0.72 : undefined,
    });
    push({
      entityId: ENT_CA,
      date: `${ym}-12`,
      description: `Presto + Petro-Canada ${ym}`,
      debitCode: '5300',
      creditCode: '1110',
      amount: transit,
    });
    push({
      entityId: ENT_CA,
      date: `${ym}-14`,
      description: `GoodLife Fitness Milton ${ym}`,
      debitCode: '5800',
      creditCode: '1110',
      amount: gym,
    });
    push({
      entityId: ENT_CA,
      date: `${ym}-16`,
      description: `TD Visa Infinite spend ${ym}`,
      debitCode: '5990',
      creditCode: '2110',
      amount: visaSpend,
    });
    push({
      entityId: ENT_CA,
      date: `${ym}-18`,
      description: `TD Visa Infinite payment ${ym}`,
      debitCode: '2110',
      creditCode: '1110',
      amount: visaPay,
    });
    push({
      entityId: ENT_CA,
      date: `${ym}-20`,
      description: `TD monthly account fee ${ym}`,
      debitCode: '5900',
      creditCode: '1110',
      amount: 15.95,
    });
    push({
      entityId: ENT_CA,
      date: `${ym}-22`,
      description: `TD High Interest Savings credit ${ym}`,
      debitCode: '1120',
      creditCode: '4400',
      amount: round2(38 + m * 0.4),
    });

    // Quarterly HST remittance on violin studio (approx 13% of studio take)
    if (m % 3 === 0) {
      push({
        entityId: ENT_CA,
        date: `${ym}-25`,
        description: `CRA HST remittance Q${m / 3} ${y}`,
        debitCode: '5410',
        creditCode: '1110',
        amount: round2(violin * 3 * 0.13),
        notes: 'HST on T2125 violin studio.',
      });
    }

    // Quarterly remittance CAD → India NRE (equity, not income)
    if (m % 3 === 0) {
      push({
        entityId: ENT_CA,
        date: `${ym}-27`,
        description: `Wise CAD→INR to ICICI NRE ${ym}`,
        debitCode: '3200',
        creditCode: '1110',
        amount: 4000,
        notes: 'Capital remittance to NRE. Not Canadian expense; not Indian income.',
      });
    }
  }

  // Canada annual / surprise
  push({
    entityId: ENT_CA,
    date: '2024-03-01',
    description: 'RRSP contribution — TD Direct Investing (2023 room)',
    debitCode: '1220',
    creditCode: '1110',
    amount: 12000,
    notes: 'RRSP — deduction on Canadian T1. Not relevant to Indian NRI ITR.',
  });
  push({
    entityId: ENT_CA,
    date: '2024-03-15',
    description: 'Halton Region property tax instalment 1',
    debitCode: '5110',
    creditCode: '1110',
    amount: 1840,
  });
  for (const y of [2024, 2025]) {
    push({
      entityId: ENT_CA,
      date: `${y}-04-18`,
      description: `Manulife + TD insurance annual ${y}`,
      debitCode: '5700',
      creditCode: '1110',
      amount: y === 2024 ? 2140 : 2280,
    });
    push({
      entityId: ENT_CA,
      date: `${y}-06-15`,
      description: `Halton Region property tax instalment 2 ${y}`,
      debitCode: '5110',
      creditCode: '1110',
      amount: y === 2024 ? 1840 : 1910,
    });
    push({
      entityId: ENT_CA,
      date: `${y}-09-15`,
      description: `CRA instalment — Canadian resident T1 ${y}`,
      debitCode: '5400',
      creditCode: '1110',
      amount: y === 2024 ? 4200 : 4550,
      notes: 'Canadian tax resident. Includes foreign-income reporting of India rent/interest.',
    });
    push({
      entityId: ENT_CA,
      date: `${y}-11-12`,
      description: `Air Canada YYZ–COK — Onam / Christmas visit ${y}`,
      debitCode: '5600',
      creditCode: '1110',
      amount: y === 2024 ? 1680 : 1825,
    });
    push({
      entityId: ENT_CA,
      date: `${y}-12-15`,
      description: `Shopify year-end bonus ${y}`,
      debitCode: '1110',
      creditCode: '4110',
      amount: y === 2024 ? 6500 : 8500,
    });
    push({
      entityId: ENT_CA,
      date: `${y}-12-20`,
      description: `Meera Patel CPA — T1 + T2125 + foreign income ${y}`,
      debitCode: '5500',
      creditCode: '1110',
      amount: 890,
    });
  }
  push({
    entityId: ENT_CA,
    date: '2025-03-01',
    description: 'RRSP contribution — TD Direct Investing',
    debitCode: '1220',
    creditCode: '1110',
    amount: 14500,
  });
  push({
    entityId: ENT_CA,
    date: '2025-01-08',
    description: 'TFSA contribution — Vanguard VEQT',
    debitCode: '1210',
    creditCode: '1110',
    amount: 7000,
    notes: 'TFSA — tax-free in Canada. Not an Indian account.',
  });
  push({
    entityId: ENT_CA,
    date: '2025-06-01',
    description: 'Basement turnover — skip-a-month vacancy (Priya Das moved out)',
    debitCode: '5990',
    creditCode: '1110',
    amount: 185,
    notes: 'Cleaning + Kijiji ads. No rent this month.',
  });
  push({
    entityId: ENT_CA,
    date: '2024-07-19',
    description: 'POS UNKNOWN TORONTO-DT',
    debitCode: '5990',
    creditCode: '1110',
    amount: 87.43,
    status: 'UNMATCHED',
  });
  push({
    entityId: ENT_CA,
    date: '2025-02-03',
    description: 'Interac e-Transfer — unlabelled',
    debitCode: '5990',
    creditCode: '1110',
    amount: 64.0,
    status: 'UNMATCHED',
    notes: 'T1 demo gate: unlabelled outflow. Confirm personal/draw before sending the package.',
  });
  push({
    entityId: ENT_CA,
    date: '2025-04-12',
    description: 'Home Depot Milton — basement suite paint',
    debitCode: '5990',
    creditCode: '1110',
    amount: 214.67,
    status: 'UNMATCHED',
    notes: 'T1 demo gate: likely T776 repair vs personal. Categorise to Basement rental expenses (T776).',
  });

  // ── India monthly FY Apr 2024 – Mar 2026 ────────────────────────────────
  for (const { y, m, ym } of monthsInclusive('2024-04', '2026-03')) {
    const fyStartYear = m >= 4 ? y : y - 1;
    const rentGross = fyStartYear === 2024 ? 45000 : 48000;
    const tdsRate = 0.312; // NRI TDS on rent (approx)
    const tds = round2(rentGross * tdsRate);
    const rentNet = round2(rentGross - tds);
    const society = fyStartYear === 2024 ? 4800 : 5200;
    const parents = 25000;
    const nroInterest = round2(1380 + (m % 4) * 40);
    const sip = 15000;

    push({
      entityId: ENT_IN,
      date: `${ym}-02`,
      description: `NEFT Arjun & Meera Nair — Panampilly rent net ${ym}`,
      debitCode: '1120',
      creditCode: '4100',
      amount: rentNet,
      notes: 'India-source rental. Taxable in India (NRI) and reported on Canadian T1 as foreign income.',
    });
    push({
      entityId: ENT_IN,
      date: `${ym}-02`,
      description: `TDS u/s 195 on Kochi rent ${ym} (tenant Form 16A)`,
      debitCode: '1620',
      creditCode: '4100',
      amount: tds,
      notes: 'TDS deducted by tenant. Credit against NRI ITR. Still India-source income.',
    });
    push({
      entityId: ENT_IN,
      date: `${ym}-05`,
      description: `Sobha Panampilly society maintenance ${ym}`,
      debitCode: '5100',
      creditCode: '1120',
      amount: society,
    });
    push({
      entityId: ENT_IN,
      date: `${ym}-07`,
      description: `UPI to parents — Kochi support ${ym}`,
      debitCode: '5200',
      creditCode: '1120',
      amount: parents,
    });
    push({
      entityId: ENT_IN,
      date: `${ym}-08`,
      description: `ICICI NRO savings interest ${ym}`,
      debitCode: '1120',
      creditCode: '4200',
      amount: nroInterest,
      notes: 'NRO interest is taxable in India for NRIs (TDS). Also foreign interest on Canadian T1.',
    });
    push({
      entityId: ENT_IN,
      date: `${ym}-10`,
      description: `Nippon India MF SIP from NRO ${ym}`,
      debitCode: '1230',
      creditCode: '1120',
      amount: sip,
    });
    push({
      entityId: ENT_IN,
      date: `${ym}-12`,
      description: `ICICI Home Loan interest — Kochi flat ${ym}`,
      debitCode: '5130',
      creditCode: '1120',
      amount: fyStartYear === 2024 ? 16800 : 15900,
    });
    push({
      entityId: ENT_IN,
      date: `${ym}-12`,
      description: `ICICI Home Loan principal — Kochi flat ${ym}`,
      debitCode: '2210',
      creditCode: '1120',
      amount: fyStartYear === 2024 ? 14200 : 15100,
    });
    push({
      entityId: ENT_IN,
      date: `${ym}-15`,
      description: `ICICI Sapphiro — Amazon.in / BigBasket ${ym}`,
      debitCode: '5900',
      creditCode: '2110',
      amount: 2400 + (m % 5) * 180,
      status: m % 5 === 0 ? 'SUGGESTED' : 'CONFIRMED',
      aiScore: m % 5 === 0 ? 0.68 : undefined,
    });
    push({
      entityId: ENT_IN,
      date: `${ym}-18`,
      description: `ICICI Sapphiro card payment from NRO ${ym}`,
      debitCode: '2110',
      creditCode: '1120',
      amount: 2300 + (m % 5) * 180,
    });
    push({
      entityId: ENT_IN,
      date: `${ym}-21`,
      description: `ICICI NRE/NRO account charges ${ym}`,
      debitCode: '5300',
      creditCode: '1110',
      amount: 149,
    });

    // Quarterly NRE FD interest (exempt in India)
    if (m % 3 === 0) {
      push({
        entityId: ENT_IN,
        date: `${ym}-24`,
        description: `ICICI NRE FD interest Q${Math.ceil(m / 3)} FY${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`,
        debitCode: '1110',
        creditCode: '4210',
        amount: 43750,
        notes: 'NRE interest exempt in India for NRI. Still foreign interest for Canadian T1.',
      });
    }

    // Matching Wise inflow to NRE (equity contribution)
    if (m % 3 === 0) {
      push({
        entityId: ENT_IN,
        date: `${ym}-27`,
        description: `Wise inward remittance to ICICI NRE ${ym}`,
        debitCode: '1110',
        creditCode: '3200',
        amount: 245000,
        notes: 'Capital from Canada. Not Indian income (NRI).',
      });
    }
  }

  // India annual / surprise
  for (const fy of [2024, 2025]) {
    const yearEnd = fy + 1;
    push({
      entityId: ENT_IN,
      date: `${fy}-07-22`,
      description: `Suresh & Co, CA — ITR-2 NRI FY${fy}-${String(yearEnd).slice(-2)}`,
      debitCode: '5500',
      creditCode: '1120',
      amount: fy === 2024 ? 18000 : 19500,
      notes: 'NRI ITR on India-source income only. DTAA Canada–India disclosure.',
    });
    push({
      entityId: ENT_IN,
      date: `${fy}-06-15`,
      description: `Advance tax — NRI India-source FY${fy}-${String(yearEnd).slice(-2)} Q1`,
      debitCode: '5400',
      creditCode: '1120',
      amount: fy === 2024 ? 22000 : 24500,
    });
    push({
      entityId: ENT_IN,
      date: `${fy}-09-15`,
      description: `Advance tax — NRI India-source FY${fy}-${String(yearEnd).slice(-2)} Q2`,
      debitCode: '5400',
      creditCode: '1120',
      amount: fy === 2024 ? 22000 : 24500,
    });
    push({
      entityId: ENT_IN,
      date: `${fy}-12-15`,
      description: `Advance tax — NRI India-source FY${fy}-${String(yearEnd).slice(-2)} Q3`,
      debitCode: '5400',
      creditCode: '1120',
      amount: fy === 2024 ? 22000 : 24500,
    });
    push({
      entityId: ENT_IN,
      date: `${yearEnd}-03-15`,
      description: `Advance tax — NRI India-source FY${fy}-${String(yearEnd).slice(-2)} Q4`,
      debitCode: '5400',
      creditCode: '1120',
      amount: fy === 2024 ? 18000 : 20000,
    });
    const tdsYear = round2((fy === 2024 ? 45000 : 48000) * 0.312 * 12);
    push({
      entityId: ENT_IN,
      date: `${yearEnd}-03-31`,
      description: `Apply Form 16A TDS credit — NRI ITR FY${fy}-${String(yearEnd).slice(-2)}`,
      debitCode: '5400',
      creditCode: '1620',
      amount: tdsYear,
      notes: 'Withholding on Kochi rent applied as Indian tax paid (NRI).',
    });
    push({
      entityId: ENT_IN,
      date: `${yearEnd}-01-10`,
      description: `Kochi Corporation property tax FY${fy}-${String(yearEnd).slice(-2)}`,
      debitCode: '5110',
      creditCode: '1120',
      amount: fy === 2024 ? 12640 : 13180,
    });
    push({
      entityId: ENT_IN,
      date: `${fy}-12-28`,
      description: `HDFC Bank dividend (NRO) FY${fy}`,
      debitCode: '1120',
      creditCode: '4300',
      amount: fy === 2024 ? 8400 : 9100,
      notes: 'India-source dividend. Taxable in India; foreign income in Canada.',
    });
  }

  push({
    entityId: ENT_IN,
    date: '2024-05-16',
    description: 'Zerodha — sold Infosys 40 shares (LTCG) to NRO',
    debitCode: '1120',
    creditCode: '1220',
    amount: 62000,
  });
  push({
    entityId: ENT_IN,
    date: '2024-05-16',
    description: 'LTCG on Infosys sale (NRI India-source)',
    debitCode: '1120',
    creditCode: '4400',
    amount: 185000,
    notes: 'Listed LTCG. India-source. Report on ITR-2 and Canadian T1 foreign income.',
  });
  push({
    entityId: ENT_IN,
    date: '2024-08-20',
    description: 'NRE transfer — sister Anjali wedding gift',
    debitCode: '3300',
    creditCode: '1110',
    amount: 150000,
  });
  push({
    entityId: ENT_IN,
    date: '2024-12-22',
    description: 'KSEB + plumber — Panampilly owner share (Onam visit)',
    debitCode: '5120',
    creditCode: '1120',
    amount: 8750,
  });
  push({
    entityId: ENT_IN,
    date: '2025-01-04',
    description: 'India visit — CIAL taxi, Grand Hyatt Kochi, family',
    debitCode: '5600',
    creditCode: '1110',
    amount: 42000,
  });
  push({
    entityId: ENT_IN,
    date: '2025-09-12',
    description: 'Nippon MF partial redeem to NRO (LTCG)',
    debitCode: '1120',
    creditCode: '1230',
    amount: 80000,
  });
  push({
    entityId: ENT_IN,
    date: '2025-09-12',
    description: 'LTCG on Nippon India MF redeem',
    debitCode: '1120',
    creditCode: '4400',
    amount: 24500,
  });
  push({
    entityId: ENT_IN,
    date: '2026-01-08',
    description: 'India visit — Christmas/New Year Kochi',
    debitCode: '5600',
    creditCode: '1110',
    amount: 38500,
  });
  push({
    entityId: ENT_IN,
    date: '2025-03-03',
    description: 'IMPS UNKNOWN — Kochi',
    debitCode: '5900',
    creditCode: '1120',
    amount: 2499,
    status: 'UNMATCHED',
    notes: 'T1 demo gate: unlabelled India outflow. Confirm personal; exclude from Kochi rental.',
  });
  push({
    entityId: ENT_IN,
    date: '2025-11-19',
    description: 'POS SWIGGY INSTAMART',
    debitCode: '5900',
    creditCode: '1120',
    amount: 687,
    status: 'UNMATCHED',
    notes: 'T1 demo gate: personal India spend. Exclude from foreign rental.',
  });

  return rows;
}

async function seedFxRates() {
  await prisma.exchange_rate.deleteMany({ where: { org_id: ORG_ID } });
  const months = monthsInclusive('2024-01', '2026-03');
  const data: Prisma.exchange_rateCreateManyInput[] = [];
  for (const { y, m, ym } of months) {
    const rate = inrToCadRate(y, m);
    const day = `${ym}-28`;
    data.push({
      id: `exrt_nri_inr_cad_avg_${ym.replace('-', '')}`,
      org_id: ORG_ID,
      from_currency_id: 'curr_inr',
      to_currency_id: 'curr_cad',
      effective_date: new Date(`${day}T00:00:00.000Z`),
      rate,
      rate_type: 'AVERAGE',
      source: 'nri-demo-seed',
    });
    data.push({
      id: `exrt_nri_inr_cad_cls_${ym.replace('-', '')}`,
      org_id: ORG_ID,
      from_currency_id: 'curr_inr',
      to_currency_id: 'curr_cad',
      effective_date: new Date(`${day}T00:00:00.000Z`),
      rate: round2(rate * 0.998 * 10000) / 10000,
      rate_type: 'CLOSING',
      source: 'nri-demo-seed',
    });
  }
  await prisma.exchange_rate.createMany({ data });
  console.log(`  ✓ ${data.length} INR→CAD FX rates`);
}

async function seedPostings() {
  const rows = buildJournals();
  await prisma.posting.deleteMany({ where: { org_id: ORG_ID } });

  const data: Prisma.postingCreateManyInput[] = rows.map((row) => {
    const valueDate = new Date(`${row.date}T12:00:00.000Z`);
    return {
      id: row.id,
      org_id: ORG_ID,
      legal_entity_id: row.entityId,
      account_id: accountId(row.entityId, row.debitCode),
      credit_account_id: accountId(row.entityId, row.creditCode),
      amount: row.amount,
      description: row.description,
      name: row.description,
      notes: row.notes ?? null,
      value_date: valueDate,
      posting_date: valueDate,
      posting_type: row.postingType ?? 'JOURNAL',
      reconciliation_status: row.status,
      ai_cat_score: row.aiScore ?? null,
      ai_categorized_at: row.aiScore ? valueDate : null,
      status: 'POSTED',
    };
  });

  const chunk = 250;
  for (let i = 0; i < data.length; i += chunk) {
    await prisma.posting.createMany({ data: data.slice(i, i + chunk) });
  }
  console.log(`  ✓ ${data.length} postings (replaced)`);
}

async function upsertUser(opts: {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  roleId: string;
  roleUserId: string;
}) {
  await prisma.user.upsert({
    where: { email: opts.email },
    update: {
      name: opts.name,
      password: opts.passwordHash,
      org_id: ORG_ID,
      auth_provider: 'local',
    },
    create: {
      id: opts.id,
      email: opts.email,
      name: opts.name,
      password: opts.passwordHash,
      external_id: opts.email,
      auth_provider: 'local',
      org_id: ORG_ID,
    },
  });
  const user = await prisma.user.findUnique({ where: { email: opts.email } });
  if (!user) throw new Error(`User ${opts.email} missing after upsert`);
  const existing = await prisma.role_user.findFirst({
    where: { user_id: user.id, role_id: opts.roleId },
  });
  if (!existing) {
    await prisma.role_user.create({
      data: {
        id: opts.roleUserId,
        user_id: user.id,
        role_id: opts.roleId,
        org_id: ORG_ID,
      },
    });
  }
}

export async function setupNriDemo() {
  console.log('🏠 Setting up NRI demo — Rajesh Menon (Canadian resident, Indian NRI taxpayer)...');

  const cad = await prisma.currency.findUnique({ where: { code: 'CAD' } });
  const inr = await prisma.currency.findUnique({ where: { code: 'INR' } });
  if (!cad || !inr) {
    throw new Error('CAD/INR currencies missing. Run seed-currencies.sql first.');
  }

  await prisma.org.upsert({
    where: { id: ORG_ID },
    update: {
      name: 'Maple Leaf NRI Holdings',
      slug: 'rajesh-menon-nri',
      settings: JSON.stringify({
        timezone: 'America/Toronto',
        currency: 'CAD',
        tax_story:
          'Canadian tax resident; NRI in India; Indian tax on India-source income only.',
        tax_package_demo: {
          default_year: 2025,
          default_cpa: 'Meera Patel CPA',
          basement_rentable_pct: null,
        },
      }),
      active_subscription: true,
      basecurrency_id: cad.id,
      base_currency: 'CAD',
    },
    create: {
      id: ORG_ID,
      name: 'Maple Leaf NRI Holdings',
      slug: 'rajesh-menon-nri',
      settings: JSON.stringify({
        timezone: 'America/Toronto',
        currency: 'CAD',
        tax_story:
          'Canadian tax resident; NRI in India; Indian tax on India-source income only.',
        tax_package_demo: {
          default_year: 2025,
          default_cpa: 'Meera Patel CPA',
          basement_rentable_pct: null,
        },
      }),
      active_subscription: true,
      basecurrency_id: cad.id,
      base_currency: 'CAD',
    },
  });
  console.log('  ✓ Organization org_rajesh');

  await prisma.entity.upsert({
    where: { id: ENT_CA },
    update: {
      organization_name: 'Rajesh Menon (Canada)',
      legal_name: 'Rajesh Menon — Canada personal',
      name: 'Rajesh Menon (Canada)',
      address: '88 Mill Street',
      city: 'Milton',
      state: 'Ontario',
      country: 'Canada',
      zip_code: 'L9T 1R7',
      is_it_headquartres: 'yes',
      is_it_a_groupcompany: 'No',
      org_id: ORG_ID,
      basecurrency_id: cad.id,
      is_individual: true,
      financial_year_type: 'JAN_DEC',
      tax_treatment: 'canadian_resident',
    },
    create: {
      id: ENT_CA,
      organization_name: 'Rajesh Menon (Canada)',
      legal_name: 'Rajesh Menon — Canada personal',
      name: 'Rajesh Menon (Canada)',
      address: '88 Mill Street',
      city: 'Milton',
      state: 'Ontario',
      country: 'Canada',
      zip_code: 'L9T 1R7',
      is_it_headquartres: 'yes',
      is_it_a_groupcompany: 'No',
      org_id: ORG_ID,
      basecurrency_id: cad.id,
      is_individual: true,
      financial_year_type: 'JAN_DEC',
      tax_treatment: 'canadian_resident',
    },
  });

  await prisma.entity.upsert({
    where: { id: ENT_IN },
    update: {
      organization_name: 'Rajesh Menon (India)',
      legal_name: 'Rajesh Menon — India NRI personal',
      name: 'Rajesh Menon (India)',
      address: '12C Sobha Panampilly',
      city: 'Kochi',
      state: 'Kerala',
      country: 'India',
      zip_code: '682036',
      is_it_headquartres: 'no',
      is_it_a_groupcompany: 'No',
      org_id: ORG_ID,
      basecurrency_id: inr.id,
      is_individual: true,
      financial_year_type: 'APR_MAR',
      tax_treatment: 'nri_india_source',
    },
    create: {
      id: ENT_IN,
      organization_name: 'Rajesh Menon (India)',
      legal_name: 'Rajesh Menon — India NRI personal',
      name: 'Rajesh Menon (India)',
      address: '12C Sobha Panampilly',
      city: 'Kochi',
      state: 'Kerala',
      country: 'India',
      zip_code: '682036',
      is_it_headquartres: 'no',
      is_it_a_groupcompany: 'No',
      org_id: ORG_ID,
      basecurrency_id: inr.id,
      is_individual: true,
      financial_year_type: 'APR_MAR',
      tax_treatment: 'nri_india_source',
    },
  });
  console.log('  ✓ Entities ent_rajesh_canada + ent_rajesh_india');

  const passwordHash = await hash(DEMO_PASSWORD, 10);
  await upsertUser({
    id: USER_RAJESH,
    email: RAJESH_EMAIL,
    name: 'Rajesh Menon',
    passwordHash,
    roleId: SUPER_ADMIN_ROLE,
    roleUserId: 'ru_rajesh_menon_sa',
  });
  await upsertUser({
    id: USER_KAVYA,
    email: KAVYA_EMAIL,
    name: 'Kavya Menon',
    passwordHash,
    roleId: FINANCE_ROLE,
    roleUserId: 'ru_kavya_menon_finance',
  });
  console.log('  ✓ Users rajesh.menon@gmail.com, kavya.menon@gmail.com');

  await setupChartOfAccounts(
    ORG_ID,
    ENT_CA,
    nriCoaPath('chart-of-accounts-canada.json'),
    'CAD',
    prisma
  );
  await setupChartOfAccounts(
    ORG_ID,
    ENT_IN,
    nriCoaPath('chart-of-accounts-india.json'),
    'INR',
    prisma
  );
  console.log('  ✓ Charts of accounts');

  await seedFxRates();
  await seedPostings();

  console.log('');
  console.log('✅ NRI demo ready');
  console.log('   Org: org_rajesh (Maple Leaf NRI Holdings)');
  console.log('   Canada: ent_rajesh_canada  CAD  FY Jan–Dec  2024–2025');
  console.log('   India:  ent_rajesh_india   INR  FY Apr–Mar  2024-25 & 2025-26');
  console.log('   Tax: Canadian resident + Indian NRI (India-source only)');
  console.log('   Login: rajesh.menon@gmail.com / admin123');
  console.log('   Login: kavya.menon@gmail.com / admin123');
  console.log('   Banks: TD Canada Trust Chequing · ICICI NRE · ICICI NRO');
}

if (require.main === module) {
  setupNriDemo()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { ORG_ID, ENT_CA, ENT_IN, RAJESH_EMAIL };
