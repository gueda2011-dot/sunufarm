/**
 * SunuFarm - Depenses : depenses hors achats fournisseur (Server Component)
 */

import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { auth } from "@/src/auth"
import { getExpenses } from "@/src/actions/expenses"
import { getSales } from "@/src/actions/sales"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import { ExpenseForm } from "./_components/ExpenseForm"
import { ExpenseList } from "./_components/ExpenseList"
import { ExpenseSummaryCards } from "./_components/ExpenseSummaryCards"

export const metadata: Metadata = { title: "Depenses" }

export default async function FinancesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")
  ensureModuleAccess(activeMembership, "FINANCES")

  const { organizationId } = activeMembership

  const [expensesResult, salesResult] = await Promise.all([
    getExpenses({ organizationId, limit: 50 }),
    getSales({ organizationId, limit: 100 }),
  ])

  const expenses = expensesResult.success ? expensesResult.data : []
  const sales = salesResult.success ? salesResult.data : []

  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amountFcfa, 0)
  const totalSales = sales.reduce((sum, sale) => sum + sale.totalFcfa, 0)
  const netResult = totalSales - totalExpenses

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Depenses</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Enregistrez ici les sorties d&apos;argent hors achats fournisseur.
        </p>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Les achats fournisseur se gerent dans <strong>Achats fournisseur</strong>. Cette page
        sert aux autres depenses: transport, salaires, energie, maintenance ou charges diverses.
      </div>

      <ExpenseSummaryCards
        totalExpenses={totalExpenses}
        totalSales={totalSales}
        netResult={netResult}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <ExpenseForm organizationId={organizationId} />
        </div>
        <div className="lg:col-span-2">
          <ExpenseList organizationId={organizationId} expenses={expenses} />
        </div>
      </div>
    </div>
  )
}
