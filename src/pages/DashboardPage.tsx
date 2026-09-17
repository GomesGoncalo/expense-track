import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAppStore } from '../state/store';
import { computeNetWorthSeries, computeNetWorthSummary } from '../reporting/netWorth';
import { computeIncomeExpenseSummary } from '../reporting/incomeExpense';
import { exportBackup, downloadBackup, readBackupFile, importBackup } from '../db/backup';
import { formatPence } from '../utils/currency';
import { todayIsoDate } from '../utils/dates';
import type { ImportMode } from '../db/backup';

type Period = 'this-month' | 'last-month' | 'ytd' | 'all-time';

function periodRange(period: Period): { start: string; end: string } {
  const today = todayIsoDate();
  const [year, month] = today.split('-').map(Number);
  if (period === 'this-month') {
    return { start: `${year}-${String(month).padStart(2, '0')}-01`, end: today };
  }
  if (period === 'last-month') {
    const lastMonthDate = new Date(year, month - 2, 1);
    const y = lastMonthDate.getFullYear();
    const m = lastMonthDate.getMonth() + 1;
    const lastDay = new Date(y, m, 0).getDate();
    return { start: `${y}-${String(m).padStart(2, '0')}-01`, end: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}` };
  }
  if (period === 'ytd') {
    return { start: `${year}-01-01`, end: today };
  }
  return { start: '0000-01-01', end: today };
}

export function DashboardPage() {
  const { accounts, transactions, valuationSnapshots, refresh } = useAppStore();
  const [period, setPeriod] = useState<Period>('this-month');
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const netWorth = useMemo(
    () => computeNetWorthSummary(accounts, transactions, valuationSnapshots),
    [accounts, transactions, valuationSnapshots],
  );
  const series = useMemo(
    () => computeNetWorthSeries(accounts, transactions, valuationSnapshots, 'week'),
    [accounts, transactions, valuationSnapshots],
  );
  const { start, end } = periodRange(period);
  const incomeExpense = useMemo(() => computeIncomeExpenseSummary(transactions, start, end), [transactions, start, end]);

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  async function handleExport() {
    const backup = await exportBackup();
    downloadBackup(backup);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const mode: ImportMode = confirm('Replace all local data with this backup? Choose Cancel to merge instead.')
      ? 'replace'
      : 'merge';
    try {
      const backup = await readBackupFile(file);
      const summary = await importBackup(backup, mode);
      setImportMessage(
        `Imported: ${summary.accountsAdded} account(s), ${summary.transactionsAdded} transaction(s) ` +
          `(${summary.transactionsSkippedDuplicate} duplicate(s) skipped).`,
      );
      await refresh();
    } catch (err) {
      setImportMessage(err instanceof Error ? err.message : 'Failed to import backup file.');
    } finally {
      e.target.value = '';
    }
  }

  return (
    <div className="page">
      <h2>Dashboard</h2>

      <div className="card">
        <h3>Net worth</h3>
        <p className="big-number">{formatPence(netWorth.combinedGbpTotalPence, 'GBP')}</p>
        {netWorth.subtotalsByCurrency.length > 1 && (
          <p className="muted">
            {netWorth.subtotalsByCurrency.map((s) => `${s.currency}: ${formatPence(s.totalPence, s.currency)}`).join('  ·  ')}
          </p>
        )}
        {netWorth.accountsMissingRate.length > 0 && (
          <p className="warnings-inline">
            {netWorth.accountsMissingRate.length} account(s) excluded from the combined total — set a manual GBP rate for
            them on the Accounts page.
          </p>
        )}
      </div>

      <div className="card">
        <h3>Net worth over time</h3>
        {series.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis tickFormatter={(v) => formatPence(v, 'GBP')} width={90} />
              <Tooltip formatter={(v) => formatPence(Number(v), 'GBP')} />
              <Area type="monotone" dataKey="totalGbpPence" stroke="#3b6fd6" fill="#3b6fd633" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="muted">Import some statements to see net worth over time.</p>
        )}
      </div>

      <div className="card">
        <h3>Accounts</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Balance</th>
              <th>As of</th>
            </tr>
          </thead>
          <tbody>
            {netWorth.subtotalsByCurrency
              .flatMap((s) => s.accountBalances)
              .map((b) => (
                <tr key={b.accountId}>
                  <td>{accountsById.get(b.accountId)?.name ?? '—'}</td>
                  <td>{formatPence(b.latestBalancePence, b.currency)}</td>
                  <td>{b.asOfDate}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Income &amp; expenses</h3>
        <label>
          Period
          <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            <option value="this-month">This month</option>
            <option value="last-month">Last month</option>
            <option value="ytd">Year to date</option>
            <option value="all-time">All time</option>
          </select>
        </label>
        <p>
          Income: {formatPence(incomeExpense.totalIncomePence, 'GBP')} &nbsp;·&nbsp; Expense:{' '}
          {formatPence(incomeExpense.totalExpensePence, 'GBP')} &nbsp;·&nbsp; Net: {formatPence(incomeExpense.netPence, 'GBP')}
        </p>
        <p className="muted">Confirmed transfers between your own accounts are excluded from these totals.</p>
      </div>

      <div className="card">
        <h3>Backup</h3>
        <div className="form-inline">
          <button onClick={handleExport}>Export JSON backup</button>
          <label className="file-button">
            Import JSON backup
            <input type="file" accept="application/json" onChange={handleImportFile} />
          </label>
        </div>
        {importMessage && <p className="muted">{importMessage}</p>}
      </div>
    </div>
  );
}
