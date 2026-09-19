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

/** Converts a native-currency pence amount into GBP pence using the account's manual rate, if any. */
export function toGbpPence(account: Account, balancePence: number): number | null {
  if (account.currency === 'GBP') return balancePence;
  if (account.manualRateToGbp !== null) return Math.round(balancePence * account.manualRateToGbp);
  return null;
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
    const gbpPence = toGbpPence(account, balance.latestBalancePence);
    if (gbpPence !== null) {
      combinedGbpTotalPence += gbpPence;
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
  /** Same balances as perAccountPence, converted to GBP — omits accounts with no manual rate set. */
  perAccountGbpPence: Record<string, number>;
}

export function bucketDate(isoDate: string, granularity: NetWorthGranularity): string {
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
export function buildBalanceSeries(
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

export interface DateIndexedBalances {
  activeAccounts: Account[];
  sortedDates: string[];
  /** Each account's stated balance on a given date, for dates it actually has a point on. */
  balanceByDateByAccount: Map<string, Map<string, number>>;
}

/**
 * Shared setup for computeNetWorthSeries and byPerson.ts's
 * computeHouseholdNetWorthSeries: every active account's balance series,
 * indexed by date once up front. Looking a date up this way instead of
 * `series.filter(p => p.date === date)` per date per account turns what
 * was an O(dates × accounts × points-per-account) scan into one pass over
 * each account's own points. buildBalanceSeries returns points sorted
 * ascending, so a later set() for a repeated date naturally keeps the
 * last one, same as the filter().at(-1) this replaces.
 */
export function buildDateIndexedBalances(
  accounts: Account[],
  transactions: Transaction[],
  valuationSnapshots: ValuationSnapshot[],
): DateIndexedBalances {
  const activeAccounts = accounts.filter((a) => !a.archived);

  const allDates = new Set<string>();
  const balanceByDateByAccount = new Map<string, Map<string, number>>();
  for (const account of activeAccounts) {
    const byDate = new Map<string, number>();
    for (const point of buildBalanceSeries(account, transactions, valuationSnapshots)) {
      byDate.set(point.date, point.balancePence);
      allDates.add(point.date);
    }
    balanceByDateByAccount.set(account.id, byDate);
  }

  return { activeAccounts, sortedDates: Array.from(allDates).sort(), balanceByDateByAccount };
}

export function computeNetWorthSeries(
  accounts: Account[],
  transactions: Transaction[],
  valuationSnapshots: ValuationSnapshot[] = [],
  granularity: NetWorthGranularity = 'day',
): NetWorthPoint[] {
  const { activeAccounts, sortedDates, balanceByDateByAccount } = buildDateIndexedBalances(
    accounts,
    transactions,
    valuationSnapshots,
  );
  if (sortedDates.length === 0) return [];

  const lastKnown = new Map<string, number>();
  const bucketed = new Map<string, NetWorthPoint>();

  for (const date of sortedDates) {
    for (const account of activeAccounts) {
      const balanceToday = balanceByDateByAccount.get(account.id)?.get(date);
      if (balanceToday !== undefined) {
        lastKnown.set(account.id, balanceToday);
      }
    }

    const bucketKey = bucketDate(date, granularity);
    const perAccountPence: Record<string, number> = {};
    const perAccountGbpPence: Record<string, number> = {};
    let totalGbpPence = 0;
    for (const account of activeAccounts) {
      const balance = lastKnown.get(account.id);
      if (balance === undefined) continue;
      perAccountPence[account.id] = balance;
      const gbpPence = toGbpPence(account, balance);
      if (gbpPence !== null) {
        totalGbpPence += gbpPence;
        perAccountGbpPence[account.id] = gbpPence;
      }
    }

    // Overwrite with the latest point within the bucket, so each bucket
    // reflects the most recent known balances up to its end.
    bucketed.set(bucketKey, { date: bucketKey, totalGbpPence, perAccountPence, perAccountGbpPence });
  }

  return Array.from(bucketed.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export interface NetWorthDrawdown {
  peakGbpPence: number;
  peakDate: string;
  currentGbpPence: number;
  currentDate: string;
  /** current - peak; zero at a new high, negative below it. */
  drawdownPence: number;
  /** Null when the peak is zero or negative — a percent off a non-positive peak isn't meaningful. */
  drawdownPercent: number | null;
}

/**
 * Current net worth against its all-time high within an existing
 * computeNetWorthSeries result — every point already known, so this is
 * just a max/latest lookup, not a forecast.
 */
export function computeNetWorthDrawdown(series: NetWorthPoint[]): NetWorthDrawdown | null {
  if (series.length === 0) return null;

  const peak = series.reduce((max, p) => (p.totalGbpPence > max.totalGbpPence ? p : max), series[0]);
  const current = series[series.length - 1];
  const drawdownPence = current.totalGbpPence - peak.totalGbpPence;

  return {
    peakGbpPence: peak.totalGbpPence,
    peakDate: peak.date,
    currentGbpPence: current.totalGbpPence,
    currentDate: current.date,
    drawdownPence,
    drawdownPercent: peak.totalGbpPence > 0 ? (drawdownPence / peak.totalGbpPence) * 100 : null,
  };
}
