import { create } from 'zustand';
import * as accountsRepo from '../db/accountsRepo';
import * as transactionsRepo from '../db/transactionsRepo';
import * as transfersRepo from '../db/transfersRepo';
import * as valuationSnapshotsRepo from '../db/valuationSnapshotsRepo';
import type { Account, Transaction, Transfer, ValuationSnapshot } from '../domain/types';

interface AppState {
  accounts: Account[];
  transactions: Transaction[];
  transfers: Transfer[];
  valuationSnapshots: ValuationSnapshot[];
  loaded: boolean;
  refresh: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  accounts: [],
  transactions: [],
  transfers: [],
  valuationSnapshots: [],
  loaded: false,
  refresh: async () => {
    const [accounts, transactions, transfers, valuationSnapshots] = await Promise.all([
      accountsRepo.listAccounts(),
      transactionsRepo.listAll(),
      transfersRepo.listAll(),
      valuationSnapshotsRepo.listAll(),
    ]);
    set({ accounts, transactions, transfers, valuationSnapshots, loaded: true });
  },
}));
