export type BankId =
  | 'first-direct'
  | 'hsbc'
  | 'monzo'
  | 'revolut'
  | 'vanguard'
  | 'trading212';

export type AccountType =
  | 'current'
  | 'savings'
  | 'credit-card'
  | 'isa'
  | 'investment'
  | 'other';

export interface Account {
  id: string;
  name: string;
  bank: BankId;
  accountType: AccountType;
  currency: string; // ISO 4217, e.g. 'GBP'
  /**
   * True for accounts whose "how much do I have" figure is a fluctuating
   * market valuation rather than a running cash ledger (e.g. a stocks ISA
   * or a Vanguard/Trading212 investment account). Determines whether net
   * worth is computed from Transaction.balancePence or from
   * ValuationSnapshot instead.
   */
  valuationBased: boolean;
  /**
   * User-entered fixed rate to convert this account's currency into GBP
   * for the combined net-worth total. Never fetched live (no backend).
   * Only meaningful when currency !== 'GBP'.
   */
  manualRateToGbp: number | null;
  createdAt: string;
  archived: boolean;
}

export interface StatementImport {
  id: string;
  accountId: string;
  fileName: string;
  bank: BankId;
  importedAt: string;
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
  pageCount: number;
  /** SHA-256 of the full extracted PDF text, for a fast whole-file duplicate check. */
  rawTextHash: string;
  columnMappingUsed: ColumnMapping | null;
  transactionCount: number;
  status: 'committed' | 'superseded';
}

export interface Transaction {
  id: string;
  accountId: string;
  statementImportId: string;
  date: string; // ISO yyyy-MM-dd
  description: string;
  amountPence: number; // signed: negative = money out, positive = money in
  balancePence: number | null; // running balance after this txn, if stated
  currency: string; // usually == account currency; Revolut rows can differ
  dedupeHash: string;
  transferId: string | null;
  category: string | null; // reserved for future use, unused in v1
  createdAt: string;
}

export type TransferMatchStatus = 'suggested' | 'confirmed' | 'rejected' | 'manual';

export interface Transfer {
  id: string;
  outgoingTransactionId: string; // the leg with amountPence < 0
  incomingTransactionId: string; // the leg with amountPence > 0
  status: TransferMatchStatus;
  matchConfidence: number; // 0..1, 1.0 for manual links
  createdAt: string;
  resolvedAt: string | null;
}

/**
 * A point-in-time value for a valuation-based account (investment/stocks
 * ISA), since its "balance" isn't a sum of transactions but a market value
 * reported by a statement or entered by hand.
 */
export interface ValuationSnapshot {
  id: string;
  accountId: string;
  date: string; // ISO yyyy-MM-dd
  valuePence: number;
  source: 'statement' | 'manual';
  statementImportId: string | null;
  createdAt: string;
}

/** Manual column mapping fallback, used when a bank's auto-parser fails. */
export interface ColumnMapping {
  dateColumnIndex: number;
  descriptionColumnIndex: number;
  moneyOutColumnIndex: number | null;
  moneyInColumnIndex: number | null;
  singleAmountColumnIndex: number | null; // for single signed-amount layouts
  balanceColumnIndex: number | null;
  dateFormat: string; // e.g. 'dd/MM/yyyy'
  headerRowIndex: number | null;
}
