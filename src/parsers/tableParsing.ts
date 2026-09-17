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

function despace(text: string): string {
  return text.replace(/\s+/g, '');
}

/**
 * Some statement PDFs (HSBC/First Direct observed in practice) bake extra
 * whitespace into a single header text run for justification, e.g.
 * "Pay m e nt t y pe and de t ails" as one literal string. A plain substring
 * check on the spaced text would miss "details"/"type", so also compare
 * with all whitespace stripped from both sides.
 */
function matchesAnyLabel(text: string, labels: string[]): boolean {
  const normalized = text.trim().toLowerCase();
  const compact = despace(normalized);
  return labels.some((label) => {
    const labelLower = label.toLowerCase();
    return normalized.includes(labelLower) || compact.includes(despace(labelLower));
  });
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

function headerRoleHits(line: TextLine, config: HeaderLabelConfig) {
  return line.items
    .map((item) => ({ item, role: roleForText(item.str, config) }))
    .filter((h): h is { item: (typeof line.items)[number]; role: ColumnRole } => h.role !== null);
}

function lineLooksLikeHeader(line: TextLine, config: HeaderLabelConfig): boolean {
  const hits = headerRoleHits(line, config);
  const hasDate = hits.some((h) => h.role === 'date');
  const hasAmountish = hits.some((h) =>
    (['description', 'singleAmount', 'moneyOut', 'moneyIn'] as ColumnRole[]).includes(h.role),
  );
  return hasDate && hasAmountish;
}

/** Finds the index of the first header-like line within a single page's lines, if any. */
export function findHeaderRowIndexInLines(lines: TextLine[], config: HeaderLabelConfig): number | null {
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (lineLooksLikeHeader(lines[lineIndex], config)) return lineIndex;
  }
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
    const lineIndex = findHeaderRowIndexInLines(lines, config);
    if (lineIndex === null) continue;

    const line = lines[lineIndex];
    const sortedHits = [...headerRoleHits(line, config)].sort((a, b) => a.item.x - b.item.x);
    const columns: HeaderColumn[] = sortedHits.map((hit, i) => {
      const nextX = sortedHits[i + 1]?.item.x ?? Infinity;
      const xStart = i === 0 ? -Infinity : hit.item.x - 4;
      const xEnd = nextX === Infinity ? Infinity : (hit.item.x + nextX) / 2;
      return { role: hit.role, xStart, xEnd };
    });

    return { pageIndex, lineIndex, columns };
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
 * previous transaction. Passing the same headerConfig used to find the
 * header lets later pages' repeated headers (and anything printed above
 * them, like a repeated account-details block) be skipped too.
 */
export function parseTableRows(
  pages: TextLine[][],
  header: HeaderLocation,
  options: ParseTableOptions,
  headerConfig?: HeaderLabelConfig,
): TableParseResult {
  return parseRowsFromColumns(
    pages,
    header.columns,
    header.pageIndex,
    header.lineIndex + 1,
    options,
    headerConfig,
  );
}

function isBalanceMarkerLine(descriptionText: string, phrase: 'brought' | 'carried'): boolean {
  const compact = despace(descriptionText.toLowerCase());
  return compact.includes(despace(`balance ${phrase} forward`));
}

/**
 * Core row parser: walks lines from (startPageIndex, startLineIndex) onward,
 * slicing each line's text items into the given column bands. Shared by the
 * header-label-driven per-bank parsers and the manual column-mapping fallback.
 *
 * Some banks (HSBC/First Direct observed in practice) only print the date
 * once per day and list that day's transactions as several lines below it,
 * each transaction itself often spanning two lines: a first line with a
 * payment-type code and the start of the description (no amount yet), then
 * a second line with the rest of the description and the amount (and,
 * on the last transaction of the day, the running balance). So rather than
 * starting a new transaction on every dated line, this walks lines
 * carrying the most recently seen date forward, accumulating description
 * text until a line supplies an amount — that line finalizes and emits the
 * transaction. This also correctly handles the simpler case (used by e.g.
 * Monzo/Revolut) where every line is fully self-contained with its own
 * date and amount: there's nothing to accumulate, so each line just emits
 * immediately as before.
 */
export function parseRowsFromColumns(
  pages: TextLine[][],
  columns: HeaderColumn[],
  startPageIndex: number,
  startLineIndex: number,
  options: ParseTableOptions,
  headerConfig?: HeaderLabelConfig,
): TableParseResult {
  const transactions: ParsedTransactionRow[] = [];
  const warnings: string[] = [];

  let currentDate: string | null = null;
  let pendingDescriptionParts: string[] = [];

  for (let pageIndex = startPageIndex; pageIndex < pages.length; pageIndex += 1) {
    const lines = pages[pageIndex];
    let startLine = pageIndex === startPageIndex ? startLineIndex : 0;

    // On pages after the first, re-locate this page's own repeated header
    // (statements often reprint the table header, and anything above it —
    // e.g. a repeated account-details block — isn't transaction data).
    if (pageIndex !== startPageIndex && headerConfig) {
      const repeatedHeaderIndex = findHeaderRowIndexInLines(lines, headerConfig);
      if (repeatedHeaderIndex !== null) {
        startLine = repeatedHeaderIndex + 1;
      }
    }

    for (let lineIndex = startLine; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const dateText = textForRole(line, columns, 'date');

      // A repeated table header we didn't already skip above (e.g. no
      // headerConfig was supplied) — skip it, it's not transaction data.
      if (dateText.trim().toLowerCase() === 'date') continue;

      if (dateText) {
        try {
          currentDate = parseStatementDate(dateText, options.dateFormat);
        } catch {
          // leave currentDate as-is; an unparseable date string here is
          // unexpected but shouldn't discard an otherwise good row.
        }
      }

      const descriptionText = textForRole(line, columns, 'description');

      // An opening-balance marker is statement furniture, not a transaction
      // — reset any accumulated description so it doesn't leak into the
      // next real transaction.
      if (isBalanceMarkerLine(descriptionText, 'brought')) {
        pendingDescriptionParts = [];
        continue;
      }
      // A closing-balance marker means this page's transaction table is
      // over — anything printed below it (rate tables, T&Cs, footnotes)
      // isn't transaction data either, so stop scanning this page.
      if (isBalanceMarkerLine(descriptionText, 'carried')) {
        break;
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
        // No amount yet on this line: it's the start (or a middle segment)
        // of a transaction description that continues on a later line.
        if (descriptionText) pendingDescriptionParts.push(descriptionText);
        continue;
      }

      if (currentDate === null) {
        warnings.push(`Skipped row with an amount but no date seen yet: "${line.text}"`);
        pendingDescriptionParts = [];
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

      const fullDescription = [...pendingDescriptionParts, descriptionText].filter(Boolean).join(' ').trim();
      pendingDescriptionParts = [];

      transactions.push({
        date: currentDate,
        description: fullDescription || line.text.trim(),
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
