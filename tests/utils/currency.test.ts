import { describe, expect, it } from 'vitest';
import { formatPence, parseAmountToPence, parseCreditCardAmountToPence } from '../../src/utils/currency';

describe('parseAmountToPence', () => {
  it('parses plain positive and negative amounts', () => {
    expect(parseAmountToPence('1234.56')).toBe(123456);
    expect(parseAmountToPence('-1234.56')).toBe(-123456);
  });

  it('strips currency symbols and thousands separators', () => {
    expect(parseAmountToPence('£1,234.56')).toBe(123456);
    expect(parseAmountToPence('$1,234.56')).toBe(123456);
  });

  it('treats a DR suffix as negative and CR as positive', () => {
    expect(parseAmountToPence('12.34 DR')).toBe(-1234);
    expect(parseAmountToPence('12.34 CR')).toBe(1234);
    expect(parseAmountToPence('-12.34 CR')).toBe(1234);
  });

  it('treats a lone trailing D as negative, distinct from a DR suffix', () => {
    expect(parseAmountToPence('987.66 D')).toBe(-98766);
    expect(parseAmountToPence('987.66 DR')).toBe(-98766);
  });

  it('recognizes suffixes glued directly onto the digits, with no space', () => {
    expect(parseAmountToPence('12.34DR')).toBe(-1234);
    expect(parseAmountToPence('12.34CR')).toBe(1234);
    expect(parseAmountToPence('987.66D')).toBe(-98766);
  });

  it('treats parenthesized amounts as negative', () => {
    expect(parseAmountToPence('(12.34)')).toBe(-1234);
  });

  it('throws on unparseable input', () => {
    expect(() => parseAmountToPence('not a number')).toThrow();
  });
});

describe('parseCreditCardAmountToPence', () => {
  it('treats a plain amount as an expense (negative) — the credit card convention', () => {
    expect(parseCreditCardAmountToPence('5.30')).toBe(-530);
    expect(parseCreditCardAmountToPence('136.32')).toBe(-13632);
  });

  it('treats a CR-suffixed amount as a payment (positive)', () => {
    expect(parseCreditCardAmountToPence('87.55CR')).toBe(8755);
    expect(parseCreditCardAmountToPence('87.55 CR')).toBe(8755);
  });

  it('is the mirror image of parseAmountToPence for the same inputs', () => {
    expect(parseCreditCardAmountToPence('10.00')).toBe(-parseAmountToPence('10.00'));
    expect(parseCreditCardAmountToPence('10.00CR')).toBe(parseAmountToPence('10.00'));
  });
});

describe('formatPence', () => {
  it('formats GBP pence as a currency string', () => {
    expect(formatPence(123456, 'GBP')).toBe('£1,234.56');
  });

  it('formats negative pence with a minus sign', () => {
    expect(formatPence(-500, 'GBP')).toContain('5.00');
  });
});
