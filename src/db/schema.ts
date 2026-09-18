import type { DBSchema } from 'idb';
import type { CustomCategory } from '../domain/categories';
import type {
  Account,
  BankId,
  Person,
  StatementImport,
  Transaction,
  Transfer,
  TransferMatchStatus,
  ValuationSnapshot,
} from '../domain/types';

export interface ExpenseTrackDB extends DBSchema {
  persons: {
    key: string;
    value: Person;
  };
  categories: {
    key: string;
    value: CustomCategory;
  };
  accounts: {
    key: string;
    value: Account;
    indexes: { 'by-bank': BankId };
  };
  statementImports: {
    key: string;
    value: StatementImport;
    indexes: { 'by-account': string };
  };
  transactions: {
    key: string;
    value: Transaction;
    indexes: {
      'by-account': string;
      'by-dedupeHash': string;
      'by-statementImport': string;
      'by-date': string;
    };
  };
  transfers: {
    key: string;
    value: Transfer;
    indexes: { 'by-status': TransferMatchStatus };
  };
  valuationSnapshots: {
    key: string;
    value: ValuationSnapshot;
    indexes: { 'by-account': string };
  };
}

export const DB_NAME = 'expense-track';
export const DB_VERSION = 3;
