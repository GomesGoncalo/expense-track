import { useEffect, useState } from 'react';

/**
 * Like useState, but persisted to localStorage — for per-viewer UI
 * preferences (e.g. which categories are hidden from a chart), not domain
 * data. Wrapped in try/catch since storage can throw or be unavailable
 * (private browsing, blocked storage) — falls back to in-memory only.
 */
export function usePersistedState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // ignore — storage may be blocked (private browsing, etc.)
    }
  }, [key, state]);

  return [state, setState];
}
