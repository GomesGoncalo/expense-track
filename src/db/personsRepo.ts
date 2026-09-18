import { getDb } from './client';
import { normalizeAccount } from './accountsRepo';
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
 * Deletes a person and strips them from every account's owners list,
 * proportionally renormalizing the remaining owners' shares back to 100%
 * (an account left with no owners just becomes unassigned, not deleted).
 */
export async function deletePersonCascade(personId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['persons', 'accounts'], 'readwrite');

  const accounts = (await tx.objectStore('accounts').getAll()).map(normalizeAccount);
  for (const account of accounts) {
    if (!account.owners.some((o) => o.personId === personId)) continue;
    const remaining = account.owners.filter((o) => o.personId !== personId);
    const remainingTotal = remaining.reduce((sum, o) => sum + o.sharePercent, 0);
    account.owners =
      remainingTotal > 0
        ? remaining.map((o) => ({ personId: o.personId, sharePercent: (o.sharePercent / remainingTotal) * 100 }))
        : [];
    await tx.objectStore('accounts').put(account);
  }

  await tx.objectStore('persons').delete(personId);
  await tx.done;
}
