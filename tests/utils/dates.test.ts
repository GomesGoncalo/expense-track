import { describe, expect, it } from 'vitest';
import { daysBetween, parseStatementDate, periodRange, todayIsoDate } from '../../src/utils/dates';

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

describe('periodRange', () => {
  it('spans the 1st of this month through today for "this-month"', () => {
    const today = todayIsoDate();
    const { start, end } = periodRange('this-month');
    expect(end).toBe(today);
    expect(start).toBe(`${today.slice(0, 7)}-01`);
  });

  it('spans the full previous calendar month for "last-month"', () => {
    const { start, end } = periodRange('last-month');
    expect(start.slice(8)).toBe('01');
    expect(start.slice(0, 7)).not.toBe(todayIsoDate().slice(0, 7));
    expect(end.slice(0, 7)).toBe(start.slice(0, 7));
  });

  it('spans January 1st through today for "ytd"', () => {
    const today = todayIsoDate();
    const { start, end } = periodRange('ytd');
    expect(start).toBe(`${today.slice(0, 4)}-01-01`);
    expect(end).toBe(today);
  });

  it('spans everything through today for "all-time"', () => {
    const { start, end } = periodRange('all-time');
    expect(start).toBe('0000-01-01');
    expect(end).toBe(todayIsoDate());
  });
});
