import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from '../../../src/components/ui/Card';

describe('Card', () => {
  it('renders a title directly under .card when there are no header actions', () => {
    const { container } = render(<Card title="Net worth">Body</Card>);
    const card = container.querySelector('.card');
    expect(card?.querySelector(':scope > h3')?.textContent).toBe('Net worth');
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('wraps the title and header actions in .card-header-row when actions are given', () => {
    const { container } = render(
      <Card title="Accounts" headerActions={<button>Add</button>}>
        Body
      </Card>,
    );
    const row = container.querySelector('.card-header-row');
    expect(row?.querySelector('h3')?.textContent).toBe('Accounts');
    expect(row?.querySelector('button')?.textContent).toBe('Add');
  });
});
