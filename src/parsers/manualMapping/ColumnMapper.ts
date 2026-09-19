import { detectColumns } from '../pdfText';
import type { DetectedColumn, TextLine } from '../pdfText';
import { parseRowsFromColumns } from '../tableParsing';
import type { ColumnRole, HeaderColumn, HeaderLabelConfig, TableParseResult } from '../tableParsing';
import type { ColumnMapping } from '../../domain/types';

/** Flattens all pages' lines for column detection across the whole document. */
export function detectColumnsForMapping(pages: TextLine[][]): DetectedColumn[] {
  return detectColumns(pages.flat());
}

function toHeaderColumn(detected: DetectedColumn, role: ColumnRole): HeaderColumn {
  return { role, xStart: detected.xStart - 4, xEnd: detected.xEnd + 4 };
}

/**
 * Builds a HeaderLabelConfig from the actual header text under the user's
 * chosen columns, so parseRowsFromColumns can re-locate this statement's
 * header row on later pages the same way every real bank parser does
 * (see its own doc comment for why that matters — without it, a repeated
 * header row or a trailing T&Cs page gets scanned as transaction data).
 * Returns undefined when the date/description columns have no header text
 * to match against, since there's nothing to re-detect with.
 */
function buildHeaderConfig(detected: DetectedColumn[], mapping: ColumnMapping): HeaderLabelConfig | undefined {
  const dateLabel = detected[mapping.dateColumnIndex]?.sampleHeader;
  const descriptionLabel = detected[mapping.descriptionColumnIndex]?.sampleHeader;
  if (!dateLabel || !descriptionLabel) return undefined;

  const config: HeaderLabelConfig = { date: [dateLabel], description: [descriptionLabel] };
  const addLabel = (role: 'moneyOut' | 'moneyIn' | 'singleAmount' | 'balance', index: number | null) => {
    const label = index !== null ? detected[index]?.sampleHeader : null;
    if (label) config[role] = [label];
  };
  addLabel('moneyOut', mapping.moneyOutColumnIndex);
  addLabel('moneyIn', mapping.moneyInColumnIndex);
  addLabel('singleAmount', mapping.singleAmountColumnIndex);
  addLabel('balance', mapping.balanceColumnIndex);
  return config;
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

  return parseRowsFromColumns(
    pages,
    columns,
    0,
    startLineIndex,
    { dateFormat: mapping.dateFormat, defaultCurrency },
    buildHeaderConfig(detected, mapping),
  );
}
