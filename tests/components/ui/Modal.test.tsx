import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Modal } from '../../../src/components/ui/Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Edit account">
        Body
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the title and children when open', () => {
    render(
      <Modal open onClose={vi.fn()} title="Edit account">
        <p>Body content</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Edit account' })).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Edit account">
        Body
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop is clicked, but not when the dialog box is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Edit account">
        <p>Body content</p>
      </Modal>,
    );
    fireEvent.mouseDown(screen.getByText('Body content'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders footer content', () => {
    render(
      <Modal open onClose={vi.fn()} title="Confirm" footer={<button>OK</button>}>
        Body
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
  });
});
