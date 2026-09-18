import { computeCategorySpendingSeries, computeSpendingByCategory, UNCATEGORIZED } from './byCategory';
import { computeIncomeExpenseSummary } from './incomeExpense';
import { latestDate, periodRange } from '../utils/dates';
import { formatPence } from '../utils/currency';
import type { Transaction, Transfer } from '../domain/types';

export type InsightTone = 'up' | 'down' | 'warning';

export interface Insight {
  id: string;
  tone: InsightTone;
  message: string;
  /** Set when the insight is about a specific category, for click-through to its drilldown. */
  category?: string;
  /** Set for insights that link elsewhere instead of a category drilldown (e.g. the Transactions page). */
  to?: string;
}

const BASELINE_MONTHS = 3;
const UNUSUAL_RELATIVE_THRESHOLD = 1.5;
const UNUSUAL_ABSOLUTE_THRESHOLD_PENCE = 3000;
const MAX_INSIGHTS = 4;

/**
 * Lightweight, no-schema-change "insights" surfaced on the Dashboard —
 * built entirely from the existing reporting functions rather than a new
 * budgeting feature, since there's no user-defined budget entity in this
 * app. Returns an empty array when there isn't enough history to say
 * anything meaningful, rather than a misleading callout from noisy data.
 */
export function computeInsights(transactions: Transaction[], transfers: Transfer[] = []): Insight[] {
  const insights: Insight[] = [];

  // Statements are imported in batches, not streamed live, so "this month"
  // is anchored on the most recent transaction date rather than wall-clock
  // today — otherwise every insight below goes silent for weeks after the
  // last import, once today's calendar month has no data yet.
  const mostRecentDate = latestDate(transactions);
  const thisMonth = periodRange('this-month', mostRecentDate ?? undefined);
  const lastMonth = periodRange('last-month', mostRecentDate ?? undefined);

  const thisMonthSpending = computeSpendingByCategory(transactions, thisMonth.start, thisMonth.end);
  const lastMonthSpending = computeSpendingByCategory(transactions, lastMonth.start, lastMonth.end);

  if (lastMonthSpending.length > 0) {
    const lastByCategory = new Map(lastMonthSpending.map((c) => [c.category, c.expensePence]));
    const thisByCategory = new Map(thisMonthSpending.map((c) => [c.category, c.expensePence]));
    const allCategories = new Set([...lastByCategory.keys(), ...thisByCategory.keys()]);

    let biggestIncrease: { category: string; deltaPence: number } | null = null;
    let biggestDecrease: { category: string; deltaPence: number } | null = null;
    for (const category of allCategories) {
      const deltaPence = (thisByCategory.get(category) ?? 0) - (lastByCategory.get(category) ?? 0);
      if (deltaPence > 0 && (!biggestIncrease || deltaPence > biggestIncrease.deltaPence)) {
        biggestIncrease = { category, deltaPence };
      }
      if (deltaPence < 0 && (!biggestDecrease || deltaPence < biggestDecrease.deltaPence)) {
        biggestDecrease = { category, deltaPence };
      }
    }

    if (biggestIncrease) {
      insights.push({
        id: 'category-increase',
        tone: 'up',
        category: biggestIncrease.category,
        message: `${biggestIncrease.category} is up ${formatPence(biggestIncrease.deltaPence)} vs last month.`,
      });
    }
    if (biggestDecrease) {
      insights.push({
        id: 'category-decrease',
        tone: 'down',
        category: biggestDecrease.category,
        message: `${biggestDecrease.category} is down ${formatPence(Math.abs(biggestDecrease.deltaPence))} vs last month.`,
      });
    }
  }

  for (const c of thisMonthSpending) {
    const series = computeCategorySpendingSeries(transactions, c.category === UNCATEGORIZED ? null : c.category, 'month');
    const priorMonths = series.filter((p) => p.period < thisMonth.start).slice(-BASELINE_MONTHS);
    if (priorMonths.length < BASELINE_MONTHS) continue;

    const baselinePence = priorMonths.reduce((sum, p) => sum + p.expensePence, 0) / priorMonths.length;
    if (baselinePence <= 0) continue;

    const ratio = c.expensePence / baselinePence;
    if (ratio >= UNUSUAL_RELATIVE_THRESHOLD && c.expensePence - baselinePence >= UNUSUAL_ABSOLUTE_THRESHOLD_PENCE) {
      insights.push({
        id: `unusual-${c.category}`,
        tone: 'warning',
        category: c.category,
        message: `${c.category} is ${ratio.toFixed(1)}x your usual monthly spend.`,
      });
    }
  }

  const summary = computeIncomeExpenseSummary(transactions, thisMonth.start, thisMonth.end);
  if ((summary.totalIncomePence > 0 || summary.totalExpensePence > 0) && summary.netPence < 0) {
    insights.push({
      id: 'net-negative',
      tone: 'warning',
      message: `You're spending more than you've brought in this month (${formatPence(summary.netPence)}).`,
    });
  }

  // Unconfirmed transfer suggestions still count as ordinary income/expense
  // everywhere else on the Dashboard (both legs), so they can meaningfully
  // inflate every total above until reviewed on the Transactions page.
  const pendingTransfers = transfers.filter((t) => t.status === 'suggested');
  if (pendingTransfers.length > 0) {
    const transactionsById = new Map(transactions.map((t) => [t.id, t]));
    const pendingTotalPence = pendingTransfers.reduce((sum, t) => {
      const outgoing = transactionsById.get(t.outgoingTransactionId);
      return sum + (outgoing ? Math.abs(outgoing.amountPence) : 0);
    }, 0);
    insights.unshift({
      id: 'pending-transfers',
      tone: 'warning',
      to: '/transactions',
      message:
        pendingTransfers.length === 1
          ? `1 suggested transfer (${formatPence(pendingTotalPence)}) is still pending review — confirm it on Transactions so it doesn't inflate your income & expense totals.`
          : `${pendingTransfers.length} suggested transfers (${formatPence(pendingTotalPence)} total) are still pending review — confirm them on Transactions so they don't inflate your income & expense totals.`,
    });
  }

  return insights.slice(0, MAX_INSIGHTS);
}
