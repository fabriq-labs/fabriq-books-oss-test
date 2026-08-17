/**
 * Deterministic T1 organizer numbers from the NRI (or any) ledger.
 * Calendar year on both entities. India amounts converted with monthly AVERAGE INR→CAD.
 */
import prisma from '../../lib/prisma';
import { NRI_ENT_CA, NRI_ENT_IN, TAX_PACKAGE_KIND } from './constants';
import { calendarBounds } from './parseGoal';
import type {
  GapItem,
  MoneyLine,
  TaxPackageIntake,
  TaxPackageResult,
  TaxPackageWorkpapers,
  UnmatchedLine,
} from './types';

type PostingRow = {
  id: string;
  description: string | null;
  notes: string | null;
  amount: unknown;
  value_date: Date | null;
  legal_entity_id: string | null;
  reconciliation_status: string | null;
  posting_type: string | null;
  ai_categorized_at: Date | null;
  account_id: string | null;
  credit_account_id: string | null;
  debit_code: string | null;
  debit_name: string | null;
  debit_class: string | null;
  credit_code: string | null;
  credit_name: string | null;
  credit_class: string | null;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isoDate(d: Date | null): string {
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

function ym(d: Date | null): string {
  if (!d) return '';
  return d.toISOString().slice(0, 7);
}

async function loadPostings(orgId: string, from: string, to: string): Promise<PostingRow[]> {
  return prisma.$queryRaw<PostingRow[]>`
    SELECT
      p.id,
      p.description,
      p.notes,
      p.amount,
      p.value_date,
      p.legal_entity_id,
      p.reconciliation_status,
      p.posting_type,
      p.ai_categorized_at,
      p.account_id,
      p.credit_account_id,
      da.code AS debit_code,
      da.name AS debit_name,
      da.classification::text AS debit_class,
      ca.code AS credit_code,
      ca.name AS credit_name,
      ca.classification::text AS credit_class
    FROM posting p
    LEFT JOIN account da ON da.id = p.account_id
    LEFT JOIN account ca ON ca.id = p.credit_account_id
    WHERE p.org_id = ${orgId}
      AND p.value_date >= ${from}::date
      AND p.value_date <= ${to}::date
      AND COALESCE(p.posting_type, '') <> 'OPENING_BALANCE'
    ORDER BY p.value_date ASC, p.id ASC
  `;
}

async function loadFxMap(orgId: string): Promise<Map<string, number>> {
  const rows = await prisma.exchange_rate.findMany({
    where: {
      org_id: orgId,
      from_currency_id: 'curr_inr',
      to_currency_id: 'curr_cad',
      rate_type: 'AVERAGE',
    },
    select: { effective_date: true, rate: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(isoDate(r.effective_date).slice(0, 7), num(r.rate));
  }
  return map;
}

function inrToCad(amountInr: number, date: Date | null, fx: Map<string, number>): number {
  const key = ym(date);
  const rate = fx.get(key) ?? [...fx.values()].slice(-1)[0] ?? 0.016;
  return round2(amountInr * rate);
}

function line(
  label: string,
  entity: 'canada' | 'india',
  currency: 'CAD' | 'INR',
  amountOrig: number,
  amountCad: number,
  extra?: Partial<MoneyLine>
): MoneyLine {
  return {
    label,
    entity,
    currency,
    amount_orig: round2(amountOrig),
    amount_cad: round2(amountCad),
    ...extra,
  };
}

function sumCad(lines: MoneyLine[]): number {
  return round2(lines.reduce((s, l) => s + l.amount_cad, 0));
}

function suggestContra(row: PostingRow, canada: boolean): Pick<
  UnmatchedLine,
  'predicted_account_id' | 'predicted_account_name' | 'confidence' | 'reason'
> {
  const desc = `${row.description || ''} ${row.notes || ''}`.toLowerCase();
  if (canada && /home depot|basement|paint|kijiji|rental repair/.test(desc)) {
    return {
      predicted_account_id: null,
      predicted_account_name: 'Basement rental expenses (T776)',
      confidence: 'medium',
      reason: 'Looks like a T776 repair; confirm vs personal.',
    };
  }
  if (canada && /interac|unlabelled|unknown/.test(desc)) {
    return {
      predicted_account_id: null,
      predicted_account_name: 'Owner draws',
      confidence: 'low',
      reason: 'Unlabelled outflow — confirm personal / draw before the T1 pack.',
    };
  }
  if (!canada && /swiggy|instamart|imps unknown/.test(desc)) {
    return {
      predicted_account_id: null,
      predicted_account_name: 'Miscellaneous — India',
      confidence: 'medium',
      reason: 'Personal India spend; exclude from foreign rental.',
    };
  }
  return {
    predicted_account_id: null,
    predicted_account_name: row.debit_name || 'Uncategorised',
    confidence: 'low',
    reason: 'Unmatched bank line — needs a human category before the package is sent.',
  };
}

async function resolvePredictedIds(
  orgId: string,
  entityId: string,
  nameHint: string | null
): Promise<{ id: string | null; name: string | null }> {
  if (!nameHint) return { id: null, name: null };
  const acct = await prisma.account.findFirst({
    where: {
      org_id: orgId,
      legal_entity_id: entityId,
      name: { equals: nameHint, mode: 'insensitive' },
    },
    select: { id: true, name: true },
  });
  if (acct) return { id: acct.id, name: acct.name };
  const fuzzy = await prisma.account.findFirst({
    where: {
      org_id: orgId,
      legal_entity_id: entityId,
      name: { contains: nameHint.split('(')[0].trim(), mode: 'insensitive' },
    },
    select: { id: true, name: true },
  });
  return fuzzy ? { id: fuzzy.id, name: fuzzy.name } : { id: null, name: nameHint };
}

export async function scanUnmatched(
  orgId: string,
  from: string,
  to: string,
  canadaId: string | null,
  indiaId: string | null
): Promise<UnmatchedLine[]> {
  const rows = await loadPostings(orgId, from, to);
  const out: UnmatchedLine[] = [];
  for (const row of rows) {
    if (String(row.reconciliation_status || '').toUpperCase() !== 'UNMATCHED') continue;
    if (row.ai_categorized_at) continue;
    const canada = row.legal_entity_id === canadaId;
    const entity: 'canada' | 'india' = canada ? 'canada' : 'india';
    const hint = suggestContra(row, canada);
    const resolved = await resolvePredictedIds(
      orgId,
      row.legal_entity_id || '',
      hint.predicted_account_name
    );
    const expenseSide = String(row.debit_class || '').toLowerCase() === 'expense'
      || String(row.debit_class || '').toLowerCase() === 'equity';
    out.push({
      posting_id: row.id,
      description: row.description || '(no description)',
      amount: round2(num(row.amount)),
      value_date: isoDate(row.value_date),
      entity,
      currency: canada ? 'CAD' : 'INR',
      current_account_id: expenseSide ? row.account_id : row.credit_account_id,
      current_account_name: expenseSide ? row.debit_name : row.credit_name,
      predicted_account_id: resolved.id,
      predicted_account_name: resolved.name || hint.predicted_account_name,
      confidence: hint.confidence,
      reason: hint.reason,
    });
  }
  return out;
}

function collectByCreditCode(
  rows: PostingRow[],
  entityId: string,
  code: string,
  fx: Map<string, number>,
  entity: 'canada' | 'india',
  label: string
): MoneyLine[] {
  const canada = entity === 'canada';
  const lines: MoneyLine[] = [];
  for (const row of rows) {
    if (row.legal_entity_id !== entityId) continue;
    if (row.credit_code !== code) continue;
    const orig = num(row.amount);
    const cad = canada ? orig : inrToCad(orig, row.value_date, fx);
    lines.push(line(
      `${label}: ${row.description || code}`,
      entity,
      canada ? 'CAD' : 'INR',
      orig,
      cad,
      { account_code: code, notes: row.notes || undefined }
    ));
  }
  return lines;
}

function collectByDebitCode(
  rows: PostingRow[],
  entityId: string,
  code: string,
  fx: Map<string, number>,
  entity: 'canada' | 'india',
  label: string
): MoneyLine[] {
  const canada = entity === 'canada';
  const lines: MoneyLine[] = [];
  for (const row of rows) {
    if (row.legal_entity_id !== entityId) continue;
    if (row.debit_code !== code) continue;
    const orig = num(row.amount);
    const cad = canada ? orig : inrToCad(orig, row.value_date, fx);
    lines.push(line(
      `${label}: ${row.description || code}`,
      entity,
      canada ? 'CAD' : 'INR',
      orig,
      cad,
      { account_code: code, notes: row.notes || undefined }
    ));
  }
  return lines;
}

function rollup(lines: MoneyLine[], label: string, entity: 'canada' | 'india', currency: 'CAD' | 'INR', code?: string): MoneyLine[] {
  if (lines.length === 0) return [];
  const orig = round2(lines.reduce((s, l) => s + l.amount_orig, 0));
  const cad = sumCad(lines);
  return [line(label, entity, currency, orig, cad, { account_code: code, notes: `${lines.length} posting(s)` })];
}

function buildGaps(
  intake: TaxPackageIntake,
  unmatched: UnmatchedLine[],
  wp: TaxPackageWorkpapers
): GapItem[] {
  const gaps: GapItem[] = [
    {
      id: 't4_slip',
      status: 'missing',
      severity: 'required',
      title: 'Shopify T4 slip',
      detail: 'Books have net pay only. Attach the T4 for gross, CPP, EI, and tax withheld.',
    },
    {
      id: 't776_pct',
      status: intake.basement_rentable_pct == null ? 'missing' : 'in_ledger',
      severity: 'required',
      title: 'T776 rentable-area percentage',
      detail: intake.basement_rentable_pct == null
        ? 'Whole-house mortgage interest, property tax, utilities, and insurance are in the ledger. Enter the basement share or leave as missing for the CPA.'
        : `Using ${intake.basement_rentable_pct}% of occupancy costs on the T776 draft.`,
    },
    {
      id: 'rrsp_receipt',
      status: wp.canada.rrsp.length ? 'missing' : 'optional',
      severity: wp.canada.rrsp.length ? 'required' : 'optional',
      title: 'RRSP contribution receipt',
      detail: 'Ledger has the cash contribution; official receipt / room still required.',
    },
    {
      id: 'hst_return',
      status: 'missing',
      severity: 'optional',
      title: 'GST/HST return (violin studio)',
      detail: 'HST remitted is in the books; collected vs ITC is not.',
    },
  ];
  if (intake.include_foreign) {
    gaps.push(
      {
        id: 'form_16a',
        status: 'missing',
        severity: 'required',
        title: 'Form 16A / 26AS (Kochi rent TDS)',
        detail: 'FTC draft uses ledger TDS and advance tax. Attach slips for Meera Patel.',
      },
      {
        id: 'acb_nippon',
        status: wp.foreign && wp.foreign.capital_gains.length ? 'missing' : 'optional',
        severity: 'required',
        title: 'Canadian ACB for Indian capital gains',
        detail: 'India LTCG is in the books; Schedule 3 needs CAD ACB and acquisition date.',
      },
      {
        id: 't1135',
        status: 'missing',
        severity: 'required',
        title: 'T1135 specified foreign property',
        detail: wp.t1135_note,
      }
    );
  }
  if (unmatched.length) {
    gaps.push({
      id: 'unmatched',
      status: 'missing',
      severity: 'required',
      title: `${unmatched.length} unmatched bank line(s)`,
      detail: 'Do not send the package until these are categorised or waived as personal.',
    });
  }
  return gaps;
}

export async function assembleTaxPackage(
  orgId: string,
  intake: TaxPackageIntake
): Promise<TaxPackageResult> {
  if (!intake.tax_year) {
    throw new Error('tax_year is required');
  }
  const { from_date, to_date } = calendarBounds(intake.tax_year);

  const entities = await prisma.entity.findMany({
    where: { org_id: orgId },
    select: { id: true, name: true, country: true, tax_treatment: true, financial_year_type: true },
  });
  const canada = entities.find((e) => e.id === NRI_ENT_CA)
    || entities.find((e) => /canada/i.test(`${e.name} ${e.country} ${e.tax_treatment}`));
  const india = entities.find((e) => e.id === NRI_ENT_IN)
    || entities.find((e) => /india|nri/i.test(`${e.name} ${e.country} ${e.tax_treatment}`));

  const canadaId = canada?.id || null;
  const indiaId = india?.id || null;
  const [rows, fx] = await Promise.all([
    loadPostings(orgId, from_date, to_date),
    loadFxMap(orgId),
  ]);
  const unmatched = await scanUnmatched(orgId, from_date, to_date, canadaId, indiaId);

  const warnings: string[] = [];
  if (!canadaId) warnings.push('No Canada legal entity found — Canada-source schedules will be empty.');
  if (intake.include_foreign && !indiaId) warnings.push('No India legal entity found — foreign income will be empty.');

  let workpapers: TaxPackageWorkpapers | null = null;
  if (canadaId) {
    const t4Salary = rollup(collectByCreditCode(rows, canadaId, '4100', fx, 'canada', 'T4 net salary'), 'T4 net salary (Shopify)', 'canada', 'CAD', '4100');
    const t4Bonus = rollup(collectByCreditCode(rows, canadaId, '4110', fx, 'canada', 'T4 bonus'), 'T4 bonus (Shopify)', 'canada', 'CAD', '4110');
    const t776Rent = rollup(collectByCreditCode(rows, canadaId, '4200', fx, 'canada', 'T776 rent'), 'T776 basement rent', 'canada', 'CAD', '4200');
    const t776Direct = rollup(collectByDebitCode(rows, canadaId, '5220', fx, 'canada', 'T776 expense'), 'T776 direct rental expenses', 'canada', 'CAD', '5220');
    const occupancy: MoneyLine[] = [];
    if (intake.basement_rentable_pct != null) {
      const pct = intake.basement_rentable_pct / 100;
      for (const [code, label] of [
        ['5100', 'Mortgage interest'],
        ['5110', 'Property tax'],
        ['5120', 'Utilities'],
        ['5700', 'Insurance'],
      ] as const) {
        const full = rollup(collectByDebitCode(rows, canadaId, code, fx, 'canada', label), label, 'canada', 'CAD', code);
        for (const l of full) {
          occupancy.push(line(
            `${label} × ${intake.basement_rentable_pct}% (T776)`,
            'canada',
            'CAD',
            round2(l.amount_orig * pct),
            round2(l.amount_cad * pct),
            { account_code: code, notes: `Allocated from whole-house ${l.amount_cad} CAD` }
          ));
        }
      }
    }
    const studio = rollup(collectByCreditCode(rows, canadaId, '4300', fx, 'canada', 'T2125'), 'T2125 violin studio', 'canada', 'CAD', '4300');
    const hst = rollup(collectByDebitCode(rows, canadaId, '5410', fx, 'canada', 'HST remitted'), 'HST remitted', 'canada', 'CAD', '5410');
    const interest = rollup(collectByCreditCode(rows, canadaId, '4400', fx, 'canada', 'TD interest'), 'TD HISA interest (estimate until T5)', 'canada', 'CAD', '4400');
    const rrsp = rollup(collectByDebitCode(rows, canadaId, '1220', fx, 'canada', 'RRSP'), 'RRSP contributions', 'canada', 'CAD', '1220');
    const tfsa = rollup(collectByDebitCode(rows, canadaId, '1210', fx, 'canada', 'TFSA'), 'TFSA contributions (not T1 income)', 'canada', 'CAD', '1210');
    const instalments = rollup(collectByDebitCode(rows, canadaId, '5400', fx, 'canada', 'CRA instalment'), 'CRA instalments', 'canada', 'CAD', '5400');

    const exclusions: MoneyLine[] = [
      ...rollup(collectByDebitCode(rows, canadaId, '3200', fx, 'canada', 'NRE remittance'), 'Wise CAD→INR remittance (equity, not income)', 'canada', 'CAD', '3200'),
      ...tfsa,
      ...rollup(collectByDebitCode(rows, canadaId, '2210', fx, 'canada', 'Mortgage principal'), 'TD mortgage principal (not deductible)', 'canada', 'CAD', '2210'),
      ...rollup(collectByDebitCode(rows, canadaId, '5200', fx, 'canada', 'Groceries'), 'Groceries (personal)', 'canada', 'CAD', '5200'),
      ...rollup(collectByDebitCode(rows, canadaId, '5210', fx, 'canada', 'Dining'), 'Dining (personal)', 'canada', 'CAD', '5210'),
      ...rollup(collectByDebitCode(rows, canadaId, '5800', fx, 'canada', 'Gym'), 'Gym (personal)', 'canada', 'CAD', '5800'),
      ...rollup(collectByDebitCode(rows, canadaId, '5600', fx, 'canada', 'Travel'), 'India trip airfare (personal)', 'canada', 'CAD', '5600'),
    ];

    let foreign: TaxPackageWorkpapers['foreign'] = null;
    if (intake.include_foreign && indiaId) {
      const rentGross = rollup(collectByCreditCode(rows, indiaId, '4100', fx, 'india', 'Kochi rent'), 'Kochi rent GROSS (net + TDS)', 'india', 'INR', '4100');
      const rentExp = [
        ...rollup(collectByDebitCode(rows, indiaId, '5100', fx, 'india', 'Society'), 'Society maintenance', 'india', 'INR', '5100'),
        ...rollup(collectByDebitCode(rows, indiaId, '5110', fx, 'india', 'Property tax'), 'Kochi property tax (cash in CY)', 'india', 'INR', '5110'),
        ...rollup(collectByDebitCode(rows, indiaId, '5120', fx, 'india', 'Repairs'), 'Owner repairs / KSEB', 'india', 'INR', '5120'),
        ...rollup(collectByDebitCode(rows, indiaId, '5130', fx, 'india', 'Home loan interest'), 'ICICI home-loan INTEREST (not principal)', 'india', 'INR', '5130'),
      ];
      const nro = rollup(collectByCreditCode(rows, indiaId, '4200', fx, 'india', 'NRO interest'), 'NRO interest (taxable both countries)', 'india', 'INR', '4200');
      const nre = rollup(collectByCreditCode(rows, indiaId, '4210', fx, 'india', 'NRE interest'), 'NRE interest — EXEMPT in India, TAXABLE in Canada', 'india', 'INR', '4210');
      const div = rollup(collectByCreditCode(rows, indiaId, '4300', fx, 'india', 'Dividends'), 'Indian dividends', 'india', 'INR', '4300');
      const gains = rollup(collectByCreditCode(rows, indiaId, '4400', fx, 'india', 'LTCG'), 'India LTCG (ACB missing for Schedule 3)', 'india', 'INR', '4400');

      const tds = collectByDebitCode(rows, indiaId, '1620', fx, 'india', 'TDS');
      const advance = collectByDebitCode(rows, indiaId, '5400', fx, 'india', 'Advance tax')
        .filter((l) => !/form 16a tds credit/i.test(l.label));
      const taxPaid = [
        ...rollup(tds, 'TDS on Kochi rent (u/s 195)', 'india', 'INR', '1620'),
        ...rollup(advance, 'India advance tax paid in calendar year', 'india', 'INR', '5400'),
      ];

      exclusions.push(
        ...rollup(collectByCreditCode(rows, indiaId, '3200', fx, 'india', 'NRE inflow'), 'NRE remittance inflow (capital, not Indian income)', 'india', 'INR', '3200'),
        ...rollup(collectByDebitCode(rows, indiaId, '2210', fx, 'india', 'Home loan principal'), 'ICICI home-loan principal (not deductible)', 'india', 'INR', '2210'),
        ...rollup(collectByDebitCode(rows, indiaId, '5200', fx, 'india', 'Parents'), 'UPI to parents (personal, not rental)', 'india', 'INR', '5200'),
        ...rollup(collectByDebitCode(rows, indiaId, '5600', fx, 'india', 'India visit'), 'India visit expenses (personal)', 'india', 'INR', '5600'),
      );

      foreign = {
        rent_gross: rentGross,
        rent_expenses: rentExp,
        nro_interest: nro,
        nre_interest: nre,
        dividends: div,
        capital_gains: gains,
        tax_paid_cy: taxPaid,
      };
      if (sumCad(nre) > 0) {
        warnings.push('NRE interest is taxable on the Canadian T1 even though it is exempt on the NRI ITR.');
      }
    }

    workpapers = {
      canada: {
        t4_net_salary: t4Salary,
        t4_bonus: t4Bonus,
        t776_rent: t776Rent,
        t776_expenses: [...t776Direct, ...occupancy],
        t2125_studio: studio,
        hst_remitted: hst,
        interest_td: interest,
        rrsp,
        tfsa,
        cra_instalments: instalments,
      },
      foreign,
      exclusions,
      t1135_note:
        'Specified foreign property (NRE/NRO, Indian equities/MF, Kochi flat, gold) is over the CAD 100k cost threshold. Cost rollforward is incomplete without year-end ACB — flag T1135 as required.',
      fx_method: 'Monthly AVERAGE INR→CAD from org exchange_rate (seeded). Capital gains may later need transaction-date spot.',
    };
  }

  const gaps = workpapers ? buildGaps(intake, unmatched, workpapers) : [];

  return {
    tax_package_kind: TAX_PACKAGE_KIND,
    phase: 'assemble',
    tax_year: intake.tax_year,
    recipient: intake.recipient,
    include_foreign: intake.include_foreign,
    basement_rentable_pct: intake.basement_rentable_pct,
    canada_entity_id: canadaId,
    india_entity_id: indiaId,
    from_date,
    to_date,
    unmatched_postings: unmatched,
    unmatched_count: unmatched.length,
    workpapers,
    gaps,
    warnings,
  };
}

export async function scanTaxPackage(
  orgId: string,
  intake: TaxPackageIntake
): Promise<TaxPackageResult> {
  const assembled = await assembleTaxPackage(orgId, intake);
  return {
    ...assembled,
    phase: 'scan',
    workpapers: null,
    gaps: assembled.gaps.filter((g) => g.id === 'unmatched' || g.id === 't776_pct'),
  };
}
