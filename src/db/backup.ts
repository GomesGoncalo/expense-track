import { getDb } from './client';
import * as accountsRepo from './accountsRepo';
import * as personsRepo from './personsRepo';
import * as statementImportsRepo from './statementImportsRepo';
import * as transactionsRepo from './transactionsRepo';
import * as transfersRepo from './transfersRepo';
import * as valuationSnapshotsRepo from './valuationSnapshotsRepo';
import type { Account, Person, StatementImport, Transaction, Transfer, ValuationSnapshot } from '../domain/types';

export const BACKUP_SCHEMA_VERSION = 2 as const;

export interface BackupFileV1 {
  schemaVersion: 2;
  exportedAt: string;
  persons: Person[];
  accounts: Account[];
  statementImports: StatementImport[];
  transactions: Transaction[];
  transfers: Transfer[];
  valuationSnapshots: ValuationSnapshot[];
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
}

export async function exportBackup(): Promise<BackupFileV1> {
  const [persons, accounts, statementImports, transactions, transfers, valuationSnapshots] = await Promise.all([
    personsRepo.listPersons(),
    accountsRepo.listAccounts(),
    statementImportsRepo.listAll(),
    transactionsRepo.listAll(),
    transfersRepo.listAll(),
    valuationSnapshotsRepo.listAll(),
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
    ]);
    const tx = db.transaction(
      ['persons', 'accounts', 'statementImports', 'transactions', 'transfers', 'valuationSnapshots'],
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
    await tx.done;

    return {
      personsAdded: backup.persons.length,
      accountsAdded: backup.accounts.length,
      transactionsAdded: backup.transactions.length,
      transactionsSkippedDuplicate: 0,
      statementImportsAdded: backup.statementImports.length,
      transfersAdded: backup.transfers.length,
      valuationSnapshotsAdded: backup.valuationSnapshots.length,
    };
  }

  // merge mode: skip anything whose id already exists; dedupe transactions by hash too.
  const summary: ImportSummary = {
    personsAdded: 0,
    accountsAdded: 0,
    transactionsAdded: 0,
    transactionsSkippedDuplicate: 0,
    statementImportsAdded: 0,
    transfersAdded: 0,
    valuationSnapshotsAdded: 0,
  };

  const existingPersonIds = new Set((await db.getAllKeys('persons')) as string[]);
  for (const person of backup.persons) {
    if (existingPersonIds.has(person.id)) continue;
    await db.put('persons', person);
    summary.personsAdded += 1;
  }

  const existingAccountIds = new Set((await db.getAllKeys('accounts')) as string[]);
  for (const account of backup.accounts) {
    if (existingAccountIds.has(account.id)) continue;
    await db.put('accounts', account);
    summary.accountsAdded += 1;
  }

  const existingImportIds = new Set((await db.getAllKeys('statementImports')) as string[]);
  for (const si of backup.statementImports) {
    if (existingImportIds.has(si.id)) continue;
    await db.put('statementImports', si);
    summary.statementImportsAdded += 1;
  }

  const existingTransactionIds = new Set((await db.getAllKeys('transactions')) as string[]);
  const existingHashes = new Set((await db.getAll('transactions')).map((t) => t.dedupeHash));
  for (const transaction of backup.transactions) {
    if (existingTransactionIds.has(transaction.id) || existingHashes.has(transaction.dedupeHash)) {
      summary.transactionsSkippedDuplicate += 1;
      continue;
    }
    await db.put('transactions', transaction);
    existingHashes.add(transaction.dedupeHash);
    summary.transactionsAdded += 1;
  }

  const existingTransferIds = new Set((await db.getAllKeys('transfers')) as string[]);
  for (const transfer of backup.transfers) {
    if (existingTransferIds.has(transfer.id)) continue;
    await db.put('transfers', transfer);
    summary.transfersAdded += 1;
  }

  const existingSnapshotIds = new Set((await db.getAllKeys('valuationSnapshots')) as string[]);
  for (const snapshot of backup.valuationSnapshots) {
    if (existingSnapshotIds.has(snapshot.id)) continue;
    await db.put('valuationSnapshots', snapshot);
    summary.valuationSnapshotsAdded += 1;
  }

  return summary;
}
