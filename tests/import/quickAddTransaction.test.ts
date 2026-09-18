import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../src/db/client';
import * as accountsRepo from '../../src/db/accountsRepo';
import * as transactionsRepo from '../../src/db/transactionsRepo';
import * as statementImportsRepo from '../../src/db/statementImportsRepo';
import * as transfersRepo from '../../src/db/transfersRepo';
import { findDuplicateTransaction, quickAddTransaction } from '../../src/import/quickAddTransaction';
import type { CreateAccountInput } from '../../src/db/accountsRepo';

async function clearAllStores() {
  const db = await getDb();
  await db.clear('accounts');
  await db.clear('statementImports');
  await db.clear('transactions');
  await db.clear('transfers');
  await db.clear('valuationSnapshots');
}

beforeEach(async () => {
  await clearAllStores();
});

async function createAccount(overrides: Partial<CreateAccountInput> = {}) {
  return accountsRepo.createAccount({
    name: 'HSBC Current',
    bank: 'hsbc',
    accountType: 'current',
    currency: 'GBP',
    valuationBased: false,
    owners: [],
    ...overrides,
  });
}

describe('quickAddTransaction', () => {
  it('inserts a transaction attributed to a synthetic "Manual entries" import', async () => {
    const account = await createAccount();

    const transaction = await quickAddTransaction({
      account,
      date: '2026-02-10',
      description: 'Corner shop',
      amountPence: -450,
      category: null,
      splitOverride: null,
    });

    const stored = await transactionsRepo.getTransaction(transaction.id);
    expect(stored?.accountId).toBe(account.id);
    expect(stored?.amountPence).toBe(-450);

    const manualImport = await statementImportsRepo.getOrCreateManualImport(account);
    expect(stored?.statementImportId).toBe(manualImport.id);
  });

  it('reuses the same synthetic import across multiple quick-adds for the same account', async () => {
    const account = await createAccount();

    const first = await quickAddTransaction({
      account,
      date: '2026-02-10',
      description: 'Corner shop',
      amountPence: -450,
      category: null,
      splitOverride: null,
    });
    const second = await quickAddTransaction({
      account,
      date: '2026-02-11',
      description: 'Coffee',
      amountPence: -320,
      category: null,
      splitOverride: null,
    });

    expect(first.statementImportId).toBe(second.statementImportId);

    const db = await getDb();
    const allImports = await db.getAll('statementImports');
    expect(allImports.filter((i) => i.accountId === account.id)).toHaveLength(1);
  });

  it('auto-categorizes using the same keyword rules as PDF import', async () => {
    const account = await createAccount();

    const transaction = await quickAddTransaction({
      account,
      date: '2026-02-10',
      description: 'TESCO STORES 1234',
      amountPence: -1200,
      category: null,
      splitOverride: null,
    });

    expect(transaction.category).toBe('Groceries');
  });

  it('respects an explicit category over the auto-guess', async () => {
    const account = await createAccount();

    const transaction = await quickAddTransaction({
      account,
      date: '2026-02-10',
      description: 'TESCO STORES 1234',
      amountPence: -1200,
      category: 'Entertainment',
      splitOverride: null,
    });

    expect(transaction.category).toBe('Entertainment');
  });

  it('reports an existing transaction as a duplicate without inserting a second one', async () => {
    const account = await createAccount();
    await quickAddTransaction({
      account,
      date: '2026-02-10',
      description: 'Corner shop',
      amountPence: -450,
      category: null,
      splitOverride: null,
    });

    const duplicate = await findDuplicateTransaction(account, '2026-02-10', 'Corner shop', -450);
    expect(duplicate).toBeDefined();
    expect(duplicate?.description).toBe('Corner shop');

    const notDuplicate = await findDuplicateTransaction(account, '2026-02-11', 'Corner shop', -450);
    expect(notDuplicate).toBeUndefined();
  });

  it('re-runs transfer matching so a manually-added leg can be matched against an existing one', async () => {
    const accountA = await createAccount({ name: 'HSBC Current', bank: 'hsbc' });
    const accountB = await createAccount({ name: 'Monzo Current', bank: 'monzo' });

    await quickAddTransaction({
      account: accountA,
      date: '2026-02-10',
      description: 'TRANSFER TO MONZO',
      amountPence: -5000,
      category: null,
      splitOverride: null,
    });
    await quickAddTransaction({
      account: accountB,
      date: '2026-02-10',
      description: 'TRANSFER FROM HSBC',
      amountPence: 5000,
      category: null,
      splitOverride: null,
    });

    const suggested = await transfersRepo.listByStatus('suggested');
    expect(suggested).toHaveLength(1);
  });
});
