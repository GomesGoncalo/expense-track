import { describe, expect, it } from 'vitest';
import { computeBiggestTransactions } from '../../src/reporting/biggestTransactions';
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

describe('computeBiggestTransactions', () => {
  it('ranks outgoing transactions by size, largest first', () => {
    const transactions = [
      makeTransaction({ description: 'small', amountPence: -500 }),
      makeTransaction({ description: 'big', amountPence: -50000 }),
      makeTransaction({ description: 'medium', amountPence: -5000 }),
    ];
    const result = computeBiggestTransactions(transactions, '2026-01-01', '2026-01-31');
    expect(result.map((t) => t.description)).toEqual(['big', 'medium', 'small']);
  });

  it('excludes income, confirmed transfers, and out-of-period transactions', () => {
    const transactions = [
      makeTransaction({ description: 'income', amountPence: 100000 }),
      makeTransaction({ description: 'transfer', amountPence: -100000, transferId: 'xfer1' }),
      makeTransaction({ description: 'last-month', amountPence: -100000, date: '2025-12-31' }),
    ];
    expect(computeBiggestTransactions(transactions, '2026-01-01', '2026-01-31')).toEqual([]);
  });

  it('respects the limit', () => {
    const transactions = Array.from({ length: 10 }, (_, i) => makeTransaction({ amountPence: -(i + 1) * 100 }));
    expect(computeBiggestTransactions(transactions, '2026-01-01', '2026-01-31', 3)).toHaveLength(3);
  });
});
