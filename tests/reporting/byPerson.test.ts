import { describe, expect, it } from 'vitest';
import {
  computeHouseholdIncomeExpense,
  computeHouseholdNetWorth,
  computeHouseholdNetWorthSeries,
} from '../../src/reporting/byPerson';
import { createId, nowIso } from '../../src/domain/id';
import type { Account, Person, Transaction } from '../../src/domain/types';

function makePerson(overrides: Partial<Person> = {}): Person {
  return { id: createId(), name: 'Person', colorIndex: 0, createdAt: nowIso(), archived: false, ...overrides };
}

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: createId(),
    name: 'Account',
    bank: 'hsbc',
    accountType: 'current',
    currency: 'GBP',
    valuationBased: false,
    manualRateToGbp: null,
    owners: [],
    createdAt: nowIso(),
    archived: false,
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: createId(),
    accountId: 'acc',
    statementImportId: 'import1',
    date: '2026-01-15',
    description: 'TXN',
    amountPence: -1000,
    balancePence: 1000,
    currency: 'GBP',
    dedupeHash: createId(),
    transferId: null,
    category: null,
    createdAt: nowIso(),
    ...overrides,
  };
}

describe('computeHouseholdNetWorth', () => {
  it('attributes a sole-owned account entirely to its owner', () => {
    const alice = makePerson({ id: 'alice' });
    const account = makeAccount({ id: 'acc1', owners: [{ personId: 'alice', sharePercent: 100 }] });
    const transactions = [makeTransaction({ accountId: 'acc1', balancePence: 50000 })];

    const result = computeHouseholdNetWorth([alice], [account], transactions, []);
    expect(result.perPerson).toEqual([{ personId: 'alice', netWorthGbpPence: 50000 }]);
    expect(result.unassignedGbpPence).toBe(0);
    expect(result.totalGbpPence).toBe(50000);
  });

  it('splits a joint account by share percentage', () => {
    const alice = makePerson({ id: 'alice' });
    const bob = makePerson({ id: 'bob' });
    const account = makeAccount({
      id: 'acc1',
      owners: [
        { personId: 'alice', sharePercent: 70 },
        { personId: 'bob', sharePercent: 30 },
      ],
    });
    const transactions = [makeTransaction({ accountId: 'acc1', balancePence: 10000 })];

    const result = computeHouseholdNetWorth([alice, bob], [account], transactions, []);
    const byId = Object.fromEntries(result.perPerson.map((p) => [p.personId, p.netWorthGbpPence]));
    expect(byId.alice).toBe(7000);
    expect(byId.bob).toBe(3000);
    expect(result.totalGbpPence).toBe(10000);
  });

  it('puts an unassigned account (no owners) into unassignedGbpPence, not any person', () => {
    const alice = makePerson({ id: 'alice' });
    const account = makeAccount({ id: 'acc1', owners: [] });
    const transactions = [makeTransaction({ accountId: 'acc1', balancePence: 20000 })];

    const result = computeHouseholdNetWorth([alice], [account], transactions, []);
    expect(result.perPerson).toEqual([{ personId: 'alice', netWorthGbpPence: 0 }]);
    expect(result.unassignedGbpPence).toBe(20000);
    expect(result.totalGbpPence).toBe(20000);
  });

  it('converts a non-GBP account to GBP before splitting shares', () => {
    const alice = makePerson({ id: 'alice' });
    const account = makeAccount({
      id: 'acc1',
      currency: 'EUR',
      manualRateToGbp: 0.85,
      owners: [{ personId: 'alice', sharePercent: 100 }],
    });
    const transactions = [makeTransaction({ accountId: 'acc1', balancePence: 10000, currency: 'EUR' })];

    const result = computeHouseholdNetWorth([alice], [account], transactions, []);
    expect(result.perPerson[0].netWorthGbpPence).toBe(8500);
  });
});

describe('computeHouseholdNetWorthSeries', () => {
  it('forward-fills and splits each account balance by owner share over time', () => {
    const alice = makePerson({ id: 'alice' });
    const bob = makePerson({ id: 'bob' });
    const account = makeAccount({
      id: 'acc1',
      owners: [
        { personId: 'alice', sharePercent: 50 },
        { personId: 'bob', sharePercent: 50 },
      ],
    });
    const transactions = [
      makeTransaction({ accountId: 'acc1', date: '2026-01-01', balancePence: 1000 }),
      makeTransaction({ accountId: 'acc1', date: '2026-01-05', balancePence: 2000 }),
    ];

    const series = computeHouseholdNetWorthSeries([alice, bob], [account], transactions, [], 'day');
    expect(series).toHaveLength(2);
    expect(series[0].perPersonGbpPence.alice).toBe(500);
    expect(series[0].perPersonGbpPence.bob).toBe(500);
    expect(series[1].perPersonGbpPence.alice).toBe(1000);
    expect(series[1].perPersonGbpPence.bob).toBe(1000);
  });
});

describe('computeHouseholdIncomeExpense', () => {
  it('splits income and expense by owner share, excluding transfers', () => {
    const alice = makePerson({ id: 'alice' });
    const bob = makePerson({ id: 'bob' });
    const account = makeAccount({
      id: 'acc1',
      owners: [
        { personId: 'alice', sharePercent: 60 },
        { personId: 'bob', sharePercent: 40 },
      ],
    });
    const transactions = [
      makeTransaction({ accountId: 'acc1', amountPence: 100000, date: '2026-01-05' }), // salary
      makeTransaction({ accountId: 'acc1', amountPence: -5000, date: '2026-01-10' }), // groceries
      makeTransaction({ accountId: 'acc1', amountPence: -20000, date: '2026-01-12', transferId: 'transfer1' }),
    ];

    const result = computeHouseholdIncomeExpense([alice, bob], [account], transactions, '2026-01-01', '2026-01-31');
    const byId = Object.fromEntries(result.map((p) => [p.personId, p]));

    expect(byId.alice.incomePence).toBe(60000);
    expect(byId.alice.expensePence).toBe(3000);
    expect(byId.bob.incomePence).toBe(40000);
    expect(byId.bob.expensePence).toBe(2000);
  });
});
