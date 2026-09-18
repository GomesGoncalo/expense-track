import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Landmark, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAppStore } from '../state/store';
import * as accountsRepo from '../db/accountsRepo';
import * as valuationSnapshotsRepo from '../db/valuationSnapshotsRepo';
import { BANK_LABELS } from '../parsers';
import { todayIsoDate } from '../utils/dates';
import { formatPence, parseAmountToPence } from '../utils/currency';
import { ownersSharesAreValid } from '../domain/owners';
import { ownerSummary } from '../utils/ownerSummary';
import { EmptyState } from '../components/common/EmptyState';
import { OwnerPicker } from '../components/common/OwnerPicker';
import type { Account, AccountOwner, AccountType, BankId, Person } from '../domain/types';

const ACCOUNT_TYPES: AccountType[] = ['current', 'savings', 'credit-card', 'isa', 'investment', 'other'];
const BANKS = Object.keys(BANK_LABELS) as BankId[];

function defaultValuationBased(accountType: AccountType): boolean {
  return accountType === 'investment';
}

interface AccountFieldsValue {
  name: string;
  bank: BankId;
  accountType: AccountType;
  currency: string;
  valuationBased: boolean;
  manualRate: string;
  owners: AccountOwner[];
}

function AccountFields({
  persons,
  value,
  onChange,
}: {
  persons: Person[];
  value: AccountFieldsValue;
  onChange: (patch: Partial<AccountFieldsValue>) => void;
}) {
  return (
    <>
      <label>
        Name
        <input
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. HSBC Current"
          required
        />
      </label>
      <label>
        Bank
        <select value={value.bank} onChange={(e) => onChange({ bank: e.target.value as BankId })}>
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
          value={value.accountType}
          onChange={(e) => {
            const accountType = e.target.value as AccountType;
            onChange({ accountType, valuationBased: defaultValuationBased(accountType) });
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
        <input value={value.currency} onChange={(e) => onChange({ currency: e.target.value })} maxLength={3} />
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={value.valuationBased}
          onChange={(e) => onChange({ valuationBased: e.target.checked })}
        />
        Tracks a market valuation (investment / stocks ISA) rather than a cash ledger
      </label>
      {value.currency.trim().toUpperCase() !== 'GBP' && (
        <label>
          Manual rate to GBP (e.g. 0.85 for EUR→GBP)
          <input
            value={value.manualRate}
            onChange={(e) => onChange({ manualRate: e.target.value })}
            placeholder="optional"
          />
        </label>
      )}
      <div>
        <span className="field-label">Owner(s)</span>
        {persons.length === 0 ? (
          <p className="muted">
            No household members yet — <Link to="/household">add one</Link> to assign this account, or leave it
            unassigned for now.
          </p>
        ) : (
          <OwnerPicker persons={persons} owners={value.owners} onChange={(owners) => onChange({ owners })} />
        )}
      </div>
    </>
  );
}

const EMPTY_ACCOUNT_FIELDS: AccountFieldsValue = {
  name: '',
  bank: 'hsbc',
  accountType: 'current',
  currency: 'GBP',
  valuationBased: false,
  manualRate: '',
  owners: [],
};

function accountToFields(account: Account): AccountFieldsValue {
  return {
    name: account.name,
    bank: account.bank,
    accountType: account.accountType,
    currency: account.currency,
    valuationBased: account.valuationBased,
    manualRate: account.manualRateToGbp !== null ? String(account.manualRateToGbp) : '',
    owners: account.owners,
  };
}

function AccountForm({ persons, onCreated }: { persons: Person[]; onCreated: () => void }) {
  const [fields, setFields] = useState<AccountFieldsValue>(EMPTY_ACCOUNT_FIELDS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(p: Partial<AccountFieldsValue>) {
    setFields((f) => ({ ...f, ...p }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!fields.name.trim()) return;
    if (!ownersSharesAreValid(fields.owners)) {
      setError('Owner shares must add up to 100%.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const currency = fields.currency.trim().toUpperCase() || 'GBP';
      await accountsRepo.createAccount({
        name: fields.name.trim(),
        bank: fields.bank,
        accountType: fields.accountType,
        currency,
        valuationBased: fields.valuationBased,
        manualRateToGbp: currency !== 'GBP' && fields.manualRate ? Number(fields.manualRate) : null,
        owners: fields.owners,
      });
      setFields(EMPTY_ACCOUNT_FIELDS);
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
      <AccountFields persons={persons} value={fields} onChange={patch} />
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        <Plus size={16} /> Add account
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

function EditAccountDialog({
  account,
  persons,
  onClose,
  onSaved,
}: {
  account: Account;
  persons: Person[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fields, setFields] = useState<AccountFieldsValue>(accountToFields(account));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(p: Partial<AccountFieldsValue>) {
    setFields((f) => ({ ...f, ...p }));
  }

  async function handleSave() {
    if (!fields.name.trim()) return;
    if (!ownersSharesAreValid(fields.owners)) {
      setError('Owner shares must add up to 100%.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const currency = fields.currency.trim().toUpperCase() || 'GBP';
      await accountsRepo.updateAccount({
        ...account,
        name: fields.name.trim(),
        bank: fields.bank,
        accountType: fields.accountType,
        currency,
        valuationBased: fields.valuationBased,
        manualRateToGbp: currency !== 'GBP' && fields.manualRate ? Number(fields.manualRate) : null,
        owners: fields.owners,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Edit account</h3>
        <div className="form-grid">
          <AccountFields persons={persons} value={fields} onChange={patch} />
        </div>
        {error && <p className="error">{error}</p>}
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={submitting}>
            Save changes
          </button>
        </div>
      </div>
    </div>
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
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function AccountsPage() {
  const { accounts, persons, refresh } = useAppStore();
  const activePersons = persons.filter((p) => !p.archived);
  const personsById = new Map(persons.map((p) => [p.id, p]));
  const [updatingValueFor, setUpdatingValueFor] = useState<Account | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

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
      <div className="page-header">
        <div>
          <h2>Accounts</h2>
          <p className="page-subtitle">Every bank, card, and investment account you're tracking.</p>
        </div>
      </div>

      <AccountForm persons={activePersons} onCreated={refresh} />

      <div className="card">
        <h3>Your accounts</h3>
        {accounts.length === 0 ? (
          <EmptyState
            icon={<Landmark size={32} />}
            title="No accounts yet"
            description="Add your first account above, then head to Import to upload a statement."
          />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Bank</th>
                  <th>Type</th>
                  <th>Currency</th>
                  <th>Owner(s)</th>
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
                    <td>{ownerSummary(account.owners, personsById)}</td>
                    <td className="row-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingAccount(account)}>
                        <Pencil size={14} /> Edit
                      </button>
                      {account.valuationBased && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setUpdatingValueFor(account)}>
                          Update value
                        </button>
                      )}
                      {!account.archived && (
                        <button className="btn btn-ghost btn-sm" onClick={() => handleArchive(account.id)}>
                          Archive
                        </button>
                      )}
                      <button className="btn btn-ghost btn-sm danger" onClick={() => handleDelete(account)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {updatingValueFor && (
        <UpdateValueDialog account={updatingValueFor} onClose={() => setUpdatingValueFor(null)} onSaved={refresh} />
      )}
      {editingAccount && (
        <EditAccountDialog
          account={editingAccount}
          persons={activePersons}
          onClose={() => setEditingAccount(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

