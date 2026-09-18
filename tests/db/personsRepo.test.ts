import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../src/db/client';
import * as accountsRepo from '../../src/db/accountsRepo';
import * as personsRepo from '../../src/db/personsRepo';

async function clearAllStores() {
  const db = await getDb();
  await db.clear('persons');
  await db.clear('accounts');
}

beforeEach(async () => {
  await clearAllStores();
});

describe('personsRepo', () => {
  it('creates and lists people', async () => {
    const alice = await personsRepo.createPerson('Alice', 0);
    const people = await personsRepo.listPersons();
    expect(people).toHaveLength(1);
    expect(people[0].id).toBe(alice.id);
    expect(people[0].archived).toBe(false);
  });

  it('archives a person without deleting them', async () => {
    const alice = await personsRepo.createPerson('Alice', 0);
    await personsRepo.archivePerson(alice.id);
    const fetched = await personsRepo.getPerson(alice.id);
    expect(fetched?.archived).toBe(true);
  });

  it('deletePersonCascade removes the person and renormalizes remaining owners on their accounts', async () => {
    const alice = await personsRepo.createPerson('Alice', 0);
    const bob = await personsRepo.createPerson('Bob', 1);
    const joint = await accountsRepo.createAccount({
      name: 'Joint account',
      bank: 'hsbc',
      accountType: 'current',
      currency: 'GBP',
      valuationBased: false,
      owners: [
        { personId: alice.id, sharePercent: 70 },
        { personId: bob.id, sharePercent: 30 },
      ],
    });
    const soleOwned = await accountsRepo.createAccount({
      name: 'Alice only',
      bank: 'monzo',
      accountType: 'current',
      currency: 'GBP',
      valuationBased: false,
      owners: [{ personId: alice.id, sharePercent: 100 }],
    });

    await personsRepo.deletePersonCascade(alice.id);

    expect(await personsRepo.getPerson(alice.id)).toBeUndefined();

    const updatedJoint = await accountsRepo.getAccount(joint.id);
    expect(updatedJoint?.owners).toEqual([{ personId: bob.id, sharePercent: 100 }]);

    const updatedSoleOwned = await accountsRepo.getAccount(soleOwned.id);
    expect(updatedSoleOwned?.owners).toEqual([]);
  });
});
