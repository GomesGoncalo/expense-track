import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem as PdfJsTextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api';

export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

export interface TextLine {
  y: number;
  items: TextItem[];
  text: string;
}

export interface DetectedColumn {
  xStart: number;
  xEnd: number;
  sampleHeader: string | null;
}

const Y_CLUSTER_TOLERANCE = 2.5;

function isMarkedContent(item: PdfJsTextItem | TextMarkedContent): item is TextMarkedContent {
  return !('transform' in item);
}

/** Extracts positioned text from a PDF file, grouped into lines per page. */
export async function extractPdfLines(file: File): Promise<TextLine[][]> {
  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;

  const pages: TextLine[][] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    const items: TextItem[] = content.items
      .filter((item): item is PdfJsTextItem => !isMarkedContent(item) && item.str.trim() !== '')
      .map((item) => ({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
      }));

    pages.push(clusterIntoLines(items));
  }
  return pages;
}

function clusterIntoLines(items: TextItem[]): TextLine[] {
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const lines: TextLine[] = [];

  for (const item of sorted) {
    let line = lines.find((l) => Math.abs(l.y - item.y) <= Y_CLUSTER_TOLERANCE);
    if (!line) {
      line = { y: item.y, items: [], text: '' };
      lines.push(line);
    }
    line.items.push(item);
  }

  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    line.text = line.items.map((i) => i.str).join(' ');
  }

  return lines;
}

/**
 * Clusters x-start positions across many lines into candidate column bands.
 * Used both by bank parsers (to locate columns near a known header) and by
 * the manual-mapping fallback UI (to let the user assign columns by hand).
 */
export function detectColumns(lines: TextLine[], tolerance = 8): DetectedColumn[] {
  const xStarts = lines.flatMap((line) => line.items.map((item) => item.x)).sort((a, b) => a - b);
  if (xStarts.length === 0) return [];

  const clusters: number[][] = [];
  for (const x of xStarts) {
    const cluster = clusters.find((c) => Math.abs(c[c.length - 1] - x) <= tolerance);
    if (cluster) {
      cluster.push(x);
    } else {
      clusters.push([x]);
    }
  }

  return clusters.map((cluster) => {
    const xStart = Math.min(...cluster);
    const xEnd = Math.max(...cluster);
    const headerLine = lines.find((line) =>
      line.items.some((item) => item.x >= xStart - tolerance && item.x <= xEnd + tolerance),
    );
    const headerItem = headerLine?.items.find(
      (item) => item.x >= xStart - tolerance && item.x <= xEnd + tolerance,
    );
    return { xStart, xEnd, sampleHeader: headerItem?.str ?? null };
  });
}

/** Finds the text item(s) within a line that fall inside a given x-range. */
export function textInColumn(line: TextLine, xStart: number, xEnd: number, padding = 8): string {
  return line.items
    .filter((item) => item.x >= xStart - padding && item.x <= xEnd + padding)
    .map((item) => item.str)
    .join(' ')
    .trim();
}

export function joinPageLines(pages: TextLine[][]): string {
  return pages.map((lines) => lines.map((l) => l.text).join('\n')).join('\n');
}
