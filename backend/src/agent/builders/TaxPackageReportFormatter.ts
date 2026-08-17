import { PlanStep } from '../tools/sessionTools';
import { ReportFormatter } from './ReportFormatterRegistry';
import { TAX_PACKAGE_TEMPLATE_ID } from '../taxPackage/constants';
import type { GapItem, MoneyLine, TaxPackageWorkpapers } from '../taxPackage/types';

function money(n: number, ccy: string = 'CAD'): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}${ccy} ${Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function sum(lines?: MoneyLine[]): number {
  return (lines || []).reduce((s, l) => s + Number(l.amount_cad || 0), 0);
}

function bullet(lines: MoneyLine[]): string[] {
  if (!lines?.length) return ['- None in ledger for this year'];
  return lines.map((l) => `- **${l.label}**: ${money(l.amount_cad)}${l.currency === 'INR' ? ` (INR ${l.amount_orig.toLocaleString('en-IN')})` : ''}${l.notes ? ` — ${l.notes}` : ''}`);
}

export function formatTaxPackageCoverLetter(ctx: Record<string, any>): string {
  const year = ctx.tax_year || '—';
  const recipient = ctx.recipient || 'CPA';
  const wp = (ctx.workpapers || {}) as TaxPackageWorkpapers;
  const gaps = (ctx.gaps || []) as GapItem[];
  const warnings = (ctx.warnings || []) as string[];
  const ca = wp.canada || ({} as TaxPackageWorkpapers['canada']);
  const fr = wp.foreign;

  const lines: string[] = [
    `# Canadian T1 organizer — TY ${year}`,
    '',
    `**To:** ${recipient}`,
    `**From:** Fabriq Books (Rajesh Menon personal books)`,
    `**Period:** ${ctx.from_date || `${year}-01-01`} → ${ctx.to_date || `${year}-12-31`} (calendar year, worldwide)`,
    `**FX:** ${wp.fx_method || 'Monthly AVERAGE INR→CAD'}`,
    '',
    'This is an organizer, not a filed T1. Fabriq has not computed federal or Ontario tax and has not applied the Canada–India DTAA.',
    '',
    '## Canada-source',
    ...bullet(ca.t4_net_salary),
    ...bullet(ca.t4_bonus),
    ...bullet(ca.t776_rent),
    ...bullet(ca.t776_expenses),
    ...bullet(ca.t2125_studio),
    ...bullet(ca.hst_remitted),
    ...bullet(ca.interest_td),
    ...bullet(ca.rrsp),
    `- TFSA ${money(sum(ca.tfsa))} — **not T1 income**`,
    `- CRA instalments ${money(sum(ca.cra_instalments))} — credit, not an expense`,
    '',
    '## Foreign income (India recut to the Canadian calendar year)',
  ];

  if (!fr) {
    lines.push('- Not included in this run.');
  } else {
    lines.push(
      ...bullet(fr.rent_gross),
      ...bullet(fr.rent_expenses),
      ...bullet(fr.nro_interest),
      ...bullet(fr.nre_interest),
      ...bullet(fr.dividends),
      ...bullet(fr.capital_gains),
      ...bullet(fr.tax_paid_cy),
      '',
      `**T1135:** ${wp.t1135_note || ''}`,
    );
  }

  if (warnings.length) {
    lines.push('', '## Warnings', ...warnings.map((w) => `- ${w}`));
  }

  lines.push('', '## Exclusions (do not put on the T1 as income)', ...bullet(wp.exclusions));

  const required = gaps.filter((g) => g.severity === 'required');
  const optional = gaps.filter((g) => g.severity !== 'required');
  lines.push('', '## Required / missing');
  if (!required.length) lines.push('- None flagged');
  for (const g of required) {
    lines.push(`- **${g.title}** (${g.status}): ${g.detail}`);
  }
  if (optional.length) {
    lines.push('', '## Optional');
    for (const g of optional) {
      lines.push(`- **${g.title}** (${g.status}): ${g.detail}`);
    }
  }

  lines.push(
    '',
    '## Package index',
    '1. This cover letter',
    '2. Excel organizer (Summary, T4, T776, T2125, Foreign, FTC, T1135, Exclusions, Gaps)',
    '3. Download from the completed Workbench session after you approve the package',
    '',
    `Unmatched lines remaining at assemble: **${ctx.unmatched_count ?? 0}**.`,
  );

  return lines.join('\n');
}

export const TaxPackageReportFormatter: ReportFormatter = {
  matches(_goalModel, step: PlanStep, session?: any): boolean {
    if (step.type !== 'report') return false;
    return session?.template_id === TAX_PACKAGE_TEMPLATE_ID
      || session?.accumulated_context?.tax_package_kind === 'ca_t1';
  },
  format(ctx: Record<string, any>): string {
    return formatTaxPackageCoverLetter(ctx);
  },
};
