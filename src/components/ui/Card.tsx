import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '../../utils/cx';

export interface CardProps {
  title?: ReactNode;
  icon?: ReactNode;
  headerActions?: ReactNode;
  children?: ReactNode;
  className?: string;
  /**
   * Whether the card's body is hidden, with a chevron toggle added to the
   * header. Omit both this and onCollapsedChange for a plain, always-open
   * card (the common case) — collapse state is controlled by the caller
   * (e.g. persisted per-viewer) rather than owned internally, since a page
   * with many cards wants that state to survive a re-render/reload.
   */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function Card({ title, icon, headerActions, children, className, collapsed, onCollapsedChange }: CardProps) {
  const heading = title && (
    <h3>
      {icon}
      {title}
    </h3>
  );

  const toggle = onCollapsedChange && (
    <button
      type="button"
      className="card-collapse-toggle"
      onClick={() => onCollapsedChange(!collapsed)}
      aria-label={collapsed ? 'Expand card' : 'Collapse card'}
      title={collapsed ? 'Expand' : 'Collapse'}
    >
      <ChevronDown size={16} style={collapsed ? { transform: 'rotate(-90deg)' } : undefined} />
    </button>
  );

  return (
    <div className={cx('card', className)}>
      {headerActions || toggle ? (
        <div className="card-header-row">
          {heading}
          <div className="card-header-actions-group">
            {headerActions}
            {toggle}
          </div>
        </div>
      ) : (
        heading
      )}
      {!collapsed && children}
    </div>
  );
}
