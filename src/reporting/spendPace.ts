import { daysBetween, daysInMonth as daysInMonthOf, latestDate, periodRange } from '../utils/dates';
import type { Transaction } from '../domain/types';

export interface SpendPace {
  monthStart: string;
  anchorDate: string;
  daysElapsed: number;
  daysInMonth: number;
  spendSoFarPence: number;
  projectedSpendPence: number;
}

/**
 * Projects the current month's total spend from what's happened so far:
 * (spend so far / days elapsed) * days in month. Anchored on the most
 * recent transaction date rather than wall-clock today — same reasoning
 * as reporting/insights.ts, since statements are imported in batches, not
 * streamed live. Returns null when there's nothing to extrapolate from
 * (no transactions at all, or none yet this month).
 */
export function computeSpendPace(transactions: Transaction[]): SpendPace | null {
  const anchorDate = latestDate(transactions);
  if (anchorDate === null) return null;

  const { start: monthStart } = periodRange('this-month', anchorDate);
  const daysElapsed = daysBetween(monthStart, anchorDate) + 1;

  let spendSoFarPence = 0;
  for (const t of transactions) {
    if (t.transferId !== null) continue;
    if (t.amountPence >= 0) continue;
    if (t.date < monthStart || t.date > anchorDate) continue;
    spendSoFarPence += Math.abs(t.amountPence);
  }
  if (spendSoFarPence === 0) return null;

  const daysInMonth = daysInMonthOf(monthStart);
  const projectedSpendPence = Math.round((spendSoFarPence / daysElapsed) * daysInMonth);

  return { monthStart, anchorDate, daysElapsed, daysInMonth, spendSoFarPence, projectedSpendPence };
}
