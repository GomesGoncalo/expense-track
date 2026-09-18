import { ParserError } from '../BankParser';
import type { BankParser, ParseResult } from '../BankParser';
import { findHeaderColumns, parseTableRows, periodFromTransactions } from '../tableParsing';
import { parseAmountToPence, parseCreditCardAmountToPence } from '../../utils/currency';
import type { TextLine } from '../pdfText';

/**
 * Verified against a real HSBC Premier Credit Card statement PDF — a
 * genuinely different layout from HsbcParser.ts (the current-account
 * statement), not a variant of it:
 *  - Two date columns ("Received By Us" / posting date, and "Transaction
 *    Date" / when the purchase happened). We use Transaction Date, since
 *    that's when the spending actually occurred.
 *  - No running balance per row at all — only a period-end "New Balance"
 *    figure in the Account Summary block near the top of the statement, so
 *    it's extracted separately and attached to the last parsed row.
 *  - Inverted sign convention from a current account: a plain amount is a
 *    purchase (an expense), and a payment/refund is marked with a "CR"
 *    suffix instead of defaulting positive. See
 *    utils/currency.ts#parseCreditCardAmountToPence.
 */
const HEADER_CONFIG = {
  date: ['transaction date'],
  description: ['details'],
  singleAmount: ['amount'],
};

const DATE_FORMAT = 'dd MMM yy';

/**
 * The period-end amount owed, from the "Account Summary" block (e.g. "New
 * Balance 198.52"), not the per-row transaction table — this statement
 * format has no running balance per row. Returned as negative pence (an
 * amount owed is a liability, not an asset) so it flows straight into net
 * worth the same way any other account's latest balance does.
 */
function extractNewBalancePence(pages: TextLine[][]): number | null {
  for (const lines of pages) {
    for (const line of lines) {
      const text = line.text.replace(/\s+/g, ' ').trim();
      const match = /new\s*balance\D{0,5}([\d,]+\.\d{2})/i.exec(text);
      if (!match) continue;
      try {
        return -Math.abs(parseAmountToPence(match[1]));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export const HsbcCreditCardParser: BankParser = {
  bank: 'hsbc',

  detect(fullText: string): boolean {
    return /hsbc/i.test(fullText) && /credit\s*card/i.test(fullText);
  },

  parse(pages: TextLine[][]): ParseResult {
    const header = findHeaderColumns(pages, HEADER_CONFIG);
    if (!header) {
      throw new ParserError('Could not find a recognizable transaction table header in this HSBC credit card statement.');
    }

    const { transactions, warnings } = parseTableRows(
      pages,
      header,
      { dateFormat: DATE_FORMAT, defaultCurrency: 'GBP', amountParser: parseCreditCardAmountToPence },
      HEADER_CONFIG,
    );

    const newBalancePence = extractNewBalancePence(pages);
    if (newBalancePence !== null && transactions.length > 0) {
      transactions[transactions.length - 1].balancePence = newBalancePence;
    }

    const { start, end } = periodFromTransactions(transactions);
    return { transactions, statementPeriodStart: start, statementPeriodEnd: end, warnings };
  },
};
