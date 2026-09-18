import { describe, expect, it } from 'vitest';
import { evenSplit, ownersShareSum, ownersSharesAreValid } from '../../src/domain/owners';

describe('evenSplit', () => {
  it('splits 100% evenly for a sole owner', () => {
    expect(evenSplit(['a'])).toEqual([{ personId: 'a', sharePercent: 100 }]);
  });

  it('splits 100% evenly across two owners', () => {
    expect(evenSplit(['a', 'b'])).toEqual([
      { personId: 'a', sharePercent: 50 },
      { personId: 'b', sharePercent: 50 },
    ]);
  });

  it('gives the rounding remainder to the last owner for an uneven split', () => {
    const owners = evenSplit(['a', 'b', 'c']);
    expect(ownersShareSum(owners)).toBeCloseTo(100, 8);
    expect(owners[0].sharePercent).toBeCloseTo(33.333333, 5);
    expect(owners[2].sharePercent).toBeCloseTo(33.333334, 5);
  });

  it('returns an empty list for no owners', () => {
    expect(evenSplit([])).toEqual([]);
  });
});

describe('ownersSharesAreValid', () => {
  it('accepts an empty (unassigned) owners list', () => {
    expect(ownersSharesAreValid([])).toBe(true);
  });

  it('accepts shares summing to 100', () => {
    expect(ownersSharesAreValid([{ personId: 'a', sharePercent: 60 }, { personId: 'b', sharePercent: 40 }])).toBe(
      true,
    );
  });

  it('rejects shares that do not sum to 100', () => {
    expect(ownersSharesAreValid([{ personId: 'a', sharePercent: 60 }, { personId: 'b', sharePercent: 30 }])).toBe(
      false,
    );
  });

  it('tolerates tiny floating point drift', () => {
    expect(ownersSharesAreValid([{ personId: 'a', sharePercent: 33.333333 }, { personId: 'b', sharePercent: 66.666667 }])).toBe(
      true,
    );
  });
});
