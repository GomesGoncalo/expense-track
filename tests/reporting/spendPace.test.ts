import { describe, expect, it } from 'vitest';
import { computeSpendPace } from '../../src/reporting/spendPace';
import { createId, nowIso } from '../../src/domain/id';
import type { Transaction } from '../../src/domain/types';

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: createId(),
    accountId: 'acc1',
    statementImportId: 'import1',
    date: '2026-02-10',
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

describe('computeSpendPace', () => {
  it('projects the month total from spend-so-far / days-elapsed * days-in-month', () => {
    // 2026-02-10 is day 10 of a 28-day February; £100 spent across days 1-10.
    const transactions = [
      makeTransaction({ date: '2026-02-01', amountPence: -5000 }),
      makeTransaction({ date: '2026-02-10', amountPence: -5000 }),
    ];
    const result = computeSpendPace(transactions);
    expect(result).not.toBeNull();
    expect(result?.daysElapsed).toBe(10);
    expect(result?.daysInMonth).toBe(28);
    expect(result?.spendSoFarPence).toBe(10000);
    expect(result?.projectedSpendPence).toBe(Math.round((10000 / 10) * 28));
  });

  it('excludes income and confirmed transfers from spend-so-far', () => {
    const transactions = [
      makeTransaction({ date: '2026-02-05', amountPence: 100000 }),
      makeTransaction({ date: '2026-02-05', amountPence: -2000, transferId: 'xfer1' }),
      makeTransaction({ date: '2026-02-05', amountPence: -1000 }),
    ];
    const result = computeSpendPace(transactions);
    expect(result?.spendSoFarPence).toBe(1000);
  });

  it('excludes transactions from prior months', () => {
    const transactions = [
      makeTransaction({ date: '2026-01-20', amountPence: -5000 }),
      makeTransaction({ date: '2026-02-03', amountPence: -1000 }),
    ];
    const result = computeSpendPace(transactions);
    expect(result?.monthStart).toBe('2026-02-01');
    expect(result?.spendSoFarPence).toBe(1000);
  });

  it('returns null with no transactions', () => {
    expect(computeSpendPace([])).toBeNull();
  });

  it('returns null when nothing has been spent yet this month', () => {
    expect(computeSpendPace([makeTransaction({ date: '2026-02-05', amountPence: 5000 })])).toBeNull();
  });
});
