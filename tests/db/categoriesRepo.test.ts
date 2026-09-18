import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../src/db/client';
import * as categoriesRepo from '../../src/db/categoriesRepo';
import * as transactionsRepo from '../../src/db/transactionsRepo';
import { createId, nowIso } from '../../src/domain/id';
import type { Transaction } from '../../src/domain/types';

async function clearAllStores() {
  const db = await getDb();
  await db.clear('categories');
  await db.clear('transactions');
}

beforeEach(async () => {
  await clearAllStores();
});

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

describe('categoriesRepo', () => {
  it('creates and lists custom categories', async () => {
    const cat = await categoriesRepo.createCategory('Pet Care');
    const all = await categoriesRepo.listCategories();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(cat.id);
    expect(all[0].archived).toBe(false);
  });

  it('rejects a name that collides with a built-in category, case-insensitively', async () => {
    await expect(categoriesRepo.createCategory('groceries')).rejects.toThrow(/already exists/i);
  });

  it('rejects a name that collides with an existing custom category', async () => {
    await categoriesRepo.createCategory('Pet Care');
    await expect(categoriesRepo.createCategory('pet care')).rejects.toThrow(/already exists/i);
  });

  it('rejects a blank name', async () => {
    await expect(categoriesRepo.createCategory('   ')).rejects.toThrow(/required/i);
  });

  it('archives and unarchives a category', async () => {
    const cat = await categoriesRepo.createCategory('Pet Care');
    await categoriesRepo.archiveCategory(cat.id);
    let all = await categoriesRepo.listCategories();
    expect(all[0].archived).toBe(true);

    await categoriesRepo.unarchiveCategory(cat.id);
    all = await categoriesRepo.listCategories();
    expect(all[0].archived).toBe(false);
  });

  it('renameCategory cascades the new name onto every transaction using the old one', async () => {
    const cat = await categoriesRepo.createCategory('Pet Care');
    const t1 = makeTransaction({ category: 'Pet Care' });
    const t2 = makeTransaction({ category: 'Pet Care' });
    const other = makeTransaction({ category: 'Groceries' });
    await transactionsRepo.insertMany([t1, t2, other]);

    await categoriesRepo.renameCategory(cat.id, 'Pets');

    expect((await transactionsRepo.getTransaction(t1.id))?.category).toBe('Pets');
    expect((await transactionsRepo.getTransaction(t2.id))?.category).toBe('Pets');
    expect((await transactionsRepo.getTransaction(other.id))?.category).toBe('Groceries');
    const all = await categoriesRepo.listCategories();
    expect(all[0].name).toBe('Pets');
  });

  it('rejects renaming to a name that already exists', async () => {
    await categoriesRepo.createCategory('Pet Care');
    const other = await categoriesRepo.createCategory('Hobbies');
    await expect(categoriesRepo.renameCategory(other.id, 'Pet Care')).rejects.toThrow(/already exists/i);
  });

  it('deleteCategoryCascade removes the category and clears it back to uncategorized', async () => {
    const cat = await categoriesRepo.createCategory('Pet Care');
    const t1 = makeTransaction({ category: 'Pet Care' });
    const other = makeTransaction({ category: 'Groceries' });
    await transactionsRepo.insertMany([t1, other]);

    await categoriesRepo.deleteCategoryCascade(cat.id);

    expect(await categoriesRepo.listCategories()).toHaveLength(0);
    expect((await transactionsRepo.getTransaction(t1.id))?.category).toBeNull();
    expect((await transactionsRepo.getTransaction(other.id))?.category).toBe('Groceries');
  });
});
