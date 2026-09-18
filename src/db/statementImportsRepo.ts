import { nowIso } from '../domain/id';
import { getDb } from './client';
import type { Account, StatementImport } from '../domain/types';

function manualImportId(accountId: string): string {
  return `manual-${accountId}`;
}

/**
 * Returns the single synthetic StatementImport that quick-added transactions
 * for this account are attributed to — Transaction.statementImportId is
 * non-nullable, so a manual entry still needs one to point at. Creates it on
 * first use; the deterministic id keeps this idempotent without a query.
 */
export async function getOrCreateManualImport(account: Account): Promise<StatementImport> {
  const db = await getDb();
  const id = manualImportId(account.id);
  const existing = await db.get('statementImports', id);
  if (existing) return existing;

  const created: StatementImport = {
    id,
    accountId: account.id,
    fileName: 'Manual entries',
    bank: account.bank,
    importedAt: nowIso(),
    statementPeriodStart: null,
    statementPeriodEnd: null,
    pageCount: 0,
    rawTextHash: id,
    columnMappingUsed: null,
    transactionCount: 0,
    status: 'committed',
  };
  await db.put('statementImports', created);
  return created;
}

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
