import { useState } from 'react';
import { CheckCircle2, FileUp } from 'lucide-react';
import { useAppStore } from '../state/store';
import { extractPdfLines, joinPageLines } from '../parsers/pdfText';
import type { TextLine, DetectedColumn } from '../parsers/pdfText';
import { computeTextHash } from '../domain/hash';
import { getParserForBank, BANK_LABELS } from '../parsers';
import { ParserError } from '../parsers/BankParser';
import type { ParsedTransactionRow } from '../parsers/BankParser';
import { detectColumnsForMapping, parseWithMapping } from '../parsers/manualMapping/ColumnMapper';
import { commitImport } from '../import/commitImport';
import { formatPence } from '../utils/currency';
import { ownerSummary } from '../utils/ownerSummary';
import type { ColumnMapping } from '../domain/types';

type Stage = 'select' | 'mapping' | 'preview' | 'done';

interface EditableRow extends ParsedTransactionRow {
  include: boolean;
}

const DATE_FORMAT_OPTIONS = ['dd/MM/yyyy', 'dd MMM yyyy', 'dd MMM yy', 'dd/MM/yy', 'yyyy-MM-dd'];

export function ImportPage() {
  const { accounts, persons, refresh } = useAppStore();
  const activeAccounts = accounts.filter((a) => !a.archived);
  const personsById = new Map(persons.map((p) => [p.id, p]));

  // Not initialized from activeAccounts[0] directly: accounts load asynchronously
  // from IndexedDB after mount, so that value would often still be empty here.
  // Falling back below (effectiveAccountId) keeps the first account selected
  // by default without needing an effect, and still lets the user pick another.
  const [accountId, setAccountId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>('select');
  const [pages, setPages] = useState<TextLine[][]>([]);
  const [rawTextHash, setRawTextHash] = useState('');
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [period, setPeriod] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [error, setError] = useState<string | null>(null);
  const [detectedColumns, setDetectedColumns] = useState<DetectedColumn[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    dateColumnIndex: 0,
    descriptionColumnIndex: 1,
    moneyOutColumnIndex: null,
    moneyInColumnIndex: null,
    singleAmountColumnIndex: 2,
    balanceColumnIndex: 3,
    dateFormat: 'dd/MM/yyyy',
    headerRowIndex: 0,
  });
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const effectiveAccountId = accountId || (activeAccounts[0]?.id ?? '');
  const account = activeAccounts.find((a) => a.id === effectiveAccountId);

  function applyParseResult(transactions: ParsedTransactionRow[], w: string[], start: string | null, end: string | null) {
    setRows(transactions.map((t) => ({ ...t, include: true })));
    setWarnings(w);
    setPeriod({ start, end });
    setStage('preview');
  }

  async function handleParse() {
    if (!file || !account) return;
    setError(null);
    setBusy(true);
    try {
      const extractedPages = await extractPdfLines(file);
      setPages(extractedPages);
      const hash = await computeTextHash(joinPageLines(extractedPages));
      setRawTextHash(hash);

      const parser = getParserForBank(account.bank);
      if (!parser.detect(joinPageLines(extractedPages), extractedPages)) {
        setWarnings([`This file doesn't look like a ${BANK_LABELS[account.bank]} statement — check you picked the right account.`]);
      }

      try {
        const result = parser.parse(extractedPages);
        applyParseResult(result.transactions, result.warnings, result.statementPeriodStart, result.statementPeriodEnd);
      } catch (err) {
        if (err instanceof ParserError) {
          setDetectedColumns(detectColumnsForMapping(extractedPages));
          setStage('mapping');
        } else {
          throw err;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read this PDF.');
    } finally {
      setBusy(false);
    }
  }

  function applyMapping() {
    if (!account) return;
    const result = parseWithMapping(pages, mapping, account.currency);
    applyParseResult(result.transactions, result.warnings, null, null);
  }

  function updateRow(index: number, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function handleCommit() {
    if (!account) return;
    setBusy(true);
    try {
      const included = rows.filter((r) => r.include);
      const result = await commitImport({
        account,
        fileName: file?.name ?? 'statement.pdf',
        rawTextHash,
        pageCount: pages.length,
        statementPeriodStart: period.start,
        statementPeriodEnd: period.end,
        columnMappingUsed: stage === 'mapping' ? mapping : null,
        rows: included,
      });
      setSummary(
        `Imported ${result.transactionsInserted} transaction(s), skipped ${result.transactionsSkippedDuplicate} duplicate(s). ` +
          `${result.transferCandidatesFound} possible transfer(s) found — review them on the Transactions page.`,
      );
      setStage('done');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setStage('select');
    setRows([]);
    setWarnings([]);
    setError(null);
    setSummary(null);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Import a statement</h2>
          <p className="page-subtitle">Upload a bank or investment statement PDF to add its transactions.</p>
        </div>
      </div>

      <div className="card form-grid">
        <label>
          Account
          <select value={effectiveAccountId} onChange={(e) => setAccountId(e.target.value)}>
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({BANK_LABELS[a.bank]}) — {ownerSummary(a.owners, personsById)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Statement PDF
          <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button className="btn btn-primary" onClick={handleParse} disabled={!file || !account || busy}>
          <FileUp size={16} /> {busy ? 'Reading…' : 'Parse statement'}
        </button>
        {error && <p className="error">{error}</p>}
      </div>

      {stage === 'mapping' && (
        <div className="card">
          <h3>Couldn&apos;t auto-detect the table — map the columns</h3>
          <p className="muted">
            Detected columns: {detectedColumns.map((c, i) => `[${i}] ${c.sampleHeader ?? '(no header text)'}`).join('  ')}
          </p>
          <div className="form-grid">
            <label>
              Date column index
              <input
                type="number"
                value={mapping.dateColumnIndex}
                onChange={(e) => setMapping((m) => ({ ...m, dateColumnIndex: Number(e.target.value) }))}
              />
            </label>
            <label>
              Description column index
              <input
                type="number"
                value={mapping.descriptionColumnIndex}
                onChange={(e) => setMapping((m) => ({ ...m, descriptionColumnIndex: Number(e.target.value) }))}
              />
            </label>
            <label>
              Single signed amount column index (leave -1 to use money out/in instead)
              <input
                type="number"
                value={mapping.singleAmountColumnIndex ?? -1}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setMapping((m) => ({ ...m, singleAmountColumnIndex: v < 0 ? null : v }));
                }}
              />
            </label>
            <label>
              Money out column index (-1 if using single amount)
              <input
                type="number"
                value={mapping.moneyOutColumnIndex ?? -1}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setMapping((m) => ({ ...m, moneyOutColumnIndex: v < 0 ? null : v }));
                }}
              />
            </label>
            <label>
              Money in column index (-1 if using single amount)
              <input
                type="number"
                value={mapping.moneyInColumnIndex ?? -1}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setMapping((m) => ({ ...m, moneyInColumnIndex: v < 0 ? null : v }));
                }}
              />
            </label>
            <label>
              Balance column index (-1 if none)
              <input
                type="number"
                value={mapping.balanceColumnIndex ?? -1}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setMapping((m) => ({ ...m, balanceColumnIndex: v < 0 ? null : v }));
                }}
              />
            </label>
            <label>
              Header row index (0 if the first line is the header)
              <input
                type="number"
                value={mapping.headerRowIndex ?? 0}
                onChange={(e) => setMapping((m) => ({ ...m, headerRowIndex: Number(e.target.value) }))}
              />
            </label>
            <label>
              Date format
              <select value={mapping.dateFormat} onChange={(e) => setMapping((m) => ({ ...m, dateFormat: e.target.value }))}>
                {DATE_FORMAT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className="btn btn-primary" onClick={applyMapping}>
            Apply mapping
          </button>
        </div>
      )}

      {stage === 'preview' && (
        <div className="card">
          <h3>Review before committing</h3>
          {warnings.length > 0 && (
            <ul className="warnings">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th></th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className={row.include ? '' : 'excluded'}>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={(e) => updateRow(i, { include: e.target.checked })}
                      />
                    </td>
                    <td>
                      <input value={row.date} onChange={(e) => updateRow(i, { date: e.target.value })} />
                    </td>
                    <td>
                      <input
                        value={row.description}
                        onChange={(e) => updateRow(i, { description: e.target.value })}
                        className="wide"
                      />
                    </td>
                    <td className={row.amountPence < 0 ? 'negative' : 'positive'}>
                      {formatPence(row.amountPence, row.currency)}
                    </td>
                    <td>{row.balancePence !== null ? formatPence(row.balancePence, row.currency) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-primary" onClick={handleCommit} disabled={busy} style={{ marginTop: 14 }}>
            {busy ? 'Saving…' : `Commit ${rows.filter((r) => r.include).length} transaction(s)`}
          </button>
        </div>
      )}

      {stage === 'done' && (
        <div className="card">
          <p style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={20} className="positive" /> {summary}
          </p>
          <button className="btn btn-primary" onClick={reset}>
            Import another statement
          </button>
        </div>
      )}
    </div>
  );
}
