import { create } from 'zustand';
import * as accountsRepo from '../db/accountsRepo';
import * as categoriesRepo from '../db/categoriesRepo';
import * as personsRepo from '../db/personsRepo';
import * as transactionsRepo from '../db/transactionsRepo';
import * as transfersRepo from '../db/transfersRepo';
import * as valuationSnapshotsRepo from '../db/valuationSnapshotsRepo';
import type { CustomCategory } from '../domain/categories';
import type { Account, Person, Transaction, Transfer, ValuationSnapshot } from '../domain/types';

interface AppState {
  persons: Person[];
  accounts: Account[];
  transactions: Transaction[];
  transfers: Transfer[];
  valuationSnapshots: ValuationSnapshot[];
  categories: CustomCategory[];
  loaded: boolean;
  refresh: () => Promise<void>;
}

/**
 * refresh() re-fetches every collection unconditionally, since callers
 * don't track which store(s) their own mutation actually touched — but
 * IndexedDB reads deserialize into brand-new JS objects every time even
 * when nothing changed, so naively `set()`-ing the raw fetch results would
 * hand every consumer a new array reference on every refresh regardless of
 * whether its data moved. That defeats Zustand's per-field selectors (see
 * useSearchIndex.ts): a selector only skips a re-render when the selected
 * value is reference-equal to last time. Comparing each fetched collection
 * against the current state by value and keeping the *old* reference when
 * nothing changed is what makes those selectors actually work.
 */
function sameByValue<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && JSON.stringify(a) === JSON.stringify(b);
}

export const useAppStore = create<AppState>((set, get) => ({
  persons: [],
  accounts: [],
  transactions: [],
  transfers: [],
  valuationSnapshots: [],
  categories: [],
  loaded: false,
  refresh: async () => {
    const [persons, accounts, transactions, transfers, valuationSnapshots, categories] = await Promise.all([
      personsRepo.listPersons(),
      accountsRepo.listAccounts(),
      transactionsRepo.listAll(),
      transfersRepo.listAll(),
      valuationSnapshotsRepo.listAll(),
      categoriesRepo.listCategories(),
    ]);
    const current = get();
    set({
      persons: sameByValue(current.persons, persons) ? current.persons : persons,
      accounts: sameByValue(current.accounts, accounts) ? current.accounts : accounts,
      transactions: sameByValue(current.transactions, transactions) ? current.transactions : transactions,
      transfers: sameByValue(current.transfers, transfers) ? current.transfers : transfers,
      valuationSnapshots: sameByValue(current.valuationSnapshots, valuationSnapshots)
        ? current.valuationSnapshots
        : valuationSnapshots,
      categories: sameByValue(current.categories, categories) ? current.categories : categories,
      loaded: true,
    });
  },
}));
