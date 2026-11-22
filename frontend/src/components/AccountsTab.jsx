import React, { useState, useEffect } from 'react';
import { Wallet, ArrowLeftRight, Plus, Landmark, Banknote, Smartphone, PiggyBank } from 'lucide-react';
import { formatNPR } from '../utils/formatters';
import { authService, financeService } from '../services/api';

const ACCOUNT_TYPES = [
  { value: 'CASH', label: 'Cash in Hand' },
  { value: 'WALLET', label: 'Digital Wallet (eSewa / Khalti)' },
  { value: 'BANK', label: 'Bank Account' },
  { value: 'SAHAKARI', label: 'Sahakari / Cooperative' },
];

function formatApiError(err, fallback = 'Action failed.') {
  if (!err.response) return 'Network error — could not reach server.';
  const data = err.response.data;
  if (typeof data === 'string') return data;
  if (data?.detail) return data.detail;
  if (data?.error) return data.error;
  if (data && typeof data === 'object') {
    return Object.entries(data)
      .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
      .join(' | ');
  }
  return fallback;
}

function getAccountIcon(type) {
  switch (type) {
    case 'CASH':
      return <Banknote size={18} />;
    case 'WALLET':
      return <Smartphone size={18} />;
    case 'BANK':
      return <Landmark size={18} />;
    case 'SAHAKARI':
      return <PiggyBank size={18} />;
    default:
      return <Wallet size={18} />;
  }
}

export default function AccountsTab({ accounts, isBlurred, onRefresh }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showTransferForm, setShowTransferForm] = useState(true);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // New Account state
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState('WALLET');
  const [openingBalance, setOpeningBalance] = useState('');
  const [creatingAccount, setCreatingAccount] = useState(false);

  // Self-Transfer state
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [submittingTransfer, setSubmittingTransfer] = useState(false);

  useEffect(() => {
    if (accounts.length > 0) {
      if (!fromAccountId || !accounts.some((a) => String(a.id) === String(fromAccountId))) {
        setFromAccountId(String(accounts[0].id));
      }
      if (!toAccountId || !accounts.some((a) => String(a.id) === String(toAccountId))) {
        const second = accounts.length > 1 ? accounts[1] : accounts[0];
        setToAccountId(String(second.id));
      }
    }
  }, [accounts, fromAccountId, toAccountId]);

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');
    if (!name.trim()) {
      setErrorMsg('Please enter an account name.');
      return;
    }

    setCreatingAccount(true);
    try {
      await financeService.createAccount({
        name: name.trim(),
        account_type: accountType,
        balance: parseFloat(openingBalance) || 0,
      });
      setName('');
      setOpeningBalance('');
      setShowAddForm(false);
      setStatusMsg('Account added successfully.');
      await onRefresh();
    } catch (err) {
      setErrorMsg(formatApiError(err, 'Could not create account.'));
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');

    const numericAmount = parseFloat(transferAmount);
    if (!numericAmount || numericAmount <= 0) {
      setErrorMsg('Please enter a valid transfer amount.');
      return;
    }
    if (!fromAccountId || !toAccountId) {
      setErrorMsg('Select both source and destination accounts.');
      return;
    }
    if (String(fromAccountId) === String(toAccountId)) {
      setErrorMsg('Source and destination accounts must be different.');
      return;
    }

    setSubmittingTransfer(true);
    try {
      const todayAD = new Date().toISOString().split('T')[0];
      const result = await financeService.createTransaction({
        workspace: authService.getWorkspaceId(),
        transaction_type: 'TRANSFER',
        source_account: Number(fromAccountId),
        destination_account: Number(toAccountId),
        total_amount: numericAmount,
        personal_expense_amount: 0,
        note: transferNote.trim() || 'Self-transfer',
        ad_date: todayAD,
      });

      setTransferAmount('');
      setTransferNote('');
      setStatusMsg(
        result.queuedOffline
          ? 'Transfer queued offline — will sync once online.'
          : 'Transfer completed without affecting monthly expenses.'
      );
      await onRefresh();
    } catch (err) {
      setErrorMsg(formatApiError(err, 'Could not complete transfer.'));
    } finally {
      setSubmittingTransfer(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-base font-bold text-white">Wallets &amp; Accounts (खाताहरू)</h2>
          <p className="text-xs text-slate-400">Cash, eSewa/Khalti, Bank &amp; Sahakari</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowTransferForm(!showTransferForm)}
            className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-700 transition"
          >
            <ArrowLeftRight size={14} />
            Transfer
          </button>
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold px-3 py-2 rounded-xl transition"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs rounded-xl px-3.5 py-2.5">
          {errorMsg}
        </div>
      )}

      {statusMsg && (
        <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs rounded-xl px-3.5 py-2.5">
          {statusMsg}
        </div>
      )}

      {/* Account Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {accounts.map((acc) => (
          <div
            key={acc.id}
            className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                {getAccountIcon(acc.account_type)}
              </div>
              <div className="truncate">
                <p className="text-sm font-semibold text-white truncate">{acc.name}</p>
                <p className="text-[11px] uppercase tracking-wider text-slate-400">
                  {acc.account_type}
                </p>
              </div>
            </div>
            <p className="text-sm font-bold text-emerald-400 shrink-0">
              {formatNPR(acc.balance, isBlurred)}
            </p>
          </div>
        ))}
      </div>

      {/* Add Account Form */}
      {showAddForm && (
        <form
          onSubmit={handleCreateAccount}
          className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3"
        >
          <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
            New Account / Bucket
          </h3>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Khalti, Nabil Bank, Hamro Sahakari"
            required
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
          />

          <div className="grid grid-cols-2 gap-2">
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>

            <input
              type="number"
              step="0.01"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              placeholder="Opening balance (रु)"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
            />
          </div>

          <button
            type="submit"
            disabled={creatingAccount}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs transition"
          >
            {creatingAccount ? 'Creating...' : 'Save Account'}
          </button>
        </form>
      )}

      {/* Self-Transfer Form */}
      {showTransferForm && accounts.length >= 2 && (
        <form
          onSubmit={handleTransfer}
          className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3"
        >
          <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
            Self-Transfer (आफ्नै खातामा ट्रान्सफर)
          </h3>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">From</label>
              <select
                value={fromAccountId}
                onChange={(e) => setFromAccountId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">To</label>
              <select
                value={toAccountId}
                onChange={(e) => setToAccountId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              step="0.01"
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              placeholder="Amount (e.g., 5000)"
              required
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
            />
            <input
              type="text"
              value={transferNote}
              onChange={(e) => setTransferNote(e.target.value)}
              placeholder="eSewa load / ATM cash"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
            />
          </div>

          <button
            type="submit"
            disabled={submittingTransfer}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs transition"
          >
            {submittingTransfer ? 'Transferring...' : 'Move Funds'}
          </button>
        </form>
      )}
    </div>
  );
}