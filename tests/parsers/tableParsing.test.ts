import { describe, expect, it } from 'vitest';
import { findHeaderColumns, parseRowsFromColumns, parseTableRows } from '../../src/parsers/tableParsing';
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

describe('findHeaderColumns + parseTableRows (money-out/money-in style, one line per transaction)', () => {
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
    expect(transactions[0].description).toBe('TESCO STORES');

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

  it('matches a header label even when the PDF bakes extra spacing into the text run', () => {
    // Real HSBC statement: a single text item literally reads
    // "Pay m e nt t y pe and de t ails" (justification spacing baked into
    // the string itself), which must still be recognized as "description".
    const pages: TextLine[][] = [
      [
        line(100, [
          { str: 'Date', x: 0 },
          { str: 'Pay m e nt t y pe and de t ails', x: 80 },
          { str: '£ Paid out', x: 300 },
          { str: '£ Paid in', x: 380 },
          { str: '£ Balance', x: 460 },
        ]),
      ],
    ];
    const header = findHeaderColumns(pages, HEADER_CONFIG);
    expect(header?.columns.map((c) => c.role)).toEqual(['date', 'description', 'moneyOut', 'moneyIn', 'balance']);
  });
});

describe('parseRowsFromColumns (HSBC/First Direct style: date printed once per day, transactions span multiple lines)', () => {
  // Mirrors the real layout: the date only appears on the first line of the
  // day, several transactions can share that date, and each transaction's
  // description can start on one line and finish (with the amount, and
  // sometimes the balance) on the next.
  const columns = [
    { role: 'date' as const, xStart: -Infinity, xEnd: 90 },
    { role: 'description' as const, xStart: 90, xEnd: 340 },
    { role: 'moneyOut' as const, xStart: 340, xEnd: 420 },
    { role: 'moneyIn' as const, xStart: 420, xEnd: 480 },
    { role: 'balance' as const, xStart: 480, xEnd: Infinity },
  ];

  const pages: TextLine[][] = [
    [
      line(200, [
        { str: '31 Jul 26', x: 0 },
        { str: 'BALANCE BROUGHT FORWARD', x: 90 },
        { str: '0.00', x: 480 },
      ]),
      line(190, [
        { str: '03 Aug 26', x: 0 },
        { str: 'DD EDF ENERGY', x: 90 },
        { str: '119.26', x: 340 },
      ]),
      line(180, [{ str: 'DD MONEYBOX', x: 90 }, { str: '50.00', x: 340 }]),
      line(170, [{ str: 'DD HALIFAX', x: 90 }, { str: '2,737.78', x: 340 }, { str: '2,907.04 D', x: 480 }]),
      line(160, [{ str: '05 Aug 26', x: 0 }, { str: 'CR SOMEONE ELSE', x: 90 }]),
      line(150, [{ str: 'REF1', x: 90 }, { str: '3,000.00', x: 420 }]),
      line(140, [{ str: 'OBP Some Payee', x: 90 }]),
      line(130, [{ str: 'REF2XYZ', x: 90 }, { str: '92.96', x: 340 }, { str: '0.00', x: 480 }]),
    ],
  ];

  it('carries the date forward across undated lines belonging to the same day', () => {
    const { transactions, warnings } = parseRowsFromColumns(pages, columns, 0, 1, {
      dateFormat: 'dd MMM yy',
      defaultCurrency: 'GBP',
    });

    expect(warnings).toHaveLength(0);
    // 3 transactions on 03 Aug (EDF, MONEYBOX, HALIFAX) + 2 on 05 Aug (CR, OBP)
    expect(transactions).toHaveLength(5);
    expect(transactions.every((t) => t.date === '2026-08-03' || t.date === '2026-08-05')).toBe(true);
  });

  it('accumulates a multi-line description up to the line that supplies the amount', () => {
    const { transactions } = parseRowsFromColumns(pages, columns, 0, 1, {
      dateFormat: 'dd MMM yy',
      defaultCurrency: 'GBP',
    });

    const halifax = transactions.find((t) => t.description.includes('HALIFAX'));
    expect(halifax?.amountPence).toBe(-273778);
    expect(halifax?.balancePence).toBe(-290704); // trailing "D" marks a debit/overdrawn balance

    const crTransfer = transactions.find((t) => t.description.includes('CR SOMEONE ELSE'));
    expect(crTransfer?.description).toBe('CR SOMEONE ELSE REF1');
    expect(crTransfer?.amountPence).toBe(300000);

    const obpTransfer = transactions.find((t) => t.description.includes('OBP Some Payee'));
    expect(obpTransfer?.description).toBe('OBP Some Payee REF2XYZ');
    expect(obpTransfer?.amountPence).toBe(-9296);
    expect(obpTransfer?.balancePence).toBe(0);
  });

  it('does not emit a transaction for balance-brought-forward/carried-forward marker lines', () => {
    const { transactions } = parseRowsFromColumns(pages, columns, 0, 1, {
      dateFormat: 'dd MMM yy',
      defaultCurrency: 'GBP',
    });
    expect(transactions.some((t) => t.description.toLowerCase().includes('balance brought forward'))).toBe(false);
  });

  it('skips a repeated header row on a later page without polluting the next description', () => {
    const twoPagePages: TextLine[][] = [
      pages[0],
      [
        line(200, [
          { str: 'Date', x: 0 },
          { str: 'Description', x: 90 },
          { str: 'Paid out', x: 340 },
          { str: 'Paid in', x: 420 },
          { str: 'Balance', x: 480 },
        ]),
        line(190, [{ str: '06 Aug 26', x: 0 }, { str: 'SOME PAYEE', x: 90 }, { str: '10.00', x: 340 }, { str: '10.00', x: 480 }]),
      ],
    ];
    const { transactions } = parseRowsFromColumns(twoPagePages, columns, 0, 1, {
      dateFormat: 'dd MMM yy',
      defaultCurrency: 'GBP',
    });
    const lastTxn = transactions.at(-1);
    expect(lastTxn?.description).toBe('SOME PAYEE');
  });

  it('skips a repeated account-summary block printed above a later page\'s own header', () => {
    // Regression test for a real bug: a page-2 "account details" block
    // (name/sort code/account number) printed ABOVE that page's repeated
    // table header was being scanned as data, and a sort code like
    // "40-38-18" landed in the money-out column band, where
    // parseFloat("40-38-18") silently parsed out "40" as a bogus £40 debit.
    const twoPagePages: TextLine[][] = [
      pages[0],
      [
        // account summary block, positioned above this page's own header
        line(300, [
          { str: 'Some Account Holder Name', x: 0 },
          { str: '40-38-18', x: 340 }, // falls inside the moneyOut band
          { str: '22019523', x: 420 },
        ]),
        line(200, [
          { str: 'Date', x: 0 },
          { str: 'Description', x: 90 },
          { str: 'Paid out', x: 340 },
          { str: 'Paid in', x: 420 },
          { str: 'Balance', x: 480 },
        ]),
        line(190, [{ str: '06 Aug 26', x: 0 }, { str: 'SOME PAYEE', x: 90 }, { str: '10.00', x: 340 }, { str: '10.00', x: 480 }]),
      ],
    ];
    const { transactions } = parseRowsFromColumns(
      twoPagePages,
      columns,
      0,
      1,
      { dateFormat: 'dd MMM yy', defaultCurrency: 'GBP' },
      HEADER_CONFIG,
    );

    expect(transactions).toHaveLength(6); // 5 from page 1 + the one real page-2 transaction
    expect(transactions.some((t) => Math.abs(t.amountPence) === 4000)).toBe(false);
    expect(transactions.at(-1)?.description).toBe('SOME PAYEE');
  });
});
