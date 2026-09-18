import { describe, expect, it } from 'vitest';
import { computeCashRunway } from '../../src/reporting/cashRunway';
import { createId, nowIso } from '../../src/domain/id';
import type { Account, Transaction } from '../../src/domain/types';

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: createId(),
    name: 'Account',
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
    accountId: 'acc1',
    statementImportId: 'import1',
    date: '2026-01-15',
    description: 'TXN',
    amountPence: -1000,
    balancePence: 1000,
    currency: 'GBP',
    dedupeHash: createId(),
    transferId: null,
    category: null,
    splitOverride: null,
    createdAt: nowIso(),
    ...overrides,
  };
}

describe('computeCashRunway', () => {
  it('divides liquid cash by the average of the last 3 completed months of expense', () => {
    const current = makeAccount({ id: 'current', accountType: 'current' });
    const transactions = [
      makeTransaction({ accountId: 'current', date: '2026-01-31', balancePence: 300000 }),
      makeTransaction({ accountId: 'current', date: '2025-10-10', amountPence: -100000 }),
      makeTransaction({ accountId: 'current', date: '2025-11-10', amountPence: -100000 }),
      makeTransaction({ accountId: 'current', date: '2025-12-10', amountPence: -100000 }),
      makeTransaction({ accountId: 'current', date: '2026-01-05', amountPence: -50000 }), // in-progress month, excluded
    ];
    const result = computeCashRunway([current], transactions, []);
    expect(result).not.toBeNull();
    expect(result?.liquidCashGbpPence).toBe(300000);
    expect(result?.averageMonthlyExpensePence).toBe(100000);
    expect(result?.runwayMonths).toBeCloseTo(3, 5);
  });

  it('excludes valuation-based and credit-card accounts from liquid cash', () => {
    const current = makeAccount({ id: 'current', accountType: 'current' });
    const investment = makeAccount({ id: 'inv', accountType: 'investment', valuationBased: true });
    const creditCard = makeAccount({ id: 'cc', accountType: 'credit-card' });
    const transactions = [
      makeTransaction({ accountId: 'current', date: '2026-01-31', balancePence: 100000 }),
      makeTransaction({ accountId: 'inv', date: '2026-01-31', balancePence: 5000000 }),
      makeTransaction({ accountId: 'cc', date: '2026-01-31', balancePence: -20000 }),
      makeTransaction({ accountId: 'current', date: '2025-10-10', amountPence: -50000 }),
      makeTransaction({ accountId: 'current', date: '2025-11-10', amountPence: -50000 }),
      makeTransaction({ accountId: 'current', date: '2025-12-10', amountPence: -50000 }),
    ];
    const result = computeCashRunway([current, investment, creditCard], transactions, []);
    expect(result?.liquidCashGbpPence).toBe(100000);
  });

  it('returns null with fewer than 3 completed months to build a baseline from', () => {
    const current = makeAccount({ id: 'current' });
    const transactions = [
      makeTransaction({ accountId: 'current', date: '2025-12-10', amountPence: -1000 }),
      makeTransaction({ accountId: 'current', date: '2026-01-05', amountPence: -1000 }),
    ];
    expect(computeCashRunway([current], transactions, [])).toBeNull();
  });

  it('returns null when there are no transactions at all', () => {
    expect(computeCashRunway([], [], [])).toBeNull();
  });
});
