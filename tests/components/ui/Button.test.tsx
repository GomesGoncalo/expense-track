import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Button } from '../../../src/components/ui/Button';

describe('Button', () => {
  it('applies the primary variant class by default', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('btn', 'btn-primary');
  });

  it('applies ghost and danger variant classes', () => {
    render(<Button variant="ghost">Cancel</Button>);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('btn-ghost');

    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('btn-ghost', 'danger');
  });

  it('applies the small size class', () => {
    render(<Button size="sm">Edit</Button>);
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveClass('btn-sm');
  });

  it('disables and shows a spinner instead of the icon while loading', () => {
    render(
      <Button loading icon={<span data-testid="icon" />}>
        Submitting
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Submitting' });
    expect(button).toBeDisabled();
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
    expect(button.querySelector('.btn-spinner')).toBeTruthy();
  });

  it('still fires onClick when not loading', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
