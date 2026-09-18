import { bucketDate } from './netWorth';
import type { NetWorthGranularity } from './netWorth';
import type { Transaction } from '../domain/types';

export interface CategorySpending {
  category: string; // a Category, or 'Uncategorized' for transactions with category === null
  expensePence: number;
}

export const UNCATEGORIZED = 'Uncategorized';

/**
 * Expense (money out) totals by category for a period, excluding confirmed
 * transfers — same transfer-exclusion rule as computeIncomeExpenseSummary.
 * Transactions with no category (auto-categorization didn't recognize the
 * merchant, and the user hasn't set one) are grouped as 'Uncategorized'
 * rather than dropped, so the totals still cover every expense. Pass
 * `excludeCategories` to leave specific categories out of the totals
 * entirely (e.g. hiding "Savings & Investments" so it doesn't dwarf
 * discretionary spending in a chart).
 */
export function computeSpendingByCategory(
  transactions: Transaction[],
  periodStart: string,
  periodEnd: string,
  excludeCategories: ReadonlySet<string> = new Set(),
): CategorySpending[] {
  const totals = new Map<string, number>();

  for (const t of transactions) {
    if (t.transferId !== null) continue;
    if (t.date < periodStart || t.date > periodEnd) continue;
    if (t.amountPence >= 0) continue;
    const category = t.category ?? UNCATEGORIZED;
    if (excludeCategories.has(category)) continue;
    totals.set(category, (totals.get(category) ?? 0) + Math.abs(t.amountPence));
  }

  return Array.from(totals.entries())
    .map(([category, expensePence]) => ({ category, expensePence }))
    .sort((a, b) => b.expensePence - a.expensePence);
}

export interface CategorySpendingPoint {
  period: string; // bucket start date, ISO yyyy-MM-dd
  expensePence: number;
}

/**
 * One category's spending bucketed over time (e.g. monthly) — the
 * "deep dive" trend for a single category, same transfer-exclusion rule as
 * computeSpendingByCategory. Pass category === null to drill into
 * 'Uncategorized' transactions.
 */
export function computeCategorySpendingSeries(
  transactions: Transaction[],
  category: string | null,
  granularity: NetWorthGranularity = 'month',
): CategorySpendingPoint[] {
  const buckets = new Map<string, number>();

  for (const t of transactions) {
    if (t.transferId !== null) continue;
    if (t.amountPence >= 0) continue;
    const txnCategory = t.category ?? UNCATEGORIZED;
    if (txnCategory !== (category ?? UNCATEGORIZED)) continue;
    const period = bucketDate(t.date, granularity);
    buckets.set(period, (buckets.get(period) ?? 0) + Math.abs(t.amountPence));
  }

  return Array.from(buckets.entries())
    .map(([period, expensePence]) => ({ period, expensePence }))
    .sort((a, b) => (a.period < b.period ? -1 : 1));
}

export interface CategorySeriesPoint {
  period: string; // bucket start date, ISO yyyy-MM-dd
  byCategory: Record<string, number>; // category -> expensePence in that bucket
}

/**
 * Every category's spending bucketed over time at once — the stacked-by-
 * month view (each bucket's bar is divided into one segment per category),
 * vs. computeCategorySpendingSeries which tracks a single category. Same
 * transfer-exclusion and excludeCategories behavior as
 * computeSpendingByCategory.
 */
export function computeCategorySpendingSeriesForAll(
  transactions: Transaction[],
  granularity: NetWorthGranularity = 'month',
  excludeCategories: ReadonlySet<string> = new Set(),
): CategorySeriesPoint[] {
  const buckets = new Map<string, Record<string, number>>();

  for (const t of transactions) {
    if (t.transferId !== null) continue;
    if (t.amountPence >= 0) continue;
    const category = t.category ?? UNCATEGORIZED;
    if (excludeCategories.has(category)) continue;
    const period = bucketDate(t.date, granularity);
    const bucket = buckets.get(period) ?? {};
    bucket[category] = (bucket[category] ?? 0) + Math.abs(t.amountPence);
    buckets.set(period, bucket);
  }

  return Array.from(buckets.entries())
    .map(([period, byCategory]) => ({ period, byCategory }))
    .sort((a, b) => (a.period < b.period ? -1 : 1));
}
