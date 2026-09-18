import { Monitor, Moon, Sun } from 'lucide-react';
import { useThemeStore, type ThemePreference } from '../../state/themeStore';
import { Button } from '../ui/Button';

const NEXT: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

const ICON: Record<ThemePreference, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

const LABEL: Record<ThemePreference, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
};

export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const preference = useThemeStore((s) => s.themePreference);
  const setPreference = useThemeStore((s) => s.setThemePreference);
  const Icon = ICON[preference];

  return (
    <Button
      variant="ghost"
      size="sm"
      icon={<Icon size={16} />}
      onClick={() => setPreference(NEXT[preference])}
      aria-label={`Theme: ${LABEL[preference]}. Click to switch.`}
      title={`Theme: ${LABEL[preference]}. Click to switch.`}
    >
      {!collapsed && LABEL[preference]}
    </Button>
  );
}
