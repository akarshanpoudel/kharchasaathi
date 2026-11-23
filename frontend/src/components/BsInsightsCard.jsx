import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, PieChart } from 'lucide-react';
import { formatNPR } from '../utils/formatters';

const BS_MONTHS = [
  'Baisakh (वैशाख)',
  'Jestha (जेठ)',
  'Ashadh (असार)',
  'Shrawan (साउन)',
  'Bhadra (भदौ)',
  'Ashwin (असोज)',
  'Kartik (कात्तिक)',
  'Mangsir (मंसिर)',
  'Poush (पुस)',
  'Magh (माघ)',
  'Falgun (फागुन)',
  'Chaitra (चैत)',
];

export default function BsInsightsCard({
  transactions = [],
  categories = [],
  bsYear,
  bsMonth,
  onChangeMonth,
  isBlurred = false,
}) {
  const [budgets, setBudgets] = useState({});
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [budgetInput, setBudgetInput] = useState('');

  const handlePrevMonth = () => {
    if (!bsMonth || !bsYear) return;
    if (bsMonth === 1) {
      onChangeMonth(bsYear - 1, 12);
    } else {
      onChangeMonth(bsYear, bsMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (!bsMonth || !bsYear) return;
    if (bsMonth === 12) {
      onChangeMonth(bsYear + 1, 1);
    } else {
      onChangeMonth(bsYear, bsMonth + 1);
    }
  };

  const categoryBreakdown = useMemo(() => {
    const totalsByCat = {};
    let totalSpent = 0;

    for (const tx of transactions) {
      if (tx.transaction_type !== 'EXPENSE') continue;
      const amt = parseFloat(tx.personal_expense_amount ?? tx.total_amount) || 0;
      if (amt <= 0) continue;
      const catId = tx.category ?? 'uncategorized';
      totalsByCat[catId] = (totalsByCat[catId] || 0) + amt;
      totalSpent += amt;
    }

    const catNameMap = {};
    for (const c of categories) {
      catNameMap[c.id] = c.name;
    }

    return Object.entries(totalsByCat)
      .map(([catId, spent]) => ({
        id: catId,
        name: catNameMap[catId] || 'Uncategorized',
        spent,
        sharePct: totalSpent > 0 ? Math.min((spent / totalSpent) * 100, 100) : 0,
        cap: budgets[catId] || 0,
      }))
      .sort((a, b) => b.spent - a.spent);
  }, [transactions, categories, budgets]);

  const saveBudgetCap = (catId) => {
    const numericCap = parseFloat(budgetInput);
    setBudgets((prev) => ({
      ...prev,
      [catId]: numericCap > 0 ? numericCap : 0,
    }));
    setEditingCategoryId(null);
    setBudgetInput('');
  };

  const monthLabel = bsMonth ? BS_MONTHS[bsMonth - 1] || `Month ${bsMonth}` : 'Current Month';

  return (
    <div className="bg-slate-950/75 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4">
      {/* BS Month Switcher */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PieChart size={16} className="text-emerald-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            BS Monthly Insights
          </span>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-2 py-1">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1 text-slate-400 hover:text-white rounded-lg"
            title="Previous BS Month"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="text-xs font-semibold text-white px-1.5 whitespace-nowrap">
            {monthLabel} {bsYear ? `${bsYear}` : ''}
          </span>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1 text-slate-400 hover:text-white rounded-lg"
            title="Next BS Month"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Category Breakdown & Optional Monthly Caps */}
      {categoryBreakdown.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-4">
          No personal expenses recorded in this BS month yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {categoryBreakdown.map((item) => {
            const hasCap = item.cap > 0;
            const barPct = hasCap
              ? Math.min((item.spent / item.cap) * 100, 100)
              : item.sharePct;
            const isOverCap = hasCap && item.spent > item.cap;

            return (
              <div key={item.id} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-200">{item.name}</span>
                  <div className="flex items-center gap-2">
                    <span className={isOverCap ? 'text-rose-400 font-bold' : 'text-slate-300 font-semibold'}>
                      {formatNPR(item.spent, isBlurred)}
                      {hasCap ? ` / ${formatNPR(item.cap, isBlurred)}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCategoryId(item.id);
                        setBudgetInput(item.cap ? String(item.cap) : '');
                      }}
                      className="text-[11px] text-emerald-400 hover:underline"
                    >
                      {hasCap ? 'Cap' : '+ Cap'}
                    </button>
                  </div>
                </div>

                {editingCategoryId === item.id && (
                  <div className="flex items-center gap-2 py-1">
                    <input
                      type="number"
                      step="1"
                      value={budgetInput}
                      onChange={(e) => setBudgetInput(e.target.value)}
                      placeholder="Monthly cap (रु)"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => saveBudgetCap(item.id)}
                      className="bg-emerald-500 text-slate-950 font-bold text-xs px-3 py-1 rounded-lg"
                    >
                      Set
                    </button>
                  </div>
                )}

                <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isOverCap ? 'bg-rose-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}