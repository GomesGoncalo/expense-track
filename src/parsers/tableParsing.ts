import { parseAmountToPence } from '../utils/currency';
import { parseStatementDate } from '../utils/dates';
import type { TextLine } from './pdfText';
import type { ParsedTransactionRow } from './BankParser';

export type ColumnRole =
  | 'date'
  | 'description'
  | 'moneyOut'
  | 'moneyIn'
  | 'singleAmount'
  | 'balance'
  | 'currency';

export interface HeaderLabelConfig {
  date: string[];
  description: string[];
  moneyOut?: string[];
  moneyIn?: string[];
  singleAmount?: string[];
  balance?: string[];
  currency?: string[];
}

export interface HeaderColumn {
  role: ColumnRole;
  xStart: number;
  xEnd: number;
}

export interface HeaderLocation {
  pageIndex: number;
  lineIndex: number;
  columns: HeaderColumn[];
}

function matchesAnyLabel(text: string, labels: string[]): boolean {
  const normalized = text.trim().toLowerCase();
  return labels.some((label) => normalized === label.toLowerCase() || normalized.includes(label.toLowerCase()));
}

function roleForText(text: string, config: HeaderLabelConfig): ColumnRole | null {
  if (matchesAnyLabel(text, config.date)) return 'date';
  if (matchesAnyLabel(text, config.description)) return 'description';
  if (config.moneyOut && matchesAnyLabel(text, config.moneyOut)) return 'moneyOut';
  if (config.moneyIn && matchesAnyLabel(text, config.moneyIn)) return 'moneyIn';
  if (config.singleAmount && matchesAnyLabel(text, config.singleAmount)) return 'singleAmount';
  if (config.balance && matchesAnyLabel(text, config.balance)) return 'balance';
  if (config.currency && matchesAnyLabel(text, config.currency)) return 'currency';
  return null;
}

/**
 * Scans all pages for a line whose items match at least a date label and
 * one of (description/singleAmount/moneyOut) — treated as the header row —
 * then derives column x-boundaries from the header items' positions (each
 * column spans from its item's x to the midpoint before the next item).
 */
export function findHeaderColumns(pages: TextLine[][], config: HeaderLabelConfig): HeaderLocation | null {
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const lines = pages[pageIndex];
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const roleHits = line.items
        .map((item) => ({ item, role: roleForText(item.str, config) }))
        .filter((h): h is { item: (typeof line.items)[number]; role: ColumnRole } => h.role !== null);

      const hasDate = roleHits.some((h) => h.role === 'date');
      const hasAmountish = roleHits.some((h) =>
        (['description', 'singleAmount', 'moneyOut', 'moneyIn'] as ColumnRole[]).includes(h.role),
      );
      if (!hasDate || !hasAmountish) continue;

      const sortedHits = [...roleHits].sort((a, b) => a.item.x - b.item.x);
      const columns: HeaderColumn[] = sortedHits.map((hit, i) => {
        const nextX = sortedHits[i + 1]?.item.x ?? Infinity;
        const xStart = i === 0 ? -Infinity : hit.item.x - 4;
        const xEnd = nextX === Infinity ? Infinity : (hit.item.x + nextX) / 2;
        return { role: hit.role, xStart, xEnd };
      });

      return { pageIndex, lineIndex, columns };
    }
  }
  return null;
}

export function textForRole(line: TextLine, columns: HeaderColumn[], role: ColumnRole): string {
  const column = columns.find((c) => c.role === role);
  if (!column) return '';
  return line.items
    .filter((item) => item.x >= column.xStart && item.x < column.xEnd)
    .map((item) => item.str)
    .join(' ')
    .trim();
}

export interface ParseTableOptions {
  dateFormat: string;
  defaultCurrency: string;
}

export interface TableParseResult {
  transactions: ParsedTransactionRow[];
  warnings: string[];
}

/**
 * Parses transaction rows from the lines following a detected header,
 * merging wrapped description-only lines (no parseable date) into the
 * previous transaction.
 */
export function parseTableRows(
  pages: TextLine[][],
  header: HeaderLocation,
  options: ParseTableOptions,
): TableParseResult {
  return parseRowsFromColumns(pages, header.columns, header.pageIndex, header.lineIndex + 1, options);
}

/**
 * Core row parser: walks lines from (startPageIndex, startLineIndex) onward,
 * slicing each line's text items into the given column bands. Shared by the
 * header-label-driven per-bank parsers and the manual column-mapping fallback.
 */
export function parseRowsFromColumns(
  pages: TextLine[][],
  columns: HeaderColumn[],
  startPageIndex: number,
  startLineIndex: number,
  options: ParseTableOptions,
): TableParseResult {
  const transactions: ParsedTransactionRow[] = [];
  const warnings: string[] = [];

  for (let pageIndex = startPageIndex; pageIndex < pages.length; pageIndex += 1) {
    const lines = pages[pageIndex];
    const startLine = pageIndex === startPageIndex ? startLineIndex : 0;

    for (let lineIndex = startLine; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const dateText = textForRole(line, columns, 'date');
      const descriptionText = textForRole(line, columns, 'description');

      let isoDate: string | null = null;
      if (dateText) {
        try {
          isoDate = parseStatementDate(dateText, options.dateFormat);
        } catch {
          isoDate = null;
        }
      }

      if (!isoDate) {
        // No parseable date on this line: treat as a wrapped continuation
        // of the previous transaction's description, if any.
        const wrapText = line.text.trim();
        if (wrapText && transactions.length > 0) {
          transactions[transactions.length - 1].description += ` ${wrapText}`;
        }
        continue;
      }

      const moneyOutText = textForRole(line, columns, 'moneyOut');
      const moneyInText = textForRole(line, columns, 'moneyIn');
      const singleAmountText = textForRole(line, columns, 'singleAmount');
      const balanceText = textForRole(line, columns, 'balance');
      const currencyText = textForRole(line, columns, 'currency');

      let amountPence: number | null = null;
      try {
        if (singleAmountText) {
          amountPence = parseAmountToPence(singleAmountText);
        } else if (moneyOutText) {
          amountPence = -Math.abs(parseAmountToPence(moneyOutText));
        } else if (moneyInText) {
          amountPence = Math.abs(parseAmountToPence(moneyInText));
        }
      } catch {
        amountPence = null;
      }

      if (amountPence === null) {
        warnings.push(`Skipped row with unparseable amount on ${dateText}: "${line.text}"`);
        continue;
      }

      let balancePence: number | null = null;
      if (balanceText) {
        try {
          balancePence = parseAmountToPence(balanceText);
        } catch {
          balancePence = null;
        }
      }

      transactions.push({
        date: isoDate,
        description: descriptionText || line.text.trim(),
        amountPence,
        balancePence,
        currency: currencyText || options.defaultCurrency,
      });
    }
  }

  return { transactions, warnings };
}

export function periodFromTransactions(
  transactions: ParsedTransactionRow[],
): { start: string | null; end: string | null } {
  if (transactions.length === 0) return { start: null, end: null };
  const dates = transactions.map((t) => t.date).sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}
