import { useMemo, useState } from 'react';
import { ArrowLeftRight, Sparkles, Users } from 'lucide-react';
import { useAppStore } from '../state/store';
import * as transfersRepo from '../db/transfersRepo';
import * as transactionsRepo from '../db/transactionsRepo';
import { formatPence } from '../utils/currency';
import { ownerSummary } from '../utils/ownerSummary';
import { ownersSharesAreValid } from '../domain/owners';
import { buildPriorCategoryLookup, resolveCategory } from '../domain/autoCategorize';
import { CATEGORIES } from '../domain/categories';
import type { Category } from '../domain/categories';
import { EmptyState } from '../components/common/EmptyState';
import { OwnerPicker } from '../components/common/OwnerPicker';
import type { AccountOwner, Person, Transaction } from '../domain/types';

function SplitDialog({
  transaction,
  persons,
  onClose,
  onSaved,
}: {
  transaction: Transaction;
  persons: Person[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [owners, setOwners] = useState<AccountOwner[]>(transaction.splitOverride ?? []);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function save(nextOwners: AccountOwner[] | null) {
    if (nextOwners && !ownersSharesAreValid(nextOwners)) {
      setError('Shares must add up to 100%.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await transactionsRepo.updateTransaction({ ...transaction, splitOverride: nextOwners });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save split.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Split "{transaction.description}"</h3>
        <p className="muted" style={{ marginTop: -8, marginBottom: 14 }}>
          Choose who this is shared between — doesn't have to be everyone. This updates income/expense and balance
          reporting; it doesn't change who actually paid (the account's owner still shows on the row).
        </p>
        {persons.length === 0 ? (
          <p className="muted">No household members yet — add some on the Household page first.</p>
        ) : (
          <OwnerPicker persons={persons} owners={owners} onChange={setOwners} />
        )}
        {error && <p className="error">{error}</p>}
        <div className="dialog-actions">
          {transaction.splitOverride && (
            <button className="btn btn-ghost danger" onClick={() => save(null)} disabled={submitting}>
              Clear split
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => save(owners.length > 0 ? owners : null)} disabled={submitting}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function TransactionsPage() {
  const { accounts, persons, transactions, transfers, refresh } = useAppStore();
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedForLink, setSelectedForLink] = useState<string[]>([]);
  const [splittingTransaction, setSplittingTransaction] = useState<Transaction | null>(null);
  const [autoCategorizing, setAutoCategorizing] = useState(false);

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const personsById = useMemo(() => new Map(persons.map((p) => [p.id, p])), [persons]);
  const transfersById = useMemo(() => new Map(transfers.map((t) => [t.id, t])), [transfers]);
  const activePersons = persons.filter((p) => !p.archived);

  const filtered = useMemo(() => {
    return transactions
      .filter((t) => accountFilter === 'all' || t.accountId === accountFilter)
      .filter((t) => categoryFilter === 'all' || (categoryFilter === 'uncategorized' ? !t.category : t.category === categoryFilter))
      .filter((t) => !search.trim() || t.description.toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [transactions, accountFilter, categoryFilter, search]);

  const uncategorizedCount = transactions.filter((t) => !t.category).length;

  async function handleCategoryChange(transaction: Transaction, category: Category | '') {
    await transactionsRepo.updateTransaction({ ...transaction, category: category || null });
    await refresh();
  }

  async function handleAutoCategorize() {
    setAutoCategorizing(true);
    try {
      const priorCategories = buildPriorCategoryLookup(transactions);
      const uncategorized = transactions.filter((t) => !t.category);
      for (const t of uncategorized) {
        const guessed = resolveCategory(t.description, t.amountPence, priorCategories);
        if (guessed) await transactionsRepo.updateTransaction({ ...t, category: guessed });
      }
      await refresh();
    } finally {
      setAutoCategorizing(false);
    }
  }

  async function handleConfirm(transferId: string) {
    await transfersRepo.confirm(transferId);
    await refresh();
  }

  async function handleReject(transferId: string) {
    await transfersRepo.reject(transferId);
    await refresh();
  }

  async function handleUnlink(transferId: string) {
    await transfersRepo.unlink(transferId);
    await refresh();
  }

  function toggleSelectForLink(id: string, amountPence: number) {
    setSelectedForLink((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev;
      // only allow selecting opposite-sign transactions for a manual link
      if (prev.length === 1) {
        const other = transactions.find((t) => t.id === prev[0]);
        if (other && Math.sign(other.amountPence) === Math.sign(amountPence)) return prev;
      }
      return [...prev, id];
    });
  }

  async function handleManualLink() {
    if (selectedForLink.length !== 2) return;
    const [aId, bId] = selectedForLink;
    const a = transactions.find((t) => t.id === aId);
    const b = transactions.find((t) => t.id === bId);
    if (!a || !b) return;
    const outgoingId = a.amountPence < 0 ? a.id : b.id;
    const incomingId = a.amountPence < 0 ? b.id : a.id;
    await transfersRepo.createManual(outgoingId, incomingId);
    setSelectedForLink([]);
    await refresh();
  }

  function transferBadge(transaction: Transaction) {
    if (!transaction.transferId) {
      const isSelected = selectedForLink.includes(transaction.id);
      return (
        <button
          className={isSelected ? 'chip chip-selected' : 'chip chip-outline'}
          onClick={() => toggleSelectForLink(transaction.id, transaction.amountPence)}
        >
          {isSelected ? 'Selected for link' : 'Link as transfer'}
        </button>
      );
    }

    const transfer = transfersById.get(transaction.transferId);
    if (!transfer) return null;

    const otherId = transfer.outgoingTransactionId === transaction.id ? transfer.incomingTransactionId : transfer.outgoingTransactionId;
    const other = transactions.find((t) => t.id === otherId);
    const otherAccountName = other ? accountsById.get(other.accountId)?.name : '?';

    if (transfer.status === 'suggested') {
      return (
        <span className="chip chip-suggested">
          Possible transfer ↔ {otherAccountName}
          <button className="btn-sm" onClick={() => handleConfirm(transfer.id)}>
            Confirm
          </button>
          <button className="btn-sm" onClick={() => handleReject(transfer.id)}>
            Reject
          </button>
        </span>
      );
    }

    return (
      <span className="chip chip-confirmed">
        Transfer ↔ {otherAccountName}
        <button className="btn-sm" onClick={() => handleUnlink(transfer.id)}>
          Unlink
        </button>
      </span>
    );
  }

  function splitControl(transaction: Transaction) {
    if (transaction.splitOverride) {
      return (
        <button className="chip chip-confirmed" onClick={() => setSplittingTransaction(transaction)}>
          <Users size={12} /> {ownerSummary(transaction.splitOverride, personsById)}
        </button>
      );
    }
    return (
      <button className="chip chip-outline" onClick={() => setSplittingTransaction(transaction)}>
        Split
      </button>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Transactions</h2>
          <p className="page-subtitle">Search, filter, and manage transfers and splits across every account.</p>
        </div>
      </div>

      <div className="card form-grid form-inline">
        <label>
          Account
          <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
            <option value="all">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">All categories</option>
            <option value="uncategorized">Uncategorized</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search description
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. Tesco" />
        </label>
        {selectedForLink.length === 2 && (
          <button className="btn btn-primary" onClick={handleManualLink}>
            Link selected as transfer
          </button>
        )}
        {uncategorizedCount > 0 && (
          <button className="btn btn-ghost" onClick={handleAutoCategorize} disabled={autoCategorizing}>
            <Sparkles size={16} />
            {autoCategorizing ? 'Categorizing…' : `Auto-categorize ${uncategorizedCount} uncategorized`}
          </button>
        )}
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<ArrowLeftRight size={32} />}
            title="No transactions match this filter"
            description={transactions.length === 0 ? 'Import a statement to see transactions here.' : undefined}
          />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Account</th>
                  <th>Owner</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Balance</th>
                  <th>Transfer</th>
                  <th>Split</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const account = accountsById.get(t.accountId);
                  return (
                    <tr key={t.id}>
                      <td>{t.date}</td>
                      <td>{account?.name ?? '—'}</td>
                      <td className="muted">{account ? ownerSummary(account.owners, personsById) : '—'}</td>
                      <td>{t.description}</td>
                      <td>
                        <select
                          className={t.category ? '' : 'category-unset'}
                          value={t.category ?? ''}
                          onChange={(e) => handleCategoryChange(t, e.target.value as Category | '')}
                        >
                          <option value="">Uncategorized</option>
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={t.amountPence < 0 ? 'negative' : 'positive'}>{formatPence(t.amountPence, t.currency)}</td>
                      <td>{t.balancePence !== null ? formatPence(t.balancePence, t.currency) : '—'}</td>
                      <td>{transferBadge(t)}</td>
                      <td>{splitControl(t)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {splittingTransaction && (
        <SplitDialog
          transaction={splittingTransaction}
          persons={activePersons}
          onClose={() => setSplittingTransaction(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
