import { useEffect, useState } from 'react';
import { useThemeStore } from '../state/themeStore';

/**
 * A CVD-safe, contrast-validated 8-color categorical palette (see the
 * dataviz skill's references/palette.md). Assign in fixed order — never
 * cycle or reassign based on filtering — and pick the light/dark step for
 * the current color scheme, since a single static hex can't have good
 * contrast on both a light and a dark surface.
 */
export const CATEGORICAL_LIGHT = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
];

export const CATEGORICAL_DARK = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
];

export function getCategoricalColor(index: number, isDark: boolean): string {
  const palette = isDark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
  return palette[index % palette.length];
}

/**
 * Stable color for a named category (transaction category, not a person) —
 * keyed by position in a fixed reference order rather than by rank in
 * whatever data happens to be on screen, so a category is always the same
 * color across renders/filters ("color follows the entity, never its
 * rank"). `referenceOrder` should be the full fixed category list (plus
 * synthetic buckets like 'Uncategorized'/'Other' appended) — callers own
 * building that list once, not per-render.
 */
export function getNamedCategoryColor(name: string, referenceOrder: readonly string[], isDark: boolean): string {
  const index = referenceOrder.indexOf(name);
  return getCategoricalColor(index === -1 ? 0 : index, isDark);
}

/**
 * Tracks the *effective* color scheme so chart colors can pick the right
 * palette step. Resolves the user's manual light/dark/system choice
 * (src/state/themeStore.ts) first, falling back to the OS preference only
 * when they've chosen 'system' — kept in sync with the CSS, which reads the
 * same store's `data-theme` attribute.
 */
export function useColorScheme(): 'light' | 'dark' {
  const preference = useThemeStore((s) => s.themePreference);
  const [systemScheme, setSystemScheme] = useState<'light' | 'dark'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemScheme(e.matches ? 'dark' : 'light');
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

  return preference === 'system' ? systemScheme : preference;
}
