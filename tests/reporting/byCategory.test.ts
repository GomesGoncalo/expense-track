import { describe, expect, it } from 'vitest';
import { computeSpendingByCategory } from '../../src/reporting/byCategory';
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
});
