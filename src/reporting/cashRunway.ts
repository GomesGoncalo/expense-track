import { computeIncomeExpenseSeries } from './incomeExpense';
import { computeLatestBalances, toGbpPence } from './netWorth';
import { latestDate, periodRange } from '../utils/dates';
import type { Account, Transaction, ValuationSnapshot } from '../domain/types';

export interface CashRunway {
  liquidCashGbpPence: number;
  averageMonthlyExpensePence: number;
  runwayMonths: number;
}

const BASELINE_MONTHS = 3;

/**
 * "How many months could you cover expenses with cash on hand, if income
 * stopped." Liquid cash is the latest GBP-converted balance of
 * non-valuation, non-credit-card accounts (current/savings/cash ISA) —
 * valuation-based accounts (a stocks ISA, an investment account) are
 * excluded since they aren't spendable without selling first, and a credit
 * card's balance is a liability, not cash on hand. Average monthly expense
 * is the mean of the last BASELINE_MONTHS *completed* calendar months (the
 * still-in-progress current month is excluded). Requires a full baseline,
 * not just whatever's there, for the same reason reporting/insights.ts
 * does: with only one or two sparse months of statement history, "average
 * monthly expense" is really "average partial-month expense" and can
 * produce a wildly overstated runway. Returns null short of that.
 */
export function computeCashRunway(
  accounts: Account[],
  transactions: Transaction[],
  valuationSnapshots: ValuationSnapshot[] = [],
): CashRunway | null {
  const accountsById = new Map(accounts.map((a) => [a.id, a]));
  const balances = computeLatestBalances(accounts, transactions, valuationSnapshots);

  let liquidCashGbpPence = 0;
  for (const balance of balances) {
    const account = accountsById.get(balance.accountId);
    if (!account || account.valuationBased || account.accountType === 'credit-card') continue;
    const gbpPence = toGbpPence(account, balance.latestBalancePence);
    if (gbpPence !== null) liquidCashGbpPence += gbpPence;
  }

  const mostRecentDate = latestDate(transactions);
  if (mostRecentDate === null) return null;

  const thisMonthStart = periodRange('this-month', mostRecentDate).start;
  const monthlySeries = computeIncomeExpenseSeries(transactions, 'month');
  // A bucket with no expense at all (e.g. a savings account that only ever
  // posts interest) isn't a "quiet month" worth averaging in — it's just an
  // account with no spending activity, and counting it as a $0 month would
  // understate the true average.
  const priorMonths = monthlySeries
    .filter((p) => p.period < thisMonthStart && p.expensePence > 0)
    .slice(-BASELINE_MONTHS);
  if (priorMonths.length < BASELINE_MONTHS) return null;

  const averageMonthlyExpensePence = priorMonths.reduce((sum, p) => sum + p.expensePence, 0) / priorMonths.length;

  return {
    liquidCashGbpPence,
    averageMonthlyExpensePence,
    runwayMonths: liquidCashGbpPence / averageMonthlyExpensePence,
  };
}
