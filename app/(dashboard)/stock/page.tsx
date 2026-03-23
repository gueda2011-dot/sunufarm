import { redirect } from "next/navigation"
import type { Metadata } from "next"

import { getSession } from "@/src/lib/auth"
import prisma from "@/src/lib/prisma"
import {
  getFeedMovements,
  getFeedStocks,
  getMedicineMovements,
  getMedicineStocks,
} from "@/src/actions/stock"
import { StockPageClient } from "./_components/StockPageClient"

export const metadata: Metadata = { title: "Stock" }

export default async function StockPage() {
  const session = await getSession()

  if (!session?.user?.id) {
    redirect("/login")
  }

  const membership = await prisma.userOrganization.findFirst({
    where: {
      userId: session.effectiveUserId,
      ...(session.isImpersonating && session.impersonatedOrganizationId
        ? { organizationId: session.impersonatedOrganizationId }
        : {}),
    },
    select: { organizationId: true },
    orderBy: { organization: { name: "asc" } },
  })

  if (!membership) {
    redirect("/login?error=no-org")
  }

  const { organizationId } = membership

  const [
    feedStocksResult,
    feedMovementsResult,
    medicineStocksResult,
    medicineMovementsResult,
  ] =
    await Promise.all([
      getFeedStocks({ organizationId }),
      getFeedMovements({ organizationId, limit: 20 }),
      getMedicineStocks({ organizationId }),
      getMedicineMovements({ organizationId, limit: 20 }),
    ])

  const feedStocks = feedStocksResult.success ? feedStocksResult.data : []
  const feedMovements = feedMovementsResult.success ? feedMovementsResult.data : []
  const medicineStocks = medicineStocksResult.success ? medicineStocksResult.data : []
  const medicineMovements =
    medicineMovementsResult.success ? medicineMovementsResult.data : []

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
        initialFeedStocks={feedStocks}
        initialFeedMovements={feedMovements}
        initialMedicineStocks={medicineStocks}
        initialMedicineMovements={medicineMovements}
      />
    </div>
  )
}
