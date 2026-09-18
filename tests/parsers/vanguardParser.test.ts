import { describe, expect, it } from 'vitest';
import { VanguardParser } from '../../src/parsers/vanguard/VanguardParser';
import { ParserError } from '../../src/parsers/BankParser';
import type { TextLine } from '../../src/parsers/pdfText';

function line(y: number, items: { str: string; x: number }[]): TextLine {
  return {
    y,
    items: items.map((i) => ({ ...i, y, width: i.str.length * 6 })),
    text: items.map((i) => i.str).join(' '),
  };
}

// Mirrors the real layout of a "Your Regular Statement" PDF: a first page
// with the account summary (Product / Value on <start> / Value on <end> /
// Account total), and a second page with the Activity (cash movements)
// table — the only thing the parser used to read.
const accountSummaryPage: TextLine[] = [
  line(567, [{ str: 'Your Regular Statement & Annual Cost and Charges Statement', x: 99 }]),
  line(552, [{ str: 'for 9 April 2026 to 8 July 2026', x: 99 }]),
  line(395, [
    { str: 'Product', x: 101 },
    { str: 'Value on 09 April 2026', x: 261 },
    { str: 'Value on 08 July 2026', x: 412 },
  ]),
  line(379, [
    { str: 'ISA', x: 101 },
    { str: '£8,545.37', x: 330 },
    { str: '£9,295.83', x: 477 },
  ]),
  line(362, [
    { str: 'Account total', x: 101 },
    { str: '£8,545.37', x: 324 },
    { str: '£9,295.83', x: 472 },
  ]),
];

const activityPage: TextLine[] = [
  line(445, [
    { str: 'Transaction date', x: 101 },
    { str: 'Transaction details', x: 190 },
    { str: 'Cash amount', x: 355 },
    { str: 'Cash balance', x: 456 },
  ]),
  line(429, [
    { str: '10/04/2026', x: 101 },
    { str: 'Selling of account investments', x: 190 },
    { str: '£12.02', x: 390 },
    { str: '£12.06', x: 491 },
  ]),
  line(376, [
    { str: '13/04/2026', x: 101 },
    { str: 'Account Fee for the period', x: 190 },
    { str: '-£12.00', x: 387 },
    { str: '£0.06', x: 497 },
  ]),
];

describe('VanguardParser', () => {
  it('values the account from the "Account total" summary, not the Activity table\'s residual cash balance', () => {
    const result = VanguardParser.parse([accountSummaryPage, activityPage]);

    expect(result.endingValuation).toEqual({ date: '2026-07-08', valuePence: 929583 });
  });

  it('derives the statement period from the "for X to Y" line, not just transaction dates', () => {
    const result = VanguardParser.parse([accountSummaryPage, activityPage]);

    // The fee transactions below both fall in April; the real period runs
    // to July, and only the summary line says so.
    expect(result.statementPeriodStart).toBe('2026-04-09');
    expect(result.statementPeriodEnd).toBe('2026-07-08');
  });

  it('still parses the Activity table\'s cash transactions', () => {
    const result = VanguardParser.parse([accountSummaryPage, activityPage]);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({ date: '2026-04-10', amountPence: 1202 });
    expect(result.transactions[1]).toMatchObject({ date: '2026-04-13', amountPence: -1200 });
  });

  it('falls back to a null valuation, without throwing, when there is no account summary table', () => {
    const result = VanguardParser.parse([activityPage]);

    expect(result.endingValuation ?? null).toBeNull();
    expect(result.transactions).toHaveLength(2);
  });

  it('returns a valuation with zero transactions for a quarter with no cash activity, instead of throwing', () => {
    const result = VanguardParser.parse([accountSummaryPage]);

    expect(result.transactions).toHaveLength(0);
    expect(result.endingValuation).toEqual({ date: '2026-07-08', valuePence: 929583 });
  });

  it('still throws when neither a recognizable Activity table nor an account summary is present', () => {
    const junkPages: TextLine[][] = [[line(1, [{ str: 'Not a statement at all', x: 0 }])]];
    expect(() => VanguardParser.parse(junkPages)).toThrow(ParserError);
  });
});
