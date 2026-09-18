import { describe, expect, it } from 'vitest';
import { computeTopMerchants } from '../../src/reporting/merchants';
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

describe('computeTopMerchants', () => {
  it('sums and ranks payees by total spend within the period', () => {
    const transactions = [
      makeTransaction({ description: 'Tesco', amountPence: -3000, date: '2026-01-05' }),
      makeTransaction({ description: 'Tesco', amountPence: -1500, date: '2026-01-20' }),
      makeTransaction({ description: 'DD Halifax', amountPence: -273778, date: '2026-01-03' }),
    ];
    const result = computeTopMerchants(transactions, '2026-01-01', '2026-01-31');
    expect(result).toEqual([
      { description: 'DD Halifax', expensePence: 273778, occurrences: 1 },
      { description: 'Tesco', expensePence: 4500, occurrences: 2 },
    ]);
  });

  it('excludes income, transfers, and transactions outside the period', () => {
    const transactions = [
      makeTransaction({ description: 'Salary', amountPence: 200000, date: '2026-01-05' }),
      makeTransaction({ description: 'To savings', amountPence: -5000, date: '2026-01-05', transferId: 'xfer1' }),
      makeTransaction({ description: 'Tesco', amountPence: -1000, date: '2025-12-31' }),
    ];
    expect(computeTopMerchants(transactions, '2026-01-01', '2026-01-31')).toEqual([]);
  });

  it('respects the limit', () => {
    const transactions = Array.from({ length: 10 }, (_, i) =>
      makeTransaction({ description: `Merchant ${i}`, amountPence: -(i + 1) * 100, date: '2026-01-10' }),
    );
    const result = computeTopMerchants(transactions, '2026-01-01', '2026-01-31', 3);
    expect(result).toHaveLength(3);
    expect(result[0].description).toBe('Merchant 9');
  });
});
