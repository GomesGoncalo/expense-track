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

export const useAppStore = create<AppState>((set) => ({
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
    set({ persons, accounts, transactions, transfers, valuationSnapshots, categories, loaded: true });
  },
}));
