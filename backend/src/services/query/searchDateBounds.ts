/**
 * Calendar-day and multi-day date bound normalization for SearchQueryBuilder.
 * Handles app timezone (default IST), Prisma DateTime fields, and LLM date-only filters.
 */
export class SearchDateBounds {
  static finalizeWhereDateBounds(where: any): void {
    if (!where || typeof where !== 'object') {
      return;
    }
    for (const field of ['value_date', 'posting_date', 'created_at']) {
      this.finalizeDateFieldDayBounds(where, field);
    }
    if (Array.isArray(where.OR)) {
      for (const branch of where.OR) {
        if (!branch || typeof branch !== 'object') continue;
        for (const field of ['value_date', 'created_at', 'posting_date']) {
          if (branch[field]) {
            const nested: any = {};
            nested[field] = branch[field];
            this.finalizeDateFieldDayBounds(nested, field);
            branch[field] = nested[field];
          }
        }
      }
    }
  }

  /**
   * LLMs often send only `lte` (or only start-of-day `gte`) for a single calendar day.
   * Complete missing bound(s) on the same UTC day so "today" does not match all history.
   */
  static finalizeDateFieldDayBounds(where: any, field: string): void {
    const cond = where[field];
    if (cond === undefined || cond === null) {
      return;
    }

    if (typeof cond !== 'object' || Array.isArray(cond) || cond instanceof Date) {
      const bounds = this.calendarDayBounds(cond);
      if (bounds) {
        where[field] = { gte: bounds.gte, lt: bounds.lt };
      }
      return;
    }

    const hasGte = cond.gte != null && cond.gte !== '';
    const hasLte = cond.lte != null && cond.lte !== '';
    const hasLt = cond.lt != null && cond.lt !== '';
    if (hasGte && (hasLte || hasLt)) {
      const gteD = new Date(cond.gte);
      const endD = new Date(hasLte ? cond.lte : cond.lt);
      const now = new Date();
      if (!Number.isNaN(gteD.getTime()) && !Number.isNaN(endD.getTime())) {
        if (this.isMultiDayDateRange(cond.gte, hasLte ? cond.lte : cond.lt)) {
          this.normalizeMultiDayDateOnlyBounds(cond);
          return;
        }
        if (this.isRecentFromMistakenForToday(gteD, endD, now)) {
          const bounds = this.calendarDayBounds(endD);
          if (bounds) {
            where[field] = { gte: bounds.gte, lt: bounds.lt };
          }
          return;
        }
        if (this.sameUtcDate(gteD, endD) || this.sameCalendarDayFromIso(cond.gte, hasLte ? cond.lte : cond.lt)) {
          const bounds = this.calendarDayBounds(cond.gte);
          if (bounds) {
            where[field] = { gte: bounds.gte, lt: bounds.lt };
          }
          return;
        }
      }
      return;
    }

    const anchor = hasLte ? cond.lte : hasLt ? cond.lt : hasGte ? cond.gte : null;
    if (anchor == null) {
      return;
    }

    const bounds = this.calendarDayBounds(anchor);
    if (!bounds) {
      return;
    }

    if (!hasGte && (hasLte || hasLt)) {
      const anchorDate = new Date(String(anchor));
      const isRangeUpperBound =
        !Number.isNaN(anchorDate.getTime()) &&
        (!this.isUtcStartOfDay(anchor) || this.isUtcEndOfDay(anchorDate));
      if (isRangeUpperBound) {
        const endBounds = this.calendarDayBounds(anchor);
        if (endBounds) {
          where[field] = { lt: endBounds.lt };
        }
        return;
      }
      where[field] = { gte: bounds.gte, lt: bounds.lt };
    } else if (hasGte && !hasLte && !hasLt && this.isUtcStartOfDay(cond.gte)) {
      where[field] = { gte: bounds.gte, lt: bounds.lt };
    }
  }

  static getAppTimezoneOffsetMinutes(): number {
    const raw = process.env.APP_TIMEZONE_OFFSET_MINUTES;
    const parsed = raw ? parseInt(raw, 10) : 330;
    return Number.isNaN(parsed) ? 330 : parsed;
  }

  static calendarDayBounds(value: unknown): { gte: string; lt: string } | null {
    const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    if (!match) {
      const d = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(d.getTime())) return null;
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return this.calendarDayBounds(`${y}-${m}-${day}`);
    }
    const [y, m, d] = match[1].split('-').map(Number);
    const offset = this.getAppTimezoneOffsetMinutes();
    const startUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    startUtc.setUTCMinutes(startUtc.getUTCMinutes() - offset);
    const endUtc = new Date(startUtc);
    endUtc.setUTCDate(endUtc.getUTCDate() + 1);
    return { gte: startUtc.toISOString(), lt: endUtc.toISOString() };
  }

  static sameCalendarDayFromIso(gte: unknown, lte: unknown): boolean {
    const g = String(gte).slice(0, 10);
    const l = String(lte).slice(0, 10);
    return g.length === 10 && g === l;
  }

  /** Date-only YYYY-MM-DD multi-day bounds → app-TZ ISO instants for Prisma DateTime fields. */
  static normalizeMultiDayDateOnlyBounds(cond: {
    gte?: unknown;
    lte?: unknown;
    lt?: unknown;
  }): void {
    const gDay = cond.gte != null && /^\d{4}-\d{2}-\d{2}$/.test(String(cond.gte).trim());
    const endVal = cond.lt ?? cond.lte;
    const eDay = endVal != null && /^\d{4}-\d{2}-\d{2}$/.test(String(endVal).trim());
    if (gDay) {
      const startBounds = this.calendarDayBounds(cond.gte);
      if (startBounds) cond.gte = startBounds.gte;
    }
    if (eDay) {
      const endBounds = this.calendarDayBounds(endVal);
      if (!endBounds) return;
      if (cond.lt != null) cond.lt = endBounds.gte;
      if (cond.lte != null) cond.lte = endBounds.gte;
    }
  }

  /** Week/month ranges — do not collapse to a single calendar day. */
  static isMultiDayDateRange(gte: unknown, end: unknown): boolean {
    const g = String(gte).slice(0, 10);
    const e = String(end).slice(0, 10);
    if (g.length !== 10 || e.length !== 10 || g === e) {
      return false;
    }
    const gDay = /^\d{4}-\d{2}-\d{2}$/.test(String(gte).trim());
    const eDay = /^\d{4}-\d{2}-\d{2}$/.test(String(end).trim());
    if (gDay && eDay) {
      return true;
    }
    const gteD = new Date(String(gte));
    const endD = new Date(String(end));
    if (Number.isNaN(gteD.getTime()) || Number.isNaN(endD.getTime())) {
      return false;
    }
    return !this.sameUtcDate(gteD, endD);
  }

  static isUtcStartOfDay(value: unknown): boolean {
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) {
      return false;
    }
    return (
      d.getUTCHours() === 0 &&
      d.getUTCMinutes() === 0 &&
      d.getUTCSeconds() === 0 &&
      d.getUTCMilliseconds() === 0
    );
  }

  static isUtcEndOfDay(value: Date): boolean {
    return (
      value.getUTCHours() === 23 &&
      value.getUTCMinutes() === 59 &&
      value.getUTCSeconds() === 59 &&
      value.getUTCMilliseconds() >= 999
    );
  }

  static sameUtcDate(a: Date, b: Date): boolean {
    return (
      a.getUTCFullYear() === b.getUTCFullYear() &&
      a.getUTCMonth() === b.getUTCMonth() &&
      a.getUTCDate() === b.getUTCDate()
    );
  }

  /** LLM uses {{recentFromDate}}–{{currentDate}} when the user asked for "today". */
  static isRecentFromMistakenForToday(gte: Date, lte: Date, now: Date): boolean {
    if (
      gte.getUTCFullYear() !== lte.getUTCFullYear() ||
      gte.getUTCMonth() !== lte.getUTCMonth()
    ) {
      return false;
    }
    if (!this.sameUtcDate(lte, now) || !this.isUtcStartOfDay(gte)) {
      return false;
    }
    const prevMonth = now.getUTCMonth() === 0 ? 11 : now.getUTCMonth() - 1;
    const prevYear = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
    return (
      gte.getUTCDate() === now.getUTCDate() &&
      gte.getUTCMonth() === prevMonth &&
      gte.getUTCFullYear() === prevYear
    );
  }
}
