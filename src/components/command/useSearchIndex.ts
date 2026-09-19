import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../state/store';
import { BANK_LABELS } from '../../parsers';
import { formatPence } from '../../utils/currency';

export type SearchResultType = 'transaction' | 'account' | 'person';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  label: string;
  sublabel: string;
  keywords: string;
  go: () => void;
}

const MAX_TRANSACTIONS = 8;
const MAX_ACCOUNTS = 5;
const MAX_PERSONS = 5;

/** Stable "nothing built yet" reference — see the `!open` early return below. */
const EMPTY_INDEX: SearchResult[] = [];

/**
 * Purely client-side search over the in-memory store — this app has no
 * backend to query. `open` gates the expensive sort/map over the whole
 * transaction history: CommandBar stays permanently mounted (AppShell) but
 * is usually closed, and the store's refresh() replaces every array
 * reference on every mutation anywhere in the app, so without this the
 * index would rebuild on every data change whether or not anyone's
 * actually searching.
 */
export function useSearchIndex(open: boolean): { search: (query: string) => SearchResult[] } {
  const transactions = useAppStore((s) => s.transactions);
  const accounts = useAppStore((s) => s.accounts);
  const persons = useAppStore((s) => s.persons);
  const navigate = useNavigate();

  const index = useMemo<SearchResult[]>(() => {
    if (!open) return EMPTY_INDEX;
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    const transactionResults: SearchResult[] = [...transactions]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((t) => {
        const account = accountById.get(t.accountId);
        return {
          type: 'transaction' as const,
          id: t.id,
          label: t.description,
          sublabel: `${formatPence(t.amountPence, t.currency)} · ${t.date}${account ? ` · ${account.name}` : ''}`,
          keywords: t.description,
          go: () => navigate(`/transactions?search=${encodeURIComponent(t.description)}`),
        };
      });

    const accountResults: SearchResult[] = accounts.map((a) => ({
      type: 'account' as const,
      id: a.id,
      label: a.name,
      sublabel: BANK_LABELS[a.bank],
      keywords: `${a.name} ${BANK_LABELS[a.bank]}`,
      go: () => navigate('/accounts'),
    }));

    const personResults: SearchResult[] = persons.map((p) => ({
      type: 'person' as const,
      id: p.id,
      label: p.name,
      sublabel: 'Household member',
      keywords: p.name,
      go: () => navigate('/household'),
    }));

    return [...transactionResults, ...accountResults, ...personResults];
  }, [open, transactions, accounts, persons, navigate]);

  const search = useCallback(
    (query: string): SearchResult[] => {
      const trimmed = query.trim().toLowerCase();
      if (!trimmed) return [];

      const matches = index.filter((entry) => entry.keywords.toLowerCase().includes(trimmed));
      const byType = (type: SearchResultType, max: number) => matches.filter((m) => m.type === type).slice(0, max);

      return [
        ...byType('transaction', MAX_TRANSACTIONS),
        ...byType('account', MAX_ACCOUNTS),
        ...byType('person', MAX_PERSONS),
      ];
    },
    [index],
  );

  return { search };
}
