import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type FinancialYearType = "JAN_DEC" | "APR_MAR" | "JUL_JUN" | "OCT_SEP";

export interface FinancialYearOption {
  value: string;
  label: string;
  from_date: string;
  to_date: string;
}

const FY_CONFIG: Record<FinancialYearType, { startMonth: number; crossYear: boolean }> = {
  JAN_DEC: { startMonth: 1,  crossYear: false },
  APR_MAR: { startMonth: 4,  crossYear: true  },
  JUL_JUN: { startMonth: 7,  crossYear: true  },
  OCT_SEP: { startMonth: 10, crossYear: true  },
};

function pad2(n: number) { return String(n).padStart(2, "0"); }

function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export interface MonthOption {
  value: string;
  label: string;
  from_date: string;
  to_date: string;
}

export function buildMonthOptions(fy: FinancialYearOption): MonthOption[] {
  const months: MonthOption[] = [];
  const [startYear, startMonth] = fy.from_date.split("-").map(Number);
  const [endYear, endMonth] = fy.to_date.split("-").map(Number);
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    const lastDay = lastDayOfMonth(year, month);
    const label = new Date(year, month - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
    months.push({
      value: `${year}-${pad2(month)}`,
      label,
      from_date: `${year}-${pad2(month)}-01`,
      to_date: `${year}-${pad2(month)}-${pad2(lastDay)}`,
    });
    month++;
    if (month > 12) { month = 1; year++; }
  }
  return months;
}

export function buildFYOptions(fyType: FinancialYearType, count = 5): FinancialYearOption[] {
  const { startMonth, crossYear } = FY_CONFIG[fyType];
  const today = new Date();
  const todayMonth = today.getMonth() + 1;
  const todayYear = today.getFullYear();

  const currentFYStartYear = todayMonth >= startMonth ? todayYear : todayYear - 1;

  return Array.from({ length: count }, (_, i) => {
    const startYear = currentFYStartYear - (count - 1 - i);
    const endYear = crossYear ? startYear + 1 : startYear;
    const endMonth = crossYear ? startMonth - 1 : 12;
    const endDay = lastDayOfMonth(endYear, endMonth);

    const from_date = `${startYear}-${pad2(startMonth)}-01`;
    const to_date = `${endYear}-${pad2(endMonth)}-${pad2(endDay)}`;

    const label = crossYear
      ? `FY ${startYear}-${String(endYear).slice(2)}`
      : `FY ${startYear}`;

    return { value: from_date, label, from_date, to_date };
  });
}

export function getPreviousFYOption(fyType: FinancialYearType): FinancialYearOption {
  const options = buildFYOptions(fyType, 5);
  // second-to-last is previous FY (last is current)
  return options[options.length - 2];
}

/** Current in-progress financial year (last entry from buildFYOptions). */
export function getCurrentFYOption(fyType: FinancialYearType): FinancialYearOption {
  const options = buildFYOptions(fyType, 5);
  return options[options.length - 1];
}

interface FinancialYearSelectorProps {
  fyType?: FinancialYearType | null;
  value: string;
  onChange: (option: FinancialYearOption) => void;
  className?: string;
}

export function FinancialYearSelector({ fyType, value, onChange, className }: FinancialYearSelectorProps) {
  const resolvedType: FinancialYearType = fyType ?? "JAN_DEC";
  const options = useMemo(() => buildFYOptions(resolvedType, 5), [resolvedType]);

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const opt = options.find((o) => o.value === v);
        if (opt) onChange(opt);
      }}
    >
      <SelectTrigger className={className ?? "w-[160px] h-9 border-slate-300 text-sm"}>
        <SelectValue placeholder="Select FY" />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
