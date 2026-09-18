import { useState } from 'react';
import { CheckCircle2, FileUp } from 'lucide-react';
import { useAppStore } from '../state/store';
import { extractPdfLines, joinPageLines } from '../parsers/pdfText';
import type { TextLine, DetectedColumn } from '../parsers/pdfText';
import { computeTextHash } from '../domain/hash';
import { getParserForAccount, BANK_LABELS } from '../parsers';
import { ParserError } from '../parsers/BankParser';
import type { ParsedTransactionRow } from '../parsers/BankParser';
import { detectColumnsForMapping, parseWithMapping } from '../parsers/manualMapping/ColumnMapper';
import { commitImport } from '../import/commitImport';
import * as statementImportsRepo from '../db/statementImportsRepo';
import { formatPence } from '../utils/currency';
import { ownerSummary } from '../utils/ownerSummary';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Table, type TableColumn } from '../components/ui/Table';
import { useToast } from '../components/ui/Toast';
import type { ColumnMapping } from '../domain/types';

type Stage = 'select' | 'mapping' | 'preview' | 'done';

interface EditableRow extends ParsedTransactionRow {
  include: boolean;
}

const DATE_FORMAT_OPTIONS = ['dd/MM/yyyy', 'dd MMM yyyy', 'dd MMM yy', 'dd/MM/yy', 'yyyy-MM-dd'];

const STAGE_LABEL: Record<Stage, string> = {
  select: 'Step 1 of 3 — Select a statement',
  mapping: 'Step 2 of 3 — Map the columns',
  preview: 'Step 2 of 3 — Review before committing',
  done: 'Done',
};

export function ImportPage() {
  const { accounts, persons, refresh } = useAppStore();
  const activeAccounts = accounts.filter((a) => !a.archived);
  const personsById = new Map(persons.map((p) => [p.id, p]));
  const { show } = useToast();

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
  const [endingValuation, setEndingValuation] = useState<{ date: string; valuePence: number } | null>(null);
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
  // Tracked separately from `stage`: applyMapping always advances stage to
  // 'preview' on success (same as the auto-parser path), so by the time
  // handleCommit runs, `stage === 'mapping'` is never true — checking it
  // there would silently lose which imports actually went through manual
  // mapping.
  const [usedManualMapping, setUsedManualMapping] = useState(false);
  const [duplicateImportWarning, setDuplicateImportWarning] = useState<string | null>(null);

  const effectiveAccountId = accountId || (activeAccounts[0]?.id ?? '');
  const account = activeAccounts.find((a) => a.id === effectiveAccountId);

  function applyParseResult(
    transactions: ParsedTransactionRow[],
    w: string[],
    start: string | null,
    end: string | null,
    valuation: { date: string; valuePence: number } | null = null,
  ) {
    setRows(transactions.map((t) => ({ ...t, include: true })));
    setWarnings(w);
    setPeriod({ start, end });
    setEndingValuation(valuation);
    setStage('preview');
  }

  async function handleParse() {
    if (!file || !account) return;
    setError(null);
    setUsedManualMapping(false);
    setDuplicateImportWarning(null);
    setBusy(true);
    try {
      const extractedPages = await extractPdfLines(file);
      setPages(extractedPages);
      const hash = await computeTextHash(joinPageLines(extractedPages));
      setRawTextHash(hash);

      const existingImport = await statementImportsRepo.findByRawTextHash(account.id, hash);
      if (existingImport) {
        setDuplicateImportWarning(
          `This looks like the same file as "${existingImport.fileName}", already imported on ${existingImport.importedAt.slice(0, 10)} — duplicate transactions below will be skipped automatically, but double check before committing.`,
        );
      }

      const parser = getParserForAccount(account.bank, account.accountType);
      if (!parser.detect(joinPageLines(extractedPages), extractedPages)) {
        setWarnings([`This file doesn't look like a ${BANK_LABELS[account.bank]} statement — check you picked the right account.`]);
      }

      try {
        const result = parser.parse(extractedPages);
        applyParseResult(
          result.transactions,
          result.warnings,
          result.statementPeriodStart,
          result.statementPeriodEnd,
          result.endingValuation ?? null,
        );
      } catch (err) {
        if (err instanceof ParserError) {
          setDetectedColumns(detectColumnsForMapping(extractedPages));
          setStage('mapping');
        } else {
          throw err;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read this PDF.';
      setError(message);
      show({ tone: 'error', message });
    } finally {
      setBusy(false);
    }
  }

  function applyMapping() {
    if (!account) return;
    const maxIndex = detectedColumns.length - 1;
    const chosenIndices = [
      mapping.dateColumnIndex,
      mapping.descriptionColumnIndex,
      mapping.moneyOutColumnIndex,
      mapping.moneyInColumnIndex,
      mapping.singleAmountColumnIndex,
      mapping.balanceColumnIndex,
    ].filter((i): i is number => i !== null);
    if (chosenIndices.some((i) => i < 0 || i > maxIndex)) {
      show({
        tone: 'error',
        message: `Column index out of range — this statement only has ${detectedColumns.length} detected column(s) (0-${maxIndex}).`,
      });
      return;
    }
    try {
      const result = parseWithMapping(pages, mapping, account.currency);
      setUsedManualMapping(true);
      applyParseResult(result.transactions, result.warnings, null, null);
    } catch (err) {
      show({ tone: 'error', message: err instanceof Error ? err.message : 'Failed to parse with this column mapping.' });
    }
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
        columnMappingUsed: usedManualMapping ? mapping : null,
        rows: included,
        endingValuation,
      });
      setSummary(
        `Imported ${result.transactionsInserted} transaction(s), skipped ${result.transactionsSkippedDuplicate} duplicate(s). ` +
          `${result.transferCandidatesFound} possible transfer(s) found — review them on the Transactions page.`,
      );
      setStage('done');
      await refresh();
    } catch (err) {
      show({ tone: 'error', message: err instanceof Error ? err.message : 'Failed to commit this import.' });
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
    setEndingValuation(null);
    setUsedManualMapping(false);
    setDuplicateImportWarning(null);
  }

  const previewColumns: TableColumn<EditableRow>[] = [
    {
      key: 'include',
      header: '',
      render: (row, i) => (
        <input type="checkbox" checked={row.include} onChange={(e) => updateRow(i, { include: e.target.checked })} />
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (row, i) => <input value={row.date} onChange={(e) => updateRow(i, { date: e.target.value })} />,
    },
    {
      key: 'description',
      header: 'Description',
      render: (row, i) => (
        <input value={row.description} onChange={(e) => updateRow(i, { description: e.target.value })} className="wide" />
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row) => <span className={row.amountPence < 0 ? 'negative' : 'positive'}>{formatPence(row.amountPence, row.currency)}</span>,
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      render: (row) => (row.balancePence !== null ? formatPence(row.balancePence, row.currency) : '—'),
    },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Import a statement</h2>
          <p className="page-subtitle">Upload a bank or investment statement PDF to add its transactions.</p>
        </div>
      </div>

      <p className="muted">{STAGE_LABEL[stage]}</p>

      <Card className="form-grid">
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
        <Button icon={<FileUp size={16} />} onClick={handleParse} disabled={!file || !account} loading={busy}>
          {busy ? 'Reading…' : 'Parse statement'}
        </Button>
        {error && <p className="error">{error}</p>}
      </Card>

      {stage === 'mapping' && (
        <Card title="Couldn't auto-detect the table — map the columns">
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
          <Button onClick={applyMapping}>Apply mapping</Button>
        </Card>
      )}

      {stage === 'preview' && (
        <Card title="Review before committing">
          {duplicateImportWarning && <p className="warnings-inline">{duplicateImportWarning}</p>}
          {warnings.length > 0 && (
            <ul className="warnings">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          {account?.valuationBased && (
            <p className="muted">
              {endingValuation
                ? `Account value on ${endingValuation.date}: ${formatPence(endingValuation.valuePence, account.currency)} — this will be recorded as the account's value.`
                : "This statement didn't state an account total — this account's value won't be updated from this import."}
            </p>
          )}
          <Table
            columns={previewColumns}
            rows={rows}
            rowKey={(_, i) => String(i)}
            rowClassName={(row) => (row.include ? undefined : 'excluded')}
            renderCard={(row, i) => (
              <>
                <label>
                  <span className="field-label">Include</span>
                  <input type="checkbox" checked={row.include} onChange={(e) => updateRow(i, { include: e.target.checked })} />
                </label>
                <label>
                  <span className="field-label">Date</span>
                  <input value={row.date} onChange={(e) => updateRow(i, { date: e.target.value })} />
                </label>
                <label>
                  <span className="field-label">Description</span>
                  <input value={row.description} onChange={(e) => updateRow(i, { description: e.target.value })} />
                </label>
                <div className="record-card-row">
                  <span className="record-card-secondary">Amount</span>
                  <span className={row.amountPence < 0 ? 'negative' : 'positive'}>{formatPence(row.amountPence, row.currency)}</span>
                </div>
                <div className="record-card-row">
                  <span className="record-card-secondary">Balance</span>
                  <span>{row.balancePence !== null ? formatPence(row.balancePence, row.currency) : '—'}</span>
                </div>
              </>
            )}
          />
          <Button onClick={handleCommit} loading={busy} style={{ marginTop: 14 }}>
            {busy ? 'Saving…' : `Commit ${rows.filter((r) => r.include).length} transaction(s)`}
          </Button>
        </Card>
      )}

      {stage === 'done' && (
        <Card>
          <p style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={20} className="positive" /> {summary}
          </p>
          <Button onClick={reset}>Import another statement</Button>
        </Card>
      )}
    </div>
  );
}
