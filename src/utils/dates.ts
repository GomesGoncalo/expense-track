import { differenceInCalendarDays, format, isValid, parse } from 'date-fns';

/** Common date formats found in UK bank/investment statements. */
export const KNOWN_DATE_FORMATS = [
  'dd/MM/yyyy',
  'dd/MM/yy',
  'dd MMM yyyy',
  'dd MMM yy',
  'd MMM yyyy',
  'yyyy-MM-dd',
];

/** Parses a statement date string into an ISO yyyy-MM-dd string, trying known formats. */
export function parseStatementDate(raw: string, preferredFormat?: string): string {
  const trimmed = raw.trim();
  const formatsToTry = preferredFormat
    ? [preferredFormat, ...KNOWN_DATE_FORMATS]
    : KNOWN_DATE_FORMATS;

  for (const fmt of formatsToTry) {
    const parsed = parse(trimmed, fmt, new Date());
    if (!isValid(parsed)) continue;

    // date-fns parses a 2-digit year as the literal number (e.g. 26 AD)
    // rather than assuming the current century, so expand it ourselves.
    if (parsed.getFullYear() < 100) {
      parsed.setFullYear(parsed.getFullYear() + 2000);
    }
    return format(parsed, 'yyyy-MM-dd');
  }
  throw new Error(`Cannot parse date: "${raw}"`);
}

export function daysBetween(isoDateA: string, isoDateB: string): number {
  return Math.abs(differenceInCalendarDays(new Date(isoDateA), new Date(isoDateB)));
}

export function todayIsoDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export type Period = 'this-month' | 'last-month' | 'ytd' | 'all-time';

/**
 * Resolves a coarse reporting period into an inclusive ISO date range.
 * Anchored on today by default; pass `anchor` (e.g. the most recent
 * transaction date) to resolve "this month"/"last month" relative to where
 * the data actually is, since statements are imported in batches rather
 * than live — anchoring on wall-clock today would make "this month" empty
 * for weeks after the last import.
 */
export function periodRange(period: Period, anchor: string = todayIsoDate()): { start: string; end: string } {
  const today = anchor;
  const [year, month] = today.split('-').map(Number);
  if (period === 'this-month') {
    return { start: `${year}-${String(month).padStart(2, '0')}-01`, end: today };
  }
  if (period === 'last-month') {
    const lastMonthDate = new Date(year, month - 2, 1);
    const y = lastMonthDate.getFullYear();
    const m = lastMonthDate.getMonth() + 1;
    const lastDay = new Date(y, m, 0).getDate();
    return {
      start: `${y}-${String(m).padStart(2, '0')}-01`,
      end: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    };
  }
  if (period === 'ytd') {
    return { start: `${year}-01-01`, end: today };
  }
  return { start: '0000-01-01', end: today };
}
