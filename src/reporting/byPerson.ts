import { buildDateIndexedBalances, bucketDate, computeLatestBalances, toGbpPence } from './netWorth';
import type { NetWorthGranularity } from './netWorth';
import type { Account, Person, Transaction, Transfer, ValuationSnapshot } from '../domain/types';

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
  const { activeAccounts, sortedDates, balanceByDateByAccount } = buildDateIndexedBalances(
    accounts,
    transactions,
    valuationSnapshots,
  );
  if (sortedDates.length === 0) return [];

  const lastKnown = new Map<string, number>();
  const bucketed = new Map<string, PersonNetWorthPoint>();

  for (const date of sortedDates) {
    for (const account of activeAccounts) {
      const balanceToday = balanceByDateByAccount.get(account.id)?.get(date);
      if (balanceToday !== undefined) {
        lastKnown.set(account.id, balanceToday);
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
 * split across that account's owners by share — or, when the transaction
 * has a `splitOverride`, across those people instead (e.g. a shared dinner
 * paid from one person's sole account but split with someone else who
 * doesn't own it). Mirrors computeIncomeExpenseSummary's transfer-exclusion
 * rule.
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

    const splits = t.splitOverride ?? account.owners;
    for (const split of splits) {
      const bucket = totals.get(split.personId) ?? { incomePence: 0, expensePence: 0 };
      const share = Math.round(gbpPence * (split.sharePercent / 100));
      if (share > 0) bucket.incomePence += share;
      else if (share < 0) bucket.expensePence += Math.abs(share);
      totals.set(split.personId, bucket);
    }
  }

  return Array.from(totals.entries()).map(([personId, { incomePence, expensePence }]) => ({
    personId,
    incomePence,
    expensePence,
  }));
}

export interface PersonBalance {
  personId: string;
  /** Positive: this person fronted more than their fair share — others owe them. Negative: they owe others. */
  netOwedGbpPence: number;
}

/**
 * Net "who owes whom" balance from split transactions (any transaction with
 * a `splitOverride`, expense or income): each account owner's normal
 * ownership share of the transaction is their "actual" cash flow (money
 * that really left, or arrived in, their account); each person named in
 * the split has a "fair" share of the same amount. A person's balance is
 * fair-minus-actual — for an expense that makes the payer positive (they
 * fronted more than their fair share, so others owe them) and split
 * participants negative (they owe the payer); for income received it's the
 * mirror image (the receiver is negative — they're holding money that
 * isn't fully theirs — and the other split participants are positive,
 * owed their share of it). Summed per person, the result is a net balance
 * — not a full pairwise settle-up (e.g. "Bob owes Alice £12 and Carol £8"),
 * just "Bob is £20 in the hole overall."
 *
 * A confirmed/manual transfer marked `settlement: true` (one household
 * member paying another back, via Transactions' "Mark as settlement")
 * feeds the same ledger: the payer's balance moves up by their share of
 * the outgoing leg and the payee's moves down by their share of the
 * incoming leg — the exact same "ownership-share of actual cash flow" math
 * as a split transaction's account-owner side, just applied to both legs
 * of the transfer instead of one transaction. If there was no prior debt,
 * this naturally creates one in the other direction rather than needing
 * special-cased "is there a debt to clear" logic.
 */
export function computeSplitBalances(
  persons: Person[],
  accounts: Account[],
  transactions: Transaction[],
  transfers: Transfer[] = [],
): PersonBalance[] {
  const accountsById = new Map(accounts.map((a) => [a.id, a]));
  const transactionsById = new Map(transactions.map((t) => [t.id, t]));
  const totals = new Map<string, number>(persons.map((p) => [p.id, 0]));

  function subtractOwnerShares(transactionId: string) {
    const t = transactionsById.get(transactionId);
    const account = t && accountsById.get(t.accountId);
    if (!t || !account) return;
    const gbpPence = toGbpPence(account, t.amountPence);
    if (gbpPence === null) return;
    for (const owner of account.owners) {
      const actual = Math.round(gbpPence * (owner.sharePercent / 100));
      totals.set(owner.personId, (totals.get(owner.personId) ?? 0) - actual);
    }
  }

  for (const t of transactions) {
    if (!t.splitOverride || t.transferId !== null) continue;
    const account = accountsById.get(t.accountId);
    if (!account) continue;
    const gbpPence = toGbpPence(account, t.amountPence);
    if (gbpPence === null) continue;

    for (const owner of account.owners) {
      const actual = Math.round(gbpPence * (owner.sharePercent / 100));
      totals.set(owner.personId, (totals.get(owner.personId) ?? 0) - actual);
    }
    for (const split of t.splitOverride) {
      const fairShare = Math.round(gbpPence * (split.sharePercent / 100));
      totals.set(split.personId, (totals.get(split.personId) ?? 0) + fairShare);
    }
  }

  for (const transfer of transfers) {
    if (!transfer.settlement) continue;
    if (transfer.status !== 'confirmed' && transfer.status !== 'manual') continue;
    subtractOwnerShares(transfer.outgoingTransactionId);
    subtractOwnerShares(transfer.incomingTransactionId);
  }

  return Array.from(totals.entries()).map(([personId, netOwedGbpPence]) => ({ personId, netOwedGbpPence }));
}

export interface PersonNetCashFlowPoint {
  period: string; // bucket start date, ISO yyyy-MM-dd
  perPersonNetGbpPence: Record<string, number>;
}

/**
 * Per-person net cash flow (income minus expense, GBP, split-aware) bucketed
 * over time — the trend-over-time counterpart to computeHouseholdIncomeExpense's
 * single-period snapshot. One line per person rather than income+expense
 * bars per person, since N people × 2 series gets cluttered fast; net flow
 * still answers "who's saving vs bleeding money" at a glance.
 */
export function computeHouseholdNetCashFlowSeries(
  persons: Person[],
  accounts: Account[],
  transactions: Transaction[],
  granularity: NetWorthGranularity = 'month',
): PersonNetCashFlowPoint[] {
  const accountsById = new Map(accounts.map((a) => [a.id, a]));
  const buckets = new Map<string, Record<string, number>>();

  for (const t of transactions) {
    if (t.transferId !== null) continue;
    const account = accountsById.get(t.accountId);
    if (!account) continue;
    const gbpPence = toGbpPence(account, t.amountPence);
    if (gbpPence === null) continue;

    const period = bucketDate(t.date, granularity);
    const bucket = buckets.get(period) ?? {};

    const splits = t.splitOverride ?? account.owners;
    for (const split of splits) {
      const share = Math.round(gbpPence * (split.sharePercent / 100));
      bucket[split.personId] = (bucket[split.personId] ?? 0) + share;
    }
    buckets.set(period, bucket);
  }

  return Array.from(buckets.entries())
    .map(([period, perPersonNetGbpPence]) => ({
      period,
      perPersonNetGbpPence: Object.fromEntries(persons.map((p) => [p.id, perPersonNetGbpPence[p.id] ?? 0])),
    }))
    .sort((a, b) => (a.period < b.period ? -1 : 1));
}
