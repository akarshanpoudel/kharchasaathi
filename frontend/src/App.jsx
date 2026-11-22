
import React, { useState, useEffect, useCallback } from 'react';
import { formatNPR } from './utils/formatters';
import { getBSDateParts } from './utils/bsDate';
import { financeService, authService } from './services/api';
import { db } from './db/offlineStore';

import QuickAddModal from './components/QuickAddModal';
import SapatiTab from './components/SapatiTab';
import AccountsTab from './components/AccountsTab';

import {
  Users,
  Wallet,
  PlusCircle,
  ArrowUpRight,
  ArrowDownLeft,
  LogOut,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';


export default function App() {
  const [isBlurred, setIsBlurred] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  const [dashboardData, setDashboardData] = useState({
    total_balance: 0,
    monthly_personal_spend: 0,
    sapati_to_receive: 0,
    sapati_to_pay: 0,
  });
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);

  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('access_token'));
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const todayBS = getBSDateParts();

  const loadCachedFallback = async () => {
    const [cachedTxs, cachedAccounts, cachedCategories] = await Promise.all([
      db.transactions.toArray(),
      db.accounts.toArray(),
      db.categories.toArray(),
    ]);
    if (cachedTxs.length) setTransactions(cachedTxs);
    if (cachedAccounts.length) setAccounts(cachedAccounts);
    if (cachedCategories.length) setCategories(cachedCategories);
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      await financeService.flushOfflineQueue();

      const wsId = authService.getWorkspaceId();
      const [dash, txs, accs, cats] = await Promise.all([
        financeService.getDashboard(wsId),
        financeService.getTransactions(wsId),
        financeService.getAccounts(wsId),
        financeService.getCategories(),
      ]);

      setDashboardData(dash);
      setTransactions(txs);
      setAccounts(accs);
      setCategories(cats);
    } catch (err) {
      console.error('Failed to sync with backend:', err);
      await loadCachedFallback();
      setError('Showing offline/cached data. Check backend connection or login.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [isLoggedIn, fetchData]);

  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      if (isRegistering) {
        await authService.register(username, password, `${username}@kharchasaathi.local`);
      }
      await authService.login(username, password);
      setIsLoggedIn(true);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        'Authentication failed. Check credentials or backend server.';
      alert(msg);
    }
  };

  const handleLogout = () => {
    authService.logout();
    setIsLoggedIn(false);
  };

  const handleTransactionSaved = async (queuedOffline) => {
    if (queuedOffline) {
      alert('Saved offline! Will sync automatically when back online.');
      await loadCachedFallback();
    } else {
      await fetchData();
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl">
          <h2 className="text-2xl font-bold text-emerald-400 mb-1">खर्चसाथी (KharchaSaathi)</h2>
          <p className="text-xs text-slate-400 mb-6">Log in to your household ledger • {todayBS.formatted} BS</p>

          <form onSubmit={handleAuth} className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                placeholder="Enter username"
                required
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                placeholder="••••••••"
                required
              />
            </div>
            <button
              type="submit"
              className="mt-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 rounded-xl transition shadow-lg shadow-emerald-500/20"
            >
              {isRegistering ? 'Create Account & Workspace' : 'Sign In'}
            </button>
            <button
              type="button"
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-xs text-slate-400 hover:text-emerald-400 text-center mt-1"
            >
              {isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Create one"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center pb-24">
      <div className="w-full max-w-md bg-slate-900 min-h-screen shadow-2xl flex flex-col border-x border-slate-800">
        <header className="px-6 py-4 flex justify-between items-center border-b border-slate-800 bg-slate-900/80 sticky top-0 z-10 backdrop-blur">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-emerald-400 flex items-center gap-2">
              <span>खर्चसाथी</span>
              <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-normal">
                {todayBS.formatted}
              </span>
            </h1>
            <p className="text-xs text-slate-400">Ghar ko hisab, sajilai</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition"
              title="Sync Data"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin text-emerald-400' : ''} />
            </button>
            <button
              onClick={() => setIsBlurred(!isBlurred)}
              className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition"
            >
              {isBlurred ? '🙈' : '👁️'}
            </button>
          </div>
        </header>

        {error && (
          <div className="mx-5 mt-4 bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl flex items-center gap-3 text-amber-300 text-xs">
            <AlertCircle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <main className="p-5 flex-1 flex flex-col gap-5">
          <div className="bg-gradient-to-br from-emerald-950/60 to-slate-900 p-5 rounded-2xl border border-emerald-500/30 shadow-lg relative overflow-hidden">
            <div className="absolute -right-4 -bottom-4 opacity-10">
              <Wallet size={120} className="text-emerald-400" />
            </div>
            <p className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
              Total Net Balance (सकल मौज्दात)
            </p>
            <h2 className="text-3xl font-extrabold mt-1 text-white tracking-tight">
              {formatNPR(dashboardData.total_balance, isBlurred)}
            </h2>

            <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-slate-400 block">Monthly Spend (यस महिना)</span>
                <span className="text-sm font-bold text-rose-400">
                  {formatNPR(dashboardData.monthly_personal_spend, isBlurred)}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">BS Period</span>
                <span className="text-sm font-bold text-sky-400">
                  {dashboardData.bs_year || todayBS.bs_year} / {dashboardData.bs_month || todayBS.bs_month}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-xs text-slate-400">To Receive (पाउनुपर्ने)</span>
                <ArrowDownLeft size={16} className="text-emerald-400" />
              </div>
              <span className="text-lg font-bold text-emerald-400 mt-2">
                {formatNPR(dashboardData.sapati_to_receive, isBlurred)}
              </span>
            </div>

            <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-xs text-slate-400">To Pay (तिर्नुपर्ने)</span>
                <ArrowUpRight size={16} className="text-amber-400" />
              </div>
              <span className="text-lg font-bold text-amber-400 mt-2">
                {formatNPR(dashboardData.sapati_to_pay, isBlurred)}
              </span>
            </div>
          </div>

          <div className="flex justify-between items-center mt-2">
            <h3 className="text-sm font-semibold text-slate-300">Recent Transactions (हालैका कारोबार)</h3>
          </div>

          <div className="flex flex-col gap-2.5">
            {transactions.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">
                No transactions recorded yet. Tap &apos;+&apos; to add one!
              </p>
            ) : (
              transactions.map((tx, idx) => (
                <div
                  key={tx.id || idx}
                  className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800 flex justify-between items-center"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-bold">
                      {tx.transaction_type === 'EXPENSE' ? '💸' : '💰'}
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-slate-200">
                        {tx.note || tx.category_name || 'Transaction'}
                      </h4>
                      <span className="text-xs text-slate-400">
                        {tx.source_account_name || 'Account'} • {tx.ad_date}
                        {tx.synced === false ? ' • Pending Sync' : ''}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-bold ${
                      tx.transaction_type === 'EXPENSE' ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {tx.transaction_type === 'EXPENSE' ? '-' : '+'} {formatNPR(tx.total_amount, isBlurred)}
                  </span>
                </div>
              ))
            )}
          </div>
        </main>

        <nav className="fixed bottom-0 w-full max-w-md bg-slate-950/95 border-t border-slate-800 py-3 px-6 flex justify-around items-center backdrop-blur z-20">
          <div className="flex flex-col items-center gap-1 text-xs text-emerald-400">
            <Wallet size={20} />
            <span>Dashboard</span>
          </div>

          <button
            onClick={() => setIsQuickAddOpen(true)}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 p-3 rounded-full shadow-lg shadow-emerald-500/20 transform hover:scale-105 transition -mt-6"
            title="Add Expense"
          >
            <PlusCircle size={28} />
          </button>

          <button
            onClick={handleLogout}
            className="flex flex-col items-center gap-1 text-xs text-slate-400 hover:text-rose-400"
          >
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </nav>
      </div>

      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        accounts={accounts}
        categories={categories}
        onSaved={handleTransactionSaved}
      />
    </div>
  );
}