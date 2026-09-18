import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Plus, Scale, Trash2, Users } from 'lucide-react';
import { useAppStore } from '../state/store';
import * as personsRepo from '../db/personsRepo';
import {
  computeHouseholdIncomeExpense,
  computeHouseholdNetCashFlowSeries,
  computeHouseholdNetWorth,
  computeHouseholdNetWorthSeries,
  computeSplitBalances,
} from '../reporting/byPerson';
import { formatPence } from '../utils/currency';
import { latestDate, periodRange } from '../utils/dates';
import type { Period } from '../utils/dates';
import { getCategoricalColor, useColorScheme } from '../utils/palette';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';

function PersonForm({ onCreated }: { onCreated: () => void }) {
  const persons = useAppStore((s) => s.persons);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { show } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await personsRepo.createPerson(name.trim(), persons.length);
      setName('');
      onCreated();
      show({ tone: 'success', message: 'Household member added.' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add person.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a household member…" />
      <Button type="submit" icon={<Plus size={16} />} loading={submitting}>
        Add
      </Button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

export function HouseholdPage() {
  const { persons, accounts, transactions, valuationSnapshots, refresh } = useAppStore();
  const activePersons = persons.filter((p) => !p.archived);
  const [period, setPeriod] = useState<Period>('this-month');
  const scheme = useColorScheme();
  const colorFor = (colorIndex: number) => getCategoricalColor(colorIndex, scheme === 'dark');

  const netWorth = useMemo(
    () => computeHouseholdNetWorth(activePersons, accounts, transactions, valuationSnapshots),
    [activePersons, accounts, transactions, valuationSnapshots],
  );
  const series = useMemo(
    () => computeHouseholdNetWorthSeries(activePersons, accounts, transactions, valuationSnapshots, 'week'),
    [activePersons, accounts, transactions, valuationSnapshots],
  );
  // Anchored on the most recent transaction date, not wall-clock today —
  // statements are imported in batches, so "this month" would otherwise
  // silently show empty for weeks after the last import (same reasoning as
  // reporting/insights.ts).
  const mostRecentDate = useMemo(() => latestDate(transactions), [transactions]);
  const { start, end } = periodRange(period, mostRecentDate ?? undefined);
  const incomeExpense = useMemo(
    () => computeHouseholdIncomeExpense(activePersons, accounts, transactions, start, end),
    [activePersons, accounts, transactions, start, end],
  );

  const balances = useMemo(() => computeSplitBalances(activePersons, accounts, transactions), [activePersons, accounts, transactions]);

  const netWorthByPerson = useMemo(() => new Map(netWorth.perPerson.map((p) => [p.personId, p.netWorthGbpPence])), [netWorth]);
  const incomeExpenseByPerson = useMemo(() => new Map(incomeExpense.map((p) => [p.personId, p])), [incomeExpense]);

  const comparisonRows = activePersons.map((p) => ({
    person: p,
    netWorth: netWorthByPerson.get(p.id) ?? 0,
    income: incomeExpenseByPerson.get(p.id)?.incomePence ?? 0,
    expense: incomeExpenseByPerson.get(p.id)?.expensePence ?? 0,
  }));

  const seriesChartData = series.map((point) => {
    const row: Record<string, string | number> = { date: point.date };
    for (const person of activePersons) row[person.name] = (point.perPersonGbpPence[person.id] ?? 0) / 100;
    return row;
  });

  const cashFlowSeries = useMemo(
    () => computeHouseholdNetCashFlowSeries(activePersons, accounts, transactions, 'month'),
    [activePersons, accounts, transactions],
  );
  const cashFlowChartData = cashFlowSeries.map((point) => {
    const row: Record<string, string | number> = { period: point.period.slice(0, 7) };
    for (const person of activePersons) row[person.name] = (point.perPersonNetGbpPence[person.id] ?? 0) / 100;
    return row;
  });

  const [pendingDeletePerson, setPendingDeletePerson] = useState<{ id: string; name: string } | null>(null);
  const { show } = useToast();

  async function handleArchivePerson(personId: string) {
    await personsRepo.archivePerson(personId);
    await refresh();
    show({ tone: 'success', message: 'Household member archived.' });
  }

  async function handleDeletePerson() {
    if (!pendingDeletePerson) return;
    await personsRepo.deletePersonCascade(pendingDeletePerson.id);
    await refresh();
    show({ tone: 'success', message: `"${pendingDeletePerson.name}" removed.` });
    setPendingDeletePerson(null);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Household</h2>
          <p className="page-subtitle">Manage who's in your household and compare net worth &amp; spending.</p>
        </div>
      </div>

      <Card title="People" icon={<Users size={18} />}>
        <PersonForm onCreated={refresh} />
        {activePersons.length === 0 ? (
          <EmptyState
            icon={<Users size={32} />}
            title="No household members yet"
            description="Add people above, then assign accounts to them from the Accounts page."
          />
        ) : (
          <ul className="person-list">
            {activePersons.map((p) => (
              <li key={p.id} className="person-list-row">
                <span className="color-dot" style={{ background: colorFor(p.colorIndex) }} />
                <span className="person-name">{p.name}</span>
                <span className="spacer" />
                <Button variant="ghost" size="sm" onClick={() => handleArchivePerson(p.id)} title="Archive">
                  Archive
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Trash2 size={16} />}
                  onClick={() => setPendingDeletePerson({ id: p.id, name: p.name })}
                  title="Remove"
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {activePersons.length === 0 ? null : (
        <>
          <Card title="Net worth by person">
            <div className="compare-grid">
              {comparisonRows.map((row) => (
                <div key={row.person.id} className="compare-tile">
                  <span className="color-dot" style={{ background: colorFor(row.person.colorIndex) }} />
                  <div className="compare-tile-name">{row.person.name}</div>
                  <div className="compare-tile-value">{formatPence(row.netWorth, 'GBP')}</div>
                </div>
              ))}
            </div>
            {netWorth.unassignedGbpPence !== 0 && (
              <p className="muted">
                {formatPence(netWorth.unassignedGbpPence, 'GBP')} is held in accounts with no assigned owner.
              </p>
            )}
          </Card>

          <Card title="Net worth over time by person">
            <p className="muted" style={{ marginTop: -8, marginBottom: 14 }}>
              Stacked — the top of the shaded area is the household total; each band is one person's share of it.
            </p>
            {seriesChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={seriesChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="chart-grid" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => formatPence(v * 100, 'GBP')} width={90} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => formatPence(Number(v) * 100, 'GBP')} />
                  <Legend />
                  {activePersons.map((p) => (
                    <Area
                      key={p.id}
                      type="monotone"
                      dataKey={p.name}
                      stackId="net-worth"
                      stroke={colorFor(p.colorIndex)}
                      fill={colorFor(p.colorIndex)}
                      fillOpacity={0.65}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No data yet" description="Import statements for each person's accounts to see this chart." />
            )}
          </Card>

          <Card title="Net cash flow by person, over time" icon={<Activity size={18} />}>
            <p className="muted" style={{ marginTop: -8, marginBottom: 14 }}>
              Income minus expense each month, per person (split-aware) — above the line means saving, below means
              spending more than they brought in.
            </p>
            {cashFlowChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={cashFlowChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="chart-grid" />
                  <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => formatPence(v * 100, 'GBP')} width={90} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => formatPence(Number(v) * 100, 'GBP')} />
                  <Legend />
                  <ReferenceLine y={0} stroke="var(--border-strong)" />
                  {activePersons.map((p) => (
                    <Line
                      key={p.id}
                      type="monotone"
                      dataKey={p.name}
                      stroke={colorFor(p.colorIndex)}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No data yet" description="Import statements for each person's accounts to see this chart." />
            )}
          </Card>

          <Card
            title={<>Income &amp; expenses by person (this period)</>}
            headerActions={
              <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
                <option value="this-month">This month</option>
                <option value="last-month">Last month</option>
                <option value="ytd">Year to date</option>
                <option value="all-time">All time</option>
              </select>
            }
          >
            <ResponsiveContainer width="100%" height={Math.max(140, comparisonRows.length * 70)}>
              <BarChart
                data={comparisonRows.map((r) => ({ name: r.person.name, Income: r.income / 100, Expense: r.expense / 100 }))}
                layout="vertical"
                margin={{ left: 16 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="chart-grid" />
                <XAxis type="number" tickFormatter={(v) => formatPence(v * 100, 'GBP')} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => formatPence(Number(v) * 100, 'GBP')} />
                <Legend />
                <Bar dataKey="Income" fill="var(--positive)" radius={[0, 4, 4, 0]} />
                <Bar dataKey="Expense" fill="var(--negative)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Balances" icon={<Scale size={18} />}>
            {balances.every((b) => b.netOwedGbpPence === 0) ? (
              <EmptyState
                title="Nothing owed"
                description="Split a transaction on the Transactions page (e.g. a dinner one person paid for, or a refund that's partly someone else's) to see balances here."
              />
            ) : (
              <ul className="person-list">
                {balances
                  .filter((b) => b.netOwedGbpPence !== 0)
                  .sort((a, b) => b.netOwedGbpPence - a.netOwedGbpPence)
                  .map((b) => {
                    const person = activePersons.find((p) => p.id === b.personId);
                    if (!person) return null;
                    const isOwed = b.netOwedGbpPence > 0;
                    return (
                      <li key={b.personId} className="person-list-row">
                        <span className="color-dot" style={{ background: colorFor(person.colorIndex) }} />
                        <span className="person-name">{person.name}</span>
                        <span className="spacer" />
                        <span className={isOwed ? 'positive' : 'negative'}>
                          {isOwed ? 'is owed ' : 'owes '}
                          {formatPence(Math.abs(b.netOwedGbpPence), 'GBP')}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            )}
          </Card>
        </>
      )}

      <ConfirmDialog
        open={pendingDeletePerson !== null}
        title={pendingDeletePerson ? `Remove "${pendingDeletePerson.name}"?` : ''}
        description="Any accounts they jointly own will have their remaining owners' shares rebalanced to 100%."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={handleDeletePerson}
        onCancel={() => setPendingDeletePerson(null)}
      />
    </div>
  );
}
