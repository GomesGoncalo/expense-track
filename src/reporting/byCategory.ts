import type { Transaction } from '../domain/types';

export interface CategorySpending {
  category: string; // a Category, or 'Uncategorized' for transactions with category === null
  expensePence: number;
}

const UNCATEGORIZED = 'Uncategorized';

/**
 * Expense (money out) totals by category for a period, excluding confirmed
 * transfers — same transfer-exclusion rule as computeIncomeExpenseSummary.
 * Transactions with no category (auto-categorization didn't recognize the
 * merchant, and the user hasn't set one) are grouped as 'Uncategorized'
 * rather than dropped, so the totals still cover every expense.
 */
export function computeSpendingByCategory(
  transactions: Transaction[],
  periodStart: string,
  periodEnd: string,
): CategorySpending[] {
  const totals = new Map<string, number>();

  for (const t of transactions) {
    if (t.transferId !== null) continue;
    if (t.date < periodStart || t.date > periodEnd) continue;
    if (t.amountPence >= 0) continue;
    const category = t.category ?? UNCATEGORIZED;
    totals.set(category, (totals.get(category) ?? 0) + Math.abs(t.amountPence));
  }

  return Array.from(totals.entries())
    .map(([category, expensePence]) => ({ category, expensePence }))
    .sort((a, b) => b.expensePence - a.expensePence);
}
