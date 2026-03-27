/**
 * SunuFarm — Page Rapports (Server Component)
 *
 * Vue de synthèse période : sélection mois/année, agrégation
 * des indicateurs clés production + financiers pour l'organisation.
 *
 * MVP : rapport mensuel statique.
 * V2 : export PDF (react-pdf) et Excel (exceljs).
 */

import { redirect }      from "next/navigation"
import type { Metadata } from "next"
import { auth }          from "@/src/auth"
import prisma            from "@/src/lib/prisma"
import { PlanGuardCard } from "@/src/components/subscription/PlanGuardCard"
import {
  getFeatureUpgradeMessage,
  hasPlanFeature,
} from "@/src/lib/subscriptions"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { ReportsPageClient } from "./_components/ReportsPageClient"

export const metadata: Metadata = { title: "Rapports" }

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const membership = await prisma.userOrganization.findFirst({
    where:   { userId: session.user.id },
    select:  { organizationId: true, role: true },
    orderBy: { organization: { name: "asc" } },
  })
  if (!membership) redirect("/start")

  const { organizationId } = membership
  const subscription = await getOrganizationSubscription(organizationId)

  if (!hasPlanFeature(subscription.plan, "REPORTS")) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Rapports</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            La vue mensuelle est reservee aux organisations qui veulent piloter leur rentabilite.
          </p>
        </div>

        <PlanGuardCard
          title="Debloquez les rapports mensuels"
          message={getFeatureUpgradeMessage("REPORTS")}
          requiredPlan="Pro"
          currentPlan={subscription.plan}
        />
      </div>
    )
  }

  const sp = await searchParams

  const now   = new Date()
  const year  = parseInt(sp.year  ?? String(now.getFullYear()), 10)
  const month = parseInt(sp.month ?? String(now.getMonth() + 1), 10)

  const fromDate = new Date(year, month - 1, 1)
  const toDate   = new Date(year, month, 0, 23, 59, 59) // dernier jour du mois

  // Fetch parallèle — toutes les agrégations de la période
  const [
    batchesActive,
    batchesClosed,
    mortalityAgg,
    expensesAgg,
    salesAgg,
    purchasesAgg,
    dailyRecordsAgg,
  ] = await Promise.all([

    // Lots actifs au cours de la période
    prisma.batch.findMany({
      where: {
        organizationId,
        deletedAt: null,
        entryDate: { lte: toDate },
        OR: [
          { status: "ACTIVE" },
          { closedAt: { gte: fromDate } },
        ],
      },
      select: {
        id:           true,
        number:       true,
        status:       true,
        entryCount:   true,
        totalCostFcfa: true,
        entryDate:    true,
      },
    }),

    // Lots clôturés dans la période
    prisma.batch.count({
      where: {
        organizationId,
        deletedAt:  null,
        closedAt:   { gte: fromDate, lte: toDate },
      },
    }),

    // Mortalité de la période
    prisma.dailyRecord.aggregate({
      where: {
        batch: { organizationId },
        date:  { gte: fromDate, lte: toDate },
      },
      _sum: { mortality: true, feedKg: true },
    }),

    // Dépenses de la période
    prisma.expense.aggregate({
      where: {
        organizationId,
        date: { gte: fromDate, lte: toDate },
      },
      _sum:   { amountFcfa: true },
      _count: { id: true },
    }),

    // Ventes de la période
    prisma.sale.aggregate({
      where: {
        organizationId,
        saleDate: { gte: fromDate, lte: toDate },
      },
      _sum:   { totalFcfa: true, paidFcfa: true },
      _count: { id: true },
    }),

    // Achats de la période
    prisma.purchase.aggregate({
      where: {
        organizationId,
        purchaseDate: { gte: fromDate, lte: toDate },
      },
      _sum:   { totalFcfa: true },
      _count: { id: true },
    }),

    // Nombre de saisies journalières
    prisma.dailyRecord.count({
      where: {
        batch: { organizationId },
        date:  { gte: fromDate, lte: toDate },
      },
    }),
  ])

  const totalMortality   = mortalityAgg._sum.mortality ?? 0
  const totalFeedKg      = mortalityAgg._sum.feedKg    ?? 0
  const totalExpenses    = expensesAgg._sum.amountFcfa ?? 0
  const totalSales       = salesAgg._sum.totalFcfa     ?? 0
  const totalPaid        = salesAgg._sum.paidFcfa      ?? 0
  const totalPurchases   = purchasesAgg._sum.totalFcfa ?? 0
  const netResult        = totalSales - totalExpenses

  return (
    <ReportsPageClient
      year={year}
      month={month}
      batchesActive={batchesActive}
      batchesClosedCount={batchesClosed}
      totalMortality={totalMortality}
      totalFeedKg={totalFeedKg}
      totalExpenses={totalExpenses}
      expensesCount={expensesAgg._count.id}
      totalSales={totalSales}
      totalPaid={totalPaid}
      salesCount={salesAgg._count.id}
      totalPurchases={totalPurchases}
      purchasesCount={purchasesAgg._count.id}
      dailyRecordsCount={dailyRecordsAgg}
      netResult={netResult}
    />
  )
}
