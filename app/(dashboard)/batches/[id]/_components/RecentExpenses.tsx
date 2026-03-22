/**
 * SunuFarm — 5 dernières dépenses du lot
 *
 * Composant de présentation pur — données passées en props depuis la page.
 * Affiche : Date | Description | Catégorie | Montant
 * Total visible en pied de liste.
 */

import { formatDate, formatMoneyFCFA } from "@/src/lib/formatters"
import type { ExpenseSummary }          from "@/src/actions/expenses"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RecentExpensesProps {
  expenses: ExpenseSummary[]
  batchId:  string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecentExpenses({ expenses }: RecentExpensesProps) {
  const total = expenses.reduce((s, e) => s + e.amountFcfa, 0)

  return (
    <div className="space-y-3">

      {/* ── Titre ────────────────────────────────────────────────────── */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
        Dépenses récentes
      </h2>

      {/* ── État vide ─────────────────────────────────────────────────── */}
      {expenses.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-400">
          Aucune dépense enregistrée pour ce lot.
        </div>
      )}

      {/* ── Liste ─────────────────────────────────────────────────────── */}
      {expenses.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Date</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Description</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400">Montant</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense, i) => (
                  <tr
                    key={expense.id}
                    className={i < expenses.length - 1 ? "border-b border-gray-50" : ""}
                  >
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                      {formatDate(expense.date)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-800">
                      <div className="truncate max-w-[180px]">{expense.description}</div>
                      {expense.category && (
                        <div className="text-xs text-gray-400">{expense.category.name}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700 font-medium tabular-nums whitespace-nowrap">
                      {formatMoneyFCFA(expense.amountFcfa)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Total */}
              <tfoot>
                <tr className="border-t border-gray-100 bg-gray-50">
                  <td colSpan={2} className="px-4 py-2.5 text-xs font-medium text-gray-500">
                    Total ({expenses.length} dépense{expenses.length > 1 ? "s" : ""} affichée{expenses.length > 1 ? "s" : ""})
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-gray-900 tabular-nums whitespace-nowrap">
                    {formatMoneyFCFA(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
