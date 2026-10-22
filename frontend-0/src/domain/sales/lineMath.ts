/** Display helpers only. Invoice/payment/credit money math runs on the API via functionMap. */

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function moneyLabel(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `<input type="date">` value → Prisma DateTime string. */
export function datePayload(value: string | undefined | null): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  if (trimmed.includes('T')) return trimmed;
  return `${trimmed}T00:00:00.000Z`;
}

export function dateInput(value: unknown): string {
  if (!value) return '';
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}
