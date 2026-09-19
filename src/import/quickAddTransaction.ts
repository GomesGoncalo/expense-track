import { createId, nowIso } from '../domain/id';
import { computeDedupeHash } from '../domain/hash';
import { resolveCategory } from '../domain/autoCategorize';
import * as transactionsRepo from '../db/transactionsRepo';
import * as statementImportsRepo from '../db/statementImportsRepo';
import { buildCurrentPriorCategoryLookup, runTransferMatching } from './commitImport';
import type { Account, AccountOwner, Transaction } from '../domain/types';
import type { Category } from '../domain/categories';

export interface QuickAddTransactionInput {
  account: Account;
  date: string;
  description: string;
  amountPence: number;
  category: Category | null;
  splitOverride: AccountOwner[] | null;
}

/** Checked before committing so the caller can warn and ask the user to confirm. */
export async function findDuplicateTransaction(
  account: Account,
  date: string,
  description: string,
  amountPence: number,
): Promise<Transaction | undefined> {
  const dedupeHash = await computeDedupeHash(account.id, date, description, amountPence);
  return transactionsRepo.findByHash(account.id, dedupeHash);
}

/**
 * Adds a single manually-entered transaction, reusing the same
 * auto-categorization and transfer-matching primitives as a PDF import (see
 * src/import/commitImport.ts) so a manual entry behaves identically to an
 * imported one afterwards.
 */
export async function quickAddTransaction(input: QuickAddTransactionInput): Promise<Transaction> {
  const dedupeHash = await computeDedupeHash(input.account.id, input.date, input.description, input.amountPence);
  const manualImport = await statementImportsRepo.getOrCreateManualImport(input.account);
  const priorCategories = await buildCurrentPriorCategoryLookup();
  const category = input.category ?? resolveCategory(input.description, input.amountPence, priorCategories);

  const transaction: Transaction = {
    id: createId(),
    accountId: input.account.id,
    statementImportId: manualImport.id,
    date: input.date,
    description: input.description,
    amountPence: input.amountPence,
    balancePence: null,
    currency: input.account.currency,
    dedupeHash,
    transferId: null,
    category,
    splitOverride: input.splitOverride,
    createdAt: nowIso(),
  };

  await transactionsRepo.insertMany([transaction]);
  await runTransferMatching();

  return transaction;
}
