import type { ReactNode } from 'react';
import { cx } from '../../utils/cx';

export interface CardProps {
  title?: ReactNode;
  icon?: ReactNode;
  headerActions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Card({ title, icon, headerActions, children, className }: CardProps) {
  const heading = title && (
    <h3>
      {icon}
      {title}
    </h3>
  );

  return (
    <div className={cx('card', className)}>
      {headerActions ? (
        <div className="card-header-row">
          {heading}
          {headerActions}
        </div>
      ) : (
        heading
      )}
      {children}
    </div>
  );
}
