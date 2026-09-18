interface AmountMagnitude {
  pence: number;
  isCreditSuffix: boolean;
  isDebitSuffix: boolean;
  isNegativeLiteral: boolean;
}

/**
 * Strips currency symbols/commas/DR/CR/D markers and parses the numeric
 * magnitude, returning it alongside the sign-related flags so callers can
 * apply whichever sign convention their statement uses (see
 * parseAmountToPence vs parseCreditCardAmountToPence below — they're
 * mirror images of each other).
 */
function parseAmountMagnitude(raw: string): AmountMagnitude {
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  // Suffix-anchored (endsWith), not a `\b`-bounded regex: some statements
  // glue the marker straight onto the digits with no space ("87.55CR"), and
  // a digit is a \w character just like a letter, so there's no word
  // boundary between "5" and "C" for `\bCR\b` to find — it silently never
  // matches. Checking "DR" before a lone "D" avoids treating the "D" inside
  // "DR" as the separate lone-debit marker some other statements use.
  const isCreditSuffix = upper.endsWith('CR');
  const isDrSuffix = upper.endsWith('DR');
  const isDebitSuffix = isDrSuffix || (!isDrSuffix && upper.endsWith('D'));
  const cleaned = trimmed
    .replace(/[£$€]/g, '')
    .replace(/(CR|DR|D)\s*$/i, '')
    .replace(/,/g, '')
    .trim();

  const isParenNegative = /^\(.*\)$/.test(cleaned);
  const unwrapped = isParenNegative ? cleaned.slice(1, -1) : cleaned;

  const value = Number.parseFloat(unwrapped);
  if (Number.isNaN(value)) {
    throw new Error(`Cannot parse amount: "${raw}"`);
  }

  return {
    pence: Math.round(Math.abs(value) * 100),
    isCreditSuffix,
    isDebitSuffix,
    isNegativeLiteral: unwrapped.trim().startsWith('-') || isParenNegative,
  };
}

/** Parses a display amount like "1,234.56", "-1,234.56", "£1,234.56", "1234.56 DR" into integer pence. */
export function parseAmountToPence(raw: string): number {
  const { pence, isCreditSuffix, isDebitSuffix, isNegativeLiteral } = parseAmountMagnitude(raw);
  const isNegative = isNegativeLiteral || isDebitSuffix;
  return isNegative && !isCreditSuffix ? -pence : pence;
}

/**
 * For credit card statements (HSBC's observed in practice), the sign
 * convention is inverted relative to a current account: a plain amount is
 * a purchase — an expense, negative here — and a "CR" suffix marks a
 * payment or refund reducing what's owed — positive here. Mirror image of
 * parseAmountToPence, where an unmarked amount defaults positive.
 */
export function parseCreditCardAmountToPence(raw: string): number {
  const { pence, isCreditSuffix } = parseAmountMagnitude(raw);
  return isCreditSuffix ? pence : -pence;
}

export function formatPence(pence: number, currency = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
  }).format(pence / 100);
}
