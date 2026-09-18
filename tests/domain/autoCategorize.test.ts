import { describe, expect, it } from 'vitest';
import { buildPriorCategoryLookup, guessCategory, resolveCategory } from '../../src/domain/autoCategorize';

describe('guessCategory', () => {
  it('recognizes common UK merchants across categories', () => {
    expect(guessCategory('TESCO STORES 3421', -1234)).toBe('Groceries');
    expect(guessCategory('DELIVEROO*ORDER', -899)).toBe('Dining & Takeout');
    expect(guessCategory('UBER   *TRIP', -750)).toBe('Transport');
    expect(guessCategory('BRITISH GAS DD', -6000)).toBe('Utilities');
    expect(guessCategory('NETFLIX.COM', -999)).toBe('Subscriptions');
    expect(guessCategory('PUREGYM LTD', -2499)).toBe('Health & Fitness');
    expect(guessCategory('VUE CINEMAS', -1500)).toBe('Entertainment');
    expect(guessCategory('RYANAIR DAC', -8000)).toBe('Travel');
    expect(guessCategory('AVIVA INSURANCE', -3000)).toBe('Insurance');
    expect(guessCategory('OVERDRAFT INTEREST CHARGE', -500)).toBe('Fees & Charges');
    expect(guessCategory('VANGUARD ASSET MGMT', -20000)).toBe('Savings & Investments');
    expect(guessCategory('RENT PAYMENT', -120000)).toBe('Housing');
  });

  it('is case-insensitive', () => {
    expect(guessCategory('tesco stores', -1000)).toBe('Groceries');
    expect(guessCategory('Tesco Stores', -1000)).toBe('Groceries');
  });

  it('recognizes salary/payroll keywords as Income regardless of amount sign check order', () => {
    expect(guessCategory('SALARY - ACME CORP', 250000)).toBe('Income');
    expect(guessCategory('PAYROLL', 200000)).toBe('Income');
  });

  it('recognizes transfer keywords', () => {
    expect(guessCategory('FASTER PAYMENT TO J SMITH', -5000)).toBe('Transfer');
    expect(guessCategory('STANDING ORDER TO SAVINGS', -10000)).toBe('Transfer');
  });

  it('defaults an unrecognized positive amount to Income', () => {
    expect(guessCategory('SOME UNKNOWN SENDER', 15000)).toBe('Income');
  });

  it('leaves an unrecognized expense uncategorized rather than guessing', () => {
    expect(guessCategory('SOME UNKNOWN MERCHANT XYZ', -1500)).toBeNull();
  });
});

describe('buildPriorCategoryLookup + resolveCategory', () => {
  it('reuses a manual correction for a matching description over the generic guess', () => {
    // "WEIRD LOCAL SHOP" wouldn't match any keyword rule on its own.
    const lookup = buildPriorCategoryLookup([
      { description: 'WEIRD LOCAL SHOP', category: 'Groceries', createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(resolveCategory('Weird   Local Shop', -500, lookup)).toBe('Groceries');
  });

  it('ignores transactions with no category when building the lookup', () => {
    const lookup = buildPriorCategoryLookup([
      { description: 'WEIRD LOCAL SHOP', category: null, createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(resolveCategory('WEIRD LOCAL SHOP', -500, lookup)).toBeNull();
  });

  it('prefers the most recently created category when descriptions repeat with different categories', () => {
    const lookup = buildPriorCategoryLookup([
      { description: 'AMBIGUOUS CO', category: 'Shopping', createdAt: '2026-01-01T00:00:00.000Z' },
      { description: 'AMBIGUOUS CO', category: 'Entertainment', createdAt: '2026-02-01T00:00:00.000Z' },
    ]);
    expect(resolveCategory('AMBIGUOUS CO', -500, lookup)).toBe('Entertainment');
  });

  it('falls back to the generic guess when no prior description matches', () => {
    const lookup = buildPriorCategoryLookup([]);
    expect(resolveCategory('TESCO STORES', -500, lookup)).toBe('Groceries');
  });
});
