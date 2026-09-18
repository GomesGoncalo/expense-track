import type { AccountOwner } from './types';

const SHARE_SUM_TOLERANCE = 0.01;

export function ownersShareSum(owners: AccountOwner[]): number {
  return owners.reduce((sum, o) => sum + o.sharePercent, 0);
}

/** An empty owners list (unassigned) is valid; a non-empty one must sum to ~100%. */
export function ownersSharesAreValid(owners: AccountOwner[]): boolean {
  if (owners.length === 0) return true;
  return Math.abs(ownersShareSum(owners) - 100) <= SHARE_SUM_TOLERANCE;
}

/** Splits 100% evenly across the given people, giving any rounding remainder to the last one. */
export function evenSplit(personIds: string[]): AccountOwner[] {
  if (personIds.length === 0) return [];
  const share = 100 / personIds.length;
  return personIds.map((personId, i) => ({
    personId,
    sharePercent: i === personIds.length - 1 ? 100 - share * (personIds.length - 1) : share,
  }));
}
