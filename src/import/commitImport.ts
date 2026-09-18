import { createId, nowIso } from '../domain/id';
import { computeDedupeHash } from '../domain/hash';
import { buildPriorCategoryLookup, resolveCategory } from '../domain/autoCategorize';
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
  /** From ParseResult.endingValuation, when the statement stated an account total directly. */
  endingValuation?: { date: string; valuePence: number } | null;
}

export interface CommitImportResult {
  statementImportId: string;
  transactionsInserted: number;
  transactionsSkippedDuplicate: number;
  transferCandidatesFound: number;
}

function pairKey(outgoingId: string, incomingId: string): string {
  return `${outgoingId}|${incomingId}`;
}

/** Runs the transfer-matching heuristic over all unlinked transactions and stores new suggestions. */
export async function runTransferMatching(): Promise<number> {
  const allTransactions = await transactionsRepo.listAll();
  const candidates = findTransferCandidates(allTransactions);
  if (candidates.length === 0) return 0;

  // One fetch of every existing transfer instead of transfersRepo.hasExistingPair
  // per candidate — that call re-fetches and re-scans the whole transfers
  // store each time, which turned every import's re-matching pass into
  // O(candidates × existing transfers) IndexedDB reads.
  const existingTransfers = await transfersRepo.listAll();
  const existingPairs = new Set(
    existingTransfers.map((t) => pairKey(t.outgoingTransactionId, t.incomingTransactionId)),
  );

  let created = 0;
  for (const candidate of candidates) {
    if (existingPairs.has(pairKey(candidate.outgoing.id, candidate.incoming.id))) continue;
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

  // Built once from everything already in the DB, so a description that
  // recurs (a subscription, a regular direct debit) picks up whatever
  // category it was given last time — including a manual correction —
  // instead of re-running the generic keyword guess every time.
  const priorCategories = buildPriorCategoryLookup(await transactionsRepo.listAll());

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
      category: resolveCategory(row.description, row.amountPence, priorCategories),
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
    if (input.endingValuation) {
      await valuationSnapshotsRepo.addSnapshot(
        input.account.id,
        input.endingValuation.date,
        input.endingValuation.valuePence,
        'statement',
        statementImportId,
      );
    } else {
      // Fallback for statements with no explicit account-total summary (or
      // parsed via the manual column-mapping UI): the latest-dated
      // transaction row that stated a running balance. For a cash account
      // this is the true balance; for a valuation-based one it may just be
      // leftover cash (see VanguardParser), so a parser-level
      // endingValuation is always preferred when available. Picks by date
      // rather than array position — input.rows is the user-editable
      // preview table, where each date is a free-text field, so it can't
      // be assumed to stay in parse order once the user edits one.
      const lastWithBalance = input.rows
        .filter((r) => r.balancePence !== null)
        .reduce<ParsedTransactionRow | null>((latest, r) => (latest === null || r.date >= latest.date ? r : latest), null);
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
  }

  const transferCandidatesFound = await runTransferMatching();

  return {
    statementImportId,
    transactionsInserted: insertedTransactions.length,
    transactionsSkippedDuplicate: skippedDuplicate,
    transferCandidatesFound,
  };
}
