import { ParserError } from '../BankParser';
import type { BankParser, ParseResult } from '../BankParser';
import { findHeaderColumns, parseTableRows, periodFromTransactions } from '../tableParsing';
import type { TextLine } from '../pdfText';

/**
 * NOTE: header labels and date format below are a best-effort guess at
 * HSBC's typical statement layout (Date | Type | Description | Paid out |
 * Paid in | Balance). Verify against a real (redacted) HSBC statement PDF
 * and adjust HEADER_CONFIG / DATE_FORMAT as needed.
 */
const HEADER_CONFIG = {
  date: ['date'],
  description: ['description', 'details', 'type'],
  moneyOut: ['paid out', 'money out'],
  moneyIn: ['paid in', 'money in'],
  balance: ['balance'],
};

const DATE_FORMAT = 'dd MMM yy';

export const HsbcParser: BankParser = {
  bank: 'hsbc',

  detect(fullText: string): boolean {
    return /hsbc/i.test(fullText);
  },

  parse(pages: TextLine[][]): ParseResult {
    const header = findHeaderColumns(pages, HEADER_CONFIG);
    if (!header) {
      throw new ParserError('Could not find a recognizable transaction table header in this HSBC statement.');
    }

    const { transactions, warnings } = parseTableRows(pages, header, {
      dateFormat: DATE_FORMAT,
      defaultCurrency: 'GBP',
    });

    const { start, end } = periodFromTransactions(transactions);
    return { transactions, statementPeriodStart: start, statementPeriodEnd: end, warnings };
  },
};
