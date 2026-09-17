import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import { DB_NAME, DB_VERSION } from './schema';
import type { ExpenseTrackDB } from './schema';

let dbPromise: Promise<IDBPDatabase<ExpenseTrackDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<ExpenseTrackDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ExpenseTrackDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const accounts = db.createObjectStore('accounts', { keyPath: 'id' });
        accounts.createIndex('by-bank', 'bank');

        const statementImports = db.createObjectStore('statementImports', { keyPath: 'id' });
        statementImports.createIndex('by-account', 'accountId');

        const transactions = db.createObjectStore('transactions', { keyPath: 'id' });
        transactions.createIndex('by-account', 'accountId');
        transactions.createIndex('by-dedupeHash', 'dedupeHash');
        transactions.createIndex('by-statementImport', 'statementImportId');
        transactions.createIndex('by-date', 'date');

        const transfers = db.createObjectStore('transfers', { keyPath: 'id' });
        transfers.createIndex('by-status', 'status');

        const valuationSnapshots = db.createObjectStore('valuationSnapshots', { keyPath: 'id' });
        valuationSnapshots.createIndex('by-account', 'accountId');
      },
    });
  }
  return dbPromise;
}

/** Test-only: forces a fresh DB connection (fake-indexeddb resets between test files). */
export function resetDbConnectionForTests(): void {
  dbPromise = null;
}
