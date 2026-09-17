import { describe, expect, it } from 'vitest';
import { findTransferCandidates } from '../../src/transfers/matchTransfers';
import { createId, nowIso } from '../../src/domain/id';
import type { Transaction } from '../../src/domain/types';

function txn(overrides: Partial<Transaction>): Transaction {
  return {
    id: createId(),
    accountId: 'accA',
    statementImportId: 'import1',
    date: '2026-01-05',
    description: 'PAYMENT',
    amountPence: -1000,
    balancePence: null,
    currency: 'GBP',
    dedupeHash: createId(),
    transferId: null,
    category: null,
    createdAt: nowIso(),
    ...overrides,
  };
}

describe('findTransferCandidates', () => {
  it('matches an exact same-amount, same-day cross-account pair', () => {
    const outgoing = txn({ accountId: 'accA', amountPence: -5000, date: '2026-01-05' });
    const incoming = txn({ accountId: 'accB', amountPence: 5000, date: '2026-01-05' });

    const candidates = findTransferCandidates([outgoing, incoming]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].outgoing.id).toBe(outgoing.id);
    expect(candidates[0].incoming.id).toBe(incoming.id);
    expect(candidates[0].confidence).toBeGreaterThan(0.75);
  });

  it('does not match transactions within the same account', () => {
    const outgoing = txn({ accountId: 'accA', amountPence: -5000 });
    const incoming = txn({ accountId: 'accA', amountPence: 5000 });
    expect(findTransferCandidates([outgoing, incoming])).toHaveLength(0);
  });

  it('matches within the date window but not beyond it', () => {
    const outgoing = txn({ accountId: 'accA', amountPence: -2000, date: '2026-01-01' });
    const withinWindow = txn({ accountId: 'accB', amountPence: 2000, date: '2026-01-03' });
    expect(findTransferCandidates([outgoing, withinWindow], { dateWindowDays: 3 })).toHaveLength(1);

    const outsideWindow = txn({ accountId: 'accB', amountPence: 2000, date: '2026-01-10' });
    expect(findTransferCandidates([outgoing, outsideWindow], { dateWindowDays: 3 })).toHaveLength(0);
  });

  it('allows a small percentage tolerance for cross-currency legs', () => {
    const outgoing = txn({ accountId: 'accA', amountPence: -10000, currency: 'GBP' });
    const incoming = txn({ accountId: 'accB', amountPence: 9950, currency: 'EUR' });
    expect(findTransferCandidates([outgoing, incoming], { amountTolerancePercent: 0.02 })).toHaveLength(1);
  });

  it('does not match same-currency legs outside the pence tolerance', () => {
    const outgoing = txn({ accountId: 'accA', amountPence: -10000, currency: 'GBP' });
    const incoming = txn({ accountId: 'accB', amountPence: 9950, currency: 'GBP' });
    expect(findTransferCandidates([outgoing, incoming])).toHaveLength(0);
  });

  it('ignores transactions already linked to a transfer', () => {
    const outgoing = txn({ accountId: 'accA', amountPence: -5000, transferId: 'existing' });
    const incoming = txn({ accountId: 'accB', amountPence: 5000 });
    expect(findTransferCandidates([outgoing, incoming])).toHaveLength(0);
  });

  it('does not produce two candidates for one outgoing transaction (greedy matching)', () => {
    const outgoing = txn({ accountId: 'accA', amountPence: -5000, date: '2026-01-05' });
    const incomingBetterMatch = txn({ accountId: 'accB', amountPence: 5000, date: '2026-01-05' });
    const incomingWorseMatch = txn({ accountId: 'accC', amountPence: 5000, date: '2026-01-07' });

    const candidates = findTransferCandidates([outgoing, incomingBetterMatch, incomingWorseMatch]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].incoming.id).toBe(incomingBetterMatch.id);
  });

  it('boosts confidence when descriptions share transfer keywords', () => {
    const outgoingPlain = txn({
      accountId: 'accA',
      amountPence: -5000,
      date: '2026-01-01',
      description: 'PAYMENT',
    });
    const incomingPlain = txn({
      accountId: 'accB',
      amountPence: 5000,
      date: '2026-01-03',
      description: 'PAYMENT',
    });
    const [plainCandidate] = findTransferCandidates([outgoingPlain, incomingPlain]);

    const outgoingKeyword = txn({
      accountId: 'accA',
      amountPence: -5000,
      date: '2026-01-01',
      description: 'FASTER PAYMENT TO SAVINGS',
    });
    const incomingKeyword = txn({
      accountId: 'accB',
      amountPence: 5000,
      date: '2026-01-03',
      description: 'FASTER PAYMENT FROM CURRENT',
    });
    const [keywordCandidate] = findTransferCandidates([outgoingKeyword, incomingKeyword]);

    expect(keywordCandidate.confidence).toBeGreaterThan(plainCandidate.confidence);
  });
});
