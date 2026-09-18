import type { Transaction } from '../domain/types';

export interface RecurringPayment {
  key: string;
  /** The longest raw description seen in the group, used as the display label. */
  description: string;
  accountId: string;
  currency: string;
  occurrences: number;
  averageAmountPence: number; // magnitude, always positive
  firstDate: string;
  lastDate: string;
  averageIntervalDays: number;
}

const MIN_OCCURRENCES = 2;
const MIN_INTERVAL_DAYS = 3; // excludes same-visit/near-duplicate charges (e.g. two parking top-ups an hour apart)
const MAX_INTERVAL_DAYS = 95; // excludes coincidental one-off repeats months apart
const MAX_INTERVAL_COEFFICIENT_OF_VARIATION = 0.5; // stdev/mean of the gaps, once there are enough to judge regularity

function normalizeDescription(description: string): string {
  // Strip digits so a recurring merchant/DD keeps grouping across statements
  // even when its reference number changes each time (e.g. "DD ID MOBILE
  // LIMITED" stays stable; a one-off transfer's random alphanumeric
  // suffix, which is mostly letters, won't collapse into anything else).
  return description.toUpperCase().replace(/[0-9]+/g, '').replace(/\s+/g, ' ').trim();
}

function daysBetweenDates(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
}

/**
 * Finds outgoing payments that repeat on a roughly regular cadence —
 * subscriptions, direct debits, standing orders — from raw transaction
 * history, with no separate "subscription" entity in the schema. Judges
 * regularity from the gaps between occurrences rather than amount
 * consistency, since a real recurring bill (e.g. a usage-based utility DD)
 * can vary in amount from one date to the next while still being clearly
 * recurring by cadence.
 */
export function computeRecurringPayments(transactions: Transaction[], limit = 8): RecurringPayment[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.transferId !== null) continue;
    if (t.amountPence >= 0) continue;
    const normalized = normalizeDescription(t.description);
    if (!normalized) continue;
    const key = `${t.accountId}|${normalized}`;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const results: RecurringPayment[] = [];
  for (const [key, group] of groups) {
    if (group.length < MIN_OCCURRENCES) continue;
    const sorted = [...group].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const dates = sorted.map((t) => t.date);
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) gaps.push(daysBetweenDates(dates[i - 1], dates[i]));

    const meanGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
    if (meanGap < MIN_INTERVAL_DAYS || meanGap > MAX_INTERVAL_DAYS) continue;

    if (gaps.length >= 2) {
      const variance = gaps.reduce((sum, g) => sum + (g - meanGap) ** 2, 0) / gaps.length;
      const coefficientOfVariation = Math.sqrt(variance) / meanGap;
      if (coefficientOfVariation > MAX_INTERVAL_COEFFICIENT_OF_VARIATION) continue;
    }

    const amounts = sorted.map((t) => Math.abs(t.amountPence));
    const averageAmountPence = Math.round(amounts.reduce((sum, a) => sum + a, 0) / amounts.length);
    const description = sorted.reduce(
      (longest, t) => (t.description.length > longest.length ? t.description : longest),
      sorted[0].description,
    );

    results.push({
      key,
      description,
      accountId: sorted[0].accountId,
      currency: sorted[0].currency,
      occurrences: sorted.length,
      averageAmountPence,
      firstDate: dates[0],
      lastDate: dates[dates.length - 1],
      averageIntervalDays: meanGap,
    });
  }

  return results
    .sort((a, b) => b.occurrences - a.occurrences || b.averageAmountPence - a.averageAmountPence)
    .slice(0, limit);
}
