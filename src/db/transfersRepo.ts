import { getDb } from './client';
import { createId, nowIso } from '../domain/id';
import * as transactionsRepo from './transactionsRepo';
import type { Transfer } from '../domain/types';

export async function listAll(): Promise<Transfer[]> {
  const db = await getDb();
  return db.getAll('transfers');
}

export async function listByStatus(status: Transfer['status']): Promise<Transfer[]> {
  const db = await getDb();
  return db.getAllFromIndex('transfers', 'by-status', status);
}

/** Pairs already suggested/resolved before, so the matcher doesn't re-suggest them. */
export async function hasExistingPair(outgoingId: string, incomingId: string): Promise<boolean> {
  const all = await listAll();
  return all.some(
    (t) => t.outgoingTransactionId === outgoingId && t.incomingTransactionId === incomingId,
  );
}

export async function createSuggested(
  outgoingTransactionId: string,
  incomingTransactionId: string,
  matchConfidence: number,
): Promise<Transfer> {
  const transfer: Transfer = {
    id: createId(),
    outgoingTransactionId,
    incomingTransactionId,
    status: 'suggested',
    matchConfidence,
    createdAt: nowIso(),
    resolvedAt: null,
  };
  const db = await getDb();
  await db.put('transfers', transfer);
  return transfer;
}

export async function createManual(
  outgoingTransactionId: string,
  incomingTransactionId: string,
): Promise<Transfer> {
  const transfer: Transfer = {
    id: createId(),
    outgoingTransactionId,
    incomingTransactionId,
    status: 'manual',
    matchConfidence: 1,
    createdAt: nowIso(),
    resolvedAt: nowIso(),
  };
  const db = await getDb();
  await db.put('transfers', transfer);
  await linkTransactions(transfer);
  return transfer;
}

export async function confirm(transferId: string): Promise<void> {
  const db = await getDb();
  const transfer = await db.get('transfers', transferId);
  if (!transfer) return;
  transfer.status = 'confirmed';
  transfer.resolvedAt = nowIso();
  await db.put('transfers', transfer);
  await linkTransactions(transfer);
}

export async function reject(transferId: string): Promise<void> {
  const db = await getDb();
  const transfer = await db.get('transfers', transferId);
  if (!transfer) return;
  transfer.status = 'rejected';
  transfer.resolvedAt = nowIso();
  await db.put('transfers', transfer);
}

/** Unlinks a confirmed/manual transfer, restoring both legs to ordinary income/expense. */
export async function unlink(transferId: string): Promise<void> {
  const db = await getDb();
  const transfer = await db.get('transfers', transferId);
  if (!transfer) return;

  const outgoing = await transactionsRepo.getTransaction(transfer.outgoingTransactionId);
  const incoming = await transactionsRepo.getTransaction(transfer.incomingTransactionId);
  if (outgoing) {
    outgoing.transferId = null;
    await transactionsRepo.updateTransaction(outgoing);
  }
  if (incoming) {
    incoming.transferId = null;
    await transactionsRepo.updateTransaction(incoming);
  }
  await db.delete('transfers', transferId);
}

async function linkTransactions(transfer: Transfer): Promise<void> {
  const outgoing = await transactionsRepo.getTransaction(transfer.outgoingTransactionId);
  const incoming = await transactionsRepo.getTransaction(transfer.incomingTransactionId);
  if (outgoing) {
    outgoing.transferId = transfer.id;
    await transactionsRepo.updateTransaction(outgoing);
  }
  if (incoming) {
    incoming.transferId = transfer.id;
    await transactionsRepo.updateTransaction(incoming);
  }
}
