import { create } from 'zustand';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'expense-track.themePreference';

function loadInitial(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // ignore — storage may be blocked (private browsing, etc.)
  }
  return 'system';
}

/** Reflects the preference onto the DOM so `index.css`'s `:root[data-theme]` rules apply. */
function applyDomTheme(preference: ThemePreference) {
  if (typeof document === 'undefined') return;
  if (preference === 'system') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = preference;
  }
}

interface ThemeState {
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
}

const initialPreference = loadInitial();
applyDomTheme(initialPreference);

/**
 * Single source of truth for light/dark/system preference, so the CSS
 * (`data-theme` attribute) and the chart palette (useColorScheme, in
 * src/utils/palette.ts) always agree — see [[useColorScheme]].
 */
export const useThemeStore = create<ThemeState>((set) => ({
  themePreference: initialPreference,
  setThemePreference: (preference) => {
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // ignore — storage may be blocked (private browsing, etc.)
    }
    applyDomTheme(preference);
    set({ themePreference: preference });
  },
}));
