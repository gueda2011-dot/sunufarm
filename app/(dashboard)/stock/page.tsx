import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { auth } from "@/src/auth"
import {
  getFeedMovements,
  getFeedStocks,
  getMedicineMovements,
  getMedicineStocks,
} from "@/src/actions/stock"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import prisma from "@/src/lib/prisma"
import { canAccessFarm } from "@/src/lib/permissions"
import { getStockPredictions, getStockTrends } from "@/src/actions/predictive"
import { hasPlanFeature } from "@/src/lib/subscriptions"
import { getOrganizationSubscription } from "@/src/lib/subscriptions.server"
import { StockPageClient } from "./_components/StockPageClient"

export const metadata: Metadata = { title: "Stock" }

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab: tabParam } = await searchParams
  const initialTab: "ALIMENT" | "MEDICAMENT" = tabParam === "medicament" ? "MEDICAMENT" : "ALIMENT"
  const session = await auth()

  if (!session?.user?.id) {
    redirect("/login")
  }

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) {
    redirect("/start")
  }
  ensureModuleAccess(activeMembership, "STOCK")

  const { organizationId, role } = activeMembership

  const subscription = await getOrganizationSubscription(organizationId)
  const canSeePredictiveStockAlerts = hasPlanFeature(subscription.plan, "PREDICTIVE_STOCK_ALERTS")

  const [feedStocksResult, feedMovementsResult, medicineStocksResult, medicineMovementsResult, farms, feedTypes, batches, membership, predictionsResult] =
    await Promise.all([
      getFeedStocks({ organizationId }),
      getFeedMovements({ organizationId, limit: 20 }),
      getMedicineStocks({ organizationId }),
      getMedicineMovements({ organizationId, limit: 20 }),
      prisma.farm.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.feedType.findMany({
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      }),
      prisma.batch.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, number: true },
        orderBy: { number: "asc" },
      }),
      prisma.userOrganization.findFirst({
        where: { userId: session.user.id, organizationId },
        select: { farmPermissions: true },
      }),
      canSeePredictiveStockAlerts
        ? getStockPredictions(organizationId)
        : Promise.resolve({ success: true as const, data: { feed: {}, medicine: {} } }),
    ])

  const trendsResult = canSeePredictiveStockAlerts
    ? await getStockTrends(organizationId)
    : { success: true as const, data: { feed: {}, medicine: {} } }

  const feedStocks = feedStocksResult.success ? feedStocksResult.data : []
  const feedMovements = feedMovementsResult.success ? feedMovementsResult.data : []
  const medicineStocks = medicineStocksResult.success ? medicineStocksResult.data : []
  const medicineMovements = medicineMovementsResult.success ? medicineMovementsResult.data : []
  const farmPermissions = membership?.farmPermissions ?? []
  const writableFarms = farms.filter((farm) =>
    canAccessFarm(role, farmPermissions, farm.id, "canWrite"),
  )
  const canCreateStock = ["SUPER_ADMIN", "OWNER", "MANAGER"].includes(role)
  const canCreateMovement = ["SUPER_ADMIN", "OWNER", "MANAGER", "TECHNICIAN"].includes(role)
  const feedPredictions = predictionsResult.success ? predictionsResult.data.feed : {}
  const medicinePredictions = predictionsResult.success ? predictionsResult.data.medicine : {}
  const feedTrends = trendsResult.success ? trendsResult.data.feed : {}
  const medicineTrends = trendsResult.success ? trendsResult.data.medicine : {}

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Stock</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Suivi des aliments, médicaments et mouvements de stock.
        </p>
      </div>

      <StockPageClient
        organizationId={organizationId}
        canCreateStock={canCreateStock}
        canCreateMovement={canCreateMovement}
        farms={writableFarms}
        batches={batches}
        feedTypes={feedTypes}
        initialFeedStocks={feedStocks}
        initialFeedMovements={feedMovements}
        initialMedicineStocks={medicineStocks}
        initialMedicineMovements={medicineMovements}
        feedPredictions={feedPredictions}
        medicinePredictions={medicinePredictions}
        feedTrends={feedTrends}
        medicineTrends={medicineTrends}
        initialTab={initialTab}
      />
    </div>
  )
}
