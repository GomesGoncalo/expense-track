import { describe, expect, it } from 'vitest';
import { computeIncomeExpenseSeries, computeIncomeExpenseSummary } from '../../src/reporting/incomeExpense';
import { createId, nowIso } from '../../src/domain/id';
import type { Transaction } from '../../src/domain/types';

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: createId(),
    accountId: 'acc1',
    statementImportId: 'import1',
    date: '2026-01-15',
    description: 'TXN',
    amountPence: -1000,
    balancePence: null,
    currency: 'GBP',
    dedupeHash: createId(),
    transferId: null,
    category: null,
    splitOverride: null,
    createdAt: nowIso(),
    ...overrides,
  };
}

describe('computeIncomeExpenseSummary', () => {
  it('sums income and expense separately within the period', () => {
    const transactions = [
      makeTransaction({ amountPence: 200000, date: '2026-01-05' }), // salary
      makeTransaction({ amountPence: -3000, date: '2026-01-10' }), // groceries
      makeTransaction({ amountPence: -1500, date: '2026-01-20' }), // subscription
    ];
    const summary = computeIncomeExpenseSummary(transactions, '2026-01-01', '2026-01-31');
    expect(summary.totalIncomePence).toBe(200000);
    expect(summary.totalExpensePence).toBe(4500);
    expect(summary.netPence).toBe(195500);
  });

  it('excludes transactions outside the period', () => {
    const transactions = [
      makeTransaction({ amountPence: -1000, date: '2025-12-31' }),
      makeTransaction({ amountPence: -1000, date: '2026-02-01' }),
      makeTransaction({ amountPence: -1000, date: '2026-01-15' }),
    ];
    const summary = computeIncomeExpenseSummary(transactions, '2026-01-01', '2026-01-31');
    expect(summary.totalExpensePence).toBe(1000);
  });

  it('excludes transactions linked to a transfer', () => {
    const transactions = [
      makeTransaction({ amountPence: -5000, transferId: 'transfer1' }),
      makeTransaction({ amountPence: 5000, transferId: 'transfer1' }),
      makeTransaction({ amountPence: -2000, transferId: null }),
    ];
    const summary = computeIncomeExpenseSummary(transactions, '2026-01-01', '2026-01-31');
    expect(summary.totalIncomePence).toBe(0);
    expect(summary.totalExpensePence).toBe(2000);
  });

  it('breaks totals down per account', () => {
    const transactions = [
      makeTransaction({ accountId: 'a', amountPence: -1000 }),
      makeTransaction({ accountId: 'b', amountPence: 3000 }),
    ];
    const summary = computeIncomeExpenseSummary(transactions, '2026-01-01', '2026-01-31');
    expect(summary.byAccount.a).toEqual({ incomePence: 0, expensePence: 1000 });
    expect(summary.byAccount.b).toEqual({ incomePence: 3000, expensePence: 0 });
  });
});

describe('computeIncomeExpenseSeries', () => {
  it('buckets income and expense by month', () => {
    const transactions = [
      makeTransaction({ amountPence: 200000, date: '2026-01-05' }),
      makeTransaction({ amountPence: -3000, date: '2026-01-20' }),
      makeTransaction({ amountPence: -1500, date: '2026-02-10' }),
    ];
    const series = computeIncomeExpenseSeries(transactions, 'month');
    expect(series).toEqual([
      { period: '2026-01-01', incomePence: 200000, expensePence: 3000 },
      { period: '2026-02-01', incomePence: 0, expensePence: 1500 },
    ]);
  });

  it('excludes confirmed transfers and sorts chronologically', () => {
    const transactions = [
      makeTransaction({ amountPence: -1000, date: '2026-02-05' }),
      makeTransaction({ amountPence: 500, date: '2026-01-05', transferId: 'transfer1' }),
      makeTransaction({ amountPence: 500, date: '2026-01-05' }),
    ];
    const series = computeIncomeExpenseSeries(transactions, 'month');
    expect(series.map((p) => p.period)).toEqual(['2026-01-01', '2026-02-01']);
    expect(series[0].incomePence).toBe(500);
  });
});
