import type { BankParser, ParseResult } from '../BankParser';
import { parseSimpleTableStatement } from '../tableParsing';
import type { TextLine } from '../pdfText';

/**
 * NOTE: Trading212 statement layouts vary (deposits, withdrawals, dividends,
 * and a portfolio total rather than a simple running cash balance). Header
 * labels below are a best-effort guess (Date | Action/Description | Total |
 * Balance). Verify against a real (redacted) Trading212 statement PDF and
 * adjust HEADER_CONFIG / DATE_FORMAT as needed. As with Vanguard, the Import
 * flow should turn this parser's last row balance into a ValuationSnapshot
 * for this (typically valuation-based) account rather than relying on
 * Transaction.balancePence for net worth.
 */
const HEADER_CONFIG = {
  date: ['date', 'time'],
  description: ['description', 'action', 'name'],
  singleAmount: ['total', 'amount'],
  balance: ['balance', 'portfolio value'],
};

const DATE_FORMAT = 'dd MMM yyyy';

export const Trading212Parser: BankParser = {
  bank: 'trading212',

  detect(fullText: string): boolean {
    return /trading\s*212/i.test(fullText);
  },

  parse(pages: TextLine[][]): ParseResult {
    return parseSimpleTableStatement(pages, {
      headerConfig: HEADER_CONFIG,
      dateFormat: DATE_FORMAT,
      notFoundMessage: 'Could not find a recognizable transaction table header in this Trading212 statement.',
    });
  },
};
