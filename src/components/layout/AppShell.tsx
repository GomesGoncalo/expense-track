import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Landmark, Upload, ArrowLeftRight, Users, Wallet, Search, Plus, Tag } from 'lucide-react';
import { ErrorBoundary } from './ErrorBoundary';
import { PrimaryNav, type NavItem } from './PrimaryNav';
import { ThemeToggle } from './ThemeToggle';
import { CommandBar } from '../command/CommandBar';
import { QuickAddTransactionModal } from '../quickAdd/QuickAddTransactionModal';
import { Button } from '../ui/Button';

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/accounts', label: 'Accounts', icon: Landmark, end: false },
  { to: '/import', label: 'Import', icon: Upload, end: false },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight, end: false },
  { to: '/household', label: 'Household', icon: Users, end: false },
  { to: '/categories', label: 'Categories', icon: Tag, end: false },
];

function Brand() {
  return (
    <NavLink to="/" className="app-brand">
      <span className="brand-mark">
        <Wallet size={16} />
      </span>
      Expense Track
    </NavLink>
  );
}

export function AppShell() {
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar-top">
          <Brand />
          <PrimaryNav items={NAV_ITEMS} variant="sidebar" />
        </div>
        <div className="app-sidebar-bottom">
          <ThemeToggle />
        </div>
      </aside>

      <div className="app-shell-content">
        <header className="app-topbar">
          <Brand />
          <button type="button" className="search-trigger" onClick={() => setSearchOpen(true)}>
            <Search size={15} />
            <span className="search-trigger-label">Search…</span>
            <span className="search-trigger-hint">⌘K</span>
          </button>
          <Button
            /* quick-add entry point, both breakpoints */
            variant="primary"
            size="sm"
            icon={<Plus size={15} />}
            onClick={() => setQuickAddOpen(true)}
          >
            Add
          </Button>
        </header>
        <main className="app-main">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <PrimaryNav items={NAV_ITEMS} variant="bottom" />

      <CommandBar open={searchOpen} onClose={() => setSearchOpen(false)} />
      <QuickAddTransactionModal open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
    </div>
  );
}
