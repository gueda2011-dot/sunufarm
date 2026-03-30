import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { auth } from "@/src/auth"
import { getPurchases } from "@/src/actions/purchases"
import { getSuppliers } from "@/src/actions/suppliers"
import { getFeedStocks, getMedicineStocks } from "@/src/actions/stock"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import { hasModuleAccess } from "@/src/lib/permissions"
import { PurchasesPageClient } from "./_components/PurchasesPageClient"

export const metadata: Metadata = { title: "Achats fournisseur" }

export default async function PurchasesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")
  ensureModuleAccess(activeMembership, "PURCHASES")

  const { organizationId, role, modulePermissions } = activeMembership
  const canManageStock = hasModuleAccess(role, modulePermissions, "STOCK")

  const [purchasesResult, suppliersResult, feedStocksResult, medicineStocksResult] =
    await Promise.all([
      getPurchases({ organizationId, limit: 50 }),
      getSuppliers({ organizationId }),
      canManageStock ? getFeedStocks({ organizationId, limit: 100 }) : Promise.resolve({ success: true as const, data: [] }),
      canManageStock ? getMedicineStocks({ organizationId, limit: 100 }) : Promise.resolve({ success: true as const, data: [] }),
    ])

  const purchases = purchasesResult.success ? purchasesResult.data : []
  const suppliers = suppliersResult.success ? suppliersResult.data : []
  const feedStocks = feedStocksResult.success ? feedStocksResult.data : []
  const medicineStocks = medicineStocksResult.success ? medicineStocksResult.data : []

  return (
    <PurchasesPageClient
      organizationId={organizationId}
      userRole={role as string}
      canManageStock={canManageStock}
      purchases={purchases}
      suppliers={suppliers}
      feedStocks={feedStocks}
      medicineStocks={medicineStocks}
    />
  )
}
