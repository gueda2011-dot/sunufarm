/**
 * SunuFarm — Page Achats (Server Component)
 */

import { redirect }      from "next/navigation"
import type { Metadata } from "next"
import { auth }          from "@/src/auth"
import prisma            from "@/src/lib/prisma"
import { getPurchases, getSuppliers } from "@/src/actions/purchases"
import { getFeedStocks, getMedicineStocks } from "@/src/actions/stock"
import { PurchasesPageClient }        from "./_components/PurchasesPageClient"

export const metadata: Metadata = { title: "Achats" }

export default async function PurchasesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const membership = await prisma.userOrganization.findFirst({
    where:   { userId: session.user.id },
    select:  { organizationId: true, role: true },
    orderBy: { organization: { name: "asc" } },
  })
  if (!membership) redirect("/login?error=no-org")

  const { organizationId, role } = membership

  const [
    purchasesResult,
    suppliersResult,
    feedStocksResult,
    medicineStocksResult,
  ] = await Promise.all([
    getPurchases({ organizationId, limit: 50 }),
    getSuppliers({ organizationId }),
    getFeedStocks({ organizationId }),
    getMedicineStocks({ organizationId }),
  ])

  const purchases  = purchasesResult.success  ? purchasesResult.data  : []
  const suppliers  = suppliersResult.success  ? suppliersResult.data  : []
  const feedStocks = feedStocksResult.success ? feedStocksResult.data : []
  const medicineStocks =
    medicineStocksResult.success ? medicineStocksResult.data : []

  return (
    <PurchasesPageClient
      organizationId={organizationId}
      userRole={role as string}
      purchases={purchases}
      suppliers={suppliers}
      feedStocks={feedStocks}
      medicineStocks={medicineStocks}
    />
  )
}
