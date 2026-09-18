import type { Transaction } from '../domain/types';

/**
 * The largest individual outgoing transactions in a period — catches
 * one-off outliers (a single big purchase) that a payee-aggregated view
 * (top merchants) or a category total can hide inside a larger sum.
 */
export function computeBiggestTransactions(
  transactions: Transaction[],
  periodStart: string,
  periodEnd: string,
  limit = 8,
): Transaction[] {
  return transactions
    .filter((t) => t.transferId === null && t.amountPence < 0 && t.date >= periodStart && t.date <= periodEnd)
    .sort((a, b) => a.amountPence - b.amountPence)
    .slice(0, limit);
}
