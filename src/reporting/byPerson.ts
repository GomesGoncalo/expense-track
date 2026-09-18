import { buildBalanceSeries, bucketDate, computeLatestBalances, toGbpPence } from './netWorth';
import type { NetWorthGranularity } from './netWorth';
import type { Account, Person, Transaction, ValuationSnapshot } from '../domain/types';

export interface PersonNetWorth {
  personId: string;
  netWorthGbpPence: number;
}

export interface HouseholdNetWorth {
  perPerson: PersonNetWorth[];
  /** Value of accounts with no owners (e.g. left over after a person was removed), not attributed to anyone. */
  unassignedGbpPence: number;
  /** Same figure as NetWorthSummary.combinedGbpTotalPence — perPerson + unassigned. */
  totalGbpPence: number;
}

/**
 * Splits each account's latest GBP-converted balance across its owners by
 * their sharePercent, and sums per person — the household-comparison
 * equivalent of computeNetWorthSummary's combined total.
 */
export function computeHouseholdNetWorth(
  persons: Person[],
  accounts: Account[],
  transactions: Transaction[],
  valuationSnapshots: ValuationSnapshot[] = [],
): HouseholdNetWorth {
  const balances = computeLatestBalances(accounts, transactions, valuationSnapshots);
  const accountsById = new Map(accounts.map((a) => [a.id, a]));

  const perPersonTotals = new Map<string, number>(persons.map((p) => [p.id, 0]));
  let unassignedGbpPence = 0;
  let totalGbpPence = 0;

  for (const balance of balances) {
    const account = accountsById.get(balance.accountId);
    if (!account) continue;
    const gbpPence = toGbpPence(account, balance.latestBalancePence);
    if (gbpPence === null) continue; // missing manual rate — excluded, same as computeNetWorthSummary
    totalGbpPence += gbpPence;

    if (account.owners.length === 0) {
      unassignedGbpPence += gbpPence;
      continue;
    }
    for (const owner of account.owners) {
      const share = Math.round(gbpPence * (owner.sharePercent / 100));
      perPersonTotals.set(owner.personId, (perPersonTotals.get(owner.personId) ?? 0) + share);
    }
  }

  return {
    perPerson: Array.from(perPersonTotals.entries()).map(([personId, netWorthGbpPence]) => ({
      personId,
      netWorthGbpPence,
    })),
    unassignedGbpPence,
    totalGbpPence,
  };
}

export interface PersonNetWorthPoint {
  date: string;
  perPersonGbpPence: Record<string, number>;
}

/** Per-person equivalent of computeNetWorthSeries: each account's GBP balance forward-filled and split by owner share. */
export function computeHouseholdNetWorthSeries(
  persons: Person[],
  accounts: Account[],
  transactions: Transaction[],
  valuationSnapshots: ValuationSnapshot[] = [],
  granularity: NetWorthGranularity = 'day',
): PersonNetWorthPoint[] {
  const activeAccounts = accounts.filter((a) => !a.archived);
  const seriesByAccount = new Map(
    activeAccounts.map((a) => [a.id, buildBalanceSeries(a, transactions, valuationSnapshots)]),
  );

  const allDates = new Set<string>();
  for (const series of seriesByAccount.values()) {
    for (const point of series) allDates.add(point.date);
  }
  const sortedDates = Array.from(allDates).sort();
  if (sortedDates.length === 0) return [];

  const lastKnown = new Map<string, number>();
  const bucketed = new Map<string, PersonNetWorthPoint>();

  for (const date of sortedDates) {
    for (const account of activeAccounts) {
      const series = seriesByAccount.get(account.id) ?? [];
      const pointsToday = series.filter((p) => p.date === date);
      if (pointsToday.length > 0) {
        lastKnown.set(account.id, pointsToday[pointsToday.length - 1].balancePence);
      }
    }

    const bucketKey = bucketDate(date, granularity);
    const perPersonGbpPence: Record<string, number> = Object.fromEntries(persons.map((p) => [p.id, 0]));
    for (const account of activeAccounts) {
      const balance = lastKnown.get(account.id);
      if (balance === undefined) continue;
      const gbpPence = toGbpPence(account, balance);
      if (gbpPence === null) continue;
      for (const owner of account.owners) {
        perPersonGbpPence[owner.personId] =
          (perPersonGbpPence[owner.personId] ?? 0) + Math.round(gbpPence * (owner.sharePercent / 100));
      }
    }

    bucketed.set(bucketKey, { date: bucketKey, perPersonGbpPence });
  }

  return Array.from(bucketed.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export interface PersonIncomeExpense {
  personId: string;
  incomePence: number;
  expensePence: number;
}

/**
 * Per-person income/expense for a period, in GBP: each non-transfer
 * transaction's amount is converted to GBP via its account's rate, then
 * split across that account's owners by share. Mirrors
 * computeIncomeExpenseSummary's transfer-exclusion rule.
 */
export function computeHouseholdIncomeExpense(
  persons: Person[],
  accounts: Account[],
  transactions: Transaction[],
  periodStart: string,
  periodEnd: string,
): PersonIncomeExpense[] {
  const accountsById = new Map(accounts.map((a) => [a.id, a]));
  const totals = new Map<string, { incomePence: number; expensePence: number }>(
    persons.map((p) => [p.id, { incomePence: 0, expensePence: 0 }]),
  );

  const inRange = transactions.filter(
    (t) => t.transferId === null && t.date >= periodStart && t.date <= periodEnd,
  );

  for (const t of inRange) {
    const account = accountsById.get(t.accountId);
    if (!account) continue;
    const gbpPence = toGbpPence(account, t.amountPence);
    if (gbpPence === null) continue;

    for (const owner of account.owners) {
      const bucket = totals.get(owner.personId) ?? { incomePence: 0, expensePence: 0 };
      const share = Math.round(gbpPence * (owner.sharePercent / 100));
      if (share > 0) bucket.incomePence += share;
      else if (share < 0) bucket.expensePence += Math.abs(share);
      totals.set(owner.personId, bucket);
    }
  }

  return Array.from(totals.entries()).map(([personId, { incomePence, expensePence }]) => ({
    personId,
    incomePence,
    expensePence,
  }));
}
