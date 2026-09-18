import { describe, expect, it } from 'vitest';
import {
  computeHouseholdIncomeExpense,
  computeHouseholdNetCashFlowSeries,
  computeHouseholdNetWorth,
  computeHouseholdNetWorthSeries,
  computeSplitBalances,
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
    splitOverride: null,
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

  it('uses splitOverride instead of account owners when present', () => {
    const alice = makePerson({ id: 'alice' });
    const bob = makePerson({ id: 'bob' });
    const carol = makePerson({ id: 'carol' });
    // account solely owned by Alice, but this one dinner is split with Carol only
    const account = makeAccount({ id: 'acc1', owners: [{ personId: 'alice', sharePercent: 100 }] });
    const transactions = [
      makeTransaction({
        accountId: 'acc1',
        amountPence: -4000,
        date: '2026-01-10',
        splitOverride: [
          { personId: 'alice', sharePercent: 50 },
          { personId: 'carol', sharePercent: 50 },
        ],
      }),
    ];

    const result = computeHouseholdIncomeExpense([alice, bob, carol], [account], transactions, '2026-01-01', '2026-01-31');
    const byId = Object.fromEntries(result.map((p) => [p.personId, p]));

    expect(byId.alice.expensePence).toBe(2000);
    expect(byId.carol.expensePence).toBe(2000);
    expect(byId.bob.expensePence).toBe(0);
  });
});

describe('computeSplitBalances', () => {
  it('credits the account owner and debits split participants their fair share', () => {
    const alice = makePerson({ id: 'alice' });
    const bob = makePerson({ id: 'bob' });
    // Alice's sole account funds a £100 dinner split 50/50 with Bob
    const account = makeAccount({ id: 'acc1', owners: [{ personId: 'alice', sharePercent: 100 }] });
    const transactions = [
      makeTransaction({
        accountId: 'acc1',
        amountPence: -10000,
        splitOverride: [
          { personId: 'alice', sharePercent: 50 },
          { personId: 'bob', sharePercent: 50 },
        ],
      }),
    ];

    const result = computeSplitBalances([alice, bob], [account], transactions);
    const byId = Object.fromEntries(result.map((p) => [p.personId, p.netOwedGbpPence]));

    expect(byId.alice).toBe(5000); // fronted £100, fair share £50 -> owed £50
    expect(byId.bob).toBe(-5000); // owes £50
  });

  it('splits among a subset of people, not necessarily everyone', () => {
    const alice = makePerson({ id: 'alice' });
    const bob = makePerson({ id: 'bob' });
    const carol = makePerson({ id: 'carol' });
    // Alice pays for a £60 takeout that's only for Bob and Carol
    const account = makeAccount({ id: 'acc1', owners: [{ personId: 'alice', sharePercent: 100 }] });
    const transactions = [
      makeTransaction({
        accountId: 'acc1',
        amountPence: -6000,
        splitOverride: [
          { personId: 'bob', sharePercent: 50 },
          { personId: 'carol', sharePercent: 50 },
        ],
      }),
    ];

    const result = computeSplitBalances([alice, bob, carol], [account], transactions);
    const byId = Object.fromEntries(result.map((p) => [p.personId, p.netOwedGbpPence]));

    expect(byId.alice).toBe(6000); // owed the full amount back
    expect(byId.bob).toBe(-3000);
    expect(byId.carol).toBe(-3000);
  });

  it('ignores transactions without a splitOverride, and linked transfers', () => {
    const alice = makePerson({ id: 'alice' });
    const bob = makePerson({ id: 'bob' });
    const account = makeAccount({ id: 'acc1', owners: [{ personId: 'alice', sharePercent: 100 }] });
    const transactions = [
      makeTransaction({ accountId: 'acc1', amountPence: -1000, splitOverride: null }),
      makeTransaction({
        accountId: 'acc1',
        amountPence: -1000,
        transferId: 'transfer1',
        splitOverride: [{ personId: 'bob', sharePercent: 100 }],
      }),
    ];

    const result = computeSplitBalances([alice, bob], [account], transactions);
    expect(result.every((p) => p.netOwedGbpPence === 0)).toBe(true);
  });

  it('handles split income as the mirror image of a split expense', () => {
    const alice = makePerson({ id: 'alice' });
    const bob = makePerson({ id: 'bob' });
    // a £200 refund lands in Alice's sole account, but half of it is Bob's
    const account = makeAccount({ id: 'acc1', owners: [{ personId: 'alice', sharePercent: 100 }] });
    const transactions = [
      makeTransaction({
        accountId: 'acc1',
        amountPence: 20000,
        splitOverride: [
          { personId: 'alice', sharePercent: 50 },
          { personId: 'bob', sharePercent: 50 },
        ],
      }),
    ];

    const result = computeSplitBalances([alice, bob], [account], transactions);
    const byId = Object.fromEntries(result.map((p) => [p.personId, p.netOwedGbpPence]));

    // Alice received the full £200 but only £100 is hers -> she owes Bob £100.
    expect(byId.alice).toBe(-10000);
    expect(byId.bob).toBe(10000);
  });

  it('nets to zero across the household for a single split expense', () => {
    const alice = makePerson({ id: 'alice' });
    const bob = makePerson({ id: 'bob' });
    const carol = makePerson({ id: 'carol' });
    const account = makeAccount({ id: 'acc1', owners: [{ personId: 'alice', sharePercent: 100 }] });
    const transactions = [
      makeTransaction({
        accountId: 'acc1',
        amountPence: -9900,
        splitOverride: [
          { personId: 'alice', sharePercent: 33.333333 },
          { personId: 'bob', sharePercent: 33.333333 },
          { personId: 'carol', sharePercent: 33.333334 },
        ],
      }),
    ];

    const result = computeSplitBalances([alice, bob, carol], [account], transactions);
    const total = result.reduce((sum, p) => sum + p.netOwedGbpPence, 0);
    expect(total).toBe(0);
  });
});

describe('computeHouseholdNetCashFlowSeries', () => {
  it('buckets each person net (income minus expense) by month, split-aware', () => {
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
      makeTransaction({ accountId: 'acc1', amountPence: 100000, date: '2026-01-05' }), // salary, owner split
      makeTransaction({ accountId: 'acc1', amountPence: -20000, date: '2026-01-10' }), // groceries, owner split
      makeTransaction({
        accountId: 'acc1',
        amountPence: -10000,
        date: '2026-02-03',
        splitOverride: [{ personId: 'bob', sharePercent: 100 }], // Bob-only expense, overrides owner split
      }),
    ];

    const series = computeHouseholdNetCashFlowSeries([alice, bob], [account], transactions, 'month');
    expect(series.map((p) => p.period)).toEqual(['2026-01-01', '2026-02-01']);

    // January: net = 80000 (100000 - 20000), split 60/40
    expect(series[0].perPersonNetGbpPence.alice).toBe(48000);
    expect(series[0].perPersonNetGbpPence.bob).toBe(32000);

    // February: Bob-only expense via splitOverride
    expect(series[1].perPersonNetGbpPence.alice).toBe(0);
    expect(series[1].perPersonNetGbpPence.bob).toBe(-10000);
  });

  it('excludes transfers and returns zero-filled entries for people with no activity in a period', () => {
    const alice = makePerson({ id: 'alice' });
    const bob = makePerson({ id: 'bob' });
    const account = makeAccount({ id: 'acc1', owners: [{ personId: 'alice', sharePercent: 100 }] });
    const transactions = [
      makeTransaction({ accountId: 'acc1', amountPence: -5000, date: '2026-01-05' }),
      makeTransaction({ accountId: 'acc1', amountPence: -5000, date: '2026-01-06', transferId: 'transfer1' }),
    ];

    const series = computeHouseholdNetCashFlowSeries([alice, bob], [account], transactions, 'month');
    expect(series).toHaveLength(1);
    expect(series[0].perPersonNetGbpPence.alice).toBe(-5000);
    expect(series[0].perPersonNetGbpPence.bob).toBe(0);
  });
});
