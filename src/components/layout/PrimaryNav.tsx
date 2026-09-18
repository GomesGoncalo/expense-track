import { NavLink } from 'react-router-dom';
import type { ComponentType } from 'react';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  end: boolean;
}

export function PrimaryNav({ items, variant }: { items: readonly NavItem[]; variant: 'sidebar' | 'bottom' }) {
  const iconSize = variant === 'sidebar' ? 18 : 20;

  return (
    <nav className={variant === 'sidebar' ? 'sidebar-nav' : 'app-bottom-nav'}>
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end}>
          <Icon size={iconSize} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
