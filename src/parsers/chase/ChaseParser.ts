import { ParserError } from '../BankParser';
import type { BankParser, ParsedTransactionRow, ParseResult } from '../BankParser';
import { findHeaderColumns, findHeaderRowIndexInLines, periodFromTransactions, textForRole } from '../tableParsing';
import { parseAmountToPence } from '../../utils/currency';
import { parseStatementDate } from '../../utils/dates';
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
    const header = findHeaderColumns(pages, HEADER_CONFIG);
    if (!header) {
      throw new ParserError('Could not find a recognizable transaction table header in this Chase statement.');
    }

    const transactions: ParsedTransactionRow[] = [];
    let currentDate: string | null = null;

    for (let pageIndex = header.pageIndex; pageIndex < pages.length; pageIndex += 1) {
      const lines = pages[pageIndex];
      let startLine = pageIndex === header.pageIndex ? header.lineIndex + 1 : 0;

      if (pageIndex !== header.pageIndex) {
        const repeatedHeaderIndex = findHeaderRowIndexInLines(lines, HEADER_CONFIG);
        if (repeatedHeaderIndex === null) continue;
        startLine = repeatedHeaderIndex + 1;
      }

      for (let lineIndex = startLine; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        const dateText = textForRole(line, header.columns, 'date');
        if (dateText) {
          try {
            currentDate = parseStatementDate(dateText, DATE_FORMAT);
          } catch {
            // leave currentDate as-is; an unparseable date here shouldn't discard an otherwise good row
          }
        }

        const amountText = textForRole(line, header.columns, 'singleAmount');
        // No amount on this line: either statement furniture ("Opening
        // balance"/"Closing balance", which only has a Balance-column value)
        // or the trailing category sub-label below a transaction already
        // emitted — either way, safe to skip outright.
        if (!amountText || !currentDate) continue;

        let amountPence: number;
        try {
          amountPence = parseAmountToPence(amountText);
        } catch {
          continue;
        }

        const balanceText = textForRole(line, header.columns, 'balance');
        let balancePence: number | null = null;
        if (balanceText) {
          try {
            balancePence = parseAmountToPence(balanceText);
          } catch {
            balancePence = null;
          }
        }

        const descriptionText = textForRole(line, header.columns, 'description');

        transactions.push({
          date: currentDate,
          description: descriptionText || line.text.trim(),
          amountPence,
          balancePence,
          currency: 'GBP',
        });
      }
    }

    const { start, end } = periodFromTransactions(transactions);
    return { transactions, statementPeriodStart: start, statementPeriodEnd: end, warnings: [] };
  },
};
