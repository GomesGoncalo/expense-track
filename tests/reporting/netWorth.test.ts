import { describe, expect, it } from 'vitest';
import {
  computeLatestBalances,
  computeNetWorthDrawdown,
  computeNetWorthSeries,
  computeNetWorthSummary,
} from '../../src/reporting/netWorth';
import type { NetWorthPoint } from '../../src/reporting/netWorth';
import { createId, nowIso } from '../../src/domain/id';
import type { Account, Transaction, ValuationSnapshot } from '../../src/domain/types';

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: createId(),
    name: 'Test account',
    bank: 'hsbc',
    accountType: 'current',
    currency: 'GBP',
    valuationBased: false,
    manualRateToGbp: null,
    owners: [],
    createdAt: nowIso(),
    archived: false,
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: createId(),
    accountId: 'acc',
    statementImportId: 'import1',
    date: '2026-01-01',
    description: 'TXN',
    amountPence: -100,
    balancePence: 1000,
    currency: 'GBP',
    dedupeHash: createId(),
    transferId: null,
    category: null,
    createdAt: nowIso(),
    ...overrides,
  };
}

describe('computeLatestBalances', () => {
  it('uses the most recent dated transaction balance for a ledger account', () => {
    const account = makeAccount({ id: 'acc1' });
    const transactions = [
      makeTransaction({ accountId: 'acc1', date: '2026-01-01', balancePence: 1000 }),
      makeTransaction({ accountId: 'acc1', date: '2026-01-10', balancePence: 1500 }),
      makeTransaction({ accountId: 'acc1', date: '2026-01-05', balancePence: 1200 }),
    ];
    const balances = computeLatestBalances([account], transactions, []);
    expect(balances).toHaveLength(1);
    expect(balances[0].latestBalancePence).toBe(1500);
    expect(balances[0].asOfDate).toBe('2026-01-10');
  });

  it('uses the latest valuation snapshot for a valuation-based account', () => {
    const account = makeAccount({ id: 'acc2', valuationBased: true, accountType: 'investment' });
    const snapshots: ValuationSnapshot[] = [
      {
        id: createId(),
        accountId: 'acc2',
        date: '2026-01-01',
        valuePence: 500000,
        source: 'statement',
        statementImportId: 'import1',
        createdAt: nowIso(),
      },
      {
        id: createId(),
        accountId: 'acc2',
        date: '2026-02-01',
        valuePence: 520000,
        source: 'manual',
        statementImportId: null,
        createdAt: nowIso(),
      },
    ];
    const balances = computeLatestBalances([account], [], snapshots);
    expect(balances[0].latestBalancePence).toBe(520000);
    expect(balances[0].asOfDate).toBe('2026-02-01');
  });

  it('excludes accounts with no data yet', () => {
    const account = makeAccount({ id: 'acc3' });
    expect(computeLatestBalances([account], [], [])).toHaveLength(0);
  });

  it('excludes archived accounts', () => {
    const account = makeAccount({ id: 'acc4', archived: true });
    const transactions = [makeTransaction({ accountId: 'acc4', balancePence: 999 })];
    expect(computeLatestBalances([account], transactions, [])).toHaveLength(0);
  });
});

describe('computeNetWorthSummary', () => {
  it('sums same-currency accounts directly into the combined GBP total', () => {
    const accA = makeAccount({ id: 'a', currency: 'GBP' });
    const accB = makeAccount({ id: 'b', currency: 'GBP' });
    const transactions = [
      makeTransaction({ accountId: 'a', balancePence: 10000 }),
      makeTransaction({ accountId: 'b', balancePence: 5000 }),
    ];
    const summary = computeNetWorthSummary([accA, accB], transactions, []);
    expect(summary.combinedGbpTotalPence).toBe(15000);
    expect(summary.accountsMissingRate).toHaveLength(0);
  });

  it('converts a non-GBP account using its manual rate', () => {
    const gbpAccount = makeAccount({ id: 'a', currency: 'GBP' });
    const eurAccount = makeAccount({ id: 'b', currency: 'EUR', manualRateToGbp: 0.85 });
    const transactions = [
      makeTransaction({ accountId: 'a', balancePence: 10000 }),
      makeTransaction({ accountId: 'b', balancePence: 10000, currency: 'EUR' }),
    ];
    const summary = computeNetWorthSummary([gbpAccount, eurAccount], transactions, []);
    expect(summary.combinedGbpTotalPence).toBe(10000 + Math.round(10000 * 0.85));

    const eurSubtotal = summary.subtotalsByCurrency.find((s) => s.currency === 'EUR');
    expect(eurSubtotal?.totalPence).toBe(10000);
  });

  it('excludes a non-GBP account without a manual rate from the combined total', () => {
    const eurAccount = makeAccount({ id: 'b', currency: 'EUR', manualRateToGbp: null });
    const transactions = [makeTransaction({ accountId: 'b', balancePence: 10000, currency: 'EUR' })];
    const summary = computeNetWorthSummary([eurAccount], transactions, []);
    expect(summary.combinedGbpTotalPence).toBe(0);
    expect(summary.accountsMissingRate).toHaveLength(1);
  });
});

describe('computeNetWorthSeries', () => {
  it('forward-fills balances across accounts with sparse dates', () => {
    const accA = makeAccount({ id: 'a', currency: 'GBP' });
    const accB = makeAccount({ id: 'b', currency: 'GBP' });
    const transactions = [
      makeTransaction({ accountId: 'a', date: '2026-01-01', balancePence: 1000 }),
      makeTransaction({ accountId: 'b', date: '2026-01-02', balancePence: 2000 }),
      makeTransaction({ accountId: 'a', date: '2026-01-05', balancePence: 1500 }),
    ];
    const series = computeNetWorthSeries([accA, accB], transactions, [], 'day');

    expect(series.map((p) => p.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-05']);
    // on 2026-01-02, account A has no new point but should forward-fill 1000
    expect(series[1].totalGbpPence).toBe(1000 + 2000);
    expect(series[1].perAccountGbpPence).toEqual({ a: 1000, b: 2000 });
    // on 2026-01-05, account B forward-fills 2000, account A updates to 1500
    expect(series[2].totalGbpPence).toBe(1500 + 2000);
    expect(series[2].perAccountGbpPence).toEqual({ a: 1500, b: 2000 });
  });

  it('omits an account from perAccountGbpPence when it has no manual conversion rate', () => {
    const gbpAccount = makeAccount({ id: 'a', currency: 'GBP' });
    const eurAccount = makeAccount({ id: 'b', currency: 'EUR', manualRateToGbp: null });
    const transactions = [
      makeTransaction({ accountId: 'a', date: '2026-01-01', balancePence: 1000 }),
      makeTransaction({ accountId: 'b', date: '2026-01-01', balancePence: 5000, currency: 'EUR' }),
    ];
    const series = computeNetWorthSeries([gbpAccount, eurAccount], transactions, [], 'day');
    expect(series[0].perAccountGbpPence).toEqual({ a: 1000 });
    expect(series[0].perAccountPence).toEqual({ a: 1000, b: 5000 });
  });

  it('returns an empty series when there is no data', () => {
    expect(computeNetWorthSeries([makeAccount()], [], [], 'day')).toEqual([]);
  });
});

function makePoint(date: string, totalGbpPence: number): NetWorthPoint {
  return { date, totalGbpPence, perAccountPence: {}, perAccountGbpPence: {} };
}

describe('computeNetWorthDrawdown', () => {
  it('reports no drawdown when the latest point is the all-time high', () => {
    const series = [makePoint('2026-01-01', 1000), makePoint('2026-02-01', 2000)];
    const result = computeNetWorthDrawdown(series);
    expect(result?.peakGbpPence).toBe(2000);
    expect(result?.currentGbpPence).toBe(2000);
    expect(result?.drawdownPence).toBe(0);
    expect(result?.drawdownPercent).toBe(0);
  });

  it('reports a negative drawdown when below the historical peak', () => {
    const series = [makePoint('2026-01-01', 1000), makePoint('2026-02-01', 2000), makePoint('2026-03-01', 1500)];
    const result = computeNetWorthDrawdown(series);
    expect(result?.peakGbpPence).toBe(2000);
    expect(result?.peakDate).toBe('2026-02-01');
    expect(result?.currentGbpPence).toBe(1500);
    expect(result?.drawdownPence).toBe(-500);
    expect(result?.drawdownPercent).toBeCloseTo(-25, 5);
  });

  it('returns null drawdownPercent when the peak is not positive', () => {
    const series = [makePoint('2026-01-01', -500)];
    const result = computeNetWorthDrawdown(series);
    expect(result?.drawdownPercent).toBeNull();
  });

  it('returns null for an empty series', () => {
    expect(computeNetWorthDrawdown([])).toBeNull();
  });
});
