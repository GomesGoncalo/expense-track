import { useEffect } from 'react';
import { AppRouter } from './router';
import { useAppStore } from './state/store';

function App() {
  const refresh = useAppStore((s) => s.refresh);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <AppRouter />;
}

export default App;
