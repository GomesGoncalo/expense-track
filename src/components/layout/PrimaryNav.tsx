import { NavLink } from 'react-router-dom';
import type { ComponentType } from 'react';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  end: boolean;
}

export function PrimaryNav({
  items,
  variant,
  collapsed = false,
}: {
  items: readonly NavItem[];
  variant: 'sidebar' | 'bottom';
  collapsed?: boolean;
}) {
  const iconSize = variant === 'sidebar' ? 18 : 20;

  return (
    <nav className={variant === 'sidebar' ? 'sidebar-nav' : 'app-bottom-nav'}>
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} title={collapsed ? label : undefined}>
          <Icon size={iconSize} />
          {!(variant === 'sidebar' && collapsed) && label}
        </NavLink>
      ))}
    </nav>
  );
}
