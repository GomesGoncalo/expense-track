import type { ReactNode } from 'react';
import { cx } from '../../utils/cx';

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T, index: number) => ReactNode;
  align?: 'left' | 'right';
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  rowClassName?: (row: T, index: number) => string | undefined;
  emptyState?: ReactNode;
  /**
   * When provided, renders an adaptive stacked card per row below the
   * mobile breakpoint (see `.record-card-list` in src/styles/components.css)
   * instead of leaving a data-dense table to horizontally scroll.
   */
  renderCard?: (row: T, index: number) => ReactNode;
  className?: string;
}

export function Table<T>({ columns, rows, rowKey, rowClassName, emptyState, renderCard, className }: TableProps<T>) {
  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <>
      <div className={cx('table-scroll', renderCard && 'responsive')}>
        <table className={cx('table', className)}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} style={col.align === 'right' ? { textAlign: 'right' } : undefined}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={rowKey(row, index)} className={rowClassName?.(row, index)}>
                {columns.map((col) => (
                  <td key={col.key} style={col.align === 'right' ? { textAlign: 'right' } : undefined}>
                    {col.render(row, index)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {renderCard && (
        <div className="record-card-list">
          {rows.map((row, index) => (
            <div key={rowKey(row, index)} className={cx('record-card', rowClassName?.(row, index))}>
              {renderCard(row, index)}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
