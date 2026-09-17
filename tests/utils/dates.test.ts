import { describe, expect, it } from 'vitest';
import { daysBetween, parseStatementDate } from '../../src/utils/dates';

describe('parseStatementDate', () => {
  it('parses dd/MM/yyyy', () => {
    expect(parseStatementDate('05/01/2026')).toBe('2026-01-05');
  });

  it('parses dd MMM yyyy', () => {
    expect(parseStatementDate('5 Jan 2026')).toBe('2026-01-05');
  });

  it('parses dd MMM yy', () => {
    expect(parseStatementDate('05 Jan 26')).toBe('2026-01-05');
  });

  it('parses iso dates unchanged', () => {
    expect(parseStatementDate('2026-01-05')).toBe('2026-01-05');
  });

  it('respects a preferred format first', () => {
    expect(parseStatementDate('01/02/2026', 'MM/dd/yyyy')).toBe('2026-01-02');
  });

  it('throws on unparseable input', () => {
    expect(() => parseStatementDate('not a date')).toThrow();
  });
});

describe('daysBetween', () => {
  it('computes absolute calendar day difference', () => {
    expect(daysBetween('2026-01-01', '2026-01-04')).toBe(3);
    expect(daysBetween('2026-01-04', '2026-01-01')).toBe(3);
    expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0);
  });
});
