import { describe, expect, it } from 'vitest';
import { findHeaderColumns, parseTableRows } from '../../src/parsers/tableParsing';
import type { TextLine } from '../../src/parsers/pdfText';

function line(y: number, items: { str: string; x: number }[]): TextLine {
  return {
    y,
    items: items.map((i) => ({ ...i, y, width: i.str.length * 6 })),
    text: items.map((i) => i.str).join(' '),
  };
}

const HEADER_CONFIG = {
  date: ['date'],
  description: ['description', 'details'],
  moneyOut: ['paid out', 'money out'],
  moneyIn: ['paid in', 'money in'],
  balance: ['balance'],
};

describe('findHeaderColumns + parseTableRows (money-out/money-in style)', () => {
  const pages: TextLine[][] = [
    [
      line(100, [
        { str: 'Date', x: 0 },
        { str: 'Description', x: 80 },
        { str: 'Paid out', x: 300 },
        { str: 'Paid in', x: 380 },
        { str: 'Balance', x: 460 },
      ]),
      line(90, [
        { str: '05/01/2026', x: 0 },
        { str: 'TESCO STORES', x: 80 },
        { str: '12.34', x: 300 },
        { str: '987.66', x: 460 },
      ]),
      line(85, [{ str: 'CARD REF 9911', x: 80 }]), // wrapped description continuation
      line(80, [
        { str: '06/01/2026', x: 0 },
        { str: 'SALARY BACS', x: 80 },
        { str: '2,000.00', x: 380 },
        { str: '2,987.66', x: 460 },
      ]),
    ],
  ];

  it('locates the header row and its column bands', () => {
    const header = findHeaderColumns(pages, HEADER_CONFIG);
    expect(header).not.toBeNull();
    expect(header?.columns.map((c) => c.role)).toEqual([
      'date',
      'description',
      'moneyOut',
      'moneyIn',
      'balance',
    ]);
  });

  it('parses data rows into signed amounts and running balances', () => {
    const header = findHeaderColumns(pages, HEADER_CONFIG)!;
    const { transactions, warnings } = parseTableRows(pages, header, {
      dateFormat: 'dd/MM/yyyy',
      defaultCurrency: 'GBP',
    });

    expect(warnings).toHaveLength(0);
    expect(transactions).toHaveLength(2);

    expect(transactions[0].date).toBe('2026-01-05');
    expect(transactions[0].amountPence).toBe(-1234);
    expect(transactions[0].balancePence).toBe(98766);
    expect(transactions[0].description).toBe('TESCO STORES CARD REF 9911');

    expect(transactions[1].date).toBe('2026-01-06');
    expect(transactions[1].amountPence).toBe(200000);
    expect(transactions[1].balancePence).toBe(298766);
  });
});

describe('findHeaderColumns + parseTableRows (single signed amount style)', () => {
  const pages: TextLine[][] = [
    [
      line(100, [
        { str: 'Date', x: 0 },
        { str: 'Description', x: 80 },
        { str: 'Amount', x: 300 },
        { str: 'Balance', x: 400 },
      ]),
      line(90, [
        { str: '01 Jan 2026', x: 0 },
        { str: 'COFFEE SHOP', x: 80 },
        { str: '-3.50', x: 300 },
        { str: '996.50', x: 400 },
      ]),
    ],
  ];

  const config = {
    date: ['date'],
    description: ['description'],
    singleAmount: ['amount'],
    balance: ['balance'],
  };

  it('parses a single signed-amount column layout', () => {
    const header = findHeaderColumns(pages, config)!;
    const { transactions } = parseTableRows(pages, header, {
      dateFormat: 'dd MMM yyyy',
      defaultCurrency: 'GBP',
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].amountPence).toBe(-350);
    expect(transactions[0].balancePence).toBe(99650);
  });
});

describe('findHeaderColumns', () => {
  it('returns null when no header-like row exists', () => {
    const pages: TextLine[][] = [[line(1, [{ str: 'Not a table', x: 0 }])]];
    expect(findHeaderColumns(pages, HEADER_CONFIG)).toBeNull();
  });
});
