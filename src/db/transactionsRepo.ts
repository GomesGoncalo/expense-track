import { getDb } from './client';
import type { Transaction } from '../domain/types';

/**
 * Fills in defaults for fields added after some transactions were already
 * persisted (e.g. `splitOverride`, added for per-transaction expense
 * splitting) — IndexedDB doesn't enforce a schema, so older records don't
 * retroactively gain new fields on their own.
 */
export function normalizeTransaction(transaction: Transaction): Transaction {
  return { ...transaction, splitOverride: transaction.splitOverride ?? null };
}

export async function findByHash(accountId: string, dedupeHash: string): Promise<Transaction | undefined> {
  const db = await getDb();
  const candidates = await db.getAllFromIndex('transactions', 'by-dedupeHash', dedupeHash);
  const match = candidates.find((t) => t.accountId === accountId);
  return match ? normalizeTransaction(match) : undefined;
}

export async function insertMany(transactions: Transaction[]): Promise<void> {
  if (transactions.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('transactions', 'readwrite');
  for (const transaction of transactions) {
    await tx.store.put(transaction);
  }
  await tx.done;
}

export async function updateTransaction(transaction: Transaction): Promise<void> {
  const db = await getDb();
  await db.put('transactions', transaction);
}

export async function listByAccount(accountId: string): Promise<Transaction[]> {
  const db = await getDb();
  const transactions = await db.getAllFromIndex('transactions', 'by-account', accountId);
  return transactions.map(normalizeTransaction);
}

export async function listAll(): Promise<Transaction[]> {
  const db = await getDb();
  const transactions = await db.getAll('transactions');
  return transactions.map(normalizeTransaction);
}

export async function getTransaction(id: string): Promise<Transaction | undefined> {
  const db = await getDb();
  const transaction = await db.get('transactions', id);
  return transaction ? normalizeTransaction(transaction) : undefined;
}
