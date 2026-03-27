import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card"
import { formatMoneyFCFA, formatDate }              from "@/src/lib/formatters"
import type { ExpenseSummary }                      from "@/src/actions/expenses"

interface ExpenseListProps {
  expenses: ExpenseSummary[]
}

export function ExpenseList({ expenses }: ExpenseListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Liste des dépenses</CardTitle>
      </CardHeader>

      <CardContent>
        {expenses.length === 0 ? (
          <p className="text-sm text-gray-400">
            Aucune dépense enregistrée pour le moment.
          </p>
        ) : (
          <div className="space-y-3">
            {expenses.map((expense) => (
              <div
                key={expense.id}
                className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 md:flex-row md:items-start md:justify-between"
              >
                <div className="space-y-1">
                  <p className="font-medium text-gray-900">{expense.description}</p>

                  <div className="flex flex-wrap gap-2 text-sm text-gray-500">
                    <span>{formatDate(expense.date)}</span>

                    {expense.category?.name ? (
                      <>
                        <span>·</span>
                        <span>{expense.category.name}</span>
                      </>
                    ) : null}

                    {expense.reference ? (
                      <>
                        <span>·</span>
                        <span>Réf. {expense.reference}</span>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="shrink-0 text-sm font-semibold text-gray-900 tabular-nums">
                  <div>{formatMoneyFCFA(expense.amountFcfa)}</div>
                  <Link
                    href={`/finances/${expense.id}`}
                    className="mt-2 inline-flex text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
