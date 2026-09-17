import { useMemo, useState } from 'react';
import { useAppStore } from '../state/store';
import * as transfersRepo from '../db/transfersRepo';
import { formatPence } from '../utils/currency';
import type { Transaction } from '../domain/types';

export function TransactionsPage() {
  const { accounts, transactions, transfers, refresh } = useAppStore();
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedForLink, setSelectedForLink] = useState<string[]>([]);

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const transfersById = useMemo(() => new Map(transfers.map((t) => [t.id, t])), [transfers]);

  const filtered = useMemo(() => {
    return transactions
      .filter((t) => accountFilter === 'all' || t.accountId === accountFilter)
      .filter((t) => !search.trim() || t.description.toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [transactions, accountFilter, search]);

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
          <button onClick={() => handleConfirm(transfer.id)}>Confirm</button>
          <button onClick={() => handleReject(transfer.id)}>Reject</button>
        </span>
      );
    }

    return (
      <span className="chip chip-confirmed">
        Transfer ↔ {otherAccountName}
        <button onClick={() => handleUnlink(transfer.id)}>Unlink</button>
      </span>
    );
  }

  return (
    <div className="page">
      <h2>Transactions</h2>

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
          Search description
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. Tesco" />
        </label>
        {selectedForLink.length === 2 && <button onClick={handleManualLink}>Link selected as transfer</button>}
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Account</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Balance</th>
              <th>Transfer</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id}>
                <td>{t.date}</td>
                <td>{accountsById.get(t.accountId)?.name ?? '—'}</td>
                <td>{t.description}</td>
                <td className={t.amountPence < 0 ? 'negative' : 'positive'}>{formatPence(t.amountPence, t.currency)}</td>
                <td>{t.balancePence !== null ? formatPence(t.balancePence, t.currency) : '—'}</td>
                <td>{transferBadge(t)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No transactions match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
