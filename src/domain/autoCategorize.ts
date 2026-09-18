import { normalizeDescription } from './hash';
import type { Category } from './categories';

interface CategoryRule {
  category: Category;
  keywords: string[];
}

// UK-focused keyword rules, checked in order (most specific first). Matching
// is a case-insensitive substring check against the transaction description.
const RULES: CategoryRule[] = [
  {
    category: 'Groceries',
    keywords: [
      'TESCO', 'SAINSBURY', 'ASDA', 'ALDI', 'LIDL', 'MORRISON', 'WAITROSE',
      'ICELAND', 'CO-OP', 'COOP FOOD', 'OCADO', 'M&S FOOD', 'MARKS AND SPENCER FOOD',
    ],
  },
  {
    category: 'Dining & Takeout',
    keywords: [
      'DELIVEROO', 'JUST EAT', 'JUSTEAT', 'UBER EATS', 'UBEREATS', 'MCDONALD',
      'KFC', 'BURGER KING', 'COSTA', 'STARBUCKS', 'PRET A MANGER', 'PRET', 'NANDO',
      'GREGGS', 'DOMINO', 'PIZZA HUT', 'PIZZA EXPRESS', 'WAGAMAMA', 'CAFFE NERO',
      'CAFE NERO', 'SUBWAY', 'ITSU',
    ],
  },
  {
    category: 'Transport',
    keywords: [
      'UBER', 'BOLT', 'TFL', 'TRAINLINE', 'NATIONAL RAIL', 'ADDISON LEE',
      'CITYMAPPER', 'NCP ', 'RINGGO', 'SHELL', ' BP ', 'ESSO', 'TEXACO',
      'GREATER ANGLIA', 'SOUTHERN RAIL', 'AVANTI',
    ],
  },
  {
    category: 'Housing',
    keywords: ['RENT', 'MORTGAGE', 'LANDLORD', 'LETTING'],
  },
  {
    category: 'Utilities',
    keywords: [
      'BRITISH GAS', 'EDF ENERGY', 'OCTOPUS ENERGY', 'SCOTTISH POWER', 'E.ON',
      'EON NEXT', 'THAMES WATER', 'SEVERN TRENT', 'ANGLIAN WATER', 'COUNCIL TAX',
      'TV LICENCE', 'TV LICENSE', 'VIRGIN MEDIA', 'BT GROUP', 'SKY DIGITAL',
      'VODAFONE', 'GIFFGAFF', ' EE LIMITED', ' O2 ', 'THREE.CO.UK',
    ],
  },
  {
    category: 'Subscriptions',
    keywords: [
      'NETFLIX', 'SPOTIFY', 'DISNEY PLUS', 'DISNEY+', 'AMAZON PRIME', 'NOW TV',
      'YOUTUBE PREMIUM', 'AUDIBLE', 'ICLOUD', 'APPLE.COM/BILL', 'PARAMOUNT+',
      'APPLE MUSIC',
    ],
  },
  {
    category: 'Health & Fitness',
    keywords: [
      'PUREGYM', 'PURE GYM', 'NUFFIELD HEALTH', 'BOOTS', 'SUPERDRUG', 'PHARMACY',
      'DENTIST', 'VIRGIN ACTIVE', 'THE GYM GROUP', 'DAVID LLOYD',
    ],
  },
  {
    category: 'Entertainment',
    keywords: [
      'CINEMA', 'VUE ', 'ODEON', 'CINEWORLD', 'TICKETMASTER', 'STEAM GAMES',
      'PLAYSTATION NETWORK', 'XBOX', 'EVENTBRITE',
    ],
  },
  {
    category: 'Travel',
    keywords: [
      'AIRBNB', 'BOOKING.COM', 'EXPEDIA', 'RYANAIR', 'EASYJET', 'BRITISH AIRWAYS',
      'TRAVELODGE', 'PREMIER INN', 'HOTELS.COM', 'LASTMINUTE',
    ],
  },
  {
    category: 'Insurance',
    keywords: ['INSURANCE', 'AVIVA', 'ADMIRAL', 'DIRECT LINE', 'CHURCHILL', 'AXA INSURANCE'],
  },
  {
    category: 'Fees & Charges',
    keywords: ['OVERDRAFT', 'INTEREST CHARGE', 'MONTHLY ACCOUNT FEE', 'UNAUTHORISED', 'UNARRANGED'],
  },
  {
    category: 'Savings & Investments',
    keywords: [
      'VANGUARD', 'TRADING 212', 'TRADING212', 'MONEYBOX', 'HARGREAVES LANSDOWN',
      'NUTMEG', 'FREETRADE', 'CHIP FINANCE',
    ],
  },
  {
    category: 'Income',
    keywords: ['SALARY', 'PAYROLL', 'WAGES', 'DIVIDEND'],
  },
  {
    category: 'Transfer',
    keywords: ['FASTER PAYMENT', 'FASTER PYMT', ' FPS ', 'STANDING ORDER TO', 'STANDING ORDER FROM'],
  },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-boundary match, not a plain substring check — a naive `.includes()`
 * on a short keyword like "TFL" or "BP" false-positives inside unrelated
 * words (e.g. "TFL" is embedded in "NE-TFL-IX.COM"). `\b` only matches at a
 * transition between a word character and a non-word one, so it correctly
 * rejects matches buried inside a longer run of letters.
 */
function keywordMatches(text: string, keyword: string): boolean {
  return new RegExp(`\\b${escapeRegExp(keyword.trim())}\\b`, 'i').test(text);
}

/**
 * Best-effort category guess from a transaction's description, using
 * keyword rules over known UK merchants/services — there's no backend to
 * call an ML/LLM classifier, and even if there were, sending transaction
 * text off-device would break this app's "nothing leaves your machine"
 * design. Returns null (left for the user to categorize) rather than
 * guessing for an unrecognized expense, since a wrong guess is worse than
 * an honest "uncategorized." Unrecognized income defaults to 'Income'
 * since that's usually a safe bet for money coming in.
 */
export function guessCategory(description: string, amountPence: number): Category | null {
  for (const rule of RULES) {
    if (rule.keywords.some((kw) => keywordMatches(description, kw))) return rule.category;
  }
  return amountPence > 0 ? 'Income' : null;
}

/**
 * Category for a description already seen before (e.g. a recurring direct
 * debit that reads identically each month), keyed by the same normalized
 * description used for dedupe hashing. Built once per import batch from
 * existing transactions and passed in, rather than hitting the DB per row.
 */
export type PriorCategoryLookup = Map<string, Category>;

export function buildPriorCategoryLookup(
  transactions: { description: string; category: Category | null; createdAt: string }[],
): PriorCategoryLookup {
  const lookup: PriorCategoryLookup = new Map();
  const sorted = [...transactions].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  for (const t of sorted) {
    if (t.category) lookup.set(normalizeDescription(t.description), t.category);
  }
  return lookup;
}

/**
 * Resolves a category for a new row: if a transaction with the same
 * (normalized) description has already been categorized — most recent
 * wins, so a manual correction propagates to future imports — reuse that;
 * otherwise fall back to the generic keyword guess.
 */
export function resolveCategory(
  description: string,
  amountPence: number,
  priorCategories: PriorCategoryLookup,
): Category | null {
  const known = priorCategories.get(normalizeDescription(description));
  if (known) return known;
  return guessCategory(description, amountPence);
}
