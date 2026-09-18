import { describe, expect, it } from 'vitest';
import { FirstDirectParser } from '../../src/parsers/firstdirect/FirstDirectParser';
import { HsbcParser } from '../../src/parsers/hsbc/HsbcParser';
import { HsbcCreditCardParser } from '../../src/parsers/hsbc/HsbcCreditCardParser';
import { ChaseParser } from '../../src/parsers/chase/ChaseParser';
import { MonzoParser } from '../../src/parsers/monzo/MonzoParser';
import { RevolutParser } from '../../src/parsers/revolut/RevolutParser';
import { VanguardParser } from '../../src/parsers/vanguard/VanguardParser';
import { Trading212Parser } from '../../src/parsers/trading212/Trading212Parser';
import { ParserError } from '../../src/parsers/BankParser';
import type { BankParser } from '../../src/parsers/BankParser';
import type { TextLine } from '../../src/parsers/pdfText';

function line(y: number, items: { str: string; x: number }[]): TextLine {
  return {
    y,
    items: items.map((i) => ({ ...i, y, width: i.str.length * 6 })),
    text: items.map((i) => i.str).join(' '),
  };
}

const dualColumnPages: TextLine[][] = [
  [
    line(100, [
      { str: 'Date', x: 0 },
      { str: 'Description', x: 80 },
      { str: 'Paid out', x: 300 },
      { str: 'Paid in', x: 380 },
      { str: 'Balance', x: 460 },
    ]),
    line(90, [
      { str: '05 Jan 26', x: 0 },
      { str: 'TESCO STORES', x: 80 },
      { str: '12.34', x: 300 },
      { str: '987.66', x: 460 },
    ]),
  ],
];

const singleAmountPages: TextLine[][] = [
  [
    line(100, [
      { str: 'Date', x: 0 },
      { str: 'Description', x: 80 },
      { str: 'Amount', x: 300 },
      { str: 'Balance', x: 400 },
    ]),
    line(90, [
      { str: '05 Jan 2026', x: 0 },
      { str: 'COFFEE SHOP', x: 80 },
      { str: '-3.50', x: 300 },
      { str: '996.50', x: 400 },
    ]),
  ],
];

const creditCardPages: TextLine[][] = [
  [
    line(100, [
      { str: 'Received By Us', x: 0 },
      { str: 'Transaction Date', x: 90 },
      { str: 'Details', x: 180 },
      { str: 'Amount', x: 400 },
    ]),
    line(90, [
      { str: '22 Jul 26', x: 0 },
      { str: '21 Jul 26', x: 90 },
      { str: 'SOME MERCHANT', x: 180 },
      { str: '5.30', x: 400 },
    ]),
  ],
];

describe.each([
  { parser: FirstDirectParser, name: 'First Direct', pages: dualColumnPages, mentionText: 'FIRST DIRECT statement' },
  { parser: HsbcParser, name: 'HSBC', pages: dualColumnPages, mentionText: 'HSBC UK Bank plc' },
  {
    parser: HsbcCreditCardParser,
    name: 'HSBC Credit Card',
    pages: creditCardPages,
    mentionText: 'Your HSBC Premier Credit Card Statement',
  },
  { parser: ChaseParser, name: 'Chase', pages: singleAmountPages, mentionText: 'Chase Saver statement' },
  { parser: MonzoParser, name: 'Monzo', pages: singleAmountPages, mentionText: 'Monzo Bank Ltd' },
  { parser: RevolutParser, name: 'Revolut', pages: singleAmountPages, mentionText: 'Revolut Ltd' },
  { parser: VanguardParser, name: 'Vanguard', pages: singleAmountPages, mentionText: 'Vanguard Asset Management' },
  { parser: Trading212Parser, name: 'Trading 212', pages: singleAmountPages, mentionText: 'Trading 212 UK Limited' },
])('$name parser', ({ parser, pages, mentionText }: { parser: BankParser; pages: TextLine[][]; mentionText: string }) => {
  it('detects its own statement text', () => {
    expect(parser.detect(mentionText, pages)).toBe(true);
  });

  it('does not detect an unrelated statement', () => {
    expect(parser.detect('Some Other Bank Ltd', pages)).toBe(false);
  });

  it('parses at least one transaction from a matching table layout', () => {
    const result = parser.parse(pages);
    expect(result.transactions.length).toBeGreaterThan(0);
    expect(result.statementPeriodStart).not.toBeNull();
  });

  it('throws ParserError when no recognizable header is present', () => {
    const junkPages: TextLine[][] = [[line(1, [{ str: 'Not a table at all', x: 0 }])]];
    expect(() => parser.parse(junkPages)).toThrow(ParserError);
  });
});
