import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Table, type TableColumn } from '../../../src/components/ui/Table';

interface Row {
  id: string;
  name: string;
  amount: number;
}

const rows: Row[] = [
  { id: '1', name: 'Tesco', amount: -1234 },
  { id: '2', name: 'Salary', amount: 250000 },
];

const columns: TableColumn<Row>[] = [
  { key: 'name', header: 'Name', render: (r) => r.name },
  { key: 'amount', header: 'Amount', render: (r) => r.amount, align: 'right' },
];

describe('Table', () => {
  it('renders a desktop table with headers and rows', () => {
    render(<Table columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Tesco' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Salary' })).toBeInTheDocument();
  });

  it('renders the empty state instead of an empty table when there are no rows', () => {
    render(<Table columns={columns} rows={[]} rowKey={(r) => r.id} emptyState={<p>Nothing here</p>} />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders both the table and a mobile card list when renderCard is provided, marking the table responsive', () => {
    const { container } = render(
      <Table columns={columns} rows={rows} rowKey={(r) => r.id} renderCard={(r) => <span>{r.name} card</span>} />,
    );
    expect(container.querySelector('.table-scroll.responsive')).toBeTruthy();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Tesco card')).toBeInTheDocument();
    expect(screen.getByText('Salary card')).toBeInTheDocument();
  });

  it('does not mark the table responsive when renderCard is omitted', () => {
    const { container } = render(<Table columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(container.querySelector('.table-scroll.responsive')).toBeFalsy();
    expect(container.querySelector('.record-card-list')).toBeFalsy();
  });
});
