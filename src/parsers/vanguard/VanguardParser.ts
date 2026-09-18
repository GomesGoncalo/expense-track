import { ParserError } from '../BankParser';
import type { BankParser, ParseResult } from '../BankParser';
import { findHeaderColumns, parseTableRows, periodFromTransactions } from '../tableParsing';
import type { TextLine } from '../pdfText';
import { parseAmountToPence } from '../../utils/currency';
import { parseStatementDate } from '../../utils/dates';

/**
 * The "Activity" table lists cash movements only (fees, dividends paid out
 * in cash, etc) with a running *cash* balance — not the account's value.
 * Header labels below are a best-effort guess at its columns.
 */
const HEADER_CONFIG = {
  date: ['date'],
  description: ['description', 'transaction type'],
  singleAmount: ['amount'],
  balance: ['value', 'portfolio value', 'balance'],
};

const DATE_FORMAT = 'dd MMM yyyy';

const STATEMENT_PERIOD_RE = /for\s+(\d{1,2}\s+\w+\s+\d{4})\s+to\s+(\d{1,2}\s+\w+\s+\d{4})/i;
const LONG_DATE_FORMAT = 'd MMMM yyyy';
const MONEY_RE = /^-?£?[\d,]+\.\d{2}$/;

/**
 * "Your Regular Statement ... for 9 April 2026 to 8 July 2026" appears once,
 * near the top of the statement — a much more reliable source for the
 * reporting period than the dates on whatever transactions happened to fall
 * within it (which, for a quiet quarter, may just be a couple of fee rows
 * days apart), and it's needed to date the ending valuation below even when
 * there were no transactions at all.
 */
function extractStatementPeriod(pages: TextLine[][]): { start: string | null; end: string | null } {
  for (const lines of pages) {
    for (const line of lines) {
      const match = line.text.match(STATEMENT_PERIOD_RE);
      if (!match) continue;
      try {
        return {
          start: parseStatementDate(match[1], LONG_DATE_FORMAT),
          end: parseStatementDate(match[2], LONG_DATE_FORMAT),
        };
      } catch {
        continue;
      }
    }
  }
  return { start: null, end: null };
}

/**
 * The "Your Vanguard account summary" table on the first page gives the
 * actual answer to "how much do I have": an "Account total" row with one
 * value per "Value on <date>" column (opening, then closing). That's what a
 * ValuationSnapshot should be built from — not the Activity table's cash
 * balance, which only reflects uninvested cash left over after fees.
 */
function extractEndingValuation(pages: TextLine[][], endDate: string | null): { date: string; valuePence: number } | null {
  if (!endDate) return null;

  for (const lines of pages) {
    const headerIndex = lines.findIndex((l) => /\bproduct\b/i.test(l.text) && /value on/i.test(l.text));
    if (headerIndex === -1) continue;

    const totalLine = lines.find((l, i) => i > headerIndex && /^account total\b/i.test(l.text.trim()));
    if (!totalLine) continue;

    const moneyItems = totalLine.items.filter((item) => MONEY_RE.test(item.str.trim()));
    const lastMoneyItem = moneyItems[moneyItems.length - 1];
    if (!lastMoneyItem) continue;

    try {
      return { date: endDate, valuePence: parseAmountToPence(lastMoneyItem.str) };
    } catch {
      continue;
    }
  }
  return null;
}

export const VanguardParser: BankParser = {
  bank: 'vanguard',

  detect(fullText: string): boolean {
    return /vanguard/i.test(fullText);
  },

  parse(pages: TextLine[][]): ParseResult {
    const { start: periodStart, end: periodEnd } = extractStatementPeriod(pages);
    const endingValuation = extractEndingValuation(pages, periodEnd);

    const header = findHeaderColumns(pages, HEADER_CONFIG);
    if (!header) {
      // No recognizable Activity table — fine when there's an account
      // summary to fall back on (a quarter with no cash movements still
      // produces a statement), otherwise this genuinely isn't a statement
      // we know how to read.
      if (endingValuation) {
        return { transactions: [], statementPeriodStart: periodStart, statementPeriodEnd: periodEnd, warnings: [], endingValuation };
      }
      throw new ParserError(
        'Could not find a recognizable transaction table header in this Vanguard statement.',
      );
    }

    const { transactions, warnings } = parseTableRows(pages, header, {
      dateFormat: DATE_FORMAT,
      defaultCurrency: 'GBP',
    }, HEADER_CONFIG);

    const derivedPeriod = periodFromTransactions(transactions);
    return {
      transactions,
      statementPeriodStart: periodStart ?? derivedPeriod.start,
      statementPeriodEnd: periodEnd ?? derivedPeriod.end,
      warnings,
      endingValuation,
    };
  },
};
