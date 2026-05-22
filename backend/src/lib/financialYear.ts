/**
 * Financial year helpers (mirrors frontend FinancialYearSelector.tsx).
 */

export type FinancialYearType = 'JAN_DEC' | 'APR_MAR' | 'JUL_JUN' | 'OCT_SEP';

export interface FinancialYearPeriod {
  from_date: string;
  to_date: string;
  label: string;
}

const FY_CONFIG: Record<FinancialYearType, { startMonth: number; crossYear: boolean }> = {
  JAN_DEC: { startMonth: 1, crossYear: false },
  APR_MAR: { startMonth: 4, crossYear: true },
  JUL_JUN: { startMonth: 7, crossYear: true },
  OCT_SEP: { startMonth: 10, crossYear: true },
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function normalizeFinancialYearType(
  value: string | null | undefined
): FinancialYearType {
  if (value === 'APR_MAR' || value === 'JUL_JUN' || value === 'OCT_SEP') {
    return value;
  }
  return 'JAN_DEC';
}

/** Full current FY bounds (calendar FY end, not capped to today). */
export function getCurrentFYBounds(fyType: FinancialYearType, asOf: Date = new Date()): FinancialYearPeriod {
  const { startMonth, crossYear } = FY_CONFIG[fyType];
  const todayMonth = asOf.getMonth() + 1;
  const todayYear = asOf.getFullYear();
  const startYear = todayMonth >= startMonth ? todayYear : todayYear - 1;
  const endYear = crossYear ? startYear + 1 : startYear;
  const endMonth = crossYear ? startMonth - 1 : 12;
  const endDay = lastDayOfMonth(endYear, endMonth);

  const from_date = `${startYear}-${pad2(startMonth)}-01`;
  const to_date = `${endYear}-${pad2(endMonth)}-${pad2(endDay)}`;
  const label = crossYear
    ? `FY ${startYear}-${String(endYear).slice(2)}`
    : `FY ${startYear}`;

  return { from_date, to_date, label };
}

/**
 * Current in-progress FY for reporting: FY start through min(FY end, today).
 */
export function getCurrentFYPeriod(
  fyType: FinancialYearType,
  asOf: Date = new Date()
): FinancialYearPeriod {
  const bounds = getCurrentFYBounds(fyType, asOf);
  const today = formatDate(asOf);
  const to_date = bounds.to_date < today ? bounds.to_date : today;
  return { from_date: bounds.from_date, to_date, label: bounds.label };
}
