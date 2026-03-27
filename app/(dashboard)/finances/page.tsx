/**
 * SunuFarm — Finances : dépenses (Server Component)
 *
 * Affiche les KPI financiers + la liste des dépenses de l'organisation.
 * Le formulaire de création est côté client (ExpenseForm).
 */

import { redirect }           from "next/navigation"
import type { Metadata }      from "next"
import { auth }               from "@/src/auth"
import { getExpenses }        from "@/src/actions/expenses"
import { getSales }           from "@/src/actions/sales"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ExpenseForm }        from "./_components/ExpenseForm"
import { ExpenseList }        from "./_components/ExpenseList"
import { ExpenseSummaryCards } from "./_components/ExpenseSummaryCards"

export const metadata: Metadata = { title: "Finances" }

export default async function FinancesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")

  const { organizationId } = activeMembership

  const [expensesResult, salesResult] = await Promise.all([
    getExpenses({ organizationId, limit: 50 }),
    getSales({ organizationId, limit: 100 }),
  ])

  const expenses = expensesResult.success ? expensesResult.data : []
  const sales    = salesResult.success    ? salesResult.data    : []

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amountFcfa, 0)
  const totalSales    = sales.reduce((sum, s) => sum + s.totalFcfa, 0)
  const netResult     = totalSales - totalExpenses

  return (
    <div className="mx-auto max-w-5xl space-y-6">

      {/* ── Titre ─────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Finances</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Suivi des dépenses de l&apos;organisation.
        </p>
      </div>

      {/* ── KPI cards ────────────────────────────────────────────────────── */}
      <ExpenseSummaryCards
        totalExpenses={totalExpenses}
        totalSales={totalSales}
        netResult={netResult}
      />

      {/* ── Formulaire + liste ───────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <ExpenseForm organizationId={organizationId} />
        </div>
        <div className="lg:col-span-2">
          <ExpenseList expenses={expenses} />
        </div>
      </div>
    </div>
  )
}
