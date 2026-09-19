import type { BankParser, ParseResult } from '../BankParser';
import { parseSimpleTableStatement } from '../tableParsing';
import type { TextLine } from '../pdfText';

/**
 * Verified against a real Chase Saver statement PDF. Its table ("Date |
 * Transaction details | Amount | Balance") puts a transaction's date,
 * description, signed amount and running balance all on one line, then
 * prints a small category sub-label ("Payment", "Interest") on its own line
 * directly below with no date/amount of its own — the opposite order from
 * HSBC/First Direct's "description first, amount later" wrapping, so this
 * doesn't reuse parseRowsFromColumns' forward-accumulation. "Opening
 * balance"/"Closing balance" rows look the same structurally: a date and a
 * balance-column value but nothing in the Amount column. Both cases are
 * handled the same way — a line with no amount is never accumulated into a
 * neighboring row, just skipped — since a real Chase transaction never wraps
 * its description across lines.
 */
const HEADER_CONFIG = {
  date: ['date'],
  description: ['transaction details', 'description'],
  singleAmount: ['amount'],
  balance: ['balance'],
};

const DATE_FORMAT = 'dd MMM yyyy';

export const ChaseParser: BankParser = {
  bank: 'chase',

  detect(fullText: string): boolean {
    return /chase/i.test(fullText);
  },

  parse(pages: TextLine[][]): ParseResult {
    return parseSimpleTableStatement(pages, {
      headerConfig: HEADER_CONFIG,
      dateFormat: DATE_FORMAT,
      // A real Chase transaction never wraps its description across lines
      // (see this file's top comment) — a no-amount line ("Opening
      // balance"/"Closing balance", a trailing category sub-label) is
      // furniture to skip, not text to carry into the next transaction.
      accumulateDescriptionAcrossLines: false,
      notFoundMessage: 'Could not find a recognizable transaction table header in this Chase statement.',
    });
  },
};
