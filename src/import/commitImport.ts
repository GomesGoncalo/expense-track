import { createId, nowIso } from '../domain/id';
import { computeDedupeHash } from '../domain/hash';
import * as transactionsRepo from '../db/transactionsRepo';
import * as statementImportsRepo from '../db/statementImportsRepo';
import * as valuationSnapshotsRepo from '../db/valuationSnapshotsRepo';
import * as transfersRepo from '../db/transfersRepo';
import { findTransferCandidates } from '../transfers/matchTransfers';
import type { Account, ColumnMapping, Transaction } from '../domain/types';
import type { ParsedTransactionRow } from '../parsers/BankParser';

export interface CommitImportInput {
  account: Account;
  fileName: string;
  rawTextHash: string;
  pageCount: number;
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
  columnMappingUsed: ColumnMapping | null;
  /** Rows after the user has reviewed/edited/excluded duplicates in the preview table. */
  rows: ParsedTransactionRow[];
}

export interface CommitImportResult {
  statementImportId: string;
  transactionsInserted: number;
  transactionsSkippedDuplicate: number;
  transferCandidatesFound: number;
}

/** Runs the transfer-matching heuristic over all unlinked transactions and stores new suggestions. */
export async function runTransferMatching(): Promise<number> {
  const allTransactions = await transactionsRepo.listAll();
  const candidates = findTransferCandidates(allTransactions);
  let created = 0;
  for (const candidate of candidates) {
    const alreadyExists = await transfersRepo.hasExistingPair(candidate.outgoing.id, candidate.incoming.id);
    if (alreadyExists) continue;
    await transfersRepo.createSuggested(candidate.outgoing.id, candidate.incoming.id, candidate.confidence);
    created += 1;
  }
  return created;
}

/**
 * Writes a reviewed statement import to the database: inserts non-duplicate
 * transactions (by dedupe hash), records the StatementImport, creates a
 * ValuationSnapshot for valuation-based accounts, then re-runs transfer
 * matching across all accounts.
 */
export async function commitImport(input: CommitImportInput): Promise<CommitImportResult> {
  const statementImportId = createId();
  const insertedTransactions: Transaction[] = [];
  let skippedDuplicate = 0;

  for (const row of input.rows) {
    const dedupeHash = await computeDedupeHash(input.account.id, row.date, row.description, row.amountPence);
    const existing = await transactionsRepo.findByHash(input.account.id, dedupeHash);
    if (existing) {
      skippedDuplicate += 1;
      continue;
    }
    insertedTransactions.push({
      id: createId(),
      accountId: input.account.id,
      statementImportId,
      date: row.date,
      description: row.description,
      amountPence: row.amountPence,
      balancePence: row.balancePence,
      currency: row.currency,
      dedupeHash,
      transferId: null,
      category: null,
      splitOverride: null,
      createdAt: nowIso(),
    });
  }

  await transactionsRepo.insertMany(insertedTransactions);

  await statementImportsRepo.createStatementImport({
    id: statementImportId,
    accountId: input.account.id,
    fileName: input.fileName,
    bank: input.account.bank,
    importedAt: nowIso(),
    statementPeriodStart: input.statementPeriodStart,
    statementPeriodEnd: input.statementPeriodEnd,
    pageCount: input.pageCount,
    rawTextHash: input.rawTextHash,
    columnMappingUsed: input.columnMappingUsed,
    transactionCount: insertedTransactions.length,
    status: 'committed',
  });

  if (input.account.valuationBased) {
    const lastWithBalance = [...input.rows].reverse().find((r) => r.balancePence !== null);
    if (lastWithBalance && lastWithBalance.balancePence !== null) {
      await valuationSnapshotsRepo.addSnapshot(
        input.account.id,
        lastWithBalance.date,
        lastWithBalance.balancePence,
        'statement',
        statementImportId,
      );
    }
  }

  const transferCandidatesFound = await runTransferMatching();

  return {
    statementImportId,
    transactionsInserted: insertedTransactions.length,
    transactionsSkippedDuplicate: skippedDuplicate,
    transferCandidatesFound,
  };
}
