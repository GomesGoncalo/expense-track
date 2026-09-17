import { daysBetween } from '../utils/dates';
import type { Transaction } from '../domain/types';

export interface TransferCandidate {
  outgoing: Transaction;
  incoming: Transaction;
  confidence: number;
  daysApart: number;
  amountDiffPence: number;
}

export interface MatchOptions {
  dateWindowDays: number;
  amountTolerancePence: number;
  amountTolerancePercent: number;
}

const DEFAULT_OPTIONS: MatchOptions = {
  dateWindowDays: 3,
  amountTolerancePence: 0,
  amountTolerancePercent: 0.02,
};

const TRANSFER_KEYWORDS = ['TRANSFER', 'FASTER PAYMENT', 'FPS', 'BANK TRANSFER'];

function amountsMatch(
  outgoingAbsPence: number,
  incomingAbsPence: number,
  sameCurrency: boolean,
  options: MatchOptions,
): boolean {
  const diff = Math.abs(outgoingAbsPence - incomingAbsPence);
  if (sameCurrency) {
    return diff <= options.amountTolerancePence;
  }
  const tolerance = outgoingAbsPence * options.amountTolerancePercent;
  return diff <= Math.max(tolerance, options.amountTolerancePence);
}

function descriptionKeywordBonus(outgoing: Transaction, incoming: Transaction): boolean {
  const combined = `${outgoing.description} ${incoming.description}`.toUpperCase();
  return TRANSFER_KEYWORDS.some((keyword) => combined.includes(keyword));
}

function scoreCandidate(
  outgoing: Transaction,
  incoming: Transaction,
  options: MatchOptions,
): TransferCandidate {
  const outgoingAbs = Math.abs(outgoing.amountPence);
  const incomingAbs = Math.abs(incoming.amountPence);
  const amountDiffPence = Math.abs(outgoingAbs - incomingAbs);
  const daysApart = daysBetween(outgoing.date, incoming.date);

  const amountDiffPercent = outgoingAbs === 0 ? 0 : amountDiffPence / outgoingAbs;
  const amountScore = Math.max(0, 1 - amountDiffPercent / Math.max(options.amountTolerancePercent, 0.0001));
  const dateScore = Math.max(0, 1 - daysApart / Math.max(options.dateWindowDays, 1));
  const keywordBonus = descriptionKeywordBonus(outgoing, incoming) ? 1 : 0;

  const confidence = Math.min(1, 0.5 * amountScore + 0.3 * dateScore + 0.2 * keywordBonus);

  return { outgoing, incoming, confidence, daysApart, amountDiffPence };
}

const MIN_CONFIDENCE_THRESHOLD = 0.4;

/**
 * Finds likely transfer pairs among unlinked transactions across different
 * accounts: an outgoing (negative) leg in one account matched to an incoming
 * (positive) leg in another, close in amount and date.
 */
export function findTransferCandidates(
  transactions: Transaction[],
  options: Partial<MatchOptions> = {},
): TransferCandidate[] {
  const opts: MatchOptions = { ...DEFAULT_OPTIONS, ...options };

  const unlinked = transactions.filter((t) => t.transferId === null);
  const outgoingTxns = unlinked.filter((t) => t.amountPence < 0);
  const incomingTxns = unlinked.filter((t) => t.amountPence > 0);

  const allCandidates: TransferCandidate[] = [];
  for (const outgoing of outgoingTxns) {
    for (const incoming of incomingTxns) {
      if (outgoing.accountId === incoming.accountId) continue;
      const sameCurrency = outgoing.currency === incoming.currency;
      if (
        !amountsMatch(Math.abs(outgoing.amountPence), Math.abs(incoming.amountPence), sameCurrency, opts)
      ) {
        continue;
      }
      if (daysBetween(outgoing.date, incoming.date) > opts.dateWindowDays) continue;

      const candidate = scoreCandidate(outgoing, incoming, opts);
      if (candidate.confidence >= MIN_CONFIDENCE_THRESHOLD) {
        allCandidates.push(candidate);
      }
    }
  }

  // Greedy bipartite matching: highest confidence first, each transaction used at most once.
  allCandidates.sort((a, b) => b.confidence - a.confidence);
  const usedOutgoing = new Set<string>();
  const usedIncoming = new Set<string>();
  const selected: TransferCandidate[] = [];
  for (const candidate of allCandidates) {
    if (usedOutgoing.has(candidate.outgoing.id) || usedIncoming.has(candidate.incoming.id)) continue;
    usedOutgoing.add(candidate.outgoing.id);
    usedIncoming.add(candidate.incoming.id);
    selected.push(candidate);
  }

  return selected;
}
