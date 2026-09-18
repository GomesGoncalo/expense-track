import { HashRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { AccountsPage } from './pages/AccountsPage';
import { ImportPage } from './pages/ImportPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { HouseholdPage } from './pages/HouseholdPage';

export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="household" element={<HouseholdPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
