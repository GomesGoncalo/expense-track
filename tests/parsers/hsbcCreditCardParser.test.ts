import { describe, expect, it } from 'vitest';
import { HsbcCreditCardParser } from '../../src/parsers/hsbc/HsbcCreditCardParser';
import type { TextLine } from '../../src/parsers/pdfText';

function line(y: number, items: { str: string; x: number }[]): TextLine {
  return {
    y,
    items: items.map((i) => ({ ...i, y, width: i.str.length * 6 })),
    text: items.map((i) => i.str).join(' '),
  };
}

// Mirrors the real HSBC Premier Credit Card statement's shape: a summary
// block (with "New Balance") on page 1, and the transaction table (with a
// posting-date column we ignore, a transaction-date column we use, no
// per-row balance, and a CR-suffixed payment) on page 2.
const pages: TextLine[][] = [
  [
    line(500, [{ str: 'Account Summary', x: 0 }]),
    line(480, [{ str: 'Previous Balance', x: 0 }, { str: '87.55', x: 200 }]),
    line(460, [{ str: 'New Balance', x: 0 }, { str: '198.52', x: 200 }]),
  ],
  [
    // "Amount" is deliberately on its own line, ~8pt above the others —
    // mirrors the real statement, where the right-aligned numeric header
    // prints a few points off the other labels' baseline (623.5 vs 615.7)
    // and lands in a separate clustered line entirely. It shares that line
    // with a section title, "Your Transaction Details" — which, on the
    // real statement, substring-matches the "details" description label
    // just because it contains that word, and must NOT plant a second,
    // shadowing description column.
    line(108, [{ str: 'Your Transaction Details', x: 0 }, { str: 'Amount', x: 400 }]),
    line(100, [
      { str: 'Received By Us', x: 0 },
      { str: 'Transaction Date', x: 90 },
      { str: 'Details', x: 180 },
    ]),
    line(90, [
      { str: '22 Jul 26', x: 0 },
      { str: '21 Jul 26', x: 90 },
      { str: 'IAP BROMLEY RINGO ECOM UXBRIDGE', x: 180 },
      { str: '5.30', x: 400 },
    ]),
    line(80, [
      { str: '22 Jul 26', x: 0 },
      { str: '22 Jul 26', x: 90 },
      { str: 'IAP HYROX UK LTD London', x: 180 },
      { str: '136.32', x: 400 },
    ]),
    line(70, [
      { str: '14 Aug 26', x: 0 },
      { str: '14 Aug 26', x: 90 },
      { str: 'DIRECT DEBIT PAYMENT - THANK YOU', x: 180 },
      { str: '87.55CR', x: 400 },
    ]),
  ],
];

describe('HsbcCreditCardParser', () => {
  it('detects an HSBC credit card statement, not a current account one', () => {
    expect(HsbcCreditCardParser.detect('Your HSBC Premier Credit Card Statement', pages)).toBe(true);
    expect(HsbcCreditCardParser.detect('Your HSBC Premier Statement', pages)).toBe(false); // current account, no "credit card"
    expect(HsbcCreditCardParser.detect('Some Other Bank Credit Card Statement', pages)).toBe(false);
  });

  it('uses the Transaction Date column, not the Received By Us posting date', () => {
    const { transactions } = HsbcCreditCardParser.parse(pages);
    expect(transactions[0].date).toBe('2026-07-21'); // Transaction Date, not "22 Jul 26" (Received By Us)
    expect(transactions[0].description).not.toContain('22 Jul 26');
  });

  it("does not let the 'Your Transaction Details' section title shadow the real Details column", () => {
    // regression test: "Your Transaction Details" shares a merged-in header
    // line with "Amount" and substring-matches the description role via
    // "details" — it must not plant a second, earlier description column
    // that shadows the real one, which previously made the description
    // column resolve empty and fall back to the whole raw line's text.
    const { transactions } = HsbcCreditCardParser.parse(pages);
    expect(transactions[0].description).toBe('IAP BROMLEY RINGO ECOM UXBRIDGE');
    expect(transactions[0].description).not.toContain('21 Jul 26');
    expect(transactions[0].description).not.toContain('Your Transaction Details');
  });

  it('treats a plain amount as an expense and a CR-suffixed amount as a payment', () => {
    const { transactions } = HsbcCreditCardParser.parse(pages);
    expect(transactions).toHaveLength(3);
    expect(transactions[0].amountPence).toBe(-530); // purchase
    expect(transactions[1].amountPence).toBe(-13632); // purchase
    expect(transactions[2].amountPence).toBe(8755); // CR payment
  });

  it('has no per-row balance, since this statement format has none', () => {
    const { transactions } = HsbcCreditCardParser.parse(pages);
    expect(transactions[0].balancePence).toBeNull();
    expect(transactions[1].balancePence).toBeNull();
  });

  it("attaches the Account Summary's New Balance (negated, as a debt) to the last transaction", () => {
    const { transactions } = HsbcCreditCardParser.parse(pages);
    const last = transactions[transactions.length - 1];
    expect(last.balancePence).toBe(-19852);
  });

  it('finds the Amount column even though its header is offset onto its own line', () => {
    const { transactions } = HsbcCreditCardParser.parse(pages);
    expect(transactions.length).toBeGreaterThan(0);
    expect(transactions.some((t) => t.amountPence !== null)).toBe(true);
  });

  it('does not confuse the unmapped Received By Us column with the date column', () => {
    // regression test: the date column's left boundary must stop at the
    // midpoint before "Received By Us", not default to -Infinity and
    // swallow it — otherwise "22 Jul 26 21 Jul 26" gets read as one string
    // and fails to parse as a date at all.
    const { warnings } = HsbcCreditCardParser.parse(pages);
    expect(warnings).toHaveLength(0);
  });
});
