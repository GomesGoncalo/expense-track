import { describe, expect, it } from 'vitest';
import { computeInsights } from '../../src/reporting/insights';
import { createId, nowIso } from '../../src/domain/id';
import type { Transaction, Transfer } from '../../src/domain/types';

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

function makeTransfer(overrides: Partial<Transfer> = {}): Transfer {
  return {
    id: createId(),
    outgoingTransactionId: 'out1',
    incomingTransactionId: 'in1',
    status: 'suggested',
    matchConfidence: 0.8,
    createdAt: nowIso(),
    resolvedAt: null,
    ...overrides,
  };
}

/** ISO date for a given day-of-month, N calendar months before the current one. */
function dateInMonth(monthsAgo: number, day: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  d.setDate(day);
  return d.toISOString().slice(0, 10);
}

describe('computeInsights', () => {
  it('returns no insights when there is no data at all', () => {
    expect(computeInsights([])).toEqual([]);
  });

  it('flags the biggest category increase and decrease vs last month', () => {
    const transactions = [
      makeTransaction({ date: dateInMonth(1, 5), category: 'Groceries', amountPence: -3000 }),
      makeTransaction({ date: dateInMonth(1, 6), category: 'Transport', amountPence: -500 }),
      makeTransaction({ date: dateInMonth(0, 5), category: 'Groceries', amountPence: -5000 }),
      makeTransaction({ date: dateInMonth(0, 6), category: 'Transport', amountPence: -100 }),
    ];

    const insights = computeInsights(transactions);
    const increase = insights.find((i) => i.id === 'category-increase');
    const decrease = insights.find((i) => i.id === 'category-decrease');

    expect(increase?.category).toBe('Groceries');
    expect(increase?.message).toContain('£20.00');
    expect(decrease?.category).toBe('Transport');
    expect(decrease?.message).toContain('£4.00');
  });

  it('does not report a category comparison when there is no prior month to compare against', () => {
    const transactions = [makeTransaction({ date: dateInMonth(0, 5), category: 'Groceries', amountPence: -3000 })];
    const insights = computeInsights(transactions);
    expect(insights.find((i) => i.id === 'category-increase')).toBeUndefined();
    expect(insights.find((i) => i.id === 'category-decrease')).toBeUndefined();
  });

  it('flags unusual spending when this month is far above the trailing 3-month baseline', () => {
    const transactions = [
      makeTransaction({ date: dateInMonth(3, 10), category: 'Entertainment', amountPence: -1000 }),
      makeTransaction({ date: dateInMonth(2, 10), category: 'Entertainment', amountPence: -1000 }),
      makeTransaction({ date: dateInMonth(1, 10), category: 'Entertainment', amountPence: -1000 }),
      makeTransaction({ date: dateInMonth(0, 10), category: 'Entertainment', amountPence: -6000 }),
    ];

    const insights = computeInsights(transactions);
    const unusual = insights.find((i) => i.id === 'unusual-Entertainment');
    expect(unusual).toBeDefined();
    expect(unusual?.tone).toBe('warning');
  });

  it('does not flag unusual spending without a full 3-month baseline', () => {
    const transactions = [
      makeTransaction({ date: dateInMonth(1, 10), category: 'Entertainment', amountPence: -1000 }),
      makeTransaction({ date: dateInMonth(0, 10), category: 'Entertainment', amountPence: -6000 }),
    ];
    const insights = computeInsights(transactions);
    expect(insights.find((i) => i.id === 'unusual-Entertainment')).toBeUndefined();
  });

  it('flags a net-negative month', () => {
    const transactions = [
      makeTransaction({ date: dateInMonth(0, 1), amountPence: 100000, category: 'Income' }),
      makeTransaction({ date: dateInMonth(0, 15), amountPence: -150000, category: 'Housing' }),
    ];
    const insights = computeInsights(transactions);
    const netNegative = insights.find((i) => i.id === 'net-negative');
    expect(netNegative).toBeDefined();
    expect(netNegative?.tone).toBe('warning');
  });

  it('does not flag net-negative for a month with more income than expense', () => {
    const transactions = [
      makeTransaction({ date: dateInMonth(0, 1), amountPence: 200000, category: 'Income' }),
      makeTransaction({ date: dateInMonth(0, 15), amountPence: -50000, category: 'Housing' }),
    ];
    const insights = computeInsights(transactions);
    expect(insights.find((i) => i.id === 'net-negative')).toBeUndefined();
  });

  it('caps the number of returned insights even when many categories look unusual', () => {
    const transactions: Transaction[] = [];
    const categories = ['Groceries', 'Transport', 'Entertainment', 'Dining & Takeout', 'Shopping', 'Utilities'];
    for (const category of categories) {
      transactions.push(makeTransaction({ date: dateInMonth(3, 5), category, amountPence: -1000 }));
      transactions.push(makeTransaction({ date: dateInMonth(2, 5), category, amountPence: -1000 }));
      transactions.push(makeTransaction({ date: dateInMonth(1, 5), category, amountPence: -1000 }));
      transactions.push(makeTransaction({ date: dateInMonth(0, 5), category, amountPence: -9000 }));
    }
    const insights = computeInsights(transactions);
    expect(insights.length).toBeLessThanOrEqual(4);
    expect(insights.filter((i) => i.id.startsWith('unusual-')).length).toBeGreaterThan(0);
  });

  it('flags a single pending transfer suggestion, linking to Transactions', () => {
    const outgoing = makeTransaction({ id: 'out1', amountPence: -5000 });
    const transfers = [makeTransfer({ outgoingTransactionId: 'out1' })];
    const insights = computeInsights([outgoing], transfers);
    const pending = insights.find((i) => i.id === 'pending-transfers');
    expect(pending).toBeDefined();
    expect(pending?.tone).toBe('warning');
    expect(pending?.to).toBe('/transactions');
    expect(pending?.message).toContain('1 suggested transfer');
    expect(pending?.message).toContain('£50.00');
  });

  it('sums and pluralizes multiple pending transfer suggestions', () => {
    const out1 = makeTransaction({ id: 'out1', amountPence: -5000 });
    const out2 = makeTransaction({ id: 'out2', amountPence: -2500 });
    const transfers = [
      makeTransfer({ outgoingTransactionId: 'out1' }),
      makeTransfer({ outgoingTransactionId: 'out2' }),
    ];
    const insights = computeInsights([out1, out2], transfers);
    const pending = insights.find((i) => i.id === 'pending-transfers');
    expect(pending?.message).toContain('2 suggested transfers');
    expect(pending?.message).toContain('£75.00');
  });

  it('does not flag confirmed or rejected transfers as pending', () => {
    const outgoing = makeTransaction({ id: 'out1', amountPence: -5000 });
    const transfers = [
      makeTransfer({ outgoingTransactionId: 'out1', status: 'confirmed' }),
      makeTransfer({ outgoingTransactionId: 'out1', status: 'rejected' }),
    ];
    const insights = computeInsights([outgoing], transfers);
    expect(insights.find((i) => i.id === 'pending-transfers')).toBeUndefined();
  });

  it('prioritizes the pending-transfers insight over the cap so it is never dropped', () => {
    const transactions: Transaction[] = [];
    const categories = ['Groceries', 'Transport', 'Entertainment', 'Dining & Takeout', 'Shopping', 'Utilities'];
    for (const category of categories) {
      transactions.push(makeTransaction({ date: dateInMonth(3, 5), category, amountPence: -1000 }));
      transactions.push(makeTransaction({ date: dateInMonth(2, 5), category, amountPence: -1000 }));
      transactions.push(makeTransaction({ date: dateInMonth(1, 5), category, amountPence: -1000 }));
      transactions.push(makeTransaction({ date: dateInMonth(0, 5), category, amountPence: -9000 }));
    }
    transactions.push(makeTransaction({ id: 'out1', date: dateInMonth(0, 6), amountPence: -5000 }));
    const transfers = [makeTransfer({ outgoingTransactionId: 'out1' })];

    const insights = computeInsights(transactions, transfers);
    expect(insights.length).toBeLessThanOrEqual(4);
    expect(insights[0].id).toBe('pending-transfers');
  });
});
