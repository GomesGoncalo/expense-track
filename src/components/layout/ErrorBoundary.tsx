import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="empty-state">
          <div className="empty-state-icon">
            <AlertTriangle size={28} />
          </div>
          <p className="empty-state-title">Something went wrong</p>
          <p className="empty-state-description">
            This page hit an unexpected error. Your data is stored locally on this device and hasn't been touched —
            reloading should fix it.
          </p>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      );
    }

    return this.props.children;
  }
}
