import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../src/db/client';
import { useAppStore } from '../../src/state/store';
import * as transactionsRepo from '../../src/db/transactionsRepo';
import * as categoriesRepo from '../../src/db/categoriesRepo';
import { createId, nowIso } from '../../src/domain/id';
import type { Transaction } from '../../src/domain/types';

async function clearAllStores() {
  const db = await getDb();
  await db.clear('accounts');
  await db.clear('persons');
  await db.clear('statementImports');
  await db.clear('transactions');
  await db.clear('transfers');
  await db.clear('valuationSnapshots');
  await db.clear('categories');
}

beforeEach(async () => {
  await clearAllStores();
  useAppStore.setState({
    persons: [],
    accounts: [],
    transactions: [],
    transfers: [],
    valuationSnapshots: [],
    categories: [],
    loaded: false,
  });
});

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: createId(),
    accountId: 'acc1',
    statementImportId: 'import1',
    date: '2026-01-05',
    description: 'TEST TXN',
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

describe('useAppStore.refresh', () => {
  it('preserves a collection\'s array reference when its data is unchanged, and replaces one that changed', async () => {
    await categoriesRepo.createCategory('Custom A');
    await transactionsRepo.insertMany([makeTransaction()]);

    await useAppStore.getState().refresh();
    const firstCategories = useAppStore.getState().categories;
    const firstTransactions = useAppStore.getState().transactions;
    expect(firstCategories).toHaveLength(1);
    expect(firstTransactions).toHaveLength(1);

    // Only transactions actually changed between these two refreshes.
    await transactionsRepo.insertMany([makeTransaction()]);
    await useAppStore.getState().refresh();

    expect(useAppStore.getState().categories).toBe(firstCategories);
    expect(useAppStore.getState().transactions).not.toBe(firstTransactions);
    expect(useAppStore.getState().transactions).toHaveLength(2);
  });

  it('preserves every reference when refreshing twice with no changes in between', async () => {
    await transactionsRepo.insertMany([makeTransaction()]);
    await useAppStore.getState().refresh();
    const first = useAppStore.getState();

    await useAppStore.getState().refresh();
    const second = useAppStore.getState();

    expect(second.persons).toBe(first.persons);
    expect(second.accounts).toBe(first.accounts);
    expect(second.transactions).toBe(first.transactions);
    expect(second.transfers).toBe(first.transfers);
    expect(second.valuationSnapshots).toBe(first.valuationSnapshots);
    expect(second.categories).toBe(first.categories);
  });
});
