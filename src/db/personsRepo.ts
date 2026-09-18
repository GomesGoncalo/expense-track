import { getDb } from './client';
import { normalizeAccount } from './accountsRepo';
import { normalizeTransaction } from './transactionsRepo';
import { removeOwnerAndRenormalize } from '../domain/owners';
import { createId, nowIso } from '../domain/id';
import type { Person } from '../domain/types';

export async function createPerson(name: string, colorIndex: number): Promise<Person> {
  const person: Person = {
    id: createId(),
    name,
    colorIndex,
    createdAt: nowIso(),
    archived: false,
  };
  const db = await getDb();
  await db.put('persons', person);
  return person;
}

export async function updatePerson(person: Person): Promise<void> {
  const db = await getDb();
  await db.put('persons', person);
}

export async function archivePerson(personId: string): Promise<void> {
  const db = await getDb();
  const person = await db.get('persons', personId);
  if (!person) return;
  person.archived = true;
  await db.put('persons', person);
}

export async function listPersons(): Promise<Person[]> {
  const db = await getDb();
  return db.getAll('persons');
}

export async function getPerson(personId: string): Promise<Person | undefined> {
  const db = await getDb();
  return db.get('persons', personId);
}

/**
 * Deletes a person and strips them from every account's owners list and
 * every transaction's split override, proportionally renormalizing the
 * remaining shares back to 100% in each case (left with none just becomes
 * unassigned, not deleted/rejected).
 */
export async function deletePersonCascade(personId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['persons', 'accounts', 'transactions'], 'readwrite');

  const accounts = (await tx.objectStore('accounts').getAll()).map(normalizeAccount);
  for (const account of accounts) {
    if (!account.owners.some((o) => o.personId === personId)) continue;
    account.owners = removeOwnerAndRenormalize(account.owners, personId);
    await tx.objectStore('accounts').put(account);
  }

  const transactions = (await tx.objectStore('transactions').getAll()).map(normalizeTransaction);
  for (const transaction of transactions) {
    if (!transaction.splitOverride?.some((o) => o.personId === personId)) continue;
    transaction.splitOverride = removeOwnerAndRenormalize(transaction.splitOverride, personId);
    await tx.objectStore('transactions').put(transaction);
  }

  await tx.objectStore('persons').delete(personId);
  await tx.done;
}
