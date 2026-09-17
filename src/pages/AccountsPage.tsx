import { useState } from 'react';
import { useAppStore } from '../state/store';
import * as accountsRepo from '../db/accountsRepo';
import * as valuationSnapshotsRepo from '../db/valuationSnapshotsRepo';
import { BANK_LABELS } from '../parsers';
import { todayIsoDate } from '../utils/dates';
import { formatPence, parseAmountToPence } from '../utils/currency';
import type { Account, AccountType, BankId } from '../domain/types';

const ACCOUNT_TYPES: AccountType[] = ['current', 'savings', 'credit-card', 'isa', 'investment', 'other'];
const BANKS = Object.keys(BANK_LABELS) as BankId[];

function defaultValuationBased(accountType: AccountType): boolean {
  return accountType === 'investment';
}

function AccountForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [bank, setBank] = useState<BankId>('hsbc');
  const [accountType, setAccountType] = useState<AccountType>('current');
  const [currency, setCurrency] = useState('GBP');
  const [valuationBased, setValuationBased] = useState(false);
  const [manualRate, setManualRate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await accountsRepo.createAccount({
        name: name.trim(),
        bank,
        accountType,
        currency: currency.trim().toUpperCase() || 'GBP',
        valuationBased,
        manualRateToGbp: currency.trim().toUpperCase() !== 'GBP' && manualRate ? Number(manualRate) : null,
      });
      setName('');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={handleSubmit}>
      <h3>Add account</h3>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HSBC Current" required />
      </label>
      <label>
        Bank
        <select value={bank} onChange={(e) => setBank(e.target.value as BankId)}>
          {BANKS.map((b) => (
            <option key={b} value={b}>
              {BANK_LABELS[b]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Type
        <select
          value={accountType}
          onChange={(e) => {
            const value = e.target.value as AccountType;
            setAccountType(value);
            setValuationBased(defaultValuationBased(value));
          }}
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label>
        Currency
        <input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} />
      </label>
      <label className="checkbox-row">
        <input type="checkbox" checked={valuationBased} onChange={(e) => setValuationBased(e.target.checked)} />
        Tracks a market valuation (investment / stocks ISA) rather than a cash ledger
      </label>
      {currency.trim().toUpperCase() !== 'GBP' && (
        <label>
          Manual rate to GBP (e.g. 0.85 for EUR→GBP)
          <input value={manualRate} onChange={(e) => setManualRate(e.target.value)} placeholder="optional" />
        </label>
      )}
      <button type="submit" disabled={submitting}>
        Add account
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

function UpdateValueDialog({ account, onClose, onSaved }: { account: Account; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!value.trim()) return;
    setError(null);
    try {
      const pence = parseAmountToPence(value);
      await valuationSnapshotsRepo.addSnapshot(account.id, todayIsoDate(), pence, 'manual');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save value.');
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Update current value — {account.name}</h3>
        <label>
          Current value ({account.currency})
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 12345.67" autoFocus />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="dialog-actions">
          <button onClick={onClose}>Cancel</button>
          <button onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

export function AccountsPage() {
  const { accounts, refresh } = useAppStore();
  const [updatingValueFor, setUpdatingValueFor] = useState<Account | null>(null);

  async function handleArchive(id: string) {
    await accountsRepo.archiveAccount(id);
    await refresh();
  }

  async function handleDelete(account: Account) {
    if (!confirm(`Delete "${account.name}" and all its transactions, imports and transfers? This cannot be undone.`)) {
      return;
    }
    await accountsRepo.deleteAccountCascade(account.id);
    await refresh();
  }

  return (
    <div className="page">
      <h2>Accounts</h2>
      <AccountForm onCreated={refresh} />

      <div className="card">
        <h3>Your accounts</h3>
        {accounts.length === 0 && <p className="muted">No accounts yet — add one above.</p>}
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Bank</th>
              <th>Type</th>
              <th>Currency</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id} className={account.archived ? 'archived' : ''}>
                <td>{account.name}</td>
                <td>{BANK_LABELS[account.bank]}</td>
                <td>
                  {account.accountType}
                  {account.valuationBased ? ' (valuation)' : ''}
                </td>
                <td>
                  {account.currency}
                  {account.currency !== 'GBP' && account.manualRateToGbp
                    ? ` (${formatPence(Math.round(account.manualRateToGbp * 100), 'GBP')}/unit)`
                    : ''}
                </td>
                <td className="row-actions">
                  {account.valuationBased && (
                    <button onClick={() => setUpdatingValueFor(account)}>Update value</button>
                  )}
                  {!account.archived && <button onClick={() => handleArchive(account.id)}>Archive</button>}
                  <button className="danger" onClick={() => handleDelete(account)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {updatingValueFor && (
        <UpdateValueDialog account={updatingValueFor} onClose={() => setUpdatingValueFor(null)} onSaved={refresh} />
      )}
    </div>
  );
}
