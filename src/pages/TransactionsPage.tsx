import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, Plus, Sparkles, Users } from 'lucide-react';
import { useAppStore } from '../state/store';
import * as transfersRepo from '../db/transfersRepo';
import * as transactionsRepo from '../db/transactionsRepo';
import { formatPence } from '../utils/currency';
import { ownerSummary } from '../utils/ownerSummary';
import { ownersSharesAreValid } from '../domain/owners';
import { buildPriorCategoryLookup, resolveCategory } from '../domain/autoCategorize';
import { categoryColorOrder, selectableCategoryNames } from '../domain/categories';
import type { Category } from '../domain/categories';
import { EmptyState } from '../components/common/EmptyState';
import { OwnerPicker } from '../components/common/OwnerPicker';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Table, type TableColumn } from '../components/ui/Table';
import { useToast } from '../components/ui/Toast';
import { QuickAddTransactionModal } from '../components/quickAdd/QuickAddTransactionModal';
import { cx } from '../utils/cx';
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
  const { show } = useToast();

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
      show({ tone: 'success', message: nextOwners ? 'Split saved.' : 'Split cleared.' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save split.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Split "${transaction.description}"`}
      footer={
        <>
          {transaction.splitOverride && (
            <Button variant="danger" onClick={() => save(null)} disabled={submitting}>
              Clear split
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => save(owners.length > 0 ? owners : null)} loading={submitting}>
            Save
          </Button>
        </>
      }
    >
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
    </Modal>
  );
}

export function TransactionsPage() {
  const { accounts, persons, transactions, transfers, categories, refresh } = useAppStore();
  const categoryNames = useMemo(() => selectableCategoryNames(categories), [categories]);
  const categoryFilterNames = useMemo(() => categoryColorOrder(categories), [categories]);
  const [searchParams] = useSearchParams();
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>(() => searchParams.get('category') ?? 'all');
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [selectedForLink, setSelectedForLink] = useState<string[]>([]);
  const [splittingTransaction, setSplittingTransaction] = useState<Transaction | null>(null);
  const [autoCategorizing, setAutoCategorizing] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const { show } = useToast();

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
      let categorized = 0;
      for (const t of uncategorized) {
        const guessed = resolveCategory(t.description, t.amountPence, priorCategories);
        if (guessed) {
          await transactionsRepo.updateTransaction({ ...t, category: guessed });
          categorized += 1;
        }
      }
      await refresh();
      show({ tone: 'success', message: `${categorized} transaction(s) categorized.` });
    } finally {
      setAutoCategorizing(false);
    }
  }

  async function handleConfirm(transferId: string) {
    await transfersRepo.confirm(transferId);
    await refresh();
    show({ tone: 'success', message: 'Transfer confirmed.' });
  }

  async function handleReject(transferId: string) {
    await transfersRepo.reject(transferId);
    await refresh();
    show({ tone: 'success', message: 'Transfer suggestion rejected.' });
  }

  async function handleUnlink(transferId: string) {
    await transfersRepo.unlink(transferId);
    await refresh();
    show({ tone: 'success', message: 'Transfer unlinked.' });
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
    show({ tone: 'success', message: 'Linked as a transfer.' });
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

  function categorySelect(t: Transaction) {
    return (
      <select
        className={cx(!t.category && 'category-unset')}
        value={t.category ?? ''}
        onChange={(e) => handleCategoryChange(t, e.target.value as Category | '')}
      >
        <option value="">Uncategorized</option>
        {categoryNames.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    );
  }

  const columns: TableColumn<Transaction>[] = [
    { key: 'date', header: 'Date', render: (t) => t.date },
    { key: 'account', header: 'Account', render: (t) => accountsById.get(t.accountId)?.name ?? '—' },
    {
      key: 'owner',
      header: 'Owner',
      render: (t) => {
        const account = accountsById.get(t.accountId);
        return <span className="muted">{account ? ownerSummary(account.owners, personsById) : '—'}</span>;
      },
    },
    { key: 'description', header: 'Description', render: (t) => t.description },
    { key: 'category', header: 'Category', render: categorySelect },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (t) => <span className={t.amountPence < 0 ? 'negative' : 'positive'}>{formatPence(t.amountPence, t.currency)}</span>,
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      render: (t) => (t.balancePence !== null ? formatPence(t.balancePence, t.currency) : '—'),
    },
    { key: 'transfer', header: 'Transfer', render: transferBadge },
    { key: 'split', header: 'Split', render: splitControl },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Transactions</h2>
          <p className="page-subtitle">Search, filter, and manage transfers and splits across every account.</p>
        </div>
      </div>

      <Card className="form-grid form-inline">
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
            {categoryFilterNames.map((c) => (
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
        <Button variant="ghost" icon={<Plus size={16} />} onClick={() => setQuickAddOpen(true)}>
          Add transaction
        </Button>
        {selectedForLink.length === 2 && (
          <Button onClick={handleManualLink}>Link selected as transfer</Button>
        )}
        {uncategorizedCount > 0 && (
          <Button variant="ghost" icon={<Sparkles size={16} />} onClick={handleAutoCategorize} loading={autoCategorizing}>
            {autoCategorizing ? 'Categorizing…' : `Auto-categorize ${uncategorizedCount} uncategorized`}
          </Button>
        )}
      </Card>

      <Card>
        <Table
          columns={columns}
          rows={filtered}
          rowKey={(t) => t.id}
          emptyState={
            <EmptyState
              icon={<ArrowLeftRight size={32} />}
              title="No transactions match this filter"
              description={transactions.length === 0 ? 'Import a statement to see transactions here.' : undefined}
            />
          }
          renderCard={(t) => {
            const account = accountsById.get(t.accountId);
            return (
              <>
                <div className="record-card-row">
                  <span className="record-card-primary">{t.description}</span>
                  <span className={t.amountPence < 0 ? 'negative' : 'positive'}>{formatPence(t.amountPence, t.currency)}</span>
                </div>
                <span className="record-card-secondary">
                  {t.date} · {account?.name ?? '—'}
                </span>
                <div className="record-card-meta">{categorySelect(t)}</div>
                <div className="record-card-meta">
                  {transferBadge(t)}
                  {splitControl(t)}
                </div>
              </>
            );
          }}
        />
      </Card>

      {splittingTransaction && (
        <SplitDialog
          transaction={splittingTransaction}
          persons={activePersons}
          onClose={() => setSplittingTransaction(null)}
          onSaved={refresh}
        />
      )}

      <QuickAddTransactionModal
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        defaultAccountId={accountFilter !== 'all' ? accountFilter : undefined}
      />
    </div>
  );
}
