import type { Transaction } from '../domain/types';

export interface MerchantSpending {
  description: string;
  expensePence: number;
  occurrences: number;
}

/**
 * Ranks outgoing payees by total spend in a period. Groups by the raw
 * description (case/whitespace-normalized only, no digit-stripping) rather
 * than the looser cadence-based grouping in reporting/recurring.ts, so two
 * different merchants never collide — this is about "where did the money
 * go", not "what repeats".
 */
export function computeTopMerchants(
  transactions: Transaction[],
  periodStart: string,
  periodEnd: string,
  limit = 8,
): MerchantSpending[] {
  const totals = new Map<string, { expensePence: number; occurrences: number; label: string }>();

  for (const t of transactions) {
    if (t.transferId !== null) continue;
    if (t.date < periodStart || t.date > periodEnd) continue;
    if (t.amountPence >= 0) continue;
    const key = t.description.trim().toUpperCase().replace(/\s+/g, ' ');
    if (!key) continue;
    const entry = totals.get(key) ?? { expensePence: 0, occurrences: 0, label: t.description.trim() };
    entry.expensePence += Math.abs(t.amountPence);
    entry.occurrences += 1;
    totals.set(key, entry);
  }

  return Array.from(totals.values())
    .sort((a, b) => b.expensePence - a.expensePence)
    .slice(0, limit)
    .map(({ label, expensePence, occurrences }) => ({ description: label, expensePence, occurrences }));
}
