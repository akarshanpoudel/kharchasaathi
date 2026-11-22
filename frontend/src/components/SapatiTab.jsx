import React, { useState, useEffect } from 'react';
import { CheckCircle2, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { formatNPR } from '../utils/formatters';
import { authService, sapatiService } from '../services/api';

export default function SapatiTab({ sapatiList = [], accounts = [], isBlurred = false, onRefresh }) {
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [settlingId, setSettlingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(String(accounts[0].id));
    }
  }, [accounts, selectedAccountId]);

  const activeItems = sapatiList.filter((item) => !item.is_settled);
  const settledItems = sapatiList.filter((item) => item.is_settled);

  const handleSettle = async (item) => {
    setErrorMsg('');
    setStatusMsg('');

    const targetAccountId = selectedAccountId || accounts[0]?.id;
    if (!targetAccountId) {
      setErrorMsg('Please select an account to settle into or from.');
      return;
    }

    setSettlingId(item.id);
    try {
      await sapatiService.settle(item.id, Number(targetAccountId), authService.getWorkspaceId());
      setStatusMsg(`Settled Sapati with ${item.contact_name || 'contact'}.`);
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err) {
      const data = err.response?.data;
      setErrorMsg(
        data?.detail ||
          data?.error ||
          (data && typeof data === 'object' ? JSON.stringify(data) : 'Could not settle Sapati.')
      );
    } finally {
      setSettlingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-base font-bold text-white">Sapati Ledger (सापटी हिसाब)</h2>
          <p className="text-xs text-slate-400">
            Split expenses in Quick Add, then settle here
          </p>
        </div>

        {accounts.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor="sapati-settle-account" className="text-xs text-slate-400">
              Settle Wallet:
            </label>
            <select
              id="sapati-settle-account"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>
        )}
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

      {/* Pending Sapati Splits */}
      <div className="flex flex-col gap-2.5">
        <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
          Pending ({activeItems.length})
        </h3>

        {activeItems.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-6 bg-slate-950/50 rounded-2xl border border-slate-800/70">
            No pending Sapati splits right now.
          </p>
        ) : (
          activeItems.map((item) => {
            const isReceivable = item.direction === 'RECEIVABLE';
            const displayName = item.contact_name || `Contact #${item.contact}`;
            return (
              <div
                key={item.id}
                className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      isReceivable
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-amber-500/15 text-amber-400'
                    }`}
                  >
                    {isReceivable ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                  </div>
                  <div className="truncate">
                    <p className="text-sm font-semibold text-white truncate">{displayName}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {isReceivable ? 'To Receive (पाउनुपर्ने)' : 'To Pay (तिर्नुपर्ने)'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <span
                    className={`text-sm font-bold ${
                      isReceivable ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {formatNPR(item.amount, isBlurred)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSettle(item)}
                    disabled={settlingId === item.id}
                    className="flex items-center gap-1 bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-emerald-400 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-700 transition"
                    title="Mark Settled"
                  >
                    <CheckCircle2 size={14} />
                    {settlingId === item.id ? 'Settling...' : 'Settle'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Settled Sapati Splits */}
      {settledItems.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
            Settled ({settledItems.length})
          </h3>
          {settledItems.map((item) => (
            <div
              key={item.id}
              className="bg-slate-950/30 border border-slate-800/60 rounded-xl px-4 py-2.5 flex justify-between items-center text-xs text-slate-400"
            >
              <span>{item.contact_name || `Contact #${item.contact}`}</span>
              <span className="line-through">{formatNPR(item.amount, isBlurred)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}