import { describe, expect, it } from 'vitest';
import { formatPence, parseAmountToPence } from '../../src/utils/currency';

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

  it('treats parenthesized amounts as negative', () => {
    expect(parseAmountToPence('(12.34)')).toBe(-1234);
  });

  it('throws on unparseable input', () => {
    expect(() => parseAmountToPence('not a number')).toThrow();
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
