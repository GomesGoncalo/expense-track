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

export type Category = (typeof CATEGORIES)[number];
