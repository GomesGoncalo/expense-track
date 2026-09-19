import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Archive, ArchiveRestore, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { useAppStore } from '../state/store';
import * as categoriesRepo from '../db/categoriesRepo';
import { CATEGORIES, categoryColorOrder } from '../domain/categories';
import type { CustomCategory } from '../domain/categories';
import { getNamedCategoryColor, useColorScheme } from '../utils/palette';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';

function CategoryForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { show } = useToast();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await categoriesRepo.createCategory(name.trim());
      setName('');
      onCreated();
      show({ tone: 'success', message: 'Category added.' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add category.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a category…" />
      <Button type="submit" icon={<Plus size={16} />} loading={submitting}>
        Add
      </Button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

function CategoryRow({
  category,
  color,
  usageCount,
  onChanged,
  onRequestDelete,
}: {
  category: CustomCategory;
  color: string;
  usageCount: number;
  onChanged: () => void;
  onRequestDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { show } = useToast();

  async function saveRename() {
    if (!name.trim() || name.trim() === category.name) {
      setEditing(false);
      setName(category.name);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await categoriesRepo.renameCategory(category.id, name.trim());
      setEditing(false);
      onChanged();
      show({ tone: 'success', message: 'Category renamed.' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename category.');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleArchived() {
    if (category.archived) await categoriesRepo.unarchiveCategory(category.id);
    else await categoriesRepo.archiveCategory(category.id);
    onChanged();
    show({ tone: 'success', message: category.archived ? 'Category restored.' : 'Category archived.' });
  }

  return (
    <li className="person-list-row">
      <span className="color-dot" style={{ background: color }} />
      {editing ? (
        <>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveRename()}
            autoFocus
          />
          <Button size="sm" onClick={saveRename} loading={submitting}>
            Save
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditing(false);
              setName(category.name);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </>
      ) : (
        <>
          <span className="person-name">{category.name}</span>
          {category.archived && <span className="chip chip-outline">Archived</span>}
        </>
      )}
      <span className="spacer" />
      {!editing && (
        <>
          <span className="muted">{usageCount} transaction{usageCount === 1 ? '' : 's'}</span>
          <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => setEditing(true)} title="Rename" />
          <Button
            variant="ghost"
            size="sm"
            icon={category.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            onClick={toggleArchived}
            title={category.archived ? 'Restore' : 'Archive'}
          />
          <Button variant="danger" size="sm" icon={<Trash2 size={16} />} onClick={onRequestDelete} title="Delete" />
        </>
      )}
      {error && <p className="error">{error}</p>}
    </li>
  );
}

export function CategoriesPage() {
  const categories = useAppStore((s) => s.categories);
  const transactions = useAppStore((s) => s.transactions);
  const refresh = useAppStore((s) => s.refresh);
  const scheme = useColorScheme();
  const [pendingDelete, setPendingDelete] = useState<CustomCategory | null>(null);
  const { show } = useToast();

  const colorOrder = useMemo(() => categoryColorOrder(categories), [categories]);
  const colorFor = (name: string) => getNamedCategoryColor(name, colorOrder, scheme === 'dark');

  const usageByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of transactions) {
      if (!t.category) continue;
      counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    }
    return counts;
  }, [transactions]);

  const sortedCustomCategories = useMemo(
    () => [...categories].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)),
    [categories],
  );

  async function handleDelete() {
    if (!pendingDelete) return;
    await categoriesRepo.deleteCategoryCascade(pendingDelete.id);
    await refresh();
    show({ tone: 'success', message: `"${pendingDelete.name}" removed.` });
    setPendingDelete(null);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Categories</h2>
          <p className="page-subtitle">Add your own categories alongside the built-in ones, and manage existing ones.</p>
        </div>
      </div>

      <Card title="Your categories" icon={<Tag size={18} />}>
        <CategoryForm onCreated={refresh} />
        {sortedCustomCategories.length === 0 ? (
          <p className="muted">
            No custom categories yet — add one above, or just pick "Uncategorized" and categorize transactions with a
            built-in category below.
          </p>
        ) : (
          <ul className="person-list">
            {sortedCustomCategories.map((c) => (
              <CategoryRow
                key={c.id}
                category={c}
                color={colorFor(c.name)}
                usageCount={usageByCategory.get(c.name) ?? 0}
                onChanged={refresh}
                onRequestDelete={() => setPendingDelete(c)}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card title="Built-in categories">
        <p className="muted" style={{ marginTop: -8, marginBottom: 12 }}>
          Always available, can't be renamed or removed.
        </p>
        <ul className="person-list">
          {CATEGORIES.map((c) => (
            <li key={c} className="person-list-row">
              <span className="color-dot" style={{ background: colorFor(c) }} />
              <span className="person-name">{c}</span>
              <span className="spacer" />
              <span className="muted">{usageByCategory.get(c) ?? 0} transaction{(usageByCategory.get(c) ?? 0) === 1 ? '' : 's'}</span>
            </li>
          ))}
        </ul>
      </Card>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete ? `Delete "${pendingDelete.name}"?` : ''}
        description={
          pendingDelete
            ? `${usageByCategory.get(pendingDelete.name) ?? 0} transaction(s) using this category will be set back to Uncategorized.`
            : undefined
        }
        confirmLabel="Delete"
        tone="danger"
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
