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

function tryScore(
  outgoing: Transaction,
  incoming: Transaction,
  opts: MatchOptions,
  allCandidates: TransferCandidate[],
): void {
  if (outgoing.accountId === incoming.accountId) return;
  if (daysBetween(outgoing.date, incoming.date) > opts.dateWindowDays) return;
  const candidate = scoreCandidate(outgoing, incoming, opts);
  if (candidate.confidence >= MIN_CONFIDENCE_THRESHOLD) allCandidates.push(candidate);
}

/**
 * Finds likely transfer pairs among unlinked transactions across different
 * accounts: an outgoing (negative) leg in one account matched to an incoming
 * (positive) leg in another, close in amount and date.
 *
 * Candidate generation is indexed by currency + exact amount rather than a
 * plain nested loop over every outgoing×incoming pair: with the default
 * options (same-currency legs must match to the exact pence), that lookup
 * is O(1) per outgoing transaction instead of O(incoming count), which
 * matters once a household's history grows into the thousands of
 * transactions. Cross-currency legs use a percentage tolerance, so they
 * can't be exact-amount-indexed and fall back to a scan — but only within
 * that (usually small) other-currency subset, not the whole dataset. If
 * `amountTolerancePence` is overridden away from its 0 default, same-currency
 * legs need the same tolerance-scan fallback, since an exact-amount index
 * can no longer answer "within N pence" lookups.
 */
export function findTransferCandidates(
  transactions: Transaction[],
  options: Partial<MatchOptions> = {},
): TransferCandidate[] {
  const opts: MatchOptions = { ...DEFAULT_OPTIONS, ...options };
  const exactAmountMatchOnly = opts.amountTolerancePence === 0;

  const unlinked = transactions.filter((t) => t.transferId === null);
  const outgoingTxns = unlinked.filter((t) => t.amountPence < 0);
  const incomingTxns = unlinked.filter((t) => t.amountPence > 0);

  // Same-currency incoming transactions, indexed by exact amount magnitude.
  const incomingByCurrencyAndAmount = new Map<string, Map<number, Transaction[]>>();
  // Every incoming transaction, indexed by currency only — used for the
  // cross-currency tolerance scan (and as the same-currency fallback when
  // amountTolerancePence is overridden to non-zero).
  const incomingByCurrency = new Map<string, Transaction[]>();
  for (const incoming of incomingTxns) {
    const currencyList = incomingByCurrency.get(incoming.currency);
    if (currencyList) currencyList.push(incoming);
    else incomingByCurrency.set(incoming.currency, [incoming]);

    let byAmount = incomingByCurrencyAndAmount.get(incoming.currency);
    if (!byAmount) {
      byAmount = new Map();
      incomingByCurrencyAndAmount.set(incoming.currency, byAmount);
    }
    const amount = Math.abs(incoming.amountPence);
    const amountList = byAmount.get(amount);
    if (amountList) amountList.push(incoming);
    else byAmount.set(amount, [incoming]);
  }

  const allCandidates: TransferCandidate[] = [];
  for (const outgoing of outgoingTxns) {
    const outgoingAbs = Math.abs(outgoing.amountPence);

    if (exactAmountMatchOnly) {
      const sameCurrencyMatches = incomingByCurrencyAndAmount.get(outgoing.currency)?.get(outgoingAbs) ?? [];
      for (const incoming of sameCurrencyMatches) tryScore(outgoing, incoming, opts, allCandidates);
    } else {
      const sameCurrencyMatches = incomingByCurrency.get(outgoing.currency) ?? [];
      for (const incoming of sameCurrencyMatches) {
        if (!amountsMatch(outgoingAbs, Math.abs(incoming.amountPence), true, opts)) continue;
        tryScore(outgoing, incoming, opts, allCandidates);
      }
    }

    for (const [currency, incomingList] of incomingByCurrency) {
      if (currency === outgoing.currency) continue;
      for (const incoming of incomingList) {
        if (!amountsMatch(outgoingAbs, Math.abs(incoming.amountPence), false, opts)) continue;
        tryScore(outgoing, incoming, opts, allCandidates);
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
