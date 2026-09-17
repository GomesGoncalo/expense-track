import { ParserError } from '../BankParser';
import type { BankParser, ParseResult } from '../BankParser';
import { findHeaderColumns, parseTableRows, periodFromTransactions } from '../tableParsing';
import type { TextLine } from '../pdfText';

/**
 * NOTE: Vanguard Investor statement layouts vary (contributions, dividends,
 * fees, and a portfolio valuation line rather than a simple running cash
 * balance). Header labels below are a best-effort guess (Date | Description
 * | Amount | Value). Verify against a real (redacted) Vanguard statement PDF
 * and adjust HEADER_CONFIG / DATE_FORMAT as needed. Because the target
 * account is typically valuation-based, the Import flow should turn this
 * parser's last row balance (portfolio value) into a ValuationSnapshot
 * rather than relying on Transaction.balancePence for net worth.
 */
const HEADER_CONFIG = {
  date: ['date'],
  description: ['description', 'transaction type'],
  singleAmount: ['amount'],
  balance: ['value', 'portfolio value', 'balance'],
};

const DATE_FORMAT = 'dd MMM yyyy';

export const VanguardParser: BankParser = {
  bank: 'vanguard',

  detect(fullText: string): boolean {
    return /vanguard/i.test(fullText);
  },

  parse(pages: TextLine[][]): ParseResult {
    const header = findHeaderColumns(pages, HEADER_CONFIG);
    if (!header) {
      throw new ParserError(
        'Could not find a recognizable transaction table header in this Vanguard statement.',
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
