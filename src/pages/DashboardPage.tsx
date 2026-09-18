import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  ArrowRight,
  BarChart3,
  Download,
  Layers,
  PieChart,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import { useAppStore } from '../state/store';
import { computeNetWorthSeries, computeNetWorthSummary } from '../reporting/netWorth';
import { computeIncomeExpenseSeries, computeIncomeExpenseSummary } from '../reporting/incomeExpense';
import {
  computeCategorySpendingSeries,
  computeCategorySpendingSeriesForAll,
  computeSpendingByCategory,
  UNCATEGORIZED,
} from '../reporting/byCategory';
import { computeInsights } from '../reporting/insights';
import { categoryColorOrder } from '../domain/categories';
import { exportBackup, downloadBackup, readBackupFile, importBackup } from '../db/backup';
import { formatPence } from '../utils/currency';
import { periodRange } from '../utils/dates';
import type { Period } from '../utils/dates';
import { getNamedCategoryColor, useColorScheme, getCategoricalColor } from '../utils/palette';
import { usePersistedState } from '../utils/persistedState';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { SkeletonCard } from '../components/ui/Skeleton';
import { Table, type TableColumn } from '../components/ui/Table';
import { useToast } from '../components/ui/Toast';
import type { ImportMode } from '../db/backup';

const OTHER_BUCKET = 'Other';

interface AccountBalanceRow {
  accountId: string;
  latestBalancePence: number;
  currency: string;
  asOfDate: string;
}

export function DashboardPage() {
  const { accounts, transactions, transfers, valuationSnapshots, categories, refresh, loaded } = useAppStore();
  /** Fixed reference order so a category always gets the same chart color, regardless of current data/sort order. */
  const categoryColorOrderList = useMemo(() => [...categoryColorOrder(categories), UNCATEGORIZED, OTHER_BUCKET], [categories]);
  const [period, setPeriod] = useState<Period>('this-month');
  const [pendingBackupFile, setPendingBackupFile] = useState<File | null>(null);
  const [excludedCategoriesList, setExcludedCategoriesList] = usePersistedState<string[]>(
    'dashboard.excludedCategories',
    [],
  );
  const excludedCategories = useMemo(() => new Set(excludedCategoriesList), [excludedCategoriesList]);
  const [drilldownCategory, setDrilldownCategory] = useState<string | null>(null);
  const scheme = useColorScheme();
  const accentColor = getCategoricalColor(0, scheme === 'dark');
  const navigate = useNavigate();
  const { show } = useToast();

  function toggleExcludedCategory(category: string) {
    setExcludedCategoriesList(
      excludedCategoriesList.includes(category)
        ? excludedCategoriesList.filter((c) => c !== category)
        : [...excludedCategoriesList, category],
    );
  }

  function goToCategoryTransactions(category: string) {
    // TransactionsPage's filter uses the literal 'uncategorized' token for
    // "no category set", distinct from the display label 'Uncategorized'.
    const value = category === UNCATEGORIZED ? 'uncategorized' : category;
    navigate(`/transactions?category=${encodeURIComponent(value)}`);
  }

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
  const allCategoriesInPeriod = useMemo(() => computeSpendingByCategory(transactions, start, end), [transactions, start, end]);
  const spendingByCategory = useMemo(
    () => computeSpendingByCategory(transactions, start, end, excludedCategories),
    [transactions, start, end, excludedCategories],
  );
  const spendingChartData = useMemo(() => {
    const top = spendingByCategory.slice(0, 7);
    const rest = spendingByCategory.slice(7);
    const restTotal = rest.reduce((sum, c) => sum + c.expensePence, 0);
    const rows = top.map((c) => ({ category: c.category, amount: c.expensePence / 100 }));
    if (restTotal > 0) rows.push({ category: 'Other (multiple categories)', amount: restTotal / 100 });
    return rows;
  }, [spendingByCategory]);
  const drilldownSeries = useMemo(
    () =>
      drilldownCategory
        ? computeCategorySpendingSeries(transactions, drilldownCategory === UNCATEGORIZED ? null : drilldownCategory, 'month')
        : [],
    [transactions, drilldownCategory],
  );
  const drilldownChartData = drilldownSeries.map((p) => ({ period: p.period.slice(0, 7), amount: p.expensePence / 100 }));

  const insights = useMemo(() => computeInsights(transactions, transfers), [transactions, transfers]);

  // Unfiltered on purpose: the top-7+Other bucket set and the legend stay
  // stable as categories are toggled — toggling a legend entry just stops
  // rendering that one Bar (see stackedCategoryKeys.filter below), rather
  // than recomputing which categories even make the top 7.
  const categoryTimeSeries = useMemo(() => computeCategorySpendingSeriesForAll(transactions, 'month'), [transactions]);
  const { stackedCategoryData, stackedCategoryKeys } = useMemo(() => {
    const totalsByCategory = new Map<string, number>();
    for (const point of categoryTimeSeries) {
      for (const [category, pence] of Object.entries(point.byCategory)) {
        totalsByCategory.set(category, (totalsByCategory.get(category) ?? 0) + pence);
      }
    }
    const topCategories = Array.from(totalsByCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([category]) => category);
    const topSet = new Set(topCategories);
    const hasOther = Array.from(totalsByCategory.keys()).some((c) => !topSet.has(c));
    const keys = hasOther ? [...topCategories, OTHER_BUCKET] : topCategories;

    const data = categoryTimeSeries.map((point) => {
      const row: Record<string, string | number> = { period: point.period.slice(0, 7) };
      for (const key of keys) row[key] = 0;
      for (const [category, pence] of Object.entries(point.byCategory)) {
        const key = topSet.has(category) ? category : OTHER_BUCKET;
        row[key] = (Number(row[key]) || 0) + pence / 100;
      }
      return row;
    });

    return { stackedCategoryData: data, stackedCategoryKeys: keys };
  }, [categoryTimeSeries]);
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
    show({ tone: 'success', message: 'Backup exported.' });
  }

  function handleImportFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPendingBackupFile(file);
  }

  async function commitBackupImport(mode: ImportMode) {
    const file = pendingBackupFile;
    setPendingBackupFile(null);
    if (!file) return;
    try {
      const backup = await readBackupFile(file);
      const summary = await importBackup(backup, mode);
      show({
        tone: 'success',
        message:
          `Imported: ${summary.personsAdded} person(s), ${summary.accountsAdded} account(s), ` +
          `${summary.transactionsAdded} transaction(s) (${summary.transactionsSkippedDuplicate} duplicate(s) skipped).`,
      });
      await refresh();
    } catch (err) {
      show({ tone: 'error', message: err instanceof Error ? err.message : 'Failed to import backup file.' });
    }
  }

  const accountBalanceRows: AccountBalanceRow[] = netWorth.subtotalsByCurrency.flatMap((s) => s.accountBalances);
  const accountBalanceColumns: TableColumn<AccountBalanceRow>[] = [
    { key: 'account', header: 'Account', render: (b) => accountsById.get(b.accountId)?.name ?? '—' },
    { key: 'balance', header: 'Balance', render: (b) => formatPence(b.latestBalancePence, b.currency), align: 'right' },
    { key: 'asOf', header: 'As of', render: (b) => b.asOfDate, align: 'right' },
  ];

  if (!loaded) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h2>Dashboard</h2>
            <p className="page-subtitle">Your overall net worth and cash flow, all in one place.</p>
          </div>
        </div>
        <SkeletonCard lines={1} />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p className="page-subtitle">Your overall net worth and cash flow, all in one place.</p>
        </div>
      </div>

      <Card title="Net worth" icon={<Wallet size={18} />}>
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
      </Card>

      {insights.length > 0 && (
        <Card title="Insights" icon={<Sparkles size={18} />}>
          <div className="insight-list">
            {insights.map((insight) => {
              const Icon = insight.tone === 'up' ? TrendingUp : insight.tone === 'down' ? TrendingDown : Sparkles;
              const clickable = Boolean(insight.category) || Boolean(insight.to);
              return (
                <button
                  key={insight.id}
                  type="button"
                  className="insight-row"
                  disabled={!clickable}
                  onClick={() => {
                    if (insight.category) goToCategoryTransactions(insight.category);
                    else if (insight.to) navigate(insight.to);
                  }}
                >
                  <Icon size={16} className={`insight-icon ${insight.tone}`} />
                  <span>{insight.message}</span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      <Card title="Net worth over time" icon={<TrendingUp size={18} />}>
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
      </Card>

      <Card title="Accounts">
        <Table
          columns={accountBalanceColumns}
          rows={accountBalanceRows}
          rowKey={(b) => b.accountId}
          emptyState={
            <EmptyState title="No account balances yet" description="Add an account and import a statement to get started." />
          }
        />
      </Card>

      <Card
        title="Income & expenses"
        headerActions={
          <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            <option value="this-month">This month</option>
            <option value="last-month">Last month</option>
            <option value="ytd">Year to date</option>
            <option value="all-time">All time</option>
          </select>
        }
      >
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
      </Card>

      <Card title="Spending by category (this period)" icon={<PieChart size={18} />}>
        {allCategoriesInPeriod.length > 0 && (
          <div className="chip-toggle-row">
            {allCategoriesInPeriod.map((c) => {
              const isExcluded = excludedCategories.has(c.category);
              return (
                <button
                  key={c.category}
                  className={isExcluded ? 'chip chip-outline chip-muted' : 'chip chip-outline'}
                  onClick={() => toggleExcludedCategory(c.category)}
                  title={isExcluded ? 'Excluded — click to include' : 'Click to exclude from the chart below'}
                >
                  {isExcluded ? <X size={11} /> : null}
                  {c.category}
                </button>
              );
            })}
          </div>
        )}
        {spendingChartData.length > 0 ? (
          <>
            <p className="muted" style={{ marginTop: 4, marginBottom: 4 }}>
              Click a bar to see that category's trend and transactions.
            </p>
            <ResponsiveContainer width="100%" height={Math.max(160, spendingChartData.length * 40)}>
              <BarChart data={spendingChartData} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" className="chart-grid" />
                <XAxis type="number" tickFormatter={(v) => formatPence(v * 100, 'GBP')} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="category" width={130} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => formatPence(Number(v) * 100, 'GBP')} />
                <Bar
                  dataKey="amount"
                  fill="var(--negative)"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(data) => {
                    const category = (data.payload as { category: string } | undefined)?.category;
                    if (!category || category.startsWith('Other (')) return;
                    setDrilldownCategory(category);
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </>
        ) : (
          <EmptyState
            title="No spending yet"
            description={
              allCategoriesInPeriod.length > 0
                ? 'Every category for this period is excluded above.'
                : 'Import a statement to see where your money is going.'
            }
          />
        )}

        {drilldownCategory && (
          <div className="drilldown-panel">
            <div className="card-header-row">
              <h4>{drilldownCategory} over time</h4>
              <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={() => setDrilldownCategory(null)}>
                Close
              </Button>
            </div>
            {drilldownChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={drilldownChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="chart-grid" />
                  <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => formatPence(v * 100, 'GBP')} width={90} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => formatPence(Number(v) * 100, 'GBP')} />
                  <Bar dataKey="amount" fill="var(--negative)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="muted">No spending in this category yet.</p>
            )}
            <Button variant="ghost" onClick={() => goToCategoryTransactions(drilldownCategory)}>
              View transactions <ArrowRight size={14} />
            </Button>
          </div>
        )}
      </Card>

      <Card title="Spending by category, over time" icon={<Layers size={18} />}>
        {stackedCategoryData.length > 0 ? (
          <>
            <p className="muted" style={{ marginTop: -8, marginBottom: 8 }}>
              Click a label to toggle that category off the chart.
            </p>
            <div className="chip-toggle-row">
              {stackedCategoryKeys.map((key) => {
                const isExcluded = excludedCategories.has(key);
                const isToggleable = key !== OTHER_BUCKET;
                return (
                  <button
                    key={key}
                    className={isExcluded ? 'chip chip-outline chip-muted' : 'chip chip-outline'}
                    onClick={() => isToggleable && toggleExcludedCategory(key)}
                    disabled={!isToggleable}
                    title={isToggleable ? (isExcluded ? 'Click to show' : 'Click to hide') : undefined}
                  >
                    <span
                      className="color-dot"
                      style={{ background: getNamedCategoryColor(key, categoryColorOrderList, scheme === 'dark') }}
                    />
                    {key}
                  </button>
                );
              })}
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stackedCategoryData}>
                <CartesianGrid strokeDasharray="3 3" className="chart-grid" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => formatPence(v * 100, 'GBP')} width={90} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => formatPence(Number(v) * 100, 'GBP')} />
                {stackedCategoryKeys
                  .filter((key) => !excludedCategories.has(key))
                  .map((key) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      stackId="spend-by-category"
                      fill={getNamedCategoryColor(key, categoryColorOrderList, scheme === 'dark')}
                    />
                  ))}
              </BarChart>
            </ResponsiveContainer>
          </>
        ) : (
          <EmptyState title="No spending yet" description="Import a statement to see category spending build up over time." />
        )}
      </Card>

      <Card title="Cash flow over time" icon={<BarChart3 size={18} />}>
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
      </Card>

      <Card title="Backup">
        <div className="form-inline">
          <Button icon={<Download size={16} />} onClick={handleExport}>
            Export JSON backup
          </Button>
          <label className="btn btn-ghost file-button">
            <Upload size={16} /> Import JSON backup
            <input type="file" accept="application/json" onChange={handleImportFileSelected} />
          </label>
        </div>
      </Card>

      <Modal
        open={pendingBackupFile !== null}
        onClose={() => setPendingBackupFile(null)}
        title="Import backup"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingBackupFile(null)}>
              Cancel
            </Button>
            <Button variant="ghost" onClick={() => commitBackupImport('merge')}>
              Merge
            </Button>
            <Button variant="danger" onClick={() => commitBackupImport('replace')}>
              Replace all data
            </Button>
          </>
        }
      >
        <p className="muted">
          Merge adds anything new from this backup alongside your existing data. Replace deletes everything currently
          stored on this device first.
        </p>
      </Modal>
    </div>
  );
}
