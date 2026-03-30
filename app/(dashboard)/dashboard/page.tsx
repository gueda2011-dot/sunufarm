/**
 * SunuFarm - Tableau de bord global (Server Component)
 */

import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { auth } from "@/src/auth"
import prisma from "@/src/lib/prisma"
import { getBatches } from "@/src/actions/batches"
import { getExpenses } from "@/src/actions/expenses"
import { getPurchases } from "@/src/actions/purchases"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import { buildDashboardViewModel } from "@/src/lib/dashboard-view"
import { AlertBanner } from "../_components/AlertBanner"
import { DashboardKpis } from "../_components/DashboardKpis"
import { ActiveBatchList } from "../_components/ActiveBatchList"
import { MortalityChart } from "../_components/MortalityChart"
import { MobileQuickActions } from "../_components/MobileQuickActions"

export const metadata: Metadata = { title: "Tableau de bord" }

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")
  ensureModuleAccess(activeMembership, "DASHBOARD")

  const { organizationId } = activeMembership
  const now = new Date()
  const threshold48h = new Date(now.getTime() - 2 * 86_400_000)

  const [
    batchesResult,
    expensesResult,
    purchasesResult,
    mortalityAgg,
    recentRecordBatchIds,
    mortalityChart,
  ] = await Promise.all([
    getBatches({ organizationId, status: "ACTIVE", limit: 100 }),
    getExpenses({ organizationId, limit: 100 }),
    getPurchases({ organizationId, limit: 100 }),
    prisma.dailyRecord.aggregate({
      where: {
        batch: { organizationId, status: "ACTIVE", deletedAt: null },
      },
      _sum: { mortality: true },
    }),
    prisma.dailyRecord.findMany({
      where: {
        batch: { organizationId, status: "ACTIVE", deletedAt: null },
        date: { gte: threshold48h },
      },
      select: { batchId: true },
      distinct: ["batchId"],
    }),
    prisma.dailyRecord.groupBy({
      by: ["date"],
      where: {
        batch: { organizationId, status: "ACTIVE", deletedAt: null },
        date: { gte: new Date(now.getTime() - 30 * 86_400_000) },
      },
      _sum: { mortality: true },
      orderBy: { date: "asc" },
    }),
  ])

  const dashboardView = buildDashboardViewModel({
    activeBatches: batchesResult.success ? batchesResult.data : [],
    expenses: expensesResult.success ? expensesResult.data : [],
    purchases: purchasesResult.success ? purchasesResult.data : [],
    totalMortality: mortalityAgg._sum.mortality ?? 0,
    recentRecordBatchIds: recentRecordBatchIds.map((row) => row.batchId),
    mortalityChartRows: mortalityChart,
    now,
  })

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Vue d&apos;ensemble de votre exploitation avicole.
        </p>
      </div>

      <MobileQuickActions />

      <AlertBanner batchesNeedingSaisie={dashboardView.batchesNeedingSaisie} />

      <DashboardKpis
        activeBatchCount={dashboardView.activeBatchCount}
        totalEntryCount={dashboardView.totalEntryCount}
        totalChargesFcfa={dashboardView.totalChargesFcfa}
        totalCashOutFcfa={dashboardView.totalCashOutFcfa}
        totalPurchasesFcfa={dashboardView.totalPurchasesFcfa}
        totalOtherExpensesFcfa={dashboardView.totalOtherExpensesFcfa}
        totalSupplierBalanceFcfa={dashboardView.totalSupplierBalanceFcfa}
        totalMortality={dashboardView.totalMortality}
        mortalityRate={dashboardView.mortalityRate}
        alertCount={dashboardView.alertCount}
      />

      <MortalityChart data={dashboardView.mortalityChart} />

      <ActiveBatchList
        batches={dashboardView.activeBatchCards}
        totalActiveBatches={dashboardView.totalActiveBatches}
      />
    </div>
  )
}
