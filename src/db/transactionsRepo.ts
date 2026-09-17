import { getDb } from './client';
import type { Transaction } from '../domain/types';

export async function findByHash(accountId: string, dedupeHash: string): Promise<Transaction | undefined> {
  const db = await getDb();
  const candidates = await db.getAllFromIndex('transactions', 'by-dedupeHash', dedupeHash);
  return candidates.find((t) => t.accountId === accountId);
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
  return db.getAllFromIndex('transactions', 'by-account', accountId);
}

export async function listAll(): Promise<Transaction[]> {
  const db = await getDb();
  return db.getAll('transactions');
}

export async function getTransaction(id: string): Promise<Transaction | undefined> {
  const db = await getDb();
  return db.get('transactions', id);
}
