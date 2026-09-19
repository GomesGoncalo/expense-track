import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { ArrowLeftRight, Landmark, Users } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useSearchIndex, type SearchResult, type SearchResultType } from './useSearchIndex';
import { cx } from '../../utils/cx';

const GROUP_LABEL: Record<SearchResultType, string> = {
  transaction: 'Transactions',
  account: 'Accounts',
  person: 'People',
};

const GROUP_ICON: Record<SearchResultType, typeof ArrowLeftRight> = {
  transaction: ArrowLeftRight,
  account: Landmark,
  person: Users,
};

export function CommandBar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { search } = useSearchIndex(open);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  const results = useMemo(() => search(query), [search, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function choose(result: SearchResult) {
    result.go();
    onClose();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[activeIndex]);
    }
  }

  const grouped = new Map<SearchResultType, SearchResult[]>();
  for (const result of results) {
    const bucket = grouped.get(result.type);
    if (bucket) bucket.push(result);
    else grouped.set(result.type, [result]);
  }

  let runningIndex = -1;

  return (
    <Modal open={open} onClose={onClose} title="Search" size="md">
      <input
        autoFocus
        className="command-bar-input"
        placeholder="Search transactions, accounts, people..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {query.trim() && (
        <div className="command-bar-results">
          {results.length === 0 && <p className="muted">No matches for &quot;{query}&quot;.</p>}
          {[...grouped.entries()].map(([type, entries]) => {
            const Icon = GROUP_ICON[type];
            return (
              <div key={type}>
                <p className="command-bar-group-label">{GROUP_LABEL[type]}</p>
                {entries.map((result) => {
                  runningIndex += 1;
                  const isActive = runningIndex === activeIndex;
                  return (
                    <button
                      key={`${result.type}-${result.id}`}
                      type="button"
                      className={cx('command-bar-item', isActive && 'active')}
                      onMouseEnter={() => setActiveIndex(runningIndex)}
                      onClick={() => choose(result)}
                    >
                      <Icon size={16} className="command-bar-item-icon" />
                      <span className="command-bar-item-text">
                        <span className="command-bar-item-label">{result.label}</span>
                        <span className="command-bar-item-sublabel">{result.sublabel}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
