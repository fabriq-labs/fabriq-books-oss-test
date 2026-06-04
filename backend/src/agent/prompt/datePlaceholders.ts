/**
 * Shared prompt date placeholders (app timezone, default IST +330).
 */

export type DatePlaceholderMap = {
  currentDate: string;
  todayStart: string;
  todayEnd: string;
  /** Start of rolling 7-day window (today + previous 6 calendar days) — "recent" / last 7 days */
  last7DaysStart: string;
  /** @deprecated Use last7DaysStart — kept as alias for older prompt text */
  recentFromDate: string;
  /** YYYY-MM-DD start of rolling 7-day window — for matching LLM date filters */
  last7DaysStartDate: string;
  weekStart: string;
  monthStart: string;
  /** First instant of previous calendar month (app TZ) */
  lastMonthStart: string;
  /**
   * First instant of the current month (app TZ). For last-month filters use
   * `lte` this value so `value_date` rows stored at local midnight (e.g. May 31 18:30Z) are included.
   */
  lastMonthEnd: string;
  /** YYYY-MM-DD first day of previous month (app TZ) — prefer for last-month `value_date` filters */
  lastMonthStartDate: string;
  /** YYYY-MM-DD first day of current month — use with `lt` as exclusive end for last month */
  monthStartDate: string;
  /** Calendar Q3 (Jul–Sep) of the previous calendar year — date-only bounds */
  lastYearQ3StartDate: string;
  lastYearQ3EndDate: string;
  /** FY Q3 (Oct–Dec) for Apr–Mar books — preferred for "Q3 of last year" in Indian demo */
  lastYearFyQ3StartDate: string;
  lastYearFyQ3EndDate: string;
};

export function getAppTimezoneOffsetMinutes(): number {
  const raw = process.env.APP_TIMEZONE_OFFSET_MINUTES;
  const parsed = raw ? parseInt(raw, 10) : 330;
  return Number.isNaN(parsed) ? 330 : parsed;
}

export function computeDatePlaceholders(now = new Date()): DatePlaceholderMap {
  const currentDate = now.toISOString();
  const tzOffset = getAppTimezoneOffsetMinutes();
  const localNow = new Date(now.getTime() + tzOffset * 60 * 1000);
  const ly = localNow.getUTCFullYear();
  const lm = localNow.getUTCMonth();
  const ld = localNow.getUTCDate();

  const calendarStart = (y: number, m: number, d: number) => {
    const startUtc = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
    startUtc.setUTCMinutes(startUtc.getUTCMinutes() - tzOffset);
    return startUtc;
  };

  const todayStart = calendarStart(ly, lm, ld);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);
  todayEnd.setUTCMilliseconds(todayEnd.getUTCMilliseconds() - 1);

  const sevenDaysBack = new Date(localNow);
  sevenDaysBack.setUTCDate(sevenDaysBack.getUTCDate() - 6);
  const last7DaysStart = calendarStart(
    sevenDaysBack.getUTCFullYear(),
    sevenDaysBack.getUTCMonth(),
    sevenDaysBack.getUTCDate()
  );

  const dow = localNow.getUTCDay();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const weekBack = new Date(localNow);
  weekBack.setUTCDate(weekBack.getUTCDate() - daysFromMonday);
  const weekStart = calendarStart(
    weekBack.getUTCFullYear(),
    weekBack.getUTCMonth(),
    weekBack.getUTCDate()
  );

  const monthStart = calendarStart(ly, lm, 1);

  const prevMonthIndex = lm === 0 ? 11 : lm - 1;
  const prevMonthYear = lm === 0 ? ly - 1 : ly;
  const lastMonthStart = calendarStart(prevMonthYear, prevMonthIndex, 1);
  const lastMonthEnd = monthStart;

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const lastMonthStartDate = `${prevMonthYear}-${pad2(prevMonthIndex + 1)}-01`;
  const monthStartDate = `${ly}-${pad2(lm + 1)}-01`;

  const lastCalendarYear = ly - 1;
  const lastYearQ3StartDate = `${lastCalendarYear}-07-01`;
  const lastYearQ3EndDate = `${lastCalendarYear}-10-01`;
  const lastYearFyQ3StartDate = `${lastCalendarYear}-10-01`;
  const lastYearFyQ3EndDate = `${ly}-01-01`;

  const last7Iso = last7DaysStart.toISOString();
  const last7DaysStartDate = `${sevenDaysBack.getUTCFullYear()}-${pad2(sevenDaysBack.getUTCMonth() + 1)}-${pad2(sevenDaysBack.getUTCDate())}`;
  return {
    currentDate,
    todayStart: todayStart.toISOString(),
    todayEnd: todayEnd.toISOString(),
    last7DaysStart: last7Iso,
    recentFromDate: last7Iso,
    last7DaysStartDate,
    weekStart: weekStart.toISOString(),
    monthStart: monthStart.toISOString(),
    lastMonthStart: lastMonthStart.toISOString(),
    lastMonthEnd: lastMonthEnd.toISOString(),
    lastMonthStartDate,
    monthStartDate,
    lastYearQ3StartDate,
    lastYearQ3EndDate,
    lastYearFyQ3StartDate,
    lastYearFyQ3EndDate,
  };
}

export function applyDatePlaceholders(template: string, placeholders: DatePlaceholderMap): string {
  let out = template;
  for (const [key, value] of Object.entries(placeholders)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return out;
}
