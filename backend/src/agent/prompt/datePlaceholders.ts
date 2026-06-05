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
  /** Monday 00:00 of the previous calendar week (app TZ) — start of "last week" */
  lastWeekStart: string;
  /** Last instant of the previous calendar week (app TZ) — same as weekStart − 1ms */
  lastWeekEnd: string;
  /** YYYY-MM-DD Monday of previous calendar week (app TZ) */
  lastWeekStartDate: string;
  monthStart: string;
  /** First instant of the next calendar month (app TZ) — exclusive end for "this month" filters */
  nextMonthStart: string;
  /** Last instant of the current calendar month (app TZ) — use with `lte` if preferred over `lt nextMonthStart` */
  monthEnd: string;
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
  /** Calendar Q3 (Jul–Sep) of the previous calendar year — date-only bounds (legacy LLM output) */
  lastYearQ3StartDate: string;
  lastYearQ3EndDate: string;
  /** FY Q3 (Oct–Dec) for Apr–Mar books — date-only bounds (legacy LLM output) */
  lastYearFyQ3StartDate: string;
  lastYearFyQ3EndDate: string;
  /** Calendar Q3 (Jul–Sep) — ISO instants for searchRecords value_date filters */
  lastYearQ3Start: string;
  lastYearQ3End: string;
  /** FY Q3 (Oct–Dec) — ISO instants; prefer for "Q3 of last year" */
  lastYearFyQ3Start: string;
  lastYearFyQ3End: string;
  /** Prior calendar day (app TZ) — for "yesterday" posting filters */
  yesterdayStart: string;
  yesterdayEnd: string;
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

  const yesterdayBack = new Date(localNow);
  yesterdayBack.setUTCDate(yesterdayBack.getUTCDate() - 1);
  const yesterdayStart = calendarStart(
    yesterdayBack.getUTCFullYear(),
    yesterdayBack.getUTCMonth(),
    yesterdayBack.getUTCDate()
  );
  const yesterdayEnd = new Date(yesterdayStart);
  yesterdayEnd.setUTCDate(yesterdayEnd.getUTCDate() + 1);
  yesterdayEnd.setUTCMilliseconds(yesterdayEnd.getUTCMilliseconds() - 1);

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

  const lastWeekMondayBack = new Date(localNow);
  lastWeekMondayBack.setUTCDate(lastWeekMondayBack.getUTCDate() - daysFromMonday - 7);
  const lastWeekStart = calendarStart(
    lastWeekMondayBack.getUTCFullYear(),
    lastWeekMondayBack.getUTCMonth(),
    lastWeekMondayBack.getUTCDate()
  );
  const lastWeekEnd = new Date(weekStart.getTime() - 1);

  const monthStart = calendarStart(ly, lm, 1);
  const nextMonthIndex = lm === 11 ? 0 : lm + 1;
  const nextMonthYear = lm === 11 ? ly + 1 : ly;
  const nextMonthStart = calendarStart(nextMonthYear, nextMonthIndex, 1);
  const monthEnd = new Date(nextMonthStart.getTime() - 1);

  const prevMonthIndex = lm === 0 ? 11 : lm - 1;
  const prevMonthYear = lm === 0 ? ly - 1 : ly;
  const lastMonthStart = calendarStart(prevMonthYear, prevMonthIndex, 1);
  const lastMonthEnd = monthStart;

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const lastMonthStartDate = `${prevMonthYear}-${pad2(prevMonthIndex + 1)}-01`;
  const monthStartDate = `${ly}-${pad2(lm + 1)}-01`;
  const lastWeekStartDate = `${lastWeekMondayBack.getUTCFullYear()}-${pad2(lastWeekMondayBack.getUTCMonth() + 1)}-${pad2(lastWeekMondayBack.getUTCDate())}`;

  const lastCalendarYear = ly - 1;
  const lastYearQ3StartDate = `${lastCalendarYear}-07-01`;
  const lastYearQ3EndDate = `${lastCalendarYear}-10-01`;
  const lastYearFyQ3StartDate = `${lastCalendarYear}-10-01`;
  const lastYearFyQ3EndDate = `${ly}-01-01`;
  const lastYearQ3Start = calendarStart(lastCalendarYear, 6, 1);
  const lastYearQ3End = calendarStart(lastCalendarYear, 9, 1);
  const lastYearFyQ3Start = calendarStart(lastCalendarYear, 9, 1);
  const lastYearFyQ3End = calendarStart(ly, 0, 1);

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
    lastWeekStart: lastWeekStart.toISOString(),
    lastWeekEnd: lastWeekEnd.toISOString(),
    lastWeekStartDate,
    monthStart: monthStart.toISOString(),
    nextMonthStart: nextMonthStart.toISOString(),
    monthEnd: monthEnd.toISOString(),
    lastMonthStart: lastMonthStart.toISOString(),
    lastMonthEnd: lastMonthEnd.toISOString(),
    lastMonthStartDate,
    monthStartDate,
    lastYearQ3StartDate,
    lastYearQ3EndDate,
    lastYearFyQ3StartDate,
    lastYearFyQ3EndDate,
    lastYearQ3Start: lastYearQ3Start.toISOString(),
    lastYearQ3End: lastYearQ3End.toISOString(),
    lastYearFyQ3Start: lastYearFyQ3Start.toISOString(),
    lastYearFyQ3End: lastYearFyQ3End.toISOString(),
    yesterdayStart: yesterdayStart.toISOString(),
    yesterdayEnd: yesterdayEnd.toISOString(),
  };
}

export function applyDatePlaceholders(template: string, placeholders: DatePlaceholderMap): string {
  let out = template;
  for (const [key, value] of Object.entries(placeholders)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return out;
}
