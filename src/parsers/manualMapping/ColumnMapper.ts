import { detectColumns } from '../pdfText';
import type { DetectedColumn, TextLine } from '../pdfText';
import { parseRowsFromColumns } from '../tableParsing';
import type { ColumnRole, HeaderColumn, TableParseResult } from '../tableParsing';
import type { ColumnMapping } from '../../domain/types';

/** Flattens all pages' lines for column detection across the whole document. */
export function detectColumnsForMapping(pages: TextLine[][]): DetectedColumn[] {
  return detectColumns(pages.flat());
}

function toHeaderColumn(detected: DetectedColumn, role: ColumnRole): HeaderColumn {
  return { role, xStart: detected.xStart - 4, xEnd: detected.xEnd + 4 };
}

/**
 * Parses a statement using a user-confirmed column mapping (the fallback UI
 * shown when a bank's auto-parser fails). Mapping indices refer to the
 * columns returned by detectColumnsForMapping for the same pages.
 */
export function parseWithMapping(
  pages: TextLine[][],
  mapping: ColumnMapping,
  defaultCurrency: string,
): TableParseResult {
  const detected = detectColumnsForMapping(pages);

  const columns: HeaderColumn[] = [
    toHeaderColumn(detected[mapping.dateColumnIndex], 'date'),
    toHeaderColumn(detected[mapping.descriptionColumnIndex], 'description'),
  ];
  if (mapping.moneyOutColumnIndex !== null) {
    columns.push(toHeaderColumn(detected[mapping.moneyOutColumnIndex], 'moneyOut'));
  }
  if (mapping.moneyInColumnIndex !== null) {
    columns.push(toHeaderColumn(detected[mapping.moneyInColumnIndex], 'moneyIn'));
  }
  if (mapping.singleAmountColumnIndex !== null) {
    columns.push(toHeaderColumn(detected[mapping.singleAmountColumnIndex], 'singleAmount'));
  }
  if (mapping.balanceColumnIndex !== null) {
    columns.push(toHeaderColumn(detected[mapping.balanceColumnIndex], 'balance'));
  }

  const startLineIndex = (mapping.headerRowIndex ?? -1) + 1;

  return parseRowsFromColumns(pages, columns, 0, startLineIndex, {
    dateFormat: mapping.dateFormat,
    defaultCurrency,
  });
}
