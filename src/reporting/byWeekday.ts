import type { Transaction } from '../domain/types';

export interface WeekdaySpending {
  weekday: number; // 0 = Monday .. 6 = Sunday
  label: string;
  expensePence: number;
}

const LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Total outgoing spend by weekday within a period (Monday-first). A plain
 * total, not a per-weekday average — the period may not contain the same
 * number of each weekday, and turning that into an "average" would imply a
 * precision the data doesn't have.
 */
export function computeSpendingByWeekday(
  transactions: Transaction[],
  periodStart: string,
  periodEnd: string,
): WeekdaySpending[] {
  const totals = new Array(7).fill(0) as number[];
  for (const t of transactions) {
    if (t.transferId !== null) continue;
    if (t.amountPence >= 0) continue;
    if (t.date < periodStart || t.date > periodEnd) continue;
    const sundayFirst = new Date(`${t.date}T00:00:00Z`).getUTCDay();
    const mondayFirst = (sundayFirst + 6) % 7;
    totals[mondayFirst] += Math.abs(t.amountPence);
  }
  return totals.map((expensePence, weekday) => ({ weekday, label: LABELS[weekday], expensePence }));
}
