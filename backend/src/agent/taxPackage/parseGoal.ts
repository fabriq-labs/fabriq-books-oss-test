import type { TaxPackageIntake } from './types';

const YEAR_RE = /\b(20\d{2})\b/;

export function parseTaxPackageGoal(
  goal: string,
  defaults?: Partial<TaxPackageIntake>
): Partial<TaxPackageIntake> {
  const text = goal || '';
  const yearMatch = text.match(YEAR_RE);
  const tax_year = yearMatch ? Number(yearMatch[1]) : defaults?.tax_year;

  let recipient = defaults?.recipient;
  const toMatch = text.match(/\b(?:for|to)\s+([^.,\n]+?)(?:\.|$)/i);
  if (/\bCPA\b/i.test(text) && toMatch) {
    recipient = toMatch[1].replace(/\s+TY\s+\d{4}.*$/i, '').trim();
  }
  const named = text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+CPA)/);
  if (named) recipient = named[1].trim();

  const pctMatch = text.match(/basement[^\d]{0,40}(\d{1,2}(?:\.\d+)?)\s*%/i)
    || text.match(/(\d{1,2}(?:\.\d+)?)\s*%[^\n]{0,40}basement/i);
  const basement_rentable_pct = pctMatch
    ? Number(pctMatch[1])
    : defaults?.basement_rentable_pct ?? null;

  let include_foreign = defaults?.include_foreign ?? true;
  if (/\bcanada[-\s]?only\b|\bexclude india\b|\bno foreign\b/i.test(text)) {
    include_foreign = false;
  }
  if (/\binclude india\b|\bforeign income\b|\bworldwide\b/i.test(text)) {
    include_foreign = true;
  }

  return {
    tax_year,
    recipient: recipient || defaults?.recipient || 'Meera Patel CPA',
    include_foreign,
    basement_rentable_pct: basement_rentable_pct ?? null,
  };
}

export function calendarBounds(taxYear: number): { from_date: string; to_date: string } {
  return {
    from_date: `${taxYear}-01-01`,
    to_date: `${taxYear}-12-31`,
  };
}
