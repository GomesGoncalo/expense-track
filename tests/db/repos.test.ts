import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../src/db/client';
import * as accountsRepo from '../../src/db/accountsRepo';
import * as transactionsRepo from '../../src/db/transactionsRepo';
import * as transfersRepo from '../../src/db/transfersRepo';
import * as statementImportsRepo from '../../src/db/statementImportsRepo';
import { createId, nowIso } from '../../src/domain/id';
import type { Transaction } from '../../src/domain/types';

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

describe('accountsRepo', () => {
  it('creates and lists accounts', async () => {
    const account = await accountsRepo.createAccount({
      name: 'HSBC Current',
      bank: 'hsbc',
      accountType: 'current',
      currency: 'GBP',
      valuationBased: false,
    });
    const all = await accountsRepo.listAccounts();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(account.id);
    expect(all[0].manualRateToGbp).toBeNull();
  });

  it('archives an account without deleting it', async () => {
    const account = await accountsRepo.createAccount({
      name: 'Old account',
      bank: 'monzo',
      accountType: 'current',
      currency: 'GBP',
      valuationBased: false,
    });
    await accountsRepo.archiveAccount(account.id);
    const fetched = await accountsRepo.getAccount(account.id);
    expect(fetched?.archived).toBe(true);
  });

  it('cascade-deletes an account, its transactions, imports, and transfers', async () => {
    const accountA = await accountsRepo.createAccount({
      name: 'A',
      bank: 'hsbc',
      accountType: 'current',
      currency: 'GBP',
      valuationBased: false,
    });
    const accountB = await accountsRepo.createAccount({
      name: 'B',
      bank: 'monzo',
      accountType: 'current',
      currency: 'GBP',
      valuationBased: false,
    });

    const outgoing = makeTransaction({ accountId: accountA.id, amountPence: -500 });
    const incoming = makeTransaction({ accountId: accountB.id, amountPence: 500 });
    await transactionsRepo.insertMany([outgoing, incoming]);
    const transfer = await transfersRepo.createManual(outgoing.id, incoming.id);

    await accountsRepo.deleteAccountCascade(accountA.id);

    expect(await accountsRepo.getAccount(accountA.id)).toBeUndefined();
    expect(await transactionsRepo.listByAccount(accountA.id)).toHaveLength(0);
    const remainingTransfers = await transfersRepo.listAll();
    expect(remainingTransfers.find((t) => t.id === transfer.id)).toBeUndefined();
    // account B and its transaction are untouched
    expect(await accountsRepo.getAccount(accountB.id)).toBeDefined();
    expect(await transactionsRepo.getTransaction(incoming.id)).toBeDefined();
  });
});

describe('transactionsRepo', () => {
  it('finds a transaction by dedupe hash within the same account only', async () => {
    const hash = 'shared-hash';
    const txnA = makeTransaction({ accountId: 'accA', dedupeHash: hash });
    const txnB = makeTransaction({ accountId: 'accB', dedupeHash: hash });
    await transactionsRepo.insertMany([txnA, txnB]);

    expect((await transactionsRepo.findByHash('accA', hash))?.id).toBe(txnA.id);
    expect((await transactionsRepo.findByHash('accB', hash))?.id).toBe(txnB.id);
    expect(await transactionsRepo.findByHash('accC', hash)).toBeUndefined();
  });
});

describe('statementImportsRepo', () => {
  it('detects an already-imported file by raw text hash', async () => {
    await statementImportsRepo.createStatementImport({
      id: createId(),
      accountId: 'acc1',
      fileName: 'jan.pdf',
      bank: 'hsbc',
      importedAt: nowIso(),
      statementPeriodStart: null,
      statementPeriodEnd: null,
      pageCount: 1,
      rawTextHash: 'hash-abc',
      columnMappingUsed: null,
      transactionCount: 3,
      status: 'committed',
    });

    expect(await statementImportsRepo.findByRawTextHash('acc1', 'hash-abc')).toBeDefined();
    expect(await statementImportsRepo.findByRawTextHash('acc1', 'hash-xyz')).toBeUndefined();
    expect(await statementImportsRepo.findByRawTextHash('acc2', 'hash-abc')).toBeUndefined();
  });
});

describe('transfersRepo', () => {
  it('confirming a suggested transfer links both transaction legs', async () => {
    const outgoing = makeTransaction({ accountId: 'accA', amountPence: -1000 });
    const incoming = makeTransaction({ accountId: 'accB', amountPence: 1000 });
    await transactionsRepo.insertMany([outgoing, incoming]);

    const transfer = await transfersRepo.createSuggested(outgoing.id, incoming.id, 0.9);
    expect((await transactionsRepo.getTransaction(outgoing.id))?.transferId).toBeNull();

    await transfersRepo.confirm(transfer.id);
    expect((await transactionsRepo.getTransaction(outgoing.id))?.transferId).toBe(transfer.id);
    expect((await transactionsRepo.getTransaction(incoming.id))?.transferId).toBe(transfer.id);
  });

  it('rejecting a suggested transfer leaves transactions unlinked', async () => {
    const outgoing = makeTransaction({ accountId: 'accA', amountPence: -1000 });
    const incoming = makeTransaction({ accountId: 'accB', amountPence: 1000 });
    await transactionsRepo.insertMany([outgoing, incoming]);

    const transfer = await transfersRepo.createSuggested(outgoing.id, incoming.id, 0.9);
    await transfersRepo.reject(transfer.id);

    expect((await transactionsRepo.getTransaction(outgoing.id))?.transferId).toBeNull();
    expect(await transfersRepo.hasExistingPair(outgoing.id, incoming.id)).toBe(true);
  });

  it('unlinking a confirmed transfer restores both legs and removes the transfer', async () => {
    const outgoing = makeTransaction({ accountId: 'accA', amountPence: -1000 });
    const incoming = makeTransaction({ accountId: 'accB', amountPence: 1000 });
    await transactionsRepo.insertMany([outgoing, incoming]);
    const transfer = await transfersRepo.createManual(outgoing.id, incoming.id);

    await transfersRepo.unlink(transfer.id);

    expect((await transactionsRepo.getTransaction(outgoing.id))?.transferId).toBeNull();
    expect((await transactionsRepo.getTransaction(incoming.id))?.transferId).toBeNull();
    expect(await transfersRepo.listAll()).toHaveLength(0);
  });
});
