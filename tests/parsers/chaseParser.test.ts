import { describe, expect, it } from 'vitest';
import { ChaseParser } from '../../src/parsers/chase/ChaseParser';
import type { TextLine } from '../../src/parsers/pdfText';

function line(y: number, items: { str: string; x: number }[]): TextLine {
  return {
    y,
    items: items.map((i) => ({ ...i, y, width: i.str.length * 6 })),
    text: items.map((i) => i.str).join(' '),
  };
}

const HEADER = line(200, [
  { str: 'Date', x: 0 },
  { str: 'Transaction details', x: 80 },
  { str: 'Amount', x: 300 },
  { str: 'Balance', x: 400 },
]);

/**
 * Shaped after a real Chase Saver statement: each real transaction's date,
 * description, signed amount and balance sit on one line; a small category
 * sub-label ("Payment"/"Interest") follows on its own line with nothing
 * else; "Opening balance"/"Closing balance" rows carry a date and a balance
 * but no amount.
 */
const statementPages: TextLine[][] = [
  [
    HEADER,
    line(190, [
      { str: '01 Aug 2026', x: 0 },
      { str: 'Opening balance', x: 80 },
      { str: '£24,622.23', x: 400 },
    ]),
    line(180, [
      { str: '01 Aug 2026', x: 0 },
      { str: 'Interest earned', x: 80 },
      { str: '+£75.56', x: 300 },
      { str: '£24,697.79', x: 400 },
    ]),
    line(170, [{ str: 'Interest', x: 80 }]),
    line(160, [
      { str: '05 Aug 2026', x: 0 },
      { str: 'To Some Person - Chase Payment', x: 80 },
      { str: '-£3,000.00', x: 300 },
      { str: '£21,697.79', x: 400 },
    ]),
    line(150, [{ str: 'Payment', x: 80 }]),
    line(140, [
      { str: '28 Aug 2026', x: 0 },
      { str: 'From Some Person - Savings Payment', x: 80 },
      { str: '+£5,127.67', x: 300 },
      { str: '£26,825.46', x: 400 },
    ]),
    line(130, [{ str: 'Payment', x: 80 }]),
    line(120, [
      { str: '31 Aug 2026', x: 0 },
      { str: 'Closing balance', x: 80 },
      { str: '£26,825.46', x: 400 },
    ]),
  ],
  // A second page reprinting the header with no further transactions —
  // mirrors the real statement's trailing terms-and-conditions page.
  [HEADER],
];

describe('ChaseParser', () => {
  it('detects a Chase statement by name', () => {
    expect(ChaseParser.detect('Chase Saver statement', statementPages)).toBe(true);
    expect(ChaseParser.detect('Some Other Bank Ltd', statementPages)).toBe(false);
  });

  it('parses only the real transactions, skipping opening/closing balance rows and category sub-labels', () => {
    const result = ChaseParser.parse(statementPages);
    expect(result.transactions).toHaveLength(3);
    expect(result.transactions.map((t) => t.description)).toEqual([
      'Interest earned',
      'To Some Person - Chase Payment',
      'From Some Person - Savings Payment',
    ]);
  });

  it('does not let a trailing category sub-label bleed into the next transaction\'s description', () => {
    const result = ChaseParser.parse(statementPages);
    for (const t of result.transactions) {
      expect(t.description.trim()).not.toMatch(/^(Payment|Interest)$/);
    }
  });

  it('parses signed amounts and running balances correctly', () => {
    const result = ChaseParser.parse(statementPages);
    expect(result.transactions[0]).toMatchObject({
      date: '2026-08-01',
      amountPence: 7556,
      balancePence: 2469779,
      currency: 'GBP',
    });
    expect(result.transactions[1]).toMatchObject({
      date: '2026-08-05',
      amountPence: -300000,
      balancePence: 2169779,
    });
    expect(result.transactions[2]).toMatchObject({
      date: '2026-08-28',
      amountPence: 512767,
      balancePence: 2682546,
    });
  });

  it('derives the statement period from the parsed transactions', () => {
    const result = ChaseParser.parse(statementPages);
    expect(result.statementPeriodStart).toBe('2026-08-01');
    expect(result.statementPeriodEnd).toBe('2026-08-28');
  });
});
