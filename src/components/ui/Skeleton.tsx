import { cx } from '../../utils/cx';

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  variant?: 'text' | 'block' | 'circle';
  className?: string;
}

export function Skeleton({ width = '100%', height, variant = 'text', className }: SkeletonProps) {
  return (
    <span
      className={cx('skeleton', variant === 'circle' && 'skeleton-circle', className)}
      style={{
        width,
        height: height ?? (variant === 'text' ? '0.9em' : '100%'),
        display: variant === 'text' ? 'inline-block' : 'block',
      }}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card">
      <Skeleton width="35%" height={16} />
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} height={14} width={i === lines - 1 ? '60%' : '100%'} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonStatTile() {
  return (
    <div className="stat-tile">
      <Skeleton width="50%" height={11} />
      <div style={{ marginTop: 8 }}>
        <Skeleton width="70%" height={22} />
      </div>
    </div>
  );
}

export function SkeletonTableRows({ columns, rows = 4 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c}>
              <Skeleton height={14} width={c === 0 ? '80%' : '60%'} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
