import type { AccountType, BankId } from '../domain/types';
import type { BankParser } from './BankParser';
import { FirstDirectParser } from './firstdirect/FirstDirectParser';
import { HsbcParser } from './hsbc/HsbcParser';
import { HsbcCreditCardParser } from './hsbc/HsbcCreditCardParser';
import { ChaseParser } from './chase/ChaseParser';
import { MonzoParser } from './monzo/MonzoParser';
import { RevolutParser } from './revolut/RevolutParser';
import { VanguardParser } from './vanguard/VanguardParser';
import { Trading212Parser } from './trading212/Trading212Parser';

/** The default parser for each bank — its most common statement type (usually a current account). */
export const PARSERS: Record<BankId, BankParser> = {
  'first-direct': FirstDirectParser,
  hsbc: HsbcParser,
  chase: ChaseParser,
  monzo: MonzoParser,
  revolut: RevolutParser,
  vanguard: VanguardParser,
  trading212: Trading212Parser,
};

/**
 * A single bank can issue statements in incompatible layouts for different
 * account types (e.g. HSBC's credit card statement isn't a variant of its
 * current account one — different columns, no running balance, even an
 * inverted amount sign convention) — so parser selection needs both the
 * bank and the account type, not just the bank.
 */
const PRODUCT_PARSERS: Partial<Record<`${BankId}:${AccountType}`, BankParser>> = {
  'hsbc:credit-card': HsbcCreditCardParser,
};

export function getParserForAccount(bank: BankId, accountType: AccountType): BankParser {
  return PRODUCT_PARSERS[`${bank}:${accountType}`] ?? PARSERS[bank];
}

export const BANK_LABELS: Record<BankId, string> = {
  'first-direct': 'First Direct',
  hsbc: 'HSBC',
  chase: 'Chase',
  monzo: 'Monzo',
  revolut: 'Revolut',
  vanguard: 'Vanguard',
  trading212: 'Trading 212',
};
