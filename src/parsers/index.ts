import type { BankId } from '../domain/types';
import type { BankParser } from './BankParser';
import { FirstDirectParser } from './firstdirect/FirstDirectParser';
import { HsbcParser } from './hsbc/HsbcParser';
import { MonzoParser } from './monzo/MonzoParser';
import { RevolutParser } from './revolut/RevolutParser';
import { VanguardParser } from './vanguard/VanguardParser';
import { Trading212Parser } from './trading212/Trading212Parser';

export const PARSERS: Record<BankId, BankParser> = {
  'first-direct': FirstDirectParser,
  hsbc: HsbcParser,
  monzo: MonzoParser,
  revolut: RevolutParser,
  vanguard: VanguardParser,
  trading212: Trading212Parser,
};

export function getParserForBank(bank: BankId): BankParser {
  return PARSERS[bank];
}

export const BANK_LABELS: Record<BankId, string> = {
  'first-direct': 'First Direct',
  hsbc: 'HSBC',
  monzo: 'Monzo',
  revolut: 'Revolut',
  vanguard: 'Vanguard',
  trading212: 'Trading 212',
};
