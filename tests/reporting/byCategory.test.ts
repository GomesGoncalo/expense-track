import { describe, expect, it } from 'vitest';
import {
  computeCategorySpendingSeries,
  computeCategorySpendingSeriesForAll,
  computeSpendingByCategory,
} from '../../src/reporting/byCategory';
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

describe('computeSpendingByCategory', () => {
  it('sums expenses per category within the period', () => {
    const transactions = [
      makeTransaction({ amountPence: -3000, category: 'Groceries', date: '2026-01-05' }),
      makeTransaction({ amountPence: -1500, category: 'Groceries', date: '2026-01-20' }),
      makeTransaction({ amountPence: -800, category: 'Transport', date: '2026-01-10' }),
    ];
    const result = computeSpendingByCategory(transactions, '2026-01-01', '2026-01-31');
    expect(result).toEqual([
      { category: 'Groceries', expensePence: 4500 },
      { category: 'Transport', expensePence: 800 },
    ]);
  });

  it('groups uncategorized transactions together', () => {
    const transactions = [
      makeTransaction({ amountPence: -1000, category: null }),
      makeTransaction({ amountPence: -500, category: null }),
    ];
    const result = computeSpendingByCategory(transactions, '2026-01-01', '2026-01-31');
    expect(result).toEqual([{ category: 'Uncategorized', expensePence: 1500 }]);
  });

  it('excludes income, transfers, and out-of-range transactions', () => {
    const transactions = [
      makeTransaction({ amountPence: 5000, category: 'Income', date: '2026-01-05' }),
      makeTransaction({ amountPence: -2000, category: 'Groceries', transferId: 'transfer1', date: '2026-01-05' }),
      makeTransaction({ amountPence: -2000, category: 'Groceries', date: '2025-12-31' }),
      makeTransaction({ amountPence: -1000, category: 'Groceries', date: '2026-01-05' }),
    ];
    const result = computeSpendingByCategory(transactions, '2026-01-01', '2026-01-31');
    expect(result).toEqual([{ category: 'Groceries', expensePence: 1000 }]);
  });

  it('sorts descending by amount', () => {
    const transactions = [
      makeTransaction({ amountPence: -500, category: 'Transport' }),
      makeTransaction({ amountPence: -5000, category: 'Groceries' }),
      makeTransaction({ amountPence: -2000, category: 'Dining & Takeout' }),
    ];
    const result = computeSpendingByCategory(transactions, '2026-01-01', '2026-01-31');
    expect(result.map((r) => r.category)).toEqual(['Groceries', 'Dining & Takeout', 'Transport']);
  });

  it('leaves out categories in excludeCategories entirely', () => {
    const transactions = [
      makeTransaction({ amountPence: -5000, category: 'Groceries' }),
      makeTransaction({ amountPence: -3000, category: 'Savings & Investments' }),
    ];
    const result = computeSpendingByCategory(transactions, '2026-01-01', '2026-01-31', new Set(['Savings & Investments']));
    expect(result).toEqual([{ category: 'Groceries', expensePence: 5000 }]);
  });
});

describe('computeCategorySpendingSeries', () => {
  it('buckets one category by month, ignoring others', () => {
    const transactions = [
      makeTransaction({ amountPence: -3000, category: 'Groceries', date: '2026-01-05' }),
      makeTransaction({ amountPence: -1500, category: 'Groceries', date: '2026-01-20' }),
      makeTransaction({ amountPence: -800, category: 'Transport', date: '2026-01-10' }),
      makeTransaction({ amountPence: -2000, category: 'Groceries', date: '2026-02-03' }),
    ];
    const series = computeCategorySpendingSeries(transactions, 'Groceries', 'month');
    expect(series).toEqual([
      { period: '2026-01-01', expensePence: 4500 },
      { period: '2026-02-01', expensePence: 2000 },
    ]);
  });

  it('drills into Uncategorized when category is null', () => {
    const transactions = [
      makeTransaction({ amountPence: -1000, category: null, date: '2026-01-05' }),
      makeTransaction({ amountPence: -2000, category: 'Groceries', date: '2026-01-05' }),
    ];
    const series = computeCategorySpendingSeries(transactions, null, 'month');
    expect(series).toEqual([{ period: '2026-01-01', expensePence: 1000 }]);
  });

  it('excludes income and transfers', () => {
    const transactions = [
      makeTransaction({ amountPence: 5000, category: 'Groceries', date: '2026-01-05' }),
      makeTransaction({ amountPence: -1000, category: 'Groceries', transferId: 'transfer1', date: '2026-01-05' }),
      makeTransaction({ amountPence: -500, category: 'Groceries', date: '2026-01-05' }),
    ];
    const series = computeCategorySpendingSeries(transactions, 'Groceries', 'month');
    expect(series).toEqual([{ period: '2026-01-01', expensePence: 500 }]);
  });
});

describe('computeCategorySpendingSeriesForAll', () => {
  it('buckets every category by month simultaneously', () => {
    const transactions = [
      makeTransaction({ amountPence: -3000, category: 'Groceries', date: '2026-01-05' }),
      makeTransaction({ amountPence: -800, category: 'Transport', date: '2026-01-10' }),
      makeTransaction({ amountPence: -2000, category: 'Groceries', date: '2026-02-03' }),
    ];
    const series = computeCategorySpendingSeriesForAll(transactions, 'month');
    expect(series).toEqual([
      { period: '2026-01-01', byCategory: { Groceries: 3000, Transport: 800 } },
      { period: '2026-02-01', byCategory: { Groceries: 2000 } },
    ]);
  });

  it('groups uncategorized and respects excludeCategories', () => {
    const transactions = [
      makeTransaction({ amountPence: -1000, category: null, date: '2026-01-05' }),
      makeTransaction({ amountPence: -2000, category: 'Groceries', date: '2026-01-05' }),
      makeTransaction({ amountPence: -500, category: 'Transport', date: '2026-01-05' }),
    ];
    const series = computeCategorySpendingSeriesForAll(transactions, 'month', new Set(['Transport']));
    expect(series).toEqual([{ period: '2026-01-01', byCategory: { Uncategorized: 1000, Groceries: 2000 } }]);
  });

  it('excludes income and transfers', () => {
    const transactions = [
      makeTransaction({ amountPence: 5000, category: 'Income', date: '2026-01-05' }),
      makeTransaction({ amountPence: -1000, category: 'Groceries', transferId: 'transfer1', date: '2026-01-05' }),
    ];
    expect(computeCategorySpendingSeriesForAll(transactions, 'month')).toEqual([]);
  });
});
