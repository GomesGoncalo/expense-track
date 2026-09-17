import { ParserError } from '../BankParser';
import type { BankParser, ParseResult } from '../BankParser';
import { findHeaderColumns, parseTableRows, periodFromTransactions } from '../tableParsing';
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
    const header = findHeaderColumns(pages, HEADER_CONFIG);
    if (!header) {
      throw new ParserError(
        'Could not find a recognizable transaction table header in this Trading212 statement.',
      );
    }

    const { transactions, warnings } = parseTableRows(pages, header, {
      dateFormat: DATE_FORMAT,
      defaultCurrency: 'GBP',
    }, HEADER_CONFIG);

    const { start, end } = periodFromTransactions(transactions);
    return { transactions, statementPeriodStart: start, statementPeriodEnd: end, warnings };
  },
};
