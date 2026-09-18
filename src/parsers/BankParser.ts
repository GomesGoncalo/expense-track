import type { BankId } from '../domain/types';
import type { TextLine } from './pdfText';

export interface ParsedTransactionRow {
  date: string; // ISO yyyy-MM-dd, already normalized
  description: string;
  amountPence: number; // signed
  balancePence: number | null;
  currency: string;
}

export interface ParseResult {
  transactions: ParsedTransactionRow[];
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
  warnings: string[];
  /**
   * For a valuation-based account (a stocks ISA, an investment account): the
   * account's total value as of the statement's closing date, when the
   * statement states one directly (e.g. an "Account total" summary line).
   * Distinct from Transaction.balancePence, which for these statements is
   * often just a residual cash balance, not the portfolio's worth — see
   * VanguardParser for the case that motivated this. Omitted/null for banks
   * whose statements don't carry this kind of summary.
   */
  endingValuation?: { date: string; valuePence: number } | null;
}

export class ParserError extends Error {
  partialLines?: TextLine[];

  constructor(message: string, partialLines?: TextLine[]) {
    super(message);
    this.name = 'ParserError';
    this.partialLines = partialLines;
  }
}

export interface BankParser {
  bank: BankId;
  /** Cheap heuristic sanity-check — the bank is already known from the target account. */
  detect(fullText: string, pages: TextLine[][]): boolean;
  /** Attempts a full structured parse. Throws ParserError to trigger the manual-mapping fallback. */
  parse(pages: TextLine[][]): ParseResult;
}
