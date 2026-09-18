import { act, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToastProvider, useToast } from '../../../src/components/ui/Toast';

function Trigger({ message, duration }: { message: string; duration?: number }) {
  const { show } = useToast();
  useEffect(() => {
    show({ message, duration });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function MultiTrigger({ messages }: { messages: string[] }) {
  const { show } = useToast();
  useEffect(() => {
    for (const message of messages) show({ message });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

describe('ToastProvider / useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a toast message', () => {
    render(
      <ToastProvider>
        <Trigger message="Account saved" />
      </ToastProvider>,
    );
    expect(screen.getByText('Account saved')).toBeInTheDocument();
  });

  it('applies a tone class for success/error toasts', () => {
    const { container } = render(
      <ToastProvider>
        <Trigger message="Failed to delete account" duration={1000} />
      </ToastProvider>,
    );
    expect(container.querySelector('.toast')).toBeTruthy();
  });

  it('auto-dismisses after the given duration', () => {
    render(
      <ToastProvider>
        <Trigger message="Transaction added" duration={1000} />
      </ToastProvider>,
    );
    expect(screen.getByText('Transaction added')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByText('Transaction added')).not.toBeInTheDocument();
  });

  it('caps the number of visible toasts, dropping the oldest first', () => {
    render(
      <ToastProvider>
        <MultiTrigger messages={['First', 'Second', 'Third', 'Fourth']} />
      </ToastProvider>,
    );
    expect(screen.queryByText('First')).not.toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getByText('Third')).toBeInTheDocument();
    expect(screen.getByText('Fourth')).toBeInTheDocument();
  });

  it('throws when useToast is used outside a ToastProvider', () => {
    function Bare() {
      useToast();
      return null;
    }
    expect(() => render(<Bare />)).toThrow('useToast must be used within a ToastProvider');
  });
});
