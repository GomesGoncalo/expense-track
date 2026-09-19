import { describe, expect, it } from 'vitest';
import { detectColumnsForMapping, parseWithMapping } from '../../src/parsers/manualMapping/ColumnMapper';
import type { TextLine } from '../../src/parsers/pdfText';
import type { ColumnMapping } from '../../src/domain/types';

function line(y: number, items: { str: string; x: number }[]): TextLine {
  return {
    y,
    items: items.map((i) => ({ ...i, y, width: i.str.length * 6 })),
    text: items.map((i) => i.str).join(' '),
  };
}

const pages: TextLine[][] = [
  [
    line(100, [
      { str: 'Date', x: 0 },
      { str: 'Description', x: 80 },
      { str: 'Amount', x: 300 },
      { str: 'Balance', x: 400 },
    ]),
    line(90, [
      { str: '01/02/2026', x: 0 },
      { str: 'GYM MEMBERSHIP', x: 80 },
      { str: '-25.00', x: 300 },
      { str: '475.00', x: 400 },
    ]),
  ],
];

describe('detectColumnsForMapping', () => {
  it('detects one column band per distinct x position across the document', () => {
    const columns = detectColumnsForMapping(pages);
    expect(columns).toHaveLength(4);
    expect(columns[0].sampleHeader).toBe('Date');
    expect(columns[2].sampleHeader).toBe('Amount');
  });
});

describe('parseWithMapping', () => {
  it('parses rows using a user-confirmed column mapping', () => {
    const mapping: ColumnMapping = {
      dateColumnIndex: 0,
      descriptionColumnIndex: 1,
      moneyOutColumnIndex: null,
      moneyInColumnIndex: null,
      singleAmountColumnIndex: 2,
      balanceColumnIndex: 3,
      dateFormat: 'dd/MM/yyyy',
      headerRowIndex: 0,
    };

    const { transactions, warnings } = parseWithMapping(pages, mapping, 'GBP');
    expect(warnings).toHaveLength(0);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].date).toBe('2026-02-01');
    expect(transactions[0].amountPence).toBe(-2500);
    expect(transactions[0].balancePence).toBe(47500);
    expect(transactions[0].description).toBe('GYM MEMBERSHIP');
  });

  it('skips a trailing page with no repeated header, instead of misreading a stray number as a transaction', () => {
    // A second page with no header row at all — e.g. a T&Cs/disclosure
    // page. Its "12.00" sits in the same x-range as the amount column, and
    // currentDate carries over from the last real transaction, so without
    // re-detecting the header per page this would silently become a bogus
    // second transaction reusing that stale date.
    const twoPagePages: TextLine[][] = [
      pages[0],
      [
        line(100, [
          { str: 'See clause', x: 80 },
          { str: '12.00', x: 300 },
        ]),
      ],
    ];

    const mapping: ColumnMapping = {
      dateColumnIndex: 0,
      descriptionColumnIndex: 1,
      moneyOutColumnIndex: null,
      moneyInColumnIndex: null,
      singleAmountColumnIndex: 2,
      balanceColumnIndex: 3,
      dateFormat: 'dd/MM/yyyy',
      headerRowIndex: 0,
    };

    const { transactions } = parseWithMapping(twoPagePages, mapping, 'GBP');
    expect(transactions).toHaveLength(1);
  });
});
