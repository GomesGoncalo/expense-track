import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../../utils/cx';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: ReactNode;
  loading?: boolean;
}

const VARIANT_CLASS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'btn-primary',
  ghost: 'btn-ghost',
  danger: 'btn-ghost danger',
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx('btn', VARIANT_CLASS[variant], size === 'sm' && 'btn-sm', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="btn-spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}
