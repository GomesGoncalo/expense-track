import { getDb } from './client';
import { createId, nowIso } from '../domain/id';
import type { Account, AccountOwner, AccountType, BankId } from '../domain/types';

/**
 * Fills in defaults for fields added after some accounts were already
 * persisted (e.g. `owners`, added for the household feature) — IndexedDB
 * doesn't enforce a schema, so older records don't retroactively gain new
 * fields on their own.
 */
export function normalizeAccount(account: Account): Account {
  return { ...account, owners: account.owners ?? [] };
}

export interface CreateAccountInput {
  name: string;
  bank: BankId;
  accountType: AccountType;
  currency: string;
  valuationBased: boolean;
  manualRateToGbp?: number | null;
  owners: AccountOwner[];
}

export async function createAccount(input: CreateAccountInput): Promise<Account> {
  const account: Account = {
    id: createId(),
    name: input.name,
    bank: input.bank,
    accountType: input.accountType,
    currency: input.currency,
    valuationBased: input.valuationBased,
    manualRateToGbp: input.manualRateToGbp ?? null,
    owners: input.owners,
    createdAt: nowIso(),
    archived: false,
  };
  const db = await getDb();
  await db.put('accounts', account);
  return account;
}

export async function updateAccount(account: Account): Promise<void> {
  const db = await getDb();
  await db.put('accounts', account);
}

export async function archiveAccount(accountId: string): Promise<void> {
  const db = await getDb();
  const account = await db.get('accounts', accountId);
  if (!account) return;
  account.archived = true;
  await db.put('accounts', account);
}

export async function deleteAccountCascade(accountId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(
    ['accounts', 'statementImports', 'transactions', 'transfers', 'valuationSnapshots'],
    'readwrite',
  );

  const transactions = await tx.objectStore('transactions').index('by-account').getAll(accountId);

  // Per-transaction indexed lookups instead of scanning the whole transfers
  // store — bounded by this account's own transaction count, like every
  // other delete below, rather than by every transfer in the database.
  const transferIdsToDelete = new Set<string>();
  for (const transaction of transactions) {
    const outgoingMatches = await tx.objectStore('transfers').index('by-outgoing').getAll(transaction.id);
    const incomingMatches = await tx.objectStore('transfers').index('by-incoming').getAll(transaction.id);
    for (const transfer of [...outgoingMatches, ...incomingMatches]) transferIdsToDelete.add(transfer.id);
  }
  for (const transferId of transferIdsToDelete) {
    await tx.objectStore('transfers').delete(transferId);
  }

  for (const transaction of transactions) {
    await tx.objectStore('transactions').delete(transaction.id);
  }

  const imports = await tx.objectStore('statementImports').index('by-account').getAllKeys(accountId);
  for (const importId of imports) {
    await tx.objectStore('statementImports').delete(importId);
  }

  const snapshots = await tx.objectStore('valuationSnapshots').index('by-account').getAllKeys(accountId);
  for (const snapshotId of snapshots) {
    await tx.objectStore('valuationSnapshots').delete(snapshotId);
  }

  await tx.objectStore('accounts').delete(accountId);
  await tx.done;
}

export async function listAccounts(): Promise<Account[]> {
  const db = await getDb();
  const accounts = await db.getAll('accounts');
  return accounts.map(normalizeAccount);
}

export async function getAccount(accountId: string): Promise<Account | undefined> {
  const db = await getDb();
  const account = await db.get('accounts', accountId);
  return account ? normalizeAccount(account) : undefined;
}
