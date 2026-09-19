import type { BankParser, ParseResult } from '../BankParser';
import { parseSimpleTableStatement } from '../tableParsing';
import type { TextLine } from '../pdfText';

/**
 * NOTE: header labels and date format below are a best-effort guess at
 * Monzo's typical statement layout (Date | Description | Amount | Balance,
 * using a single signed amount column rather than money-out/money-in).
 * Verify against a real (redacted) Monzo statement PDF and adjust
 * HEADER_CONFIG / DATE_FORMAT as needed.
 */
const HEADER_CONFIG = {
  date: ['date'],
  description: ['description', 'name'],
  singleAmount: ['amount'],
  balance: ['balance'],
};

const DATE_FORMAT = 'dd MMM yyyy';

export const MonzoParser: BankParser = {
  bank: 'monzo',

  detect(fullText: string): boolean {
    return /monzo/i.test(fullText);
  },

  parse(pages: TextLine[][]): ParseResult {
    return parseSimpleTableStatement(pages, {
      headerConfig: HEADER_CONFIG,
      dateFormat: DATE_FORMAT,
      notFoundMessage: 'Could not find a recognizable transaction table header in this Monzo statement.',
    });
  },
};
