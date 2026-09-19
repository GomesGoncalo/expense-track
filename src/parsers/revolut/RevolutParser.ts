import type { BankParser, ParseResult } from '../BankParser';
import { parseSimpleTableStatement } from '../tableParsing';
import type { TextLine } from '../pdfText';

/**
 * NOTE: header labels and date format below are a best-effort guess at
 * Revolut's typical statement layout (Date | Description | Amount |
 * Currency | Balance). Revolut multi-currency accounts can show a different
 * currency per row, hence the optional "currency" column. Verify against a
 * real (redacted) Revolut statement PDF — ideally a multi-currency one — and
 * adjust HEADER_CONFIG / DATE_FORMAT as needed.
 */
const HEADER_CONFIG = {
  date: ['date', 'completed date'],
  description: ['description'],
  singleAmount: ['amount'],
  balance: ['balance'],
  currency: ['currency'],
};

const DATE_FORMAT = 'dd MMM yyyy';

export const RevolutParser: BankParser = {
  bank: 'revolut',

  detect(fullText: string): boolean {
    return /revolut/i.test(fullText);
  },

  parse(pages: TextLine[][]): ParseResult {
    return parseSimpleTableStatement(pages, {
      headerConfig: HEADER_CONFIG,
      dateFormat: DATE_FORMAT,
      notFoundMessage: 'Could not find a recognizable transaction table header in this Revolut statement.',
    });
  },
};
