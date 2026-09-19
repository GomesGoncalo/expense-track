import type { BankParser, ParseResult } from '../BankParser';
import { parseSimpleTableStatement } from '../tableParsing';
import type { TextLine } from '../pdfText';

/**
 * Verified against a real HSBC Premier statement PDF. Its table repeats a
 * "Date | Payment type and details | Paid out | Paid in | Balance" header on
 * every page (with justification spacing sometimes baked into the header
 * text itself), only prints the date once per day, each transaction can
 * span multiple lines (description first, amount/balance on a later line —
 * see parseRowsFromColumns in tableParsing.ts), and marks a debit/overdrawn
 * balance with a trailing "D" rather than "DR".
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
    return parseSimpleTableStatement(pages, {
      headerConfig: HEADER_CONFIG,
      dateFormat: DATE_FORMAT,
      notFoundMessage: 'Could not find a recognizable transaction table header in this HSBC statement.',
    });
  },
};
