import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import { DB_NAME, DB_VERSION } from './schema';
import type { ExpenseTrackDB } from './schema';

let dbPromise: Promise<IDBPDatabase<ExpenseTrackDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<ExpenseTrackDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ExpenseTrackDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
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
        }
        if (oldVersion < 2) {
          db.createObjectStore('persons', { keyPath: 'id' });
        }
        if (oldVersion < 3) {
          db.createObjectStore('categories', { keyPath: 'id' });
        }
        if (oldVersion < 4) {
          // Lets deleteAccountCascade look up an account's transfers by
          // transaction id instead of scanning the whole transfers store.
          const transfers = transaction.objectStore('transfers');
          transfers.createIndex('by-outgoing', 'outgoingTransactionId');
          transfers.createIndex('by-incoming', 'incomingTransactionId');
        }
      },
    });
  }
  return dbPromise;
}

/** Test-only: forces a fresh DB connection (fake-indexeddb resets between test files). */
export function resetDbConnectionForTests(): void {
  dbPromise = null;
}
