export const CATEGORIES = [
  'Groceries',
  'Dining & Takeout',
  'Transport',
  'Housing',
  'Utilities',
  'Subscriptions',
  'Shopping',
  'Health & Fitness',
  'Entertainment',
  'Travel',
  'Insurance',
  'Fees & Charges',
  'Savings & Investments',
  'Income',
  'Transfer',
  'Other',
] as const;

/**
 * A category name — one of the built-ins above, or a user-defined custom
 * category (src/db/categoriesRepo.ts). Plain string rather than a literal
 * union since custom categories aren't known at compile time; Transaction
 * stores whatever string was picked either way.
 */
export type Category = string;

/** A user-defined category, alongside the fixed built-in list above. */
export interface CustomCategory {
  id: string;
  name: string;
  createdAt: string;
  archived: boolean;
}

/**
 * Category names offered when picking a category for a transaction —
 * built-ins plus active (non-archived) custom ones, in creation order.
 */
export function selectableCategoryNames(customCategories: readonly CustomCategory[]): string[] {
  return [
    ...CATEGORIES,
    ...customCategories
      .filter((c) => !c.archived)
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map((c) => c.name),
  ];
}

/**
 * Full reference order — including archived categories — for stable
 * per-category chart colors. A category's color must stay fixed even after
 * it's archived, since past transactions keep using its name.
 */
export function categoryColorOrder(customCategories: readonly CustomCategory[]): string[] {
  return [
    ...CATEGORIES,
    ...customCategories.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)).map((c) => c.name),
  ];
}
