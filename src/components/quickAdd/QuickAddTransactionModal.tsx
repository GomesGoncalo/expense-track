import { useMemo, useState } from 'react';
import { useAppStore } from '../../state/store';
import { selectableCategoryNames } from '../../domain/categories';
import type { Category } from '../../domain/categories';
import { todayIsoDate } from '../../utils/dates';
import { ownersSharesAreValid } from '../../domain/owners';
import { resolveCategory, buildPriorCategoryLookup } from '../../domain/autoCategorize';
import { findDuplicateTransaction, quickAddTransaction } from '../../import/quickAddTransaction';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { OwnerPicker } from '../common/OwnerPicker';
import { cx } from '../../utils/cx';
import type { AccountOwner } from '../../domain/types';

export interface QuickAddTransactionModalProps {
  open: boolean;
  onClose: () => void;
  defaultAccountId?: string;
}

type Direction = 'out' | 'in';

export function QuickAddTransactionModal({ open, onClose, defaultAccountId }: QuickAddTransactionModalProps) {
  const { accounts, persons, transactions, categories, refresh } = useAppStore();
  const { show } = useToast();
  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const categoryNames = useMemo(() => selectableCategoryNames(categories), [categories]);

  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(todayIsoDate());
  const [description, setDescription] = useState('');
  const [direction, setDirection] = useState<Direction>('out');
  const [amountInput, setAmountInput] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const [owners, setOwners] = useState<AccountOwner[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const effectiveAccountId = accountId || defaultAccountId || activeAccounts[0]?.id || '';
  const account = activeAccounts.find((a) => a.id === effectiveAccountId);

  const suggestedCategory = useMemo(() => {
    const magnitude = Number(amountInput);
    if (!description.trim() || !amountInput.trim() || Number.isNaN(magnitude)) return null;
    const priorCategories = buildPriorCategoryLookup(transactions);
    const amountPence = Math.round(magnitude * 100) * (direction === 'out' ? -1 : 1);
    return resolveCategory(description, amountPence, priorCategories);
  }, [description, amountInput, direction, transactions]);

  function reset() {
    setAccountId('');
    setDate(todayIsoDate());
    setDescription('');
    setDirection('out');
    setAmountInput('');
    setCategory('');
    setOwners([]);
    setError(null);
    setDuplicateWarning(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    setError(null);
    if (!account) {
      setError('Choose an account.');
      return;
    }
    if (!description.trim()) {
      setError('Enter a description.');
      return;
    }
    const magnitude = Number(amountInput);
    if (!amountInput.trim() || Number.isNaN(magnitude) || magnitude <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (owners.length > 0 && !ownersSharesAreValid(owners)) {
      setError('Split shares must add up to 100%.');
      return;
    }

    const amountPence = Math.round(magnitude * 100) * (direction === 'out' ? -1 : 1);
    const trimmedDescription = description.trim();

    if (!duplicateWarning) {
      const duplicate = await findDuplicateTransaction(account, date, trimmedDescription, amountPence);
      if (duplicate) {
        setDuplicateWarning(true);
        return;
      }
    }

    setSubmitting(true);
    try {
      await quickAddTransaction({
        account,
        date,
        description: trimmedDescription,
        amountPence,
        category: category || null,
        splitOverride: owners.length > 0 ? owners : null,
      });
      await refresh();
      show({ tone: 'success', message: 'Transaction added.' });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add transaction.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add transaction"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting}>
            {duplicateWarning ? 'Add anyway' : 'Add transaction'}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <label>
          Account
          <select value={effectiveAccountId} onChange={(e) => setAccountId(e.target.value)}>
            {activeAccounts.length === 0 && <option value="">No accounts yet</option>}
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Corner shop" />
        </label>
        <label>
          Amount
          <div className="inline-form" style={{ marginBottom: 0 }}>
            <select value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
              <option value="out">Money out</option>
              <option value="in">Money in</option>
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </label>
        <label>
          Category
          <select
            className={cx(!category && 'category-unset')}
            value={category}
            onChange={(e) => setCategory(e.target.value as Category | '')}
          >
            <option value="">{suggestedCategory ? `Suggested: ${suggestedCategory}` : 'Uncategorized'}</option>
            {categoryNames.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {persons.length > 0 && (
          <div>
            <span className="field-label">Split between (optional)</span>
            <OwnerPicker persons={persons} owners={owners} onChange={setOwners} />
          </div>
        )}
        {duplicateWarning && (
          <p className="warnings-inline">
            This looks like a duplicate of an existing transaction on this account — click "Add anyway" to add it
            regardless.
          </p>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </Modal>
  );
}
