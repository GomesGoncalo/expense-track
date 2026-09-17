import { getDb } from './client';
import { createId, nowIso } from '../domain/id';
import type { ValuationSnapshot } from '../domain/types';

export async function addSnapshot(
  accountId: string,
  date: string,
  valuePence: number,
  source: ValuationSnapshot['source'],
  statementImportId: string | null = null,
): Promise<ValuationSnapshot> {
  const snapshot: ValuationSnapshot = {
    id: createId(),
    accountId,
    date,
    valuePence,
    source,
    statementImportId,
    createdAt: nowIso(),
  };
  const db = await getDb();
  await db.put('valuationSnapshots', snapshot);
  return snapshot;
}

export async function listByAccount(accountId: string): Promise<ValuationSnapshot[]> {
  const db = await getDb();
  return db.getAllFromIndex('valuationSnapshots', 'by-account', accountId);
}

export async function listAll(): Promise<ValuationSnapshot[]> {
  const db = await getDb();
  return db.getAll('valuationSnapshots');
}
