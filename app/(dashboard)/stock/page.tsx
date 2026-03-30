import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { auth } from "@/src/auth"
import {
  getFeedMovements,
  getFeedStocks,
  getMedicineStocks,
} from "@/src/actions/stock"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import prisma from "@/src/lib/prisma"
import { canAccessFarm } from "@/src/lib/permissions"
import { StockPageClient } from "./_components/StockPageClient"

export const metadata: Metadata = { title: "Stock" }

export default async function StockPage() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect("/login")
  }

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) {
    redirect("/start")
  }
  ensureModuleAccess(activeMembership, "STOCK")

  const { organizationId, role, farmPermissions } = activeMembership

  const [feedStocksResult, feedMovementsResult, medicineStocksResult, farms, feedTypes] =
    await Promise.all([
      getFeedStocks({ organizationId }),
      getFeedMovements({ organizationId, limit: 20 }),
      getMedicineStocks({ organizationId }),
      prisma.farm.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.feedType.findMany({
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      }),
    ])

  const feedStocks = feedStocksResult.success ? feedStocksResult.data : []
  const feedMovements = feedMovementsResult.success ? feedMovementsResult.data : []
  const medicineStocks = medicineStocksResult.success ? medicineStocksResult.data : []
  const writableFarms = farms.filter((farm) =>
    canAccessFarm(role, farmPermissions, farm.id, "canWrite"),
  )
  const canCreateStock = ["SUPER_ADMIN", "OWNER", "MANAGER"].includes(role)

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
        farms={writableFarms}
        feedTypes={feedTypes}
        initialFeedStocks={feedStocks}
        initialFeedMovements={feedMovements}
        initialMedicineStocks={medicineStocks}
      />
    </div>
  )
}
