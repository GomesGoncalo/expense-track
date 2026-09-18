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
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Modal } from '../components/ui/Modal';
import { Table, type TableColumn } from '../components/ui/Table';
import { useToast } from '../components/ui/Toast';
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
  const { show } = useToast();

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
      show({ tone: 'success', message: 'Account added.' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card title="Add account" icon={<Plus size={16} />}>
      <form className="form-grid" onSubmit={handleSubmit}>
        <AccountFields persons={persons} value={fields} onChange={patch} />
        <Button type="submit" icon={<Plus size={16} />} loading={submitting}>
          Add account
        </Button>
        {error && <p className="error">{error}</p>}
      </form>
    </Card>
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
  const { show } = useToast();

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
      show({ tone: 'success', message: 'Account updated.' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit account"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={submitting}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <AccountFields persons={persons} value={fields} onChange={patch} />
      </div>
      {error && <p className="error">{error}</p>}
    </Modal>
  );
}

function UpdateValueDialog({ account, onClose, onSaved }: { account: Account; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { show } = useToast();

  async function handleSave() {
    if (!value.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const pence = parseAmountToPence(value);
      await valuationSnapshotsRepo.addSnapshot(account.id, todayIsoDate(), pence, 'manual');
      onSaved();
      onClose();
      show({ tone: 'success', message: 'Value updated.' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save value.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Update current value — ${account.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={submitting}>
            Save
          </Button>
        </>
      }
    >
      <label>
        Current value ({account.currency})
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 12345.67" autoFocus />
      </label>
      {error && <p className="error">{error}</p>}
    </Modal>
  );
}

export function AccountsPage() {
  const { accounts, persons, refresh } = useAppStore();
  const activePersons = persons.filter((p) => !p.archived);
  const personsById = new Map(persons.map((p) => [p.id, p]));
  const [updatingValueFor, setUpdatingValueFor] = useState<Account | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Account | null>(null);
  const { show } = useToast();

  async function handleArchive(id: string) {
    await accountsRepo.archiveAccount(id);
    await refresh();
    show({ tone: 'success', message: 'Account archived.' });
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    await accountsRepo.deleteAccountCascade(pendingDelete.id);
    await refresh();
    show({ tone: 'success', message: `"${pendingDelete.name}" deleted.` });
    setPendingDelete(null);
  }

  const columns: TableColumn<Account>[] = [
    { key: 'name', header: 'Name', render: (a) => a.name },
    { key: 'bank', header: 'Bank', render: (a) => BANK_LABELS[a.bank] },
    {
      key: 'type',
      header: 'Type',
      render: (a) => `${a.accountType}${a.valuationBased ? ' (valuation)' : ''}`,
    },
    {
      key: 'currency',
      header: 'Currency',
      render: (a) =>
        `${a.currency}${
          a.currency !== 'GBP' && a.manualRateToGbp ? ` (${formatPence(Math.round(a.manualRateToGbp * 100), 'GBP')}/unit)` : ''
        }`,
    },
    { key: 'owners', header: 'Owner(s)', render: (a) => ownerSummary(a.owners, personsById) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (account) => (
        <div className="row-actions">
          <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => setEditingAccount(account)}>
            Edit
          </Button>
          {account.valuationBased && (
            <Button variant="ghost" size="sm" onClick={() => setUpdatingValueFor(account)}>
              Update value
            </Button>
          )}
          {!account.archived && (
            <Button variant="ghost" size="sm" onClick={() => handleArchive(account.id)}>
              Archive
            </Button>
          )}
          <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => setPendingDelete(account)} />
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Accounts</h2>
          <p className="page-subtitle">Every bank, card, and investment account you're tracking.</p>
        </div>
      </div>

      <AccountForm persons={activePersons} onCreated={refresh} />

      <Card title="Your accounts">
        <Table
          columns={columns}
          rows={accounts}
          rowKey={(a) => a.id}
          rowClassName={(a) => (a.archived ? 'archived' : undefined)}
          emptyState={
            <EmptyState
              icon={<Landmark size={32} />}
              title="No accounts yet"
              description="Add your first account above, then head to Import to upload a statement."
            />
          }
          renderCard={(account) => (
            <>
              <div className="record-card-row">
                <span className="record-card-primary">{account.name}</span>
              </div>
              <span className="record-card-secondary">
                {BANK_LABELS[account.bank]} · {account.accountType}
                {account.valuationBased ? ' (valuation)' : ''}
              </span>
              <div className="record-card-meta">
                <span className="muted">{ownerSummary(account.owners, personsById) || 'Unassigned'}</span>
              </div>
              <div className="record-card-actions">
                <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => setEditingAccount(account)}>
                  Edit
                </Button>
                {account.valuationBased && (
                  <Button variant="ghost" size="sm" onClick={() => setUpdatingValueFor(account)}>
                    Update value
                  </Button>
                )}
                {!account.archived && (
                  <Button variant="ghost" size="sm" onClick={() => handleArchive(account.id)}>
                    Archive
                  </Button>
                )}
                <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => setPendingDelete(account)} />
              </div>
            </>
          )}
        />
      </Card>

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
      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete ? `Delete "${pendingDelete.name}"?` : ''}
        description="This deletes all of its transactions, imports and transfers. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
