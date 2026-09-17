import { ParserError } from '../BankParser';
import type { BankParser, ParseResult } from '../BankParser';
import { findHeaderColumns, parseTableRows, periodFromTransactions } from '../tableParsing';
import type { TextLine } from '../pdfText';

/**
 * NOTE: header labels and date format below are a best-effort guess at First
 * Direct's typical statement layout (Date | Description | Paid out | Paid in
 * | Balance). Verify against a real (redacted) First Direct statement PDF
 * and adjust HEADER_CONFIG / DATE_FORMAT as needed.
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
    const header = findHeaderColumns(pages, HEADER_CONFIG);
    if (!header) {
      throw new ParserError(
        'Could not find a recognizable transaction table header in this First Direct statement.',
      );
    }

    const { transactions, warnings } = parseTableRows(pages, header, {
      dateFormat: DATE_FORMAT,
      defaultCurrency: 'GBP',
    });

    const { start, end } = periodFromTransactions(transactions);
    return { transactions, statementPeriodStart: start, statementPeriodEnd: end, warnings };
  },
};
