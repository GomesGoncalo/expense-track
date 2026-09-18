import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Plus, Trash2, Users } from 'lucide-react';
import { useAppStore } from '../state/store';
import * as personsRepo from '../db/personsRepo';
import { computeHouseholdIncomeExpense, computeHouseholdNetWorth, computeHouseholdNetWorthSeries } from '../reporting/byPerson';
import { formatPence } from '../utils/currency';
import { todayIsoDate } from '../utils/dates';
import { getCategoricalColor, useColorScheme } from '../utils/palette';
import { EmptyState } from '../components/common/EmptyState';

type Period = 'this-month' | 'last-month' | 'ytd' | 'all-time';

function periodRange(period: Period): { start: string; end: string } {
  const today = todayIsoDate();
  const [year, month] = today.split('-').map(Number);
  if (period === 'this-month') return { start: `${year}-${String(month).padStart(2, '0')}-01`, end: today };
  if (period === 'last-month') {
    const d = new Date(year, month - 2, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const lastDay = new Date(y, m, 0).getDate();
    return { start: `${y}-${String(m).padStart(2, '0')}-01`, end: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}` };
  }
  if (period === 'ytd') return { start: `${year}-01-01`, end: today };
  return { start: '0000-01-01', end: today };
}

function PersonForm({ onCreated }: { onCreated: () => void }) {
  const persons = useAppStore((s) => s.persons);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await personsRepo.createPerson(name.trim(), persons.length);
      setName('');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add person.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a household member…" />
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        <Plus size={16} /> Add
      </button>
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
  const { start, end } = periodRange(period);
  const incomeExpense = useMemo(
    () => computeHouseholdIncomeExpense(activePersons, accounts, transactions, start, end),
    [activePersons, accounts, transactions, start, end],
  );

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

  async function handleArchivePerson(personId: string) {
    await personsRepo.archivePerson(personId);
    await refresh();
  }

  async function handleDeletePerson(personId: string, name: string) {
    if (!confirm(`Remove "${name}"? Any accounts they jointly own will have their remaining owners' shares rebalanced to 100%.`)) {
      return;
    }
    await personsRepo.deletePersonCascade(personId);
    await refresh();
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Household</h2>
          <p className="page-subtitle">Manage who's in your household and compare net worth &amp; spending.</p>
        </div>
      </div>

      <section className="card">
        <h3>
          <Users size={18} /> People
        </h3>
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
                <button className="btn btn-ghost btn-icon" onClick={() => handleArchivePerson(p.id)} title="Archive">
                  Archive
                </button>
                <button
                  className="btn btn-ghost btn-icon danger"
                  onClick={() => handleDeletePerson(p.id, p.name)}
                  title="Remove"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {activePersons.length === 0 ? null : (
        <>
          <section className="card">
            <h3>Net worth by person</h3>
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
          </section>

          <section className="card">
            <h3>Net worth over time by person</h3>
            {seriesChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={seriesChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="chart-grid" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => formatPence(v * 100, 'GBP')} width={90} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => formatPence(Number(v) * 100, 'GBP')} />
                  <Legend />
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
          </section>

          <section className="card">
            <div className="card-header-row">
              <h3>Income &amp; expenses by person</h3>
              <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
                <option value="this-month">This month</option>
                <option value="last-month">Last month</option>
                <option value="ytd">Year to date</option>
                <option value="all-time">All time</option>
              </select>
            </div>
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
          </section>
        </>
      )}
    </div>
  );
}
