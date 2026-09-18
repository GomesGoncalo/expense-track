import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../src/db/client';
import * as accountsRepo from '../../src/db/accountsRepo';
import * as transactionsRepo from '../../src/db/transactionsRepo';
import { exportBackup, importBackup, readBackupFile } from '../../src/db/backup';
import { createId, nowIso } from '../../src/domain/id';
import type { Transaction } from '../../src/domain/types';

async function clearAllStores() {
  const db = await getDb();
  await db.clear('persons');
  await db.clear('accounts');
  await db.clear('statementImports');
  await db.clear('transactions');
  await db.clear('transfers');
  await db.clear('valuationSnapshots');
}

beforeEach(async () => {
  await clearAllStores();
});

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: createId(),
    accountId: 'acc1',
    statementImportId: 'import1',
    date: '2026-01-05',
    description: 'TEST TXN',
    amountPence: -1000,
    balancePence: 5000,
    currency: 'GBP',
    dedupeHash: createId(),
    transferId: null,
    category: null,
    createdAt: nowIso(),
    ...overrides,
  };
}

describe('backup export/import round-trip', () => {
  it('exports current state and restores it via replace mode', async () => {
    const account = await accountsRepo.createAccount({
      name: 'HSBC Current',
      bank: 'hsbc',
      accountType: 'current',
      currency: 'GBP',
      valuationBased: false,
      owners: [],
    });
    const txn = makeTransaction({ accountId: account.id });
    await transactionsRepo.insertMany([txn]);

    const backup = await exportBackup();
    expect(backup.accounts).toHaveLength(1);
    expect(backup.transactions).toHaveLength(1);

    await clearAllStores();
    expect(await accountsRepo.listAccounts()).toHaveLength(0);

    const summary = await importBackup(backup, 'replace');
    expect(summary.accountsAdded).toBe(1);
    expect(summary.transactionsAdded).toBe(1);

    const restoredAccounts = await accountsRepo.listAccounts();
    expect(restoredAccounts).toHaveLength(1);
    expect(restoredAccounts[0].id).toBe(account.id);
  });

  it('merge mode skips duplicate ids and duplicate dedupe hashes', async () => {
    const account = await accountsRepo.createAccount({
      name: 'HSBC Current',
      bank: 'hsbc',
      accountType: 'current',
      currency: 'GBP',
      valuationBased: false,
      owners: [],
    });
    const txn = makeTransaction({ accountId: account.id, dedupeHash: 'dup-hash' });
    await transactionsRepo.insertMany([txn]);

    const backup = await exportBackup();
    // simulate re-importing the same backup without wiping first
    const summary = await importBackup(backup, 'merge');

    expect(summary.accountsAdded).toBe(0);
    expect(summary.transactionsAdded).toBe(0);
    expect(summary.transactionsSkippedDuplicate).toBe(1);
    expect(await accountsRepo.listAccounts()).toHaveLength(1);
  });

  it('rejects a backup with an unsupported schema version', async () => {
    const bogus = { schemaVersion: 999, persons: [], accounts: [], statementImports: [], transactions: [], transfers: [], valuationSnapshots: [] };
    // @ts-expect-error intentionally malformed for the test
    await expect(importBackup(bogus, 'replace')).rejects.toThrow(/schema version/i);
  });

  it('readBackupFile parses and validates a File', async () => {
    const account = await accountsRepo.createAccount({
      name: 'HSBC Current',
      bank: 'hsbc',
      accountType: 'current',
      currency: 'GBP',
      valuationBased: false,
      owners: [],
    });
    const backup = await exportBackup();
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });
    const parsed = await readBackupFile(file);
    expect(parsed.accounts[0].id).toBe(account.id);
  });
});
