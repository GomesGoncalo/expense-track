import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  ArrowLeftRight,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Download,
  Layers,
  PiggyBank,
  PieChart,
  Receipt,
  Repeat,
  Sparkles,
  Store,
  TrendingDown,
  TrendingUp,
  Upload,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAppStore } from '../state/store';
import { computeNetWorthDrawdown, computeNetWorthSeries, computeNetWorthSummary } from '../reporting/netWorth';
import { computeCashRunway } from '../reporting/cashRunway';
import { computeSpendPace } from '../reporting/spendPace';
import { computeIncomeExpenseSeries, computeIncomeExpenseSummary } from '../reporting/incomeExpense';
import {
  computeCategorySpendingSeries,
  computeCategorySpendingSeriesForAll,
  computeSpendingByCategory,
  UNCATEGORIZED,
} from '../reporting/byCategory';
import { computeInsights } from '../reporting/insights';
import { computeRecurringPayments } from '../reporting/recurring';
import type { RecurringPayment } from '../reporting/recurring';
import { computeTopMerchants } from '../reporting/merchants';
import { computeHouseholdIncomeExpense } from '../reporting/byPerson';
import { computeBiggestTransactions } from '../reporting/biggestTransactions';
import { computeSpendingByWeekday } from '../reporting/byWeekday';
import * as transfersRepo from '../db/transfersRepo';
import type { Transaction, Transfer } from '../domain/types';
import { categoryColorOrder } from '../domain/categories';
import { exportBackup, downloadBackup, readBackupFile, importBackup } from '../db/backup';
import { formatPence } from '../utils/currency';
import { daysBetween, periodRange, todayIsoDate } from '../utils/dates';
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

function formatCadence(averageIntervalDays: number): string {
  if (averageIntervalDays <= 10) return 'weekly';
  if (averageIntervalDays <= 20) return 'fortnightly';
  if (averageIntervalDays <= 40) return 'monthly';
  if (averageIntervalDays <= 100) return 'quarterly';
  return `every ~${Math.round(averageIntervalDays)} days`;
}

interface AccountBalanceRow {
  accountId: string;
  latestBalancePence: number;
  currency: string;
  asOfDate: string;
}

export function DashboardPage() {
  const { persons, accounts, transactions, transfers, valuationSnapshots, categories, refresh, loaded } = useAppStore();
  /** Fixed reference order so a category always gets the same chart color, regardless of current data/sort order. */
  const categoryColorOrderList = useMemo(() => [...categoryColorOrder(categories), UNCATEGORIZED, OTHER_BUCKET], [categories]);
  const [period, setPeriod] = useState<Period>('this-month');
  const [pendingBackupFile, setPendingBackupFile] = useState<File | null>(null);
  const [excludedCategoriesList, setExcludedCategoriesList] = usePersistedState<string[]>(
    'dashboard.excludedCategories',
    [],
  );
  const excludedCategories = useMemo(() => new Set(excludedCategoriesList), [excludedCategoriesList]);
  const [excludedNetWorthAccountsList, setExcludedNetWorthAccountsList] = usePersistedState<string[]>(
    'dashboard.excludedNetWorthAccounts',
    [],
  );
  const excludedNetWorthAccounts = useMemo(() => new Set(excludedNetWorthAccountsList), [excludedNetWorthAccountsList]);
  const [collapsedCardsList, setCollapsedCardsList] = usePersistedState<string[]>('dashboard.collapsedCards', []);
  const collapsedCards = useMemo(() => new Set(collapsedCardsList), [collapsedCardsList]);
  const [drilldownCategory, setDrilldownCategory] = useState<string | null>(null);
  const scheme = useColorScheme();
  const navigate = useNavigate();
  const { show } = useToast();

  function toggleExcludedCategory(category: string) {
    setExcludedCategoriesList(
      excludedCategoriesList.includes(category)
        ? excludedCategoriesList.filter((c) => c !== category)
        : [...excludedCategoriesList, category],
    );
  }

  function toggleExcludedNetWorthAccount(accountId: string) {
    setExcludedNetWorthAccountsList(
      excludedNetWorthAccountsList.includes(accountId)
        ? excludedNetWorthAccountsList.filter((id) => id !== accountId)
        : [...excludedNetWorthAccountsList, accountId],
    );
  }

  /** Spread onto a Card to make it collapsible, with state persisted per-viewer. */
  function cardCollapseProps(cardId: string) {
    return {
      collapsed: collapsedCards.has(cardId),
      onCollapsedChange: () =>
        setCollapsedCardsList(
          collapsedCardsList.includes(cardId)
            ? collapsedCardsList.filter((id) => id !== cardId)
            : [...collapsedCardsList, cardId],
        ),
    };
  }

  function goToCategoryTransactions(category: string) {
    // TransactionsPage's filter uses the literal 'uncategorized' token for
    // "no category set", distinct from the display label 'Uncategorized'.
    const value = category === UNCATEGORIZED ? 'uncategorized' : category;
    navigate(`/transactions?category=${encodeURIComponent(value)}`);
  }

  async function handleConfirmTransfer(transferId: string) {
    await transfersRepo.confirm(transferId);
    await refresh();
    show({ tone: 'success', message: 'Transfer confirmed.' });
  }

  async function handleRejectTransfer(transferId: string) {
    await transfersRepo.reject(transferId);
    await refresh();
    show({ tone: 'success', message: 'Transfer suggestion rejected.' });
  }

  const netWorth = useMemo(
    () => computeNetWorthSummary(accounts, transactions, valuationSnapshots),
    [accounts, transactions, valuationSnapshots],
  );
  const series = useMemo(
    () => computeNetWorthSeries(accounts, transactions, valuationSnapshots, 'week'),
    [accounts, transactions, valuationSnapshots],
  );
  const netWorthDrawdown = useMemo(() => computeNetWorthDrawdown(series), [series]);
  const cashRunway = useMemo(
    () => computeCashRunway(accounts, transactions, valuationSnapshots),
    [accounts, transactions, valuationSnapshots],
  );
  const spendPace = useMemo(() => computeSpendPace(transactions), [transactions]);
  /** Fixed reference order so an account always gets the same chart color — see categoryColorOrderList above. */
  const netWorthAccountOrder = useMemo(
    () => [...accounts].filter((a) => !a.archived).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)),
    [accounts],
  );
  const netWorthAccountsWithData = useMemo(() => {
    const idsWithData = new Set<string>();
    for (const point of series) {
      for (const accountId of Object.keys(point.perAccountGbpPence)) idsWithData.add(accountId);
    }
    return netWorthAccountOrder.filter((a) => idsWithData.has(a.id));
  }, [series, netWorthAccountOrder]);
  const netWorthChartData = useMemo(
    () =>
      series.map((point) => {
        const row: Record<string, string | number> = { date: point.date };
        for (const account of netWorthAccountsWithData) {
          row[account.id] = (point.perAccountGbpPence[account.id] ?? 0) / 100;
        }
        return row;
      }),
    [series, netWorthAccountsWithData],
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

  const uncategorizedInfo = useMemo(() => {
    let count = 0;
    let totalPence = 0;
    for (const t of transactions) {
      if (t.transferId !== null || t.category !== null || t.amountPence >= 0) continue;
      if (t.date < start || t.date > end) continue;
      count += 1;
      totalPence += Math.abs(t.amountPence);
    }
    return { count, totalPence };
  }, [transactions, start, end]);

  const topMerchants = useMemo(() => computeTopMerchants(transactions, start, end), [transactions, start, end]);
  const topMerchantsChartData = useMemo(
    () => topMerchants.map((m) => ({ description: m.description, amount: m.expensePence / 100 })),
    [topMerchants],
  );

  const recurringPayments = useMemo(() => computeRecurringPayments(transactions), [transactions]);

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
    Net: (p.incomePence - p.expensePence) / 100,
  }));
  const savingsRateData = useMemo(
    () =>
      cashFlowSeries
        .filter((p) => p.incomePence > 0)
        .map((p) => ({
          period: p.period.slice(0, 7),
          rate: ((p.incomePence - p.expensePence) / p.incomePence) * 100,
        })),
    [cashFlowSeries],
  );

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const transactionsById = useMemo(() => new Map(transactions.map((t) => [t.id, t])), [transactions]);

  const pendingTransferRows = useMemo(() => {
    return transfers
      .map((transfer) => ({
        transfer,
        outgoing: transactionsById.get(transfer.outgoingTransactionId),
        incoming: transactionsById.get(transfer.incomingTransactionId),
      }))
      .filter(
        (row): row is { transfer: Transfer; outgoing: Transaction; incoming: Transaction } =>
          row.transfer.status === 'suggested' && row.outgoing !== undefined && row.incoming !== undefined,
      );
  }, [transfers, transactionsById]);

  const activePersons = useMemo(() => persons.filter((p) => !p.archived), [persons]);
  const personCashFlow = useMemo(
    () => computeHouseholdIncomeExpense(activePersons, accounts, transactions, start, end),
    [activePersons, accounts, transactions, start, end],
  );
  const personChartData = useMemo(() => {
    const personsById = new Map(activePersons.map((p) => [p.id, p]));
    return personCashFlow.map((p) => ({
      person: personsById.get(p.personId)?.name ?? '—',
      Income: p.incomePence / 100,
      Expense: p.expensePence / 100,
    }));
  }, [personCashFlow, activePersons]);

  const biggestTransactions = useMemo(
    () => computeBiggestTransactions(transactions, start, end),
    [transactions, start, end],
  );

  const weekdaySpendingData = useMemo(
    () => computeSpendingByWeekday(transactions, start, end).map((w) => ({ label: w.label, amount: w.expensePence / 100 })),
    [transactions, start, end],
  );

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

  const STALE_BALANCE_DAYS = 45;
  const accountBalanceRows: AccountBalanceRow[] = netWorth.subtotalsByCurrency.flatMap((s) => s.accountBalances);
  const accountBalanceColumns: TableColumn<AccountBalanceRow>[] = [
    { key: 'account', header: 'Account', render: (b) => accountsById.get(b.accountId)?.name ?? '—' },
    { key: 'balance', header: 'Balance', render: (b) => formatPence(b.latestBalancePence, b.currency), align: 'right' },
    {
      key: 'asOf',
      header: 'As of',
      align: 'right',
      render: (b) => {
        const stale = daysBetween(b.asOfDate, todayIsoDate()) > STALE_BALANCE_DAYS;
        return (
          <>
            {b.asOfDate}
            {stale && (
              <span className="stale-tag" title="No newer statement imported for this account">
                {' '}
                stale
              </span>
            )}
          </>
        );
      },
    },
  ];

  const recurringColumns: TableColumn<RecurringPayment>[] = [
    { key: 'description', header: 'Payee', render: (r) => r.description },
    { key: 'cadence', header: 'Cadence', render: (r) => formatCadence(r.averageIntervalDays) },
    { key: 'amount', header: 'Avg. amount', render: (r) => formatPence(r.averageAmountPence, r.currency), align: 'right' },
    { key: 'lastSeen', header: 'Last seen', render: (r) => r.lastDate, align: 'right' },
  ];

  const biggestTransactionsColumns: TableColumn<Transaction>[] = [
    { key: 'date', header: 'Date', render: (t) => t.date },
    { key: 'description', header: 'Description', render: (t) => t.description },
    { key: 'account', header: 'Account', render: (t) => accountsById.get(t.accountId)?.name ?? '—' },
    { key: 'category', header: 'Category', render: (t) => t.category ?? UNCATEGORIZED },
    { key: 'amount', header: 'Amount', render: (t) => formatPence(t.amountPence, t.currency), align: 'right' },
  ];

  type PendingTransferRow = { transfer: Transfer; outgoing: Transaction; incoming: Transaction };
  const pendingTransferColumns: TableColumn<PendingTransferRow>[] = [
    { key: 'date', header: 'Date', render: (r) => r.outgoing.date },
    {
      key: 'accounts',
      header: 'Between',
      render: (r) =>
        `${accountsById.get(r.outgoing.accountId)?.name ?? '—'} → ${accountsById.get(r.incoming.accountId)?.name ?? '—'}`,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (r) => formatPence(Math.abs(r.outgoing.amountPence), r.outgoing.currency),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="form-inline" style={{ gap: 6, justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={() => handleConfirmTransfer(r.transfer.id)}>
            Confirm
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleRejectTransfer(r.transfer.id)}>
            Reject
          </Button>
        </div>
      ),
    },
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

      <Card title="Net worth" icon={<Wallet size={18} />} {...cardCollapseProps('net-worth')}>
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
        <Card title="Insights" icon={<Sparkles size={18} />} {...cardCollapseProps('insights')}>
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
                  <span className="insight-message">{insight.message}</span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {pendingTransferRows.length > 0 && (
        <Card title="Pending transfers" icon={<ArrowLeftRight size={18} />} {...cardCollapseProps('pending-transfers')}>
          <p className="muted" style={{ marginTop: -8, marginBottom: 8 }}>
            Matched by amount and date across two of your accounts — confirm to exclude both legs from income/expense
            totals below, or reject if it isn't really a transfer.
          </p>
          <Table columns={pendingTransferColumns} rows={pendingTransferRows} rowKey={(r) => r.transfer.id} />
        </Card>
      )}

      <Card title="Net worth over time" icon={<TrendingUp size={18} />} {...cardCollapseProps('net-worth-over-time')}>
        {netWorthChartData.length > 0 ? (
          <>
            <p className="muted" style={{ marginTop: -8, marginBottom: 8 }}>
              Each step lands exactly on a statement or valuation update — flat stretches mean no newer data, not a
              flat balance. Click a label to hide that account.
            </p>
            <div className="chip-toggle-row">
              {netWorthAccountsWithData.map((account, index) => {
                const isExcluded = excludedNetWorthAccounts.has(account.id);
                return (
                  <button
                    key={account.id}
                    className={isExcluded ? 'chip chip-outline chip-muted' : 'chip chip-outline'}
                    onClick={() => toggleExcludedNetWorthAccount(account.id)}
                    title={isExcluded ? 'Click to show' : 'Click to hide'}
                  >
                    <span
                      className="color-dot"
                      style={{ background: getCategoricalColor(index, scheme === 'dark') }}
                    />
                    {account.name}
                  </button>
                );
              })}
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={netWorthChartData}>
                <CartesianGrid strokeDasharray="3 3" className="chart-grid" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => formatPence(Number(v) * 100, 'GBP')} width={90} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v, name) => [formatPence(Number(v) * 100, 'GBP'), name]} />
                {netWorthAccountsWithData
                  .filter((account) => !excludedNetWorthAccounts.has(account.id))
                  .map((account) => (
                    <Area
                      key={account.id}
                      type="stepAfter"
                      dataKey={account.id}
                      name={account.name}
                      stackId="net-worth"
                      stroke={getCategoricalColor(netWorthAccountsWithData.indexOf(account), scheme === 'dark')}
                      fill={getCategoricalColor(netWorthAccountsWithData.indexOf(account), scheme === 'dark')}
                      fillOpacity={0.7}
                      strokeWidth={1.5}
                      dot={{ r: 2 }}
                      isAnimationActive={false}
                    />
                  ))}
              </AreaChart>
            </ResponsiveContainer>
          </>
        ) : (
          <EmptyState title="No data yet" description="Import a statement to see your net worth trend here." />
        )}
      </Card>

      <Card title="Financial health" icon={<Activity size={18} />} {...cardCollapseProps('financial-health')}>
        <div className="stat-grid">
          <div className="stat-tile">
            <p className="stat-tile-label">Cash runway</p>
            {cashRunway ? (
              <>
                <p className="stat-tile-value">{cashRunway.runwayMonths.toFixed(1)} months</p>
                <p className="muted" style={{ fontSize: '0.78rem', marginTop: 2 }}>
                  {formatPence(cashRunway.liquidCashGbpPence, 'GBP')} cash ÷ {formatPence(cashRunway.averageMonthlyExpensePence, 'GBP')}/mo avg spend
                </p>
              </>
            ) : (
              <p className="muted" style={{ marginTop: 4 }}>
                Need more data — at least 3 completed months of expense history.
              </p>
            )}
          </div>
          {netWorthDrawdown && (
            <div className="stat-tile">
              <p className="stat-tile-label">Net worth vs. all-time high</p>
              <p className={`stat-tile-value ${netWorthDrawdown.drawdownPence >= 0 ? 'positive' : 'negative'}`}>
                {netWorthDrawdown.drawdownPence >= 0
                  ? 'At an all-time high'
                  : netWorthDrawdown.drawdownPercent !== null
                    ? `${netWorthDrawdown.drawdownPercent.toFixed(1)}% below peak`
                    : `${formatPence(netWorthDrawdown.drawdownPence, 'GBP')} below peak`}
              </p>
              <p className="muted" style={{ fontSize: '0.78rem', marginTop: 2 }}>
                Peak {formatPence(netWorthDrawdown.peakGbpPence, 'GBP')} on {netWorthDrawdown.peakDate}
              </p>
            </div>
          )}
          {spendPace && (
            <div className="stat-tile">
              <p className="stat-tile-label">On track to spend this month</p>
              <p className="stat-tile-value negative">{formatPence(spendPace.projectedSpendPence, 'GBP')}</p>
              <p className="muted" style={{ fontSize: '0.78rem', marginTop: 2 }}>
                {formatPence(spendPace.spendSoFarPence, 'GBP')} so far — day {spendPace.daysElapsed} of{' '}
                {spendPace.daysInMonth}
              </p>
            </div>
          )}
        </div>
      </Card>

      <Card title="Accounts" {...cardCollapseProps('accounts')}>
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
        {...cardCollapseProps('income-expenses')}
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
        {uncategorizedInfo.count > 0 && (
          <div
            className="warnings-inline"
            style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
          >
            <span>
              {uncategorizedInfo.count} uncategorized transaction{uncategorizedInfo.count === 1 ? '' : 's'} this period (
              {formatPence(uncategorizedInfo.totalPence)}) — left out of every category chart below.
            </span>
            <Button variant="ghost" size="sm" onClick={() => goToCategoryTransactions(UNCATEGORIZED)}>
              Review <ArrowRight size={14} />
            </Button>
          </div>
        )}
      </Card>

      {personCashFlow.length > 1 && (
        <Card
          title="By person"
          icon={<Users size={18} />}
          headerActions={
            <Button variant="ghost" size="sm" onClick={() => navigate('/household')}>
              Net worth &amp; who-owes-whom <ArrowRight size={14} />
            </Button>
          }
          {...cardCollapseProps('by-person')}
        >
          <p className="muted" style={{ marginTop: -8, marginBottom: 8 }}>
            Split by each account's ownership share (or a transaction's manual split, when set), for the period above.
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={personChartData}>
              <CartesianGrid strokeDasharray="3 3" className="chart-grid" />
              <XAxis dataKey="person" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => formatPence(Number(v) * 100, 'GBP')} width={90} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => formatPence(Number(v) * 100, 'GBP')} />
              <Legend />
              <Bar dataKey="Income" fill="var(--positive)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Expense" fill="var(--negative)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card
        title="Spending by category (this period)"
        icon={<PieChart size={18} />}
        {...cardCollapseProps('spending-by-category')}
      >
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

      <Card title="Top merchants (this period)" icon={<Store size={18} />} {...cardCollapseProps('top-merchants')}>
        {topMerchantsChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(160, topMerchantsChartData.length * 40)}>
            <BarChart data={topMerchantsChartData} layout="vertical" margin={{ left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" className="chart-grid" />
              <XAxis type="number" tickFormatter={(v) => formatPence(Number(v) * 100, 'GBP')} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="description" width={160} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => formatPence(Number(v) * 100, 'GBP')} />
              <Bar dataKey="amount" fill="var(--negative)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState title="No spending yet" description="Import a statement to see your biggest payees." />
        )}
      </Card>

      <Card
        title="Biggest transactions (this period)"
        icon={<Receipt size={18} />}
        {...cardCollapseProps('biggest-transactions')}
      >
        {biggestTransactions.length > 0 ? (
          <Table columns={biggestTransactionsColumns} rows={biggestTransactions} rowKey={(t) => t.id} />
        ) : (
          <EmptyState title="No spending yet" description="Import a statement to see your largest individual purchases." />
        )}
      </Card>

      <Card
        title="Spending by day of week (this period)"
        icon={<CalendarDays size={18} />}
        {...cardCollapseProps('spending-by-weekday')}
      >
        {weekdaySpendingData.some((d) => d.amount > 0) ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weekdaySpendingData}>
              <CartesianGrid strokeDasharray="3 3" className="chart-grid" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => formatPence(Number(v) * 100, 'GBP')} width={90} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => formatPence(Number(v) * 100, 'GBP')} />
              <Bar dataKey="amount" fill="var(--negative)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState title="No spending yet" description="Import a statement to see which days you spend the most." />
        )}
      </Card>

      <Card
        title="Spending by category, over time"
        icon={<Layers size={18} />}
        {...cardCollapseProps('spending-by-category-over-time')}
      >
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

      <Card title="Recurring payments" icon={<Repeat size={18} />} {...cardCollapseProps('recurring-payments')}>
        {recurringPayments.length > 0 ? (
          <>
            <p className="muted" style={{ marginTop: -8, marginBottom: 8 }}>
              Detected from charges to the same payee on a regular cadence — a rough signal, not a guarantee.
            </p>
            <Table columns={recurringColumns} rows={recurringPayments} rowKey={(r) => r.key} />
          </>
        ) : (
          <EmptyState
            title="Nothing detected yet"
            description="Once a payment repeats a few times on a regular cadence, it'll show up here."
          />
        )}
      </Card>

      <Card title="Cash flow over time" icon={<BarChart3 size={18} />} {...cardCollapseProps('cash-flow-over-time')}>
        {cashFlowChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={cashFlowChartData}>
              <CartesianGrid strokeDasharray="3 3" className="chart-grid" />
              <XAxis dataKey="period" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => formatPence(Number(v) * 100, 'GBP')} width={90} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => formatPence(Number(v) * 100, 'GBP')} />
              <Legend />
              <Bar dataKey="Income" fill="var(--positive)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Expense" fill="var(--negative)" radius={[3, 3, 0, 0]} />
              <Line type="linear" dataKey="Net" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState title="No data yet" description="Import a statement to see income and expenses by month." />
        )}
      </Card>

      <Card title="Savings rate" icon={<PiggyBank size={18} />} {...cardCollapseProps('savings-rate')}>
        {savingsRateData.length > 0 ? (
          <>
            <p className="muted" style={{ marginTop: -8, marginBottom: 8 }}>
              Share of income kept each month, after expenses. Months with no recorded income are left out rather than
              shown as 0%.
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={savingsRateData}>
                <CartesianGrid strokeDasharray="3 3" className="chart-grid" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${v}%`} width={50} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, 'Savings rate']} />
                <ReferenceLine y={0} stroke="var(--border)" />
                <Line type="linear" dataKey="rate" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </>
        ) : (
          <EmptyState
            title="Not enough data yet"
            description="Once you have a month with income recorded, your savings rate trend will show up here."
          />
        )}
      </Card>

      <Card title="Backup" {...cardCollapseProps('backup')}>
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
