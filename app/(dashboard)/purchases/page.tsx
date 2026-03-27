/**
 * SunuFarm — Page Achats (Server Component)
 */

import { redirect }      from "next/navigation"
import type { Metadata } from "next"
import { auth }          from "@/src/auth"
import { getPurchases, getSuppliers } from "@/src/actions/purchases"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import { PurchasesPageClient }        from "./_components/PurchasesPageClient"

export const metadata: Metadata = { title: "Achats" }

export default async function PurchasesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")
  ensureModuleAccess(activeMembership, "PURCHASES")

  const { organizationId, role } = activeMembership

  const [purchasesResult, suppliersResult] = await Promise.all([
    getPurchases({ organizationId, limit: 50 }),
    getSuppliers({ organizationId }),
  ])

  const purchases  = purchasesResult.success  ? purchasesResult.data  : []
  const suppliers  = suppliersResult.success  ? suppliersResult.data  : []

  // KPIs
  const totalFcfa   = purchases.reduce((s, p) => s + p.totalFcfa,   0)
  const paidFcfa    = purchases.reduce((s, p) => s + p.paidFcfa,    0)
  const balanceFcfa = purchases.reduce((s, p) => s + p.balanceFcfa, 0)

  return (
    <PurchasesPageClient
      organizationId={organizationId}
      userRole={role as string}
      purchases={purchases}
      suppliers={suppliers}
      totalFcfa={totalFcfa}
      paidFcfa={paidFcfa}
      balanceFcfa={balanceFcfa}
    />
  )
}
