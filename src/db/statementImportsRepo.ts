import { getDb } from './client';
import type { StatementImport } from '../domain/types';

export async function createStatementImport(statementImport: StatementImport): Promise<void> {
  const db = await getDb();
  await db.put('statementImports', statementImport);
}

export async function listByAccount(accountId: string): Promise<StatementImport[]> {
  const db = await getDb();
  return db.getAllFromIndex('statementImports', 'by-account', accountId);
}

export async function findByRawTextHash(
  accountId: string,
  rawTextHash: string,
): Promise<StatementImport | undefined> {
  const imports = await listByAccount(accountId);
  return imports.find((i) => i.rawTextHash === rawTextHash);
}

export async function listAll(): Promise<StatementImport[]> {
  const db = await getDb();
  return db.getAll('statementImports');
}
