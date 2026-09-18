import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfirmDialog } from '../../../src/components/ui/ConfirmDialog';

describe('ConfirmDialog', () => {
  it('calls onCancel when the cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open title="Delete account?" onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm when the confirm button is clicked', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <ConfirmDialog open title="Delete account?" confirmLabel="Delete" onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not invoke onConfirm a second time while the first call is still pending', async () => {
    let resolve: () => void = () => {};
    const pending = new Promise<void>((r) => {
      resolve = r;
    });
    const onConfirm = vi.fn().mockReturnValue(pending);
    render(
      <ConfirmDialog open title="Delete account?" confirmLabel="Delete" onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    const button = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    resolve();
  });

  it('renders a description when provided', () => {
    render(
      <ConfirmDialog
        open
        title="Delete account?"
        description="This cannot be undone."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });
});
