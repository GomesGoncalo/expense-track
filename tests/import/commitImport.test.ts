import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../src/db/client';
import * as accountsRepo from '../../src/db/accountsRepo';
import * as transactionsRepo from '../../src/db/transactionsRepo';
import * as valuationSnapshotsRepo from '../../src/db/valuationSnapshotsRepo';
import * as transfersRepo from '../../src/db/transfersRepo';
import { commitImport } from '../../src/import/commitImport';
import type { ParsedTransactionRow } from '../../src/parsers/BankParser';

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

function row(overrides: Partial<ParsedTransactionRow> = {}): ParsedTransactionRow {
  return {
    date: '2026-01-05',
    description: 'TESCO STORES',
    amountPence: -1234,
    balancePence: 98766,
    currency: 'GBP',
    ...overrides,
  };
}

describe('commitImport', () => {
  it('inserts transactions and records the statement import', async () => {
    const account = await accountsRepo.createAccount({
      name: 'HSBC Current',
      bank: 'hsbc',
      accountType: 'current',
      currency: 'GBP',
      valuationBased: false,
      owners: [],
    });

    const result = await commitImport({
      account,
      fileName: 'jan.pdf',
      rawTextHash: 'hash1',
      pageCount: 1,
      statementPeriodStart: '2026-01-01',
      statementPeriodEnd: '2026-01-31',
      columnMappingUsed: null,
      rows: [row(), row({ date: '2026-01-06', description: 'SALARY', amountPence: 200000 })],
    });

    expect(result.transactionsInserted).toBe(2);
    expect(result.transactionsSkippedDuplicate).toBe(0);

    const transactions = await transactionsRepo.listByAccount(account.id);
    expect(transactions).toHaveLength(2);
  });

  it('auto-categorizes each row on commit', async () => {
    const account = await accountsRepo.createAccount({
      name: 'HSBC Current',
      bank: 'hsbc',
      accountType: 'current',
      currency: 'GBP',
      valuationBased: false,
      owners: [],
    });

    await commitImport({
      account,
      fileName: 'jan.pdf',
      rawTextHash: 'hash1',
      pageCount: 1,
      statementPeriodStart: '2026-01-01',
      statementPeriodEnd: '2026-01-31',
      columnMappingUsed: null,
      rows: [row(), row({ date: '2026-01-06', description: 'SALARY', amountPence: 200000 })],
    });

    const transactions = await transactionsRepo.listByAccount(account.id);
    const byDescription = Object.fromEntries(transactions.map((t) => [t.description, t.category]));
    expect(byDescription['TESCO STORES']).toBe('Groceries');
    expect(byDescription['SALARY']).toBe('Income');
  });

  it('reuses a manually corrected category for a later import with the same description', async () => {
    const account = await accountsRepo.createAccount({
      name: 'HSBC Current',
      bank: 'hsbc',
      accountType: 'current',
      currency: 'GBP',
      valuationBased: false,
      owners: [],
    });

    // "LOCAL CORNER SHOP" doesn't match any keyword rule, so it lands uncategorized...
    await commitImport({
      account,
      fileName: 'jan.pdf',
      rawTextHash: 'hash1',
      pageCount: 1,
      statementPeriodStart: '2026-01-01',
      statementPeriodEnd: '2026-01-31',
      columnMappingUsed: null,
      rows: [row({ description: 'LOCAL CORNER SHOP', amountPence: -400 })],
    });
    const firstPass = await transactionsRepo.listByAccount(account.id);
    expect(firstPass[0].category).toBeNull();

    // ...the user corrects it by hand...
    await transactionsRepo.updateTransaction({ ...firstPass[0], category: 'Groceries' });

    // ...and the next month's statement (a different day, so it's not a dedupe-skipped duplicate)
    // should pick up that same category automatically.
    await commitImport({
      account,
      fileName: 'feb.pdf',
      rawTextHash: 'hash2',
      pageCount: 1,
      statementPeriodStart: '2026-02-01',
      statementPeriodEnd: '2026-02-28',
      columnMappingUsed: null,
      rows: [row({ date: '2026-02-05', description: 'LOCAL CORNER SHOP', amountPence: -450 })],
    });

    const secondPass = await transactionsRepo.listByAccount(account.id);
    const february = secondPass.find((t) => t.date === '2026-02-05');
    expect(february?.category).toBe('Groceries');
  });

  it('skips rows that duplicate an already-imported transaction', async () => {
    const account = await accountsRepo.createAccount({
      name: 'HSBC Current',
      bank: 'hsbc',
      accountType: 'current',
      currency: 'GBP',
      valuationBased: false,
      owners: [],
    });

    const commitInput = {
      account,
      fileName: 'jan.pdf',
      rawTextHash: 'hash1',
      pageCount: 1,
      statementPeriodStart: '2026-01-01',
      statementPeriodEnd: '2026-01-31',
      columnMappingUsed: null,
      rows: [row()],
    };

    await commitImport(commitInput);
    // re-importing an overlapping statement with the same row
    const second = await commitImport({ ...commitInput, fileName: 'jan-reupload.pdf', rawTextHash: 'hash2' });

    expect(second.transactionsInserted).toBe(0);
    expect(second.transactionsSkippedDuplicate).toBe(1);
    expect(await transactionsRepo.listByAccount(account.id)).toHaveLength(1);
  });

  it('creates a valuation snapshot for a valuation-based account from the last row balance', async () => {
    const account = await accountsRepo.createAccount({
      name: 'Vanguard ISA',
      bank: 'vanguard',
      accountType: 'investment',
      currency: 'GBP',
      valuationBased: true,
      owners: [],
    });

    await commitImport({
      account,
      fileName: 'q1.pdf',
      rawTextHash: 'hash1',
      pageCount: 1,
      statementPeriodStart: '2026-01-01',
      statementPeriodEnd: '2026-03-31',
      columnMappingUsed: null,
      rows: [
        row({ date: '2026-01-05', balancePence: 500000 }),
        row({ date: '2026-03-31', balancePence: 520000 }),
      ],
    });

    const snapshots = await valuationSnapshotsRepo.listByAccount(account.id);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].valuePence).toBe(520000);
    expect(snapshots[0].source).toBe('statement');
  });

  it('suggests a transfer when a matching cross-account pair appears after commit', async () => {
    const accountA = await accountsRepo.createAccount({
      name: 'HSBC Current',
      bank: 'hsbc',
      accountType: 'current',
      currency: 'GBP',
      valuationBased: false,
      owners: [],
    });
    const accountB = await accountsRepo.createAccount({
      name: 'Monzo Current',
      bank: 'monzo',
      accountType: 'current',
      currency: 'GBP',
      valuationBased: false,
      owners: [],
    });

    await commitImport({
      account: accountA,
      fileName: 'a.pdf',
      rawTextHash: 'hashA',
      pageCount: 1,
      statementPeriodStart: null,
      statementPeriodEnd: null,
      columnMappingUsed: null,
      rows: [row({ date: '2026-01-05', amountPence: -5000, description: 'TRANSFER TO MONZO' })],
    });

    const result = await commitImport({
      account: accountB,
      fileName: 'b.pdf',
      rawTextHash: 'hashB',
      pageCount: 1,
      statementPeriodStart: null,
      statementPeriodEnd: null,
      columnMappingUsed: null,
      rows: [row({ date: '2026-01-05', amountPence: 5000, description: 'TRANSFER FROM HSBC' })],
    });

    expect(result.transferCandidatesFound).toBe(1);
    const suggested = await transfersRepo.listByStatus('suggested');
    expect(suggested).toHaveLength(1);
  });
});
