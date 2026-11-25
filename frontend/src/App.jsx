import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Wallet,
  Home,
  Plus,
  Eye,
  EyeOff,
  LogOut,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
} from 'lucide-react';
import { db } from './db/offlineStore';
import {
  authService,
  workspaceService,
  financeService,
  sapatiService,
} from './services/api';
import { formatNPR } from './utils/formatters';
import QuickAddModal from './components/QuickAddModal';
import SapatiTab from './components/SapatiTab';
import AccountsTab from './components/AccountsTab';
import BsInsightsCard from './components/BsInsightsCard';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(localStorage.getItem('access_token')));
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'sapati' | 'accounts'
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);

  const [workspaceId, setWorkspaceId] = useState(() => authService.getWorkspaceId());
  const [workspaces, setWorkspaces] = useState([]);
  const [copiedInvite, setCopiedInvite] = useState(false);

  const [selectedBsYear, setSelectedBsYear] = useState(null);
  const [selectedBsMonth, setSelectedBsMonth] = useState(null);

  const [dashboard, setDashboard] = useState({
    total_balance: 0,
    monthly_personal_spend: 0,
    sapati_to_receive: 0,
    sapati_to_pay: 0,
  });
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [sapatiList, setSapatiList] = useState([]);

  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isFlushing, setIsFlushing] = useState(false);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await db.syncQueue.count();
      setPendingSyncCount(count);
    } catch (err) {
      console.error('Failed to read syncQueue count:', err);
    }
  }, []);

  const loadWorkspaces = useCallback(async () => {
    try {
      const list = await workspaceService.getAll();
      setWorkspaces(list);
      if (list.length > 0) {
        const currentId = authService.getWorkspaceId();
        const exists = list.some((ws) => Number(ws.id) === Number(currentId));
        if (!exists) {
          const fallbackId = list[0].id;
          workspaceService.setActive(fallbackId);
          setWorkspaceId(fallbackId);
        }
      }
    } catch (err) {
      console.error('Could not load workspaces:', err);
    }
  }, []);

  const fetchData = useCallback(
    async (targetWsId = workspaceId, bsYear = selectedBsYear, bsMonth = selectedBsMonth) => {
      if (!isAuthenticated) return;
      try {
        const [dashData, accData, catData, txData, sapatiData] = await Promise.all([
          financeService.getDashboard(targetWsId, bsYear, bsMonth),
          financeService.getAccounts(targetWsId),
          financeService.getCategories(),
          financeService.getTransactions(targetWsId, bsYear, bsMonth),
          sapatiService.getAll(targetWsId),
        ]);

        setDashboard(dashData);
        setAccounts(accData);
        setCategories(catData);
        setTransactions(txData);
        setSapatiList(sapatiData);

        if (bsYear === null && dashData?.bs_year) {
          setSelectedBsYear(dashData.bs_year);
        }
        if (bsMonth === null && dashData?.bs_month) {
          setSelectedBsMonth(dashData.bs_month);
        }
      } catch (err) {
        console.error('Error loading workspace data:', err);
      }
    },
    [isAuthenticated, workspaceId, selectedBsYear, selectedBsMonth]
  );

  const handleFlushQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    setIsFlushing(true);
    try {
      const synced = await financeService.flushOfflineQueue();
      await refreshPendingCount();
      if (synced > 0) {
        await fetchData(authService.getWorkspaceId(), selectedBsYear, selectedBsMonth);
      }
    } catch (err) {
      console.error('Failed to flush offline queue:', err);
    } finally {
      setIsFlushing(false);
    }
  }, [fetchData, refreshPendingCount, selectedBsYear, selectedBsMonth]);

  useEffect(() => {
    refreshPendingCount();

    const onOnline = () => {
      setIsOnline(true);
      handleFlushQueue();
    };
    const onOffline = () => {
      setIsOnline(false);
      refreshPendingCount();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [handleFlushQueue, refreshPendingCount]);

  useEffect(() => {
    if (isAuthenticated) {
      loadWorkspaces();
      fetchData(workspaceId, selectedBsYear, selectedBsMonth);
    }
  }, [isAuthenticated, workspaceId, selectedBsYear, selectedBsMonth, loadWorkspaces, fetchData]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      if (authMode === 'login') {
        await authService.login(username.trim(), password);
      } else {
        await authService.register(username.trim(), password, email.trim());
        await authService.login(username.trim(), password);
      }
      const wsId = authService.getWorkspaceId();
      setWorkspaceId(wsId);
      setIsAuthenticated(true);
    } catch (err) {
      const data = err.response?.data;
      setAuthError(data?.error || data?.detail || 'Authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    authService.logout();
    setIsAuthenticated(false);
    setWorkspaces([]);
    setAccounts([]);
    setTransactions([]);
    setSapatiList([]);
  };

  const handleWorkspaceChange = async (nextId) => {
    const numericId = Number(nextId);
    workspaceService.setActive(numericId);
    setWorkspaceId(numericId);
    setSelectedBsYear(null);
    setSelectedBsMonth(null);
    await fetchData(numericId, null, null);
  };

  const handleMonthChange = (nextYear, nextMonth) => {
    setSelectedBsYear(nextYear);
    setSelectedBsMonth(nextMonth);
  };

  const handleAfterSave = async () => {
    await refreshPendingCount();
    await fetchData(workspaceId, selectedBsYear, selectedBsMonth);
  };

  const activeWorkspace = workspaces.find((ws) => Number(ws.id) === Number(workspaceId));

  const handleCopyInvite = async () => {
    if (!activeWorkspace?.invite_code) return;
    try {
      await navigator.clipboard.writeText(activeWorkspace.invite_code);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2000);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
          <h1 className="text-xl font-bold text-emerald-400 mb-1">KharchaSaathi</h1>
          <p className="text-xs text-slate-400 mb-5">
            {authMode === 'login' ? 'Sign in to your Hisab' : 'Create your KharchaSaathi account'}
          </p>

          {authError && (
            <div className="mb-4 bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs rounded-xl px-3 py-2">
              {authError}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="flex flex-col gap-3">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              required
              className="bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
            />
            {authMode === 'register' && (
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email (optional)"
                className="bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
              />
            )}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min 8 chars)"
              required
              className="bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
            />
            <button
              type="submit"
              disabled={authLoading}
              className="mt-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 rounded-xl text-sm transition"
            >
              {authLoading ? 'Please wait...' : authMode === 'login' ? 'Login' : 'Register'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setAuthMode(authMode === 'login' ? 'register' : 'login');
              setAuthError('');
            }}
            className="mt-4 w-full text-center text-xs text-slate-400 hover:text-emerald-400"
          >
            {authMode === 'login'
              ? 'Need an account? Register here'
              : 'Already have an account? Login'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-5">
        {/* Top Header + Workspace Switcher */}
        <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-lg font-bold text-white">KharchaSaathi</h1>
            <p className="text-xs text-slate-400">नेपाली खर्च र सापटी साथी</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              aria-label="Active Workspace"
              value={workspaceId}
              onChange={(e) => handleWorkspaceChange(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-semibold text-white focus:outline-none focus:border-emerald-500"
            >
              {workspaces.length === 0 ? (
                <option value={workspaceId}>Workspace #{workspaceId}</option>
              ) : (
                workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name} {ws.workspace_type === 'SHARED' ? '(Shared)' : ''}
                  </option>
                ))
              )}
            </select>

            {activeWorkspace?.invite_code && (
              <button
                type="button"
                onClick={handleCopyInvite}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-[11px] font-medium text-emerald-400 transition"
                title="Copy workspace invite code"
              >
                {copiedInvite ? 'Copied!' : `Code: ${activeWorkspace.invite_code}`}
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsBlurred(!isBlurred)}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
              title={isBlurred ? 'Show amounts' : 'Hide amounts'}
            >
              {isBlurred ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* Offline / Pending Sync Banner */}
        {(!isOnline || pendingSyncCount > 0) && (
          <div
            className={`mb-4 px-3.5 py-2 rounded-xl border text-xs flex items-center justify-between gap-2 ${
              !isOnline
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  !isOnline ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'
                }`}
              />
              <span>
                {!isOnline
                  ? 'Offline mode — changes save locally'
                  : isFlushing
                    ? 'Syncing queued items...'
                    : 'Back online'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {pendingSyncCount > 0 && (
                <span className="bg-slate-950/80 border border-slate-700 px-2 py-0.5 rounded-full font-semibold">
                  Pending sync: {pendingSyncCount}
                </span>
              )}
              {isOnline && pendingSyncCount > 0 && !isFlushing && (
                <button
                  type="button"
                  onClick={handleFlushQueue}
                  className="underline font-semibold hover:text-white"
                >
                  Sync now
                </button>
              )}
            </div>
          </div>
        )}

        {/* Active Tab Content */}
        <main className="bg-slate-900/70 border border-slate-800 rounded-3xl p-4 sm:p-5 flex flex-col gap-5">
          {activeTab === 'dashboard' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
                  <p className="text-xs text-slate-400">Total Balance</p>
                  <p className="text-lg font-bold text-emerald-400 mt-1">
                    {formatNPR(dashboard.total_balance, isBlurred)}
                  </p>
                </div>
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
                  <p className="text-xs text-slate-400">Monthly Spend</p>
                  <p className="text-lg font-bold text-white mt-1">
                    {formatNPR(dashboard.monthly_personal_spend, isBlurred)}
                  </p>
                </div>
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
                  <p className="text-xs text-slate-400">Sapati to Receive</p>
                  <p className="text-sm font-bold text-emerald-400 mt-1">
                    {formatNPR(dashboard.sapati_to_receive, isBlurred)}
                  </p>
                </div>
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
                  <p className="text-xs text-slate-400">Sapati to Pay</p>
                  <p className="text-sm font-bold text-amber-400 mt-1">
                    {formatNPR(dashboard.sapati_to_pay, isBlurred)}
                  </p>
                </div>
              </div>

              <BsInsightsCard
                transactions={transactions}
                categories={categories}
                bsYear={selectedBsYear}
                bsMonth={selectedBsMonth}
                onChangeMonth={handleMonthChange}
                isBlurred={isBlurred}
              />

              <div className="flex flex-col gap-2.5">
                <h2 className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                  Recent Transactions
                </h2>
                {transactions.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">
                    No transactions recorded yet. Tap + to add one.
                  </p>
                ) : (
                  transactions.map((tx) => {
                    const isTransfer = tx.transaction_type === 'TRANSFER';
                    const isIncome = tx.transaction_type === 'INCOME';
                    return (
                      <div
                        key={tx.id}
                        className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 shrink-0">
                            {isTransfer ? (
                              <ArrowLeftRight size={16} />
                            ) : isIncome ? (
                              <ArrowDownLeft size={16} className="text-emerald-400" />
                            ) : (
                              <ArrowUpRight size={16} className="text-rose-400" />
                            )}
                          </div>
                          <div className="truncate">
                            <p className="text-sm font-semibold text-white truncate">
                              {tx.note || tx.category_name || tx.transaction_type}
                            </p>
                            <p className="text-[11px] text-slate-400 truncate">
                              {tx.source_account_name || ''}
                              {isTransfer && tx.destination_account_name
                                ? ` → ${tx.destination_account_name}`
                                : ''}{' '}
                              • {tx.ad_date}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-sm font-bold shrink-0 ${
                            isTransfer
                              ? 'text-slate-300'
                              : isIncome
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                          }`}
                        >
                          {formatNPR(tx.total_amount, isBlurred)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {activeTab === 'sapati' && (
            <SapatiTab
              sapatiList={sapatiList}
              accounts={accounts}
              isBlurred={isBlurred}
              onRefresh={handleAfterSave}
            />
          )}

          {activeTab === 'accounts' && (
            <AccountsTab
              accounts={accounts}
              isBlurred={isBlurred}
              onRefresh={handleAfterSave}
            />
          )}
        </main>
      </div>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 inset-x-0 bg-slate-950/95 border-t border-slate-800 backdrop-blur-md z-40">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center justify-around">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center gap-1 text-xs ${
              activeTab === 'dashboard' ? 'text-emerald-400 font-semibold' : 'text-slate-400'
            }`}
          >
            <Home size={18} />
            <span>Home</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sapati')}
            className={`flex flex-col items-center gap-1 text-xs ${
              activeTab === 'sapati' ? 'text-emerald-400 font-semibold' : 'text-slate-400'
            }`}
          >
            <Users size={18} />
            <span>Sapati</span>
          </button>

          <button
            type="button"
            onClick={() => setIsQuickAddOpen(true)}
            className="-mt-6 w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-lg shadow-emerald-500/30 transition"
            title="Quick Expense"
          >
            <Plus size={22} strokeWidth={2.5} />
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('accounts')}
            className={`flex flex-col items-center gap-1 text-xs ${
              activeTab === 'accounts' ? 'text-emerald-400 font-semibold' : 'text-slate-400'
            }`}
          >
            <Wallet size={18} />
            <span>Accounts</span>
          </button>
        </div>
      </nav>

      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        accounts={accounts}
        categories={categories}
        onSaved={handleAfterSave}
      />
    </div>
  );
}