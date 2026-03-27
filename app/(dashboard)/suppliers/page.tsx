import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { auth } from "@/src/auth"
import { getCurrentOrganizationContext } from "@/src/lib/active-organization"
import { ensureModuleAccess } from "@/src/lib/dashboard-access"
import { getSuppliers } from "@/src/actions/suppliers"
import { SuppliersPageClient } from "./_components/SuppliersPageClient"

export const metadata: Metadata = { title: "Fournisseurs" }

export default async function SuppliersPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const { activeMembership } = await getCurrentOrganizationContext(session.user.id)
  if (!activeMembership) redirect("/start")
  ensureModuleAccess(activeMembership, "SUPPLIERS")

  const { organizationId, role } = activeMembership

  const suppliersResult = await getSuppliers({ organizationId })
  const suppliers = suppliersResult.success ? suppliersResult.data : []

  const totalSuppliers = suppliers.length
  const totalPurchasedFcfa = suppliers.reduce((sum, supplier) => sum + supplier.totalPurchasedFcfa, 0)
  const totalBalanceFcfa = suppliers.reduce((sum, supplier) => sum + supplier.balanceFcfa, 0)

  return (
    <SuppliersPageClient
      organizationId={organizationId}
      userRole={role}
      suppliers={suppliers}
      totalSuppliers={totalSuppliers}
      totalPurchasedFcfa={totalPurchasedFcfa}
      totalBalanceFcfa={totalBalanceFcfa}
    />
  )
}
