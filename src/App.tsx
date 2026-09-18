import { useEffect } from 'react';
import { AppRouter } from './router';
import { useAppStore } from './state/store';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { ToastProvider } from './components/ui/Toast';

function App() {
  const refresh = useAppStore((s) => s.refresh);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <AppRouter />
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
