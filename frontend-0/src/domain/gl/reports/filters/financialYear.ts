export type FinancialYearType = 'JAN_DEC' | 'APR_MAR' | 'JUL_JUN' | 'OCT_SEP';

export type FinancialYearOption = {
  value: string;
  label: string;
  from_date: string;
  to_date: string;
};

export type MonthOption = {
  value: string;
  label: string;
  from_date: string;
  to_date: string;
};

const FY_CONFIG: Record<FinancialYearType, { startMonth: number; crossYear: boolean }> = {
  JAN_DEC: { startMonth: 1, crossYear: false },
  APR_MAR: { startMonth: 4, crossYear: true },
  JUL_JUN: { startMonth: 7, crossYear: true },
  OCT_SEP: { startMonth: 10, crossYear: true },
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function buildMonthOptions(fy: FinancialYearOption): MonthOption[] {
  const months: MonthOption[] = [];
  const [startYear, startMonth] = fy.from_date.split('-').map(Number);
  const [endYear, endMonth] = fy.to_date.split('-').map(Number);
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    const lastDay = lastDayOfMonth(year, month);
    const label = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    months.push({
      value: `${year}-${pad2(month)}`,
      label,
      from_date: `${year}-${pad2(month)}-01`,
      to_date: `${year}-${pad2(month)}-${pad2(lastDay)}`,
    });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

export function buildFYOptions(fyType: FinancialYearType, count = 5): FinancialYearOption[] {
  const { startMonth, crossYear } = FY_CONFIG[fyType];
  const today = new Date();
  const todayMonth = today.getMonth() + 1;
  const todayYear = today.getFullYear();
  const currentFYStartYear = todayMonth >= startMonth ? todayYear : todayYear - 1;

  return Array.from({ length: count }, (_, index) => {
    const startYear = currentFYStartYear - (count - 1 - index);
    const endYear = crossYear ? startYear + 1 : startYear;
    const endMonth = crossYear ? startMonth - 1 : 12;
    const endDay = lastDayOfMonth(endYear, endMonth);
    const from_date = `${startYear}-${pad2(startMonth)}-01`;
    const to_date = `${endYear}-${pad2(endMonth)}-${pad2(endDay)}`;
    const label = crossYear ? `FY ${startYear}-${String(endYear).slice(2)}` : `FY ${startYear}`;
    return { value: from_date, label, from_date, to_date };
  });
}

export function getCurrentFYOption(fyType: FinancialYearType = 'JAN_DEC'): FinancialYearOption {
  const options = buildFYOptions(fyType, 5);
  return options[options.length - 1];
}
