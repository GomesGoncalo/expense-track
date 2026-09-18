import { describe, expect, it } from 'vitest';
import { computeRecurringPayments } from '../../src/reporting/recurring';
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

describe('computeRecurringPayments', () => {
  it('detects a weekly direct debit even when its amount varies', () => {
    const transactions = [
      makeTransaction({ date: '2026-08-03', description: 'DD MONEYBOX', amountPence: -5000 }),
      makeTransaction({ date: '2026-08-10', description: 'DD MONEYBOX', amountPence: -15000 }),
      makeTransaction({ date: '2026-08-17', description: 'DD MONEYBOX', amountPence: -5000 }),
      makeTransaction({ date: '2026-08-24', description: 'DD MONEYBOX', amountPence: -5000 }),
    ];
    const result = computeRecurringPayments(transactions);
    expect(result).toHaveLength(1);
    expect(result[0].occurrences).toBe(4);
    expect(result[0].averageIntervalDays).toBeCloseTo(7, 5);
    expect(result[0].averageAmountPence).toBe(7500);
  });

  it('ignores irregular repeats of the same payee (not a recurring cadence)', () => {
    const transactions = [
      makeTransaction({ date: '2026-07-21', description: 'IAP BROMLEY RINGO ECOM UXBRIDGE', amountPence: -530 }),
      makeTransaction({ date: '2026-07-28', description: 'IAP BROMLEY RINGO ECOM UXBRIDGE', amountPence: -530 }),
      makeTransaction({ date: '2026-07-29', description: 'IAP BROMLEY RINGO ECOM UXBRIDGE', amountPence: -95 }),
      makeTransaction({ date: '2026-07-29', description: 'IAP BROMLEY RINGO ECOM UXBRIDGE', amountPence: -100 }),
    ];
    expect(computeRecurringPayments(transactions)).toEqual([]);
  });

  it('groups a merchant across changing reference numbers', () => {
    const transactions = [
      makeTransaction({ date: '2026-06-01', description: 'REF 1234 GYM MEMBERSHIP', amountPence: -3000 }),
      makeTransaction({ date: '2026-07-01', description: 'REF 5678 GYM MEMBERSHIP', amountPence: -3000 }),
      makeTransaction({ date: '2026-08-01', description: 'REF 9012 GYM MEMBERSHIP', amountPence: -3000 }),
    ];
    const result = computeRecurringPayments(transactions);
    expect(result).toHaveLength(1);
    expect(result[0].occurrences).toBe(3);
  });

  it('ignores a single occurrence', () => {
    expect(computeRecurringPayments([makeTransaction()])).toEqual([]);
  });

  it('ignores incoming transactions and confirmed transfers', () => {
    const transactions = [
      makeTransaction({ date: '2026-01-01', description: 'SALARY', amountPence: 200000 }),
      makeTransaction({ date: '2026-02-01', description: 'SALARY', amountPence: 200000 }),
      makeTransaction({ date: '2026-01-05', description: 'TO SAVINGS', amountPence: -5000, transferId: 'xfer1' }),
      makeTransaction({ date: '2026-02-05', description: 'TO SAVINGS', amountPence: -5000, transferId: 'xfer2' }),
    ];
    expect(computeRecurringPayments(transactions)).toEqual([]);
  });

  it('excludes two same-day duplicate charges (too tight a gap to be a cadence)', () => {
    const transactions = [
      makeTransaction({ date: '2026-01-01', description: 'CAR PARK', amountPence: -200 }),
      makeTransaction({ date: '2026-01-01', description: 'CAR PARK', amountPence: -200 }),
    ];
    expect(computeRecurringPayments(transactions)).toEqual([]);
  });
});
