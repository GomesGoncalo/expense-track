import type { BankParser, ParseResult } from '../BankParser';
import { parseSimpleTableStatement } from '../tableParsing';
import type { TextLine } from '../pdfText';

/**
 * NOTE: header labels and date format below are a best-effort guess at First
 * Direct's typical statement layout (Date | Description | Paid out | Paid in
 * | Balance), based on HsbcParser.ts, which was verified against a real HSBC
 * Premier statement — First Direct is part of HSBC Group and likely shares
 * the same statement generator/layout (date printed once per day, multi-line
 * transactions, "D" suffix for a debit/overdrawn balance), but this hasn't
 * been confirmed against a real First Direct statement PDF yet. If it
 * doesn't parse correctly, compare against HsbcParser.ts first.
 */
const HEADER_CONFIG = {
  date: ['date'],
  description: ['description', 'details', 'payment type'],
  moneyOut: ['paid out', 'money out', 'withdrawn'],
  moneyIn: ['paid in', 'money in', 'deposited'],
  balance: ['balance'],
};

const DATE_FORMAT = 'dd MMM yy';

export const FirstDirectParser: BankParser = {
  bank: 'first-direct',

  detect(fullText: string): boolean {
    return /first\s*direct/i.test(fullText);
  },

  parse(pages: TextLine[][]): ParseResult {
    return parseSimpleTableStatement(pages, {
      headerConfig: HEADER_CONFIG,
      dateFormat: DATE_FORMAT,
      notFoundMessage: 'Could not find a recognizable transaction table header in this First Direct statement.',
    });
  },
};
