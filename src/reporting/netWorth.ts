import type { Account, Transaction, ValuationSnapshot } from '../domain/types';

export interface AccountBalance {
  accountId: string;
  currency: string;
  latestBalancePence: number;
  asOfDate: string;
  hasData: true;
}

export interface CurrencySubtotal {
  currency: string;
  totalPence: number;
  accountBalances: AccountBalance[];
}

export interface NetWorthSummary {
  subtotalsByCurrency: CurrencySubtotal[];
  /** Combined total in GBP, converting non-GBP accounts via their manualRateToGbp. */
  combinedGbpTotalPence: number;
  /** Accounts excluded from the combined total because they lack a manual conversion rate. */
  accountsMissingRate: AccountBalance[];
}

function latestBalanceForAccount(
  account: Account,
  transactions: Transaction[],
  valuationSnapshots: ValuationSnapshot[],
): AccountBalance | null {
  if (account.valuationBased) {
    const accountSnapshots = valuationSnapshots
      .filter((s) => s.accountId === account.id)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : 1));
    const latest = accountSnapshots.at(-1);
    if (!latest) return null;
    return {
      accountId: account.id,
      currency: account.currency,
      latestBalancePence: latest.valuePence,
      asOfDate: latest.date,
      hasData: true,
    };
  }

  const accountTransactions = transactions
    .filter((t) => t.accountId === account.id && t.balancePence !== null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : 1));
  const latest = accountTransactions.at(-1);
  if (!latest || latest.balancePence === null) return null;
  return {
    accountId: account.id,
    currency: account.currency,
    latestBalancePence: latest.balancePence,
    asOfDate: latest.date,
    hasData: true,
  };
}

export function computeLatestBalances(
  accounts: Account[],
  transactions: Transaction[],
  valuationSnapshots: ValuationSnapshot[] = [],
): AccountBalance[] {
  return accounts
    .filter((a) => !a.archived)
    .map((a) => latestBalanceForAccount(a, transactions, valuationSnapshots))
    .filter((b): b is AccountBalance => b !== null);
}

export function computeNetWorthSummary(
  accounts: Account[],
  transactions: Transaction[],
  valuationSnapshots: ValuationSnapshot[] = [],
): NetWorthSummary {
  const balances = computeLatestBalances(accounts, transactions, valuationSnapshots);
  const accountsById = new Map(accounts.map((a) => [a.id, a]));

  const byCurrency = new Map<string, AccountBalance[]>();
  for (const balance of balances) {
    const list = byCurrency.get(balance.currency) ?? [];
    list.push(balance);
    byCurrency.set(balance.currency, list);
  }

  const subtotalsByCurrency: CurrencySubtotal[] = Array.from(byCurrency.entries()).map(
    ([currency, accountBalances]) => ({
      currency,
      totalPence: accountBalances.reduce((sum, b) => sum + b.latestBalancePence, 0),
      accountBalances,
    }),
  );

  let combinedGbpTotalPence = 0;
  const accountsMissingRate: AccountBalance[] = [];
  for (const balance of balances) {
    const account = accountsById.get(balance.accountId);
    if (!account) continue;
    if (account.currency === 'GBP') {
      combinedGbpTotalPence += balance.latestBalancePence;
    } else if (account.manualRateToGbp !== null) {
      combinedGbpTotalPence += Math.round(balance.latestBalancePence * account.manualRateToGbp);
    } else {
      accountsMissingRate.push(balance);
    }
  }

  return { subtotalsByCurrency, combinedGbpTotalPence, accountsMissingRate };
}

export type NetWorthGranularity = 'day' | 'week' | 'month';

export interface NetWorthPoint {
  date: string;
  totalGbpPence: number;
  perAccountPence: Record<string, number>;
}

function bucketDate(isoDate: string, granularity: NetWorthGranularity): string {
  if (granularity === 'day') return isoDate;
  const d = new Date(isoDate);
  if (granularity === 'week') {
    const day = d.getUTCDay();
    const diff = (day + 6) % 7; // days since Monday
    d.setUTCDate(d.getUTCDate() - diff);
    return d.toISOString().slice(0, 10);
  }
  // month
  return `${isoDate.slice(0, 7)}-01`;
}

/** Builds a forward-filled step function of {date -> balancePence} for one account. */
function buildBalanceSeries(
  account: Account,
  transactions: Transaction[],
  valuationSnapshots: ValuationSnapshot[],
): { date: string; balancePence: number }[] {
  if (account.valuationBased) {
    return valuationSnapshots
      .filter((s) => s.accountId === account.id)
      .map((s) => ({ date: s.date, balancePence: s.valuePence }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  return transactions
    .filter((t) => t.accountId === account.id && t.balancePence !== null)
    .map((t) => ({ date: t.date, balancePence: t.balancePence as number }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function computeNetWorthSeries(
  accounts: Account[],
  transactions: Transaction[],
  valuationSnapshots: ValuationSnapshot[] = [],
  granularity: NetWorthGranularity = 'day',
): NetWorthPoint[] {
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
  const bucketed = new Map<string, NetWorthPoint>();

  for (const date of sortedDates) {
    for (const account of activeAccounts) {
      const series = seriesByAccount.get(account.id) ?? [];
      const pointsToday = series.filter((p) => p.date === date);
      if (pointsToday.length > 0) {
        lastKnown.set(account.id, pointsToday[pointsToday.length - 1].balancePence);
      }
    }

    const bucketKey = bucketDate(date, granularity);
    const perAccountPence: Record<string, number> = {};
    let totalGbpPence = 0;
    for (const account of activeAccounts) {
      const balance = lastKnown.get(account.id);
      if (balance === undefined) continue;
      perAccountPence[account.id] = balance;
      if (account.currency === 'GBP') {
        totalGbpPence += balance;
      } else if (account.manualRateToGbp !== null) {
        totalGbpPence += Math.round(balance * account.manualRateToGbp);
      }
    }

    // Overwrite with the latest point within the bucket, so each bucket
    // reflects the most recent known balances up to its end.
    bucketed.set(bucketKey, { date: bucketKey, totalGbpPence, perAccountPence });
  }

  return Array.from(bucketed.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}
