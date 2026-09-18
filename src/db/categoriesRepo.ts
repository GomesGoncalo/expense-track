import { getDb } from './client';
import { createId, nowIso } from '../domain/id';
import { CATEGORIES } from '../domain/categories';
import type { CustomCategory } from '../domain/categories';

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

async function nameCollides(name: string, excludeId?: string): Promise<boolean> {
  if (CATEGORIES.some((c) => normalizeName(c) === normalizeName(name))) return true;
  const db = await getDb();
  const existing = await db.getAll('categories');
  return existing.some((c) => c.id !== excludeId && normalizeName(c.name) === normalizeName(name));
}

export async function listCategories(): Promise<CustomCategory[]> {
  const db = await getDb();
  return db.getAll('categories');
}

export async function createCategory(name: string): Promise<CustomCategory> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Category name is required.');
  if (await nameCollides(trimmed)) throw new Error(`"${trimmed}" already exists.`);

  const category: CustomCategory = { id: createId(), name: trimmed, createdAt: nowIso(), archived: false };
  const db = await getDb();
  await db.put('categories', category);
  return category;
}

/**
 * Renames a category and cascades the new name onto every transaction
 * currently using the old one — categories are referenced by name (a plain
 * string on Transaction), not by id, so nothing else would pick up the
 * rename otherwise.
 */
export async function renameCategory(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Category name is required.');

  const db = await getDb();
  const category = await db.get('categories', id);
  if (!category) return;
  if (trimmed !== category.name && (await nameCollides(trimmed, id))) {
    throw new Error(`"${trimmed}" already exists.`);
  }
  if (trimmed === category.name) return;

  const oldName = category.name;
  const tx = db.transaction(['categories', 'transactions'], 'readwrite');
  await tx.objectStore('categories').put({ ...category, name: trimmed });
  const transactions = await tx.objectStore('transactions').getAll();
  for (const t of transactions) {
    if (t.category !== oldName) continue;
    await tx.objectStore('transactions').put({ ...t, category: trimmed });
  }
  await tx.done;
}

export async function archiveCategory(id: string): Promise<void> {
  const db = await getDb();
  const category = await db.get('categories', id);
  if (!category) return;
  await db.put('categories', { ...category, archived: true });
}

export async function unarchiveCategory(id: string): Promise<void> {
  const db = await getDb();
  const category = await db.get('categories', id);
  if (!category) return;
  await db.put('categories', { ...category, archived: false });
}

/**
 * Deletes a category and clears it back to uncategorized on any transaction
 * currently using it. No owner-style renormalizing needed like
 * deletePersonCascade — a category is just a name, not a referenced id.
 */
export async function deleteCategoryCascade(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['categories', 'transactions'], 'readwrite');
  const category = await tx.objectStore('categories').get(id);
  if (category) {
    const transactions = await tx.objectStore('transactions').getAll();
    for (const t of transactions) {
      if (t.category !== category.name) continue;
      await tx.objectStore('transactions').put({ ...t, category: null });
    }
  }
  await tx.objectStore('categories').delete(id);
  await tx.done;
}
