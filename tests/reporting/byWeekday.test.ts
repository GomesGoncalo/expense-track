import { describe, expect, it } from 'vitest';
import { computeSpendingByWeekday } from '../../src/reporting/byWeekday';
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

describe('computeSpendingByWeekday', () => {
  it('buckets spend by weekday, Monday-first', () => {
    // 2026-01-05 is a Monday, 2026-01-11 is a Sunday.
    const transactions = [
      makeTransaction({ date: '2026-01-05', amountPence: -1000 }),
      makeTransaction({ date: '2026-01-11', amountPence: -2000 }),
    ];
    const result = computeSpendingByWeekday(transactions, '2026-01-01', '2026-01-31');
    expect(result).toHaveLength(7);
    expect(result[0]).toEqual({ weekday: 0, label: 'Mon', expensePence: 1000 });
    expect(result[6]).toEqual({ weekday: 6, label: 'Sun', expensePence: 2000 });
    expect(result[1].expensePence).toBe(0);
  });

  it('excludes income, confirmed transfers, and out-of-period transactions', () => {
    const transactions = [
      makeTransaction({ date: '2026-01-05', amountPence: 1000 }),
      makeTransaction({ date: '2026-01-05', amountPence: -1000, transferId: 'xfer1' }),
      makeTransaction({ date: '2025-12-29', amountPence: -1000 }),
    ];
    const result = computeSpendingByWeekday(transactions, '2026-01-01', '2026-01-31');
    expect(result.reduce((sum, w) => sum + w.expensePence, 0)).toBe(0);
  });
});
