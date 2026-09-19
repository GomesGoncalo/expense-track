import { getDb } from './client';
import * as accountsRepo from './accountsRepo';
import * as categoriesRepo from './categoriesRepo';
import * as personsRepo from './personsRepo';
import * as statementImportsRepo from './statementImportsRepo';
import * as transactionsRepo from './transactionsRepo';
import * as transfersRepo from './transfersRepo';
import * as valuationSnapshotsRepo from './valuationSnapshotsRepo';
import type { CustomCategory } from '../domain/categories';
import type { Account, Person, StatementImport, Transaction, Transfer, ValuationSnapshot } from '../domain/types';

export const BACKUP_SCHEMA_VERSION = 3 as const;

export interface BackupFileV1 {
  schemaVersion: 3;
  exportedAt: string;
  persons: Person[];
  accounts: Account[];
  statementImports: StatementImport[];
  transactions: Transaction[];
  transfers: Transfer[];
  valuationSnapshots: ValuationSnapshot[];
  categories: CustomCategory[];
}

export type ImportMode = 'replace' | 'merge';

export interface ImportSummary {
  personsAdded: number;
  accountsAdded: number;
  transactionsAdded: number;
  transactionsSkippedDuplicate: number;
  statementImportsAdded: number;
  transfersAdded: number;
  valuationSnapshotsAdded: number;
  categoriesAdded: number;
}

export async function exportBackup(): Promise<BackupFileV1> {
  const [persons, accounts, statementImports, transactions, transfers, valuationSnapshots, categories] =
    await Promise.all([
      personsRepo.listPersons(),
      accountsRepo.listAccounts(),
      statementImportsRepo.listAll(),
      transactionsRepo.listAll(),
      transfersRepo.listAll(),
      valuationSnapshotsRepo.listAll(),
      categoriesRepo.listCategories(),
    ]);
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    persons,
    accounts,
    statementImports,
    transactions,
    transfers,
    valuationSnapshots,
    categories,
  };
}

export function downloadBackup(backup: BackupFileV1): void {
  const dateStamp = backup.exportedAt.slice(0, 10);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `expense-track-backup-${dateStamp}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function validateBackup(data: unknown): asserts data is BackupFileV1 {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Backup file is not a valid JSON object.');
  }
  const candidate = data as Partial<BackupFileV1>;
  if (candidate.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported backup schema version: ${String(candidate.schemaVersion)}. Expected ${BACKUP_SCHEMA_VERSION}.`,
    );
  }
  const requiredArrays: (keyof BackupFileV1)[] = [
    'persons',
    'accounts',
    'statementImports',
    'transactions',
    'transfers',
    'valuationSnapshots',
    'categories',
  ];
  for (const key of requiredArrays) {
    if (!Array.isArray(candidate[key])) {
      throw new Error(`Backup file is missing the "${key}" array.`);
    }
  }
}

export async function readBackupFile(file: File): Promise<BackupFileV1> {
  const text = await file.text();
  const data: unknown = JSON.parse(text);
  validateBackup(data);
  return data;
}

export async function importBackup(backup: BackupFileV1, mode: ImportMode): Promise<ImportSummary> {
  validateBackup(backup);
  const db = await getDb();

  if (mode === 'replace') {
    await Promise.all([
      db.clear('persons'),
      db.clear('accounts'),
      db.clear('statementImports'),
      db.clear('transactions'),
      db.clear('transfers'),
      db.clear('valuationSnapshots'),
      db.clear('categories'),
    ]);
    const tx = db.transaction(
      ['persons', 'accounts', 'statementImports', 'transactions', 'transfers', 'valuationSnapshots', 'categories'],
      'readwrite',
    );
    for (const person of backup.persons) await tx.objectStore('persons').put(person);
    for (const account of backup.accounts) await tx.objectStore('accounts').put(account);
    for (const si of backup.statementImports) await tx.objectStore('statementImports').put(si);
    for (const transaction of backup.transactions) await tx.objectStore('transactions').put(transaction);
    for (const transfer of backup.transfers) await tx.objectStore('transfers').put(transfer);
    for (const snapshot of backup.valuationSnapshots) {
      await tx.objectStore('valuationSnapshots').put(snapshot);
    }
    for (const category of backup.categories) await tx.objectStore('categories').put(category);
    await tx.done;

    return {
      personsAdded: backup.persons.length,
      accountsAdded: backup.accounts.length,
      transactionsAdded: backup.transactions.length,
      transactionsSkippedDuplicate: 0,
      statementImportsAdded: backup.statementImports.length,
      transfersAdded: backup.transfers.length,
      valuationSnapshotsAdded: backup.valuationSnapshots.length,
      categoriesAdded: backup.categories.length,
    };
  }

  // merge mode: skip anything whose id already exists; dedupe transactions by hash too.
  // One shared transaction across every store, same as replace mode above —
  // each db.put(...) call outside a shared transaction commits on its own,
  // so a large backup used to mean thousands of one-record transactions
  // with no all-or-nothing guarantee if the import failed partway through.
  const summary: ImportSummary = {
    personsAdded: 0,
    accountsAdded: 0,
    transactionsAdded: 0,
    transactionsSkippedDuplicate: 0,
    statementImportsAdded: 0,
    transfersAdded: 0,
    valuationSnapshotsAdded: 0,
    categoriesAdded: 0,
  };

  const tx = db.transaction(
    ['persons', 'accounts', 'statementImports', 'transactions', 'transfers', 'valuationSnapshots', 'categories'],
    'readwrite',
  );

  const existingPersonIds = new Set(await tx.objectStore('persons').getAllKeys());
  for (const person of backup.persons) {
    if (existingPersonIds.has(person.id)) continue;
    await tx.objectStore('persons').put(person);
    summary.personsAdded += 1;
  }

  const existingAccountIds = new Set(await tx.objectStore('accounts').getAllKeys());
  for (const account of backup.accounts) {
    if (existingAccountIds.has(account.id)) continue;
    await tx.objectStore('accounts').put(account);
    summary.accountsAdded += 1;
  }

  const existingImportIds = new Set(await tx.objectStore('statementImports').getAllKeys());
  for (const si of backup.statementImports) {
    if (existingImportIds.has(si.id)) continue;
    await tx.objectStore('statementImports').put(si);
    summary.statementImportsAdded += 1;
  }

  const existingTransactionIds = new Set(await tx.objectStore('transactions').getAllKeys());
  const existingHashes = new Set((await tx.objectStore('transactions').getAll()).map((t) => t.dedupeHash));
  for (const transaction of backup.transactions) {
    if (existingTransactionIds.has(transaction.id) || existingHashes.has(transaction.dedupeHash)) {
      summary.transactionsSkippedDuplicate += 1;
      continue;
    }
    await tx.objectStore('transactions').put(transaction);
    existingHashes.add(transaction.dedupeHash);
    summary.transactionsAdded += 1;
  }

  const existingTransferIds = new Set(await tx.objectStore('transfers').getAllKeys());
  for (const transfer of backup.transfers) {
    if (existingTransferIds.has(transfer.id)) continue;
    await tx.objectStore('transfers').put(transfer);
    summary.transfersAdded += 1;
  }

  const existingSnapshotIds = new Set(await tx.objectStore('valuationSnapshots').getAllKeys());
  for (const snapshot of backup.valuationSnapshots) {
    if (existingSnapshotIds.has(snapshot.id)) continue;
    await tx.objectStore('valuationSnapshots').put(snapshot);
    summary.valuationSnapshotsAdded += 1;
  }

  const existingCategoryIds = new Set(await tx.objectStore('categories').getAllKeys());
  for (const category of backup.categories) {
    if (existingCategoryIds.has(category.id)) continue;
    await tx.objectStore('categories').put(category);
    summary.categoriesAdded += 1;
  }

  await tx.done;
  return summary;
}
