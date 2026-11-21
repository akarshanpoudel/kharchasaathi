import React, { useState, useEffect } from 'react';
import { X, Users } from 'lucide-react';
import { authService, financeService, sapatiService } from '../services/api';
import { formatNPR } from '../utils/formatters';

export default function QuickAddModal({ isOpen, onClose, accounts, categories, onSaved }) {
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Sapati split states
  const [isSplitSapati, setIsSplitSapati] = useState(false);
  const [counterpartyName, setCounterpartyName] = useState('');
  const [sapatiDirection, setSapatiDirection] = useState('TO_RECEIVE'); // 'TO_RECEIVE' | 'TO_PAY'
  const [personalShare, setPersonalShare] = useState('');

  useEffect(() => {
    if (accounts.length > 0 && !accountId) {
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId]);

  useEffect(() => {
    if (categories.length > 0 && !categoryId) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  if (!isOpen) return null;

  const numericTotal = parseFloat(amount) || 0;
  const numericPersonal = isSplitSapati
    ? Math.min(Math.max(parseFloat(personalShare) || 0, 0), numericTotal)
    : numericTotal;
  const sapatiAmount = isSplitSapati ? Math.max(numericTotal - numericPersonal, 0) : 0;

  const resetForm = () => {
    setAmount('');
    setNote('');
    setIsSplitSapati(false);
    setCounterpartyName('');
    setSapatiDirection('TO_RECEIVE');
    setPersonalShare('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (numericTotal <= 0) return;

    if (isSplitSapati && !counterpartyName.trim()) {
      alert('Please enter who the Sapati is with.');
      return;
    }

    setSubmitting(true);
    try {
      const todayAD = new Date().toISOString().split('T')[0];
      const workspaceId = authService.getWorkspaceId();

      const txResult = await financeService.createTransaction({
        workspace: workspaceId,
        transaction_type: 'EXPENSE',
        source_account: Number(accountId),
        total_amount: numericTotal,
        personal_expense_amount: numericPersonal,
        category: categoryId ? Number(categoryId) : null,
        note: note.trim() || (isSplitSapati ? `Sapati with ${counterpartyName.trim()}` : ''),
        ad_date: todayAD,
      });

      let sapatiQueued = false;
      if (isSplitSapati && sapatiAmount > 0) {
        const sapatiResult = await sapatiService.create({
          workspace: workspaceId,
          person_name: counterpartyName.trim(),
          direction: sapatiDirection,
          amount: sapatiAmount,
          account: Number(accountId),
          note: note.trim(),
          ad_date: todayAD,
        });
        sapatiQueued = sapatiResult.queuedOffline;
      }

      resetForm();
      onSaved(txResult.queuedOffline || sapatiQueued);
      onClose();
    } catch (err) {
      alert(err.response?.data?.detail || err.response?.data?.error || 'Could not save transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-lg font-bold text-white">Quick Expense (छिटो खर्च)</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Total Paid Amount (कुल रकम)</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1200"
              autoFocus
              required
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-xl font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Paid From Account</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Sapati Toggle */}
          <button
            type="button"
            onClick={() => setIsSplitSapati(!isSplitSapati)}
            className={`flex items-center justify-between px-4 py-3 rounded-xl border text-xs font-semibold transition ${
              isSplitSapati
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <Users size={16} />
              Split as Sapati (सापटी बाँडफाँड)
            </span>
            <span>{isSplitSapati ? 'ON' : 'OFF'}</span>
          </button>

          {isSplitSapati && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSapatiDirection('TO_RECEIVE')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border ${
                    sapatiDirection === 'TO_RECEIVE'
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  They Owe Me (पाउनुपर्ने)
                </button>
                <button
                  type="button"
                  onClick={() => setSapatiDirection('TO_PAY')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border ${
                    sapatiDirection === 'TO_PAY'
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  I Owe Them (तिर्नुपर्ने)
                </button>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Person Name</label>
                <input
                  type="text"
                  value={counterpartyName}
                  onChange={(e) => setCounterpartyName(e.target.value)}
                  placeholder="e.g., Sujan, Bikash"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Your Personal Share (रु)</label>
                <input
                  type="number"
                  step="0.01"
                  value={personalShare}
                  onChange={(e) => setPersonalShare(e.target.value)}
                  placeholder="0"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-800 text-xs">
                <span className="text-slate-400">Sapati Recorded:</span>
                <span className="font-bold text-emerald-400">{formatNPR(sapatiAmount)}</span>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-slate-400 block mb-1">Note (Optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="MoMo lunch, Pathao, Tarkari..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold py-3 rounded-xl transition shadow-lg shadow-emerald-500/20"
          >
            {submitting ? 'Saving...' : isSplitSapati ? 'Save Expense & Sapati' : 'Save Expense'}
          </button>
        </form>
      </div>
    </div>
  );
}