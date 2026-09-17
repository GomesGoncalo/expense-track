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
