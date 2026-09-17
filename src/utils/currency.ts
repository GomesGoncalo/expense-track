/**
 * Parses a display amount like "1,234.56", "-1,234.56", "£1,234.56",
 * "1234.56 DR" into integer pence. Some HSBC/First Direct statements mark a
 * debit (overdrawn) balance with a lone trailing "D" rather than "DR" —
 * `\bD\b` matches that but not the "D" inside "DR" (no word boundary there).
 */
export function parseAmountToPence(raw: string): number {
  const trimmed = raw.trim();
  const isCreditSuffix = /\bCR\b/i.test(trimmed);
  const isDebitSuffix = /\bDR\b/i.test(trimmed) || /\bD\b/i.test(trimmed);
  const cleaned = trimmed
    .replace(/[£$€]/g, '')
    .replace(/\bDR\b|\bCR\b|\bD\b/gi, '')
    .replace(/,/g, '')
    .trim();

  const isParenNegative = /^\(.*\)$/.test(cleaned);
  const unwrapped = isParenNegative ? cleaned.slice(1, -1) : cleaned;

  const value = Number.parseFloat(unwrapped);
  if (Number.isNaN(value)) {
    throw new Error(`Cannot parse amount: "${raw}"`);
  }

  let pence = Math.round(Math.abs(value) * 100);
  const isNegative = unwrapped.trim().startsWith('-') || isParenNegative || isDebitSuffix;
  if (isNegative && !isCreditSuffix) {
    pence = -pence;
  }
  return pence;
}

export function formatPence(pence: number, currency = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
  }).format(pence / 100);
}
