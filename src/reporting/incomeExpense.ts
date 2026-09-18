import { bucketDate } from './netWorth';
import type { NetWorthGranularity } from './netWorth';
import type { Transaction } from '../domain/types';

export interface IncomeExpenseSummary {
  periodStart: string;
  periodEnd: string;
  totalIncomePence: number;
  totalExpensePence: number;
  netPence: number;
  byAccount: Record<string, { incomePence: number; expensePence: number }>;
}

/**
 * Sums income/expense for transactions in [periodStart, periodEnd] (inclusive,
 * ISO yyyy-MM-dd), excluding any transaction linked to a confirmed/manual
 * transfer (transferId !== null) since that money didn't leave or enter the
 * user's overall pool of accounts.
 */
export function computeIncomeExpenseSummary(
  transactions: Transaction[],
  periodStart: string,
  periodEnd: string,
): IncomeExpenseSummary {
  const inRange = transactions.filter(
    (t) => t.transferId === null && t.date >= periodStart && t.date <= periodEnd,
  );

  const byAccount: Record<string, { incomePence: number; expensePence: number }> = {};
  let totalIncomePence = 0;
  let totalExpensePence = 0;

  for (const t of inRange) {
    const bucket = byAccount[t.accountId] ?? { incomePence: 0, expensePence: 0 };
    if (t.amountPence > 0) {
      bucket.incomePence += t.amountPence;
      totalIncomePence += t.amountPence;
    } else if (t.amountPence < 0) {
      bucket.expensePence += Math.abs(t.amountPence);
      totalExpensePence += Math.abs(t.amountPence);
    }
    byAccount[t.accountId] = bucket;
  }

  return {
    periodStart,
    periodEnd,
    totalIncomePence,
    totalExpensePence,
    netPence: totalIncomePence - totalExpensePence,
    byAccount,
  };
}

export interface IncomeExpensePoint {
  period: string; // bucket start date, ISO yyyy-MM-dd
  incomePence: number;
  expensePence: number;
}

/**
 * Income/expense bucketed over time (e.g. one point per month), for
 * trend charts — same transfer-exclusion rule as computeIncomeExpenseSummary,
 * just grouped by period instead of collapsed into one range.
 */
export function computeIncomeExpenseSeries(
  transactions: Transaction[],
  granularity: NetWorthGranularity = 'month',
): IncomeExpensePoint[] {
  const buckets = new Map<string, { incomePence: number; expensePence: number }>();

  for (const t of transactions) {
    if (t.transferId !== null) continue;
    const period = bucketDate(t.date, granularity);
    const bucket = buckets.get(period) ?? { incomePence: 0, expensePence: 0 };
    if (t.amountPence > 0) bucket.incomePence += t.amountPence;
    else if (t.amountPence < 0) bucket.expensePence += Math.abs(t.amountPence);
    buckets.set(period, bucket);
  }

  return Array.from(buckets.entries())
    .map(([period, { incomePence, expensePence }]) => ({ period, incomePence, expensePence }))
    .sort((a, b) => (a.period < b.period ? -1 : 1));
}
