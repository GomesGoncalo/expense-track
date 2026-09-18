import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Download, TrendingUp, Upload, Wallet } from 'lucide-react';
import { useAppStore } from '../state/store';
import { computeNetWorthSeries, computeNetWorthSummary } from '../reporting/netWorth';
import { computeIncomeExpenseSeries, computeIncomeExpenseSummary } from '../reporting/incomeExpense';
import { exportBackup, downloadBackup, readBackupFile, importBackup } from '../db/backup';
import { formatPence } from '../utils/currency';
import { todayIsoDate } from '../utils/dates';
import { getCategoricalColor, useColorScheme } from '../utils/palette';
import { EmptyState } from '../components/common/EmptyState';
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
  const scheme = useColorScheme();
  const accentColor = getCategoricalColor(0, scheme === 'dark');

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
  const cashFlowSeries = useMemo(() => computeIncomeExpenseSeries(transactions, 'month'), [transactions]);
  const cashFlowChartData = cashFlowSeries.map((p) => ({
    period: p.period.slice(0, 7),
    Income: p.incomePence / 100,
    Expense: p.expensePence / 100,
  }));

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  async function handleExport() {
    const backup = await exportBackup();
    downloadBackup(backup);
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const mode: ImportMode = confirm('Replace all local data with this backup? Choose Cancel to merge instead.')
      ? 'replace'
      : 'merge';
    try {
      const backup = await readBackupFile(file);
      const summary = await importBackup(backup, mode);
      setImportMessage(
        `Imported: ${summary.personsAdded} person(s), ${summary.accountsAdded} account(s), ${summary.transactionsAdded} transaction(s) ` +
          `(${summary.transactionsSkippedDuplicate} duplicate(s) skipped).`,
      );
      await refresh();
    } catch (err) {
      setImportMessage(err instanceof Error ? err.message : 'Failed to import backup file.');
    } finally {
      e.target.value = '';
    }
  }

  const accountBalanceRows = netWorth.subtotalsByCurrency.flatMap((s) => s.accountBalances);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p className="page-subtitle">Your overall net worth and cash flow, all in one place.</p>
        </div>
      </div>

      <div className="card">
        <h3>
          <Wallet size={18} /> Net worth
        </h3>
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
        <h3>
          <TrendingUp size={18} /> Net worth over time
        </h3>
        {series.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={series}>
              <CartesianGrid strokeDasharray="3 3" className="chart-grid" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => formatPence(v, 'GBP')} width={90} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => formatPence(Number(v), 'GBP')} />
              <Area type="monotone" dataKey="totalGbpPence" stroke={accentColor} fill={accentColor} fillOpacity={0.18} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState title="No data yet" description="Import a statement to see your net worth trend here." />
        )}
      </div>

      <div className="card">
        <h3>Accounts</h3>
        {accountBalanceRows.length === 0 ? (
          <EmptyState title="No account balances yet" description="Add an account and import a statement to get started." />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Balance</th>
                  <th>As of</th>
                </tr>
              </thead>
              <tbody>
                {accountBalanceRows.map((b) => (
                  <tr key={b.accountId}>
                    <td>{accountsById.get(b.accountId)?.name ?? '—'}</td>
                    <td>{formatPence(b.latestBalancePence, b.currency)}</td>
                    <td>{b.asOfDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header-row">
          <h3>Income &amp; expenses</h3>
          <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            <option value="this-month">This month</option>
            <option value="last-month">Last month</option>
            <option value="ytd">Year to date</option>
            <option value="all-time">All time</option>
          </select>
        </div>
        <div className="stat-grid">
          <div className="stat-tile">
            <p className="stat-tile-label">Income</p>
            <p className="stat-tile-value positive">{formatPence(incomeExpense.totalIncomePence, 'GBP')}</p>
          </div>
          <div className="stat-tile">
            <p className="stat-tile-label">Expense</p>
            <p className="stat-tile-value negative">{formatPence(incomeExpense.totalExpensePence, 'GBP')}</p>
          </div>
          <div className="stat-tile">
            <p className="stat-tile-label">Net</p>
            <p className={`stat-tile-value ${incomeExpense.netPence >= 0 ? 'positive' : 'negative'}`}>
              {formatPence(incomeExpense.netPence, 'GBP')}
            </p>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          Confirmed transfers between your own accounts are excluded from these totals.
        </p>
      </div>

      <div className="card">
        <h3>
          <BarChart3 size={18} /> Cash flow over time
        </h3>
        {cashFlowChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={cashFlowChartData}>
              <CartesianGrid strokeDasharray="3 3" className="chart-grid" />
              <XAxis dataKey="period" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => formatPence(v * 100, 'GBP')} width={90} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => formatPence(Number(v) * 100, 'GBP')} />
              <Legend />
              <Bar dataKey="Income" fill="var(--positive)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Expense" fill="var(--negative)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState title="No data yet" description="Import a statement to see income and expenses by month." />
        )}
      </div>

      <div className="card">
        <h3>Backup</h3>
        <div className="form-inline">
          <button className="btn btn-primary" onClick={handleExport}>
            <Download size={16} /> Export JSON backup
          </button>
          <label className="btn btn-ghost file-button">
            <Upload size={16} /> Import JSON backup
            <input type="file" accept="application/json" onChange={handleImportFile} />
          </label>
        </div>
        {importMessage && <p className="muted">{importMessage}</p>}
      </div>
    </div>
  );
}
